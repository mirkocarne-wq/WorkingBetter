import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, like, or, sql, type SQL } from 'drizzle-orm';
import { competencies, competencyAssessments, developmentPlans, emailOutbox, f360Campaigns, f360Requests, f360Responses, f360Subjects, oneOnOneRelations, orgUnits, persons, withPlatform, withTenant, type AnyDb, type TenantTx } from '@wb/db';
import {
  DefaultF360Categories,
  DefaultF360OpenQuestions,
  DefaultF360Scale,
  ErrorCodes,
  F360CategoryLabels,
  Permissions,
  buildF360Report,
  hasPermission,
  heatmapF360,
  toCsv,
  type F360Category,
  type F360CategoryConfig,
  type F360OpenQuestion,
  type F360Report,
  type F360ResponseInput,
  type F360Scale,
  type Principal,
} from '@wb/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { createPdf } from '../common/pdf.js';
import { principal, tx } from '../common/context.js';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors.js';
import { CONFIG, type AppConfig } from '../config.js';
import { DB, DB_APP_ROLE } from '../db/db.module.js';
import { DevelopmentService } from '../development/development.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { PopulationDto, answersDto, createCampaignDto, debriefDto, devActionDto, nominateDto, updateCampaignDto } from './dto.js';

type CampaignRow = typeof f360Campaigns.$inferSelect;
type SubjectRow = typeof f360Subjects.$inferSelect;
type RequestRow = typeof f360Requests.$inferSelect;
type Answers = z.infer<typeof answersDto>;
type Viewer = 'self' | 'manager' | 'hr';
export interface PersonLite { id: string; firstName: string; lastName: string; jobTitle: string | null }

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
const personName = (p?: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}` : '—');
const today = () => new Date().toISOString().slice(0, 10);
const OPEN_REQUEST = ['pending'] as const;

/**
 * Feedback 360° (F360): campagne, nomine con suggerimenti e approvazione, raccolta per categoria con anonimato
 * architetturale, valutatori esterni via magic link, report con soglia, regole di rilascio, debrief, aggregato.
 * Visibilità: la persona vede i propri 360°; il manager quelli dei riporti diretti; l'HR tutto tranne le identità
 * di chi ha risposto nelle categorie anonime (mai memorizzate insieme alla risposta).
 */
@Injectable()
export class F360Service {
  constructor(
    @Inject(DB) private readonly db: AnyDb,
    @Inject(DB_APP_ROLE) private readonly appRole: string | null,
    @Inject(CONFIG) private readonly cfg: AppConfig,
    private readonly audit: AuditService,
    private readonly notifier: NotificationsService,
    private readonly dev: DevelopmentService,
  ) {}

  // ---------- helper ----------

  private categoriesOf(c: CampaignRow): F360CategoryConfig[] {
    const list = (c.categories as F360CategoryConfig[]) ?? [];
    return list.length ? list : [...DefaultF360Categories];
  }
  private categoryCfg(c: CampaignRow, key: F360Category): F360CategoryConfig | undefined {
    return this.categoriesOf(c).find((x) => x.key === key && x.enabled);
  }
  private async campaignRow(id: string, t: TenantTx = tx()): Promise<CampaignRow> {
    const [c] = await t.select().from(f360Campaigns).where(eq(f360Campaigns.id, id));
    if (!c) throw notFound('Campagna 360°', id);
    return c;
  }
  private async subjectRow(id: string): Promise<SubjectRow> {
    const [s] = await tx().select().from(f360Subjects).where(eq(f360Subjects.id, id));
    if (!s) throw notFound('Soggetto 360°', id);
    return s;
  }
  /** self | manager | hr, altrimenti 404 per non rivelare l'esistenza. */
  private viewerOf(p: Principal, s: SubjectRow): Viewer | null {
    if (hasPermission(p.roles, Permissions.F360_MANAGE)) return 'hr';
    if (p.personId && s.personId === p.personId) return 'self';
    if (p.personId && s.managerPersonId === p.personId && hasPermission(p.roles, Permissions.F360_TEAM)) return 'manager';
    return null;
  }
  private async subjectFor(id: string): Promise<{ s: SubjectRow; c: CampaignRow; viewer: Viewer }> {
    const p = principal();
    const s = await this.subjectRow(id);
    const viewer = this.viewerOf(p, s);
    if (!viewer) throw notFound('Soggetto 360°', id);
    return { s, c: await this.campaignRow(s.campaignId), viewer };
  }
  private async namesOf(ids: readonly (string | null | undefined)[], t: TenantTx = tx()): Promise<Map<string, PersonLite>> {
    const uniq = [...new Set(ids.filter((x): x is string => !!x))];
    if (!uniq.length) return new Map();
    const rows = await t.select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName, jobTitle: persons.jobTitle }).from(persons).where(inArray(persons.id, uniq));
    return new Map(rows.map((r) => [r.id, r]));
  }
  private async competencyDefs(keys: readonly string[], t: TenantTx = tx()) {
    if (!keys.length) return [];
    const rows = await t.select().from(competencies).where(inArray(competencies.key, [...keys]));
    return keys.map((k) => rows.find((r) => r.key === k)).filter((x): x is typeof competencies.$inferSelect => !!x).map((r) => ({ key: r.key, name: r.name, description: r.description, levels: r.levels as { level: number; label: string; descriptor: string }[] }));
  }
  private campaignView(c: CampaignRow) {
    return { ...c, competencyKeys: c.competencyKeys as string[], scale: c.scale as F360Scale, openQuestions: c.openQuestions as F360OpenQuestion[], categories: this.categoriesOf(c), population: c.population as PopulationDto };
  }

  // ---------- campagne (F360-001…005) ----------

  async listCampaigns() {
    const rows = await tx().select().from(f360Campaigns).orderBy(desc(f360Campaigns.createdAt));
    const ids = rows.map((r) => r.id);
    const subj = ids.length ? await tx().select({ campaignId: f360Subjects.campaignId, status: f360Subjects.status, n: sql<number>`count(*)::int` }).from(f360Subjects).where(inArray(f360Subjects.campaignId, ids)).groupBy(f360Subjects.campaignId, f360Subjects.status) : [];
    const req = ids.length ? await tx().select({ campaignId: f360Requests.campaignId, status: f360Requests.status, n: sql<number>`count(*)::int` }).from(f360Requests).where(inArray(f360Requests.campaignId, ids)).groupBy(f360Requests.campaignId, f360Requests.status) : [];
    return rows.map((c) => ({
      ...this.campaignView(c),
      subjects: Object.fromEntries(subj.filter((s) => s.campaignId === c.id).map((s) => [s.status, s.n])) as Record<string, number>,
      requests: Object.fromEntries(req.filter((r) => r.campaignId === c.id).map((r) => [r.status, r.n])) as Record<string, number>,
    }));
  }

  async getCampaign(id: string) {
    const c = await this.campaignRow(id);
    return { ...this.campaignView(c), competencies: await this.competencyDefs(c.competencyKeys as string[]), progress: c.status === 'draft' ? null : await this.progress(id) };
  }

  private async assertCompetencies(keys: string[]) {
    const found = await tx().select({ key: competencies.key }).from(competencies).where(inArray(competencies.key, keys));
    const missing = keys.filter((k) => !found.some((f) => f.key === k));
    if (missing.length) throw unprocessable(ErrorCodes.VALIDATION, `Competenze non presenti nel framework: ${missing.join(', ')}`);
  }

  async createCampaign(dto: z.infer<typeof createCampaignDto>) {
    const p = principal();
    await this.assertCompetencies(dto.competencyKeys);
    const [row] = await tx()
      .insert(f360Campaigns)
      .values({
        tenantId: p.tenantId,
        createdBy: p.userId,
        name: dto.name,
        description: dto.description ?? null,
        competencyKeys: dto.competencyKeys,
        scale: dto.scale ?? DefaultF360Scale,
        openQuestions: dto.openQuestions ?? [...DefaultF360OpenQuestions],
        categories: dto.categories ?? [...DefaultF360Categories],
        nominationBy: dto.nominationBy,
        requireApproval: dto.requireApproval,
        releaseRule: dto.releaseRule,
        managerSeesReport: dto.managerSeesReport,
        anonymityThreshold: dto.anonymityThreshold,
        population: dto.population,
        nominationDueAt: dto.nominationDueAt ?? null,
        collectionDueAt: dto.collectionDueAt ?? null,
      })
      .returning();
    await this.audit.log({ action: 'f360.campaign_create', entityType: 'f360_campaign', entityId: row!.id, after: dto });
    return this.getCampaign(row!.id);
  }

  async updateCampaign(id: string, dto: z.infer<typeof updateCampaignDto>) {
    const before = await this.campaignRow(id);
    if (before.status === 'closed') throw conflict(ErrorCodes.CONFLICT, 'Campagna chiusa');
    const structural = ['competencyKeys', 'scale', 'openQuestions', 'categories', 'nominationBy', 'requireApproval', 'population', 'anonymityThreshold'] as const;
    if (before.status !== 'draft' && structural.some((k) => dto[k] !== undefined)) throw conflict(ErrorCodes.CONFLICT, 'Dopo il lancio si possono modificare solo nome, descrizione, scadenze e regola di rilascio');
    if (dto.competencyKeys) await this.assertCompetencies(dto.competencyKeys);
    const [row] = await tx().update(f360Campaigns).set({ ...dto, updatedAt: new Date() }).where(eq(f360Campaigns.id, id)).returning();
    await this.audit.log({ action: 'f360.campaign_update', entityType: 'f360_campaign', entityId: id, before, after: dto });
    return this.campaignView(row!);
  }

  private async resolvePopulation(pop: PopulationDto) {
    const conds: SQL[] = [inArray(persons.status, ['active', 'invited'])];
    if (pop.orgUnitIds?.length) {
      const units = await tx().select({ path: orgUnits.path }).from(orgUnits).where(inArray(orgUnits.id, pop.orgUnitIds));
      const subtree = units.length ? await tx().select({ id: orgUnits.id }).from(orgUnits).where(or(...units.map((u) => like(orgUnits.path, `${u.path}%`)))!) : [];
      const byUnit = subtree.length ? inArray(persons.orgUnitId, subtree.map((s) => s.id)) : sql`false`;
      conds.push(pop.personIds?.length ? or(byUnit, inArray(persons.id, pop.personIds))! : byUnit);
    } else if (pop.personIds?.length) conds.push(inArray(persons.id, pop.personIds));
    if (pop.excludePersonIds?.length) conds.push(sql`${persons.id} NOT IN ${pop.excludePersonIds}`);
    const rows = await tx().select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName, jobTitle: persons.jobTitle, managerId: persons.managerId, orgUnitId: persons.orgUnitId }).from(persons).where(and(...conds)).orderBy(persons.lastName, persons.firstName);
    return { included: rows, withoutManager: rows.filter((r) => !r.managerId).length };
  }

  async previewPopulation(id: string) {
    const c = await this.campaignRow(id);
    return this.resolvePopulation(c.population as PopulationDto);
  }

  /** Lancio: crea i soggetti con le richieste fisse (self, manager) e avvia la fase di nomina. */
  async launch(id: string) {
    const p = principal();
    const c = await this.campaignRow(id);
    if (c.status !== 'draft') throw conflict(ErrorCodes.CONFLICT, `Campagna già ${c.status}`);
    const pop = await this.resolvePopulation(c.population as PopulationDto);
    if (!pop.included.length) throw unprocessable(ErrorCodes.VALIDATION, 'Nessuna persona nella popolazione');
    const selfCfg = this.categoryCfg(c, 'self');
    const managerCfg = this.categoryCfg(c, 'manager');
    const now = new Date();
    await tx().update(f360Campaigns).set({ status: 'nomination', launchedAt: now, updatedAt: now }).where(eq(f360Campaigns.id, id));
    for (const person of pop.included) {
      const [s] = await tx().insert(f360Subjects).values({ tenantId: p.tenantId, createdBy: p.userId, campaignId: id, personId: person.id, managerPersonId: person.managerId, orgUnitId: person.orgUnitId, status: 'nominating' }).returning();
      const fixed: (typeof f360Requests.$inferInsert)[] = [];
      if (selfCfg) fixed.push({ tenantId: p.tenantId, campaignId: id, subjectId: s!.id, category: 'self', raterPersonId: person.id, status: 'proposed' });
      if (managerCfg && person.managerId) fixed.push({ tenantId: p.tenantId, campaignId: id, subjectId: s!.id, category: 'manager', raterPersonId: person.managerId, status: 'proposed' });
      if (fixed.length) await tx().insert(f360Requests).values(fixed);
      if (c.nominationBy === 'subject') await this.notifier.send({ personId: person.id, type: 'f360.nominate', data: { title: c.name, dueDate: c.nominationDueAt }, link: `/f360/subjects/${s!.id}` });
      else if (c.nominationBy === 'manager' && person.managerId) await this.notifier.send({ personId: person.managerId, type: 'f360.nominate', data: { title: c.name, dueDate: c.nominationDueAt, subjectName: personName(person) }, link: `/f360/subjects/${s!.id}` });
    }
    await this.audit.log({ action: 'f360.campaign_launch', entityType: 'f360_campaign', entityId: id, after: { subjects: pop.included.length, withoutManager: pop.withoutManager } });
    return this.getCampaign(id);
  }

  /** Avvio raccolta: approva d'ufficio le nomine in sospeso, invita i valutatori (email con magic link per gli esterni). */
  async startCollection(id: string) {
    const p = principal();
    const c = await this.campaignRow(id);
    if (c.status !== 'nomination') throw conflict(ErrorCodes.CONFLICT, 'La campagna non è in fase di nomina');
    const now = new Date();
    const expiresAt = c.collectionDueAt ? new Date(`${c.collectionDueAt}T23:59:59Z`) : null;
    const subjects = await tx().select().from(f360Subjects).where(eq(f360Subjects.campaignId, id));
    const names = await this.namesOf(subjects.map((s) => s.personId));
    let invited = 0;
    let autoApproved = 0;
    for (const s of subjects) {
      if (s.status !== 'approved') {
        autoApproved++;
        await tx().update(f360Subjects).set({ approvedAt: now, approvedByPersonId: p.personId ?? null, updatedAt: now }).where(eq(f360Subjects.id, s.id));
      }
      const reqs = await tx().select().from(f360Requests).where(and(eq(f360Requests.subjectId, s.id), eq(f360Requests.status, 'proposed')));
      const subjectName = personName(names.get(s.personId));
      for (const r of reqs) {
        const cfg = this.categoryCfg(c, r.category);
        const patch: Partial<typeof f360Requests.$inferInsert> = { status: 'pending', invitedAt: now, expiresAt, updatedAt: now };
        if (r.category === 'external' && r.externalEmail) {
          const token = randomBytes(24).toString('base64url');
          patch.tokenHash = hashToken(token);
          await this.queueExternalEmail(tx(), p.tenantId, r, c, subjectName, token, false);
        }
        await tx().update(f360Requests).set(patch).where(eq(f360Requests.id, r.id));
        if (r.raterPersonId) await this.notifier.send({ personId: r.raterPersonId, type: 'f360.request', data: { title: c.name, otherName: r.category === 'self' ? 'di te (autovalutazione)' : subjectName, dueDate: c.collectionDueAt, anonymous: cfg?.anonymous ? 1 : null }, link: `/f360/requests/${r.id}` });
        invited++;
      }
      await tx().update(f360Subjects).set({ status: 'collecting', updatedAt: now }).where(eq(f360Subjects.id, s.id));
    }
    await tx().update(f360Campaigns).set({ status: 'collection', collectionStartedAt: now, updatedAt: now }).where(eq(f360Campaigns.id, id));
    await this.audit.log({ action: 'f360.campaign_start_collection', entityType: 'f360_campaign', entityId: id, after: { invited, autoApproved } });
    return { ...(await this.getCampaign(id)), invited, autoApproved };
  }

  private externalUrl(token: string) {
    return `${this.cfg.APP_BASE_URL.replace(/\/$/, '')}/f360/external/${token}`;
  }
  private async queueExternalEmail(t: TenantTx, tenantId: string, r: RequestRow, c: CampaignRow, subjectName: string, token: string, reminder: boolean) {
    const url = this.externalUrl(token);
    const due = c.collectionDueAt ? ` entro il ${c.collectionDueAt}` : '';
    await t.insert(emailOutbox).values({
      tenantId,
      toEmail: r.externalEmail!,
      toName: r.externalName,
      subject: `${reminder ? 'Promemoria: ' : ''}feedback su ${subjectName} · ${c.name}`,
      text: `Gentile ${r.externalName ?? ''},\n\n${subjectName} ti ha indicato come persona in grado di dare un feedback sul suo lavoro nell'ambito della campagna «${c.name}». Il questionario richiede pochi minuti e le risposte sono anonime: vengono mostrate solo in forma aggregata.\n\nCompila qui${due}: ${url}\n\nIl link è personale: non inoltrarlo.\n\nGrazie,\nWorkingBetter`,
    });
  }

  /** Solleciti (una notifica al giorno per richiesta aperta; email agli esterni con nuovo link). */
  async remind(id: string) {
    const p = principal();
    const c = await this.campaignRow(id);
    if (c.status !== 'collection') throw conflict(ErrorCodes.CONFLICT, 'La raccolta non è in corso');
    const reqs = await tx().select({ r: f360Requests, s: f360Subjects }).from(f360Requests).innerJoin(f360Subjects, eq(f360Subjects.id, f360Requests.subjectId)).where(and(eq(f360Requests.campaignId, id), inArray(f360Requests.status, [...OPEN_REQUEST])));
    const names = await this.namesOf(reqs.map((x) => x.s.personId));
    const day = today();
    let sent = 0;
    for (const { r, s } of reqs) {
      const subjectName = personName(names.get(s.personId));
      if (r.raterPersonId) {
        const res = await this.notifier.send({ personId: r.raterPersonId, type: 'f360.reminder', data: { title: c.name, otherName: r.category === 'self' ? 'di te' : subjectName, daysLeft: c.collectionDueAt ? Math.max(0, Math.ceil((new Date(`${c.collectionDueAt}T23:59:59Z`).getTime() - Date.now()) / 86400000)) : null }, link: `/f360/requests/${r.id}`, dedupeKey: `f360_remind:${r.id}:${day}` });
        if (res.created) sent++;
      } else if (r.externalEmail && (!r.remindedAt || r.remindedAt.toISOString().slice(0, 10) !== day)) {
        const token = randomBytes(24).toString('base64url');
        await tx().update(f360Requests).set({ tokenHash: hashToken(token), remindedAt: new Date(), updatedAt: new Date() }).where(eq(f360Requests.id, r.id));
        await this.queueExternalEmail(tx(), p.tenantId, r, c, subjectName, token, true);
        sent++;
      }
    }
    await this.audit.log({ action: 'f360.campaign_remind', entityType: 'f360_campaign', entityId: id, after: { sent, pending: reqs.length } });
    return { sent, pending: reqs.length };
  }

  /** Chiusura: genera i report con la soglia, scade le richieste aperte, alimenta le valutazioni DEV (fonte 360°). */
  async close(id: string) {
    const p = principal();
    const c = await this.campaignRow(id);
    if (c.status !== 'collection') throw conflict(ErrorCodes.CONFLICT, 'La raccolta non è in corso');
    const now = new Date();
    const subjects = await tx().select().from(f360Subjects).where(eq(f360Subjects.campaignId, id));
    const names = await this.namesOf(subjects.map((s) => s.personId));
    let released = 0;
    for (const s of subjects) {
      const report = await this.generateReport(c, s);
      const auto = c.releaseRule === 'immediately';
      await tx()
        .update(f360Subjects)
        .set({ report, reportGeneratedAt: now, status: auto ? 'released' : 'ready', releasedAt: auto ? now : null, releasedByPersonId: auto ? (p.personId ?? null) : null, updatedAt: now })
        .where(eq(f360Subjects.id, s.id));
      await tx().update(f360Requests).set({ status: 'expired', updatedAt: now }).where(and(eq(f360Requests.subjectId, s.id), inArray(f360Requests.status, [...OPEN_REQUEST])));
      // valutazioni di competenza dalla media degli altri (DEV-012, fonte 360)
      const items = report.competencies.filter((x) => x.others != null).map((x) => ({ tenantId: p.tenantId, personId: s.personId, competencyKey: x.competencyKey, source: '360' as const, level: Math.round(x.others!), note: `Media 360° «${c.name}» su ${x.othersN} risposte`, assessedByPersonId: null, assessedAt: now }));
      if (items.length) await tx().insert(competencyAssessments).values(items);
      const subjectName = personName(names.get(s.personId));
      if (s.managerPersonId && c.managerSeesReport) await this.notifier.send({ personId: s.managerPersonId, type: 'f360.report_ready', data: { title: c.name, otherName: subjectName, responses: report.responses, next: c.releaseRule === 'after_debrief' ? 'Pianifica il debrief: al termine il report sarà rilasciato.' : c.releaseRule === 'manager' ? 'Rilascialo quando sei pronto/a.' : '' }, link: `/f360/subjects/${s.id}` });
      if (auto) {
        released++;
        await this.notifier.send({ personId: s.personId, type: 'f360.report_released', data: { title: c.name }, link: `/f360/subjects/${s.id}` });
      }
    }
    await tx().update(f360Campaigns).set({ status: 'closed', closedAt: now, updatedAt: now }).where(eq(f360Campaigns.id, id));
    await this.audit.log({ action: 'f360.campaign_close', entityType: 'f360_campaign', entityId: id, after: { subjects: subjects.length, released } });
    return this.getCampaign(id);
  }

  private async generateReport(c: CampaignRow, s: SubjectRow): Promise<F360Report> {
    const responses = await tx().select().from(f360Responses).where(eq(f360Responses.subjectId, s.id));
    const invitedRows = await tx().select({ category: f360Requests.category, n: sql<number>`count(*)::int` }).from(f360Requests).where(and(eq(f360Requests.subjectId, s.id), inArray(f360Requests.status, ['pending', 'submitted', 'expired', 'declined']))).groupBy(f360Requests.category);
    const invited: Partial<Record<F360Category, number>> = {};
    for (const r of invitedRows) invited[r.category] = r.n;
    return buildF360Report({
      competencyKeys: c.competencyKeys as string[],
      categories: this.categoriesOf(c),
      threshold: c.anonymityThreshold,
      invited,
      responses: responses.map((r): F360ResponseInput => ({ category: r.category, ratings: r.ratings as Record<string, number | null>, comments: r.comments as Record<string, string>, openAnswers: r.openAnswers as Record<string, string> })),
    });
  }

  /** Avanzamento per soggetto: conteggi per categoria (invitati/risposte), mai chi ha risposto nelle categorie anonime. */
  async progress(id: string) {
    const c = await this.campaignRow(id);
    const subjects = await tx().select().from(f360Subjects).where(eq(f360Subjects.campaignId, id)).orderBy(f360Subjects.createdAt);
    const reqs = subjects.length ? await tx().select({ subjectId: f360Requests.subjectId, category: f360Requests.category, status: f360Requests.status, n: sql<number>`count(*)::int` }).from(f360Requests).where(eq(f360Requests.campaignId, id)).groupBy(f360Requests.subjectId, f360Requests.category, f360Requests.status) : [];
    const names = await this.namesOf(subjects.flatMap((s) => [s.personId, s.managerPersonId]));
    const totals = { subjects: subjects.length, byStatus: {} as Record<string, number>, invited: 0, submitted: 0 };
    const rows = subjects.map((s) => {
      totals.byStatus[s.status] = (totals.byStatus[s.status] ?? 0) + 1;
      const byCategory: Record<string, { nominated: number; invited: number; submitted: number; declined: number }> = {};
      for (const r of reqs.filter((x) => x.subjectId === s.id)) {
        const e = (byCategory[r.category] ??= { nominated: 0, invited: 0, submitted: 0, declined: 0 });
        if (r.status !== 'rejected') e.nominated += r.n;
        if (['pending', 'submitted', 'expired', 'declined'].includes(r.status)) e.invited += r.n;
        if (r.status === 'submitted') e.submitted += r.n;
        if (r.status === 'declined') e.declined += r.n;
      }
      const invited = Object.values(byCategory).reduce((a, b) => a + b.invited, 0);
      const submitted = Object.values(byCategory).reduce((a, b) => a + b.submitted, 0);
      totals.invited += invited;
      totals.submitted += submitted;
      return { id: s.id, status: s.status, person: names.get(s.personId) ?? null, manager: s.managerPersonId ? (names.get(s.managerPersonId) ?? null) : null, byCategory, invited, submitted, releasedAt: s.releasedAt, debriefAt: s.debriefAt, reportGeneratedAt: s.reportGeneratedAt };
    });
    return { campaign: { id: c.id, name: c.name, status: c.status }, totals, subjects: rows };
  }

  // ---------- aggregato (F360-023/024) ----------

  async aggregate(id: string, groupBy: 'org_unit' | 'manager') {
    const c = await this.campaignRow(id);
    const keys = c.competencyKeys as string[];
    const subjects = await tx().select().from(f360Subjects).where(and(eq(f360Subjects.campaignId, id), sql`${f360Subjects.report} IS NOT NULL`));
    const units = groupBy === 'org_unit' ? await tx().select({ id: orgUnits.id, name: orgUnits.name }).from(orgUnits) : [];
    const names = groupBy === 'manager' ? await this.namesOf(subjects.map((s) => s.managerPersonId)) : new Map<string, PersonLite>();
    const items = subjects.map((s) => {
      const gk = (groupBy === 'org_unit' ? s.orgUnitId : s.managerPersonId) ?? 'none';
      const label = groupBy === 'org_unit' ? (units.find((u) => u.id === s.orgUnitId)?.name ?? 'Senza unità') : s.managerPersonId ? personName(names.get(s.managerPersonId)) : 'Senza manager';
      return { groupKey: gk, groupLabel: label, report: s.report as F360Report };
    });
    const rows = heatmapF360(items, keys, c.anonymityThreshold);
    const all = heatmapF360(items.map((i) => ({ ...i, groupKey: 'all', groupLabel: 'Tutti' })), keys, c.anonymityThreshold);
    return { campaign: { id: c.id, name: c.name, status: c.status, threshold: c.anonymityThreshold }, groupBy, competencies: await this.competencyDefs(keys), rows, total: all[0] ?? null, subjectsWithReport: subjects.length };
  }

  async aggregateCsv(id: string, groupBy: 'org_unit' | 'manager') {
    const a = await this.aggregate(id, groupBy);
    const header = [groupBy === 'org_unit' ? 'Unità' : 'Manager', 'Soggetti', ...a.competencies.map((c) => c.name)];
    const line = (r: (typeof a.rows)[number]) => [r.label, r.subjects, ...a.competencies.map((c) => (r.suppressed ? 'sotto soglia' : r.cells[c.key] == null ? '' : r.cells[c.key]!.toFixed(2)))];
    return toCsv(header, [...a.rows.map(line), ...(a.total ? [line(a.total)] : [])]);
  }

  // ---------- soggetti ----------

  async listSubjects(q: { box: 'mine' | 'team' | 'all'; campaignId?: string }) {
    const p = principal();
    const conds: SQL[] = [];
    if (q.box === 'mine') conds.push(eq(f360Subjects.personId, p.personId ?? ''));
    else if (q.box === 'team') {
      if (!hasPermission(p.roles, Permissions.F360_TEAM) && !hasPermission(p.roles, Permissions.F360_MANAGE)) throw forbidden();
      conds.push(eq(f360Subjects.managerPersonId, p.personId ?? ''));
    } else if (!hasPermission(p.roles, Permissions.F360_MANAGE)) throw forbidden();
    if (q.campaignId) conds.push(eq(f360Subjects.campaignId, q.campaignId));
    const rows = await tx().select({ s: f360Subjects, c: f360Campaigns }).from(f360Subjects).innerJoin(f360Campaigns, eq(f360Campaigns.id, f360Subjects.campaignId)).where(conds.length ? and(...conds) : undefined).orderBy(desc(f360Subjects.createdAt));
    const names = await this.namesOf(rows.flatMap((r) => [r.s.personId, r.s.managerPersonId]));
    const counts = rows.length ? await tx().select({ subjectId: f360Requests.subjectId, status: f360Requests.status, n: sql<number>`count(*)::int` }).from(f360Requests).where(inArray(f360Requests.subjectId, rows.map((r) => r.s.id))).groupBy(f360Requests.subjectId, f360Requests.status) : [];
    return rows.map(({ s, c }) => {
      const viewer = this.viewerOf(p, s)!;
      const byStatus = Object.fromEntries(counts.filter((x) => x.subjectId === s.id).map((x) => [x.status, x.n])) as Record<string, number>;
      return { ...this.subjectView(s, c, viewer), person: names.get(s.personId) ?? null, manager: s.managerPersonId ? (names.get(s.managerPersonId) ?? null) : null, counts: byStatus };
    });
  }

  private canSeeReport(viewer: Viewer, s: SubjectRow, c: CampaignRow) {
    if (!s.report) return false;
    if (viewer === 'hr') return true;
    if (viewer === 'manager') return c.managerSeesReport;
    return s.status === 'released';
  }
  private canNominate(viewer: Viewer, s: SubjectRow, c: CampaignRow) {
    if (c.status !== 'nomination') return false;
    if (viewer === 'hr') return ['nominating', 'pending_approval', 'approved'].includes(s.status);
    if (viewer === 'self') return c.nominationBy === 'subject' && s.status === 'nominating';
    return (c.nominationBy === 'manager' && s.status === 'nominating') || (c.requireApproval && s.status === 'pending_approval');
  }
  private subjectView(s: SubjectRow, c: CampaignRow, viewer: Viewer) {
    return {
      id: s.id,
      campaign: { id: c.id, name: c.name, status: c.status, nominationBy: c.nominationBy, requireApproval: c.requireApproval, releaseRule: c.releaseRule, nominationDueAt: c.nominationDueAt, collectionDueAt: c.collectionDueAt, anonymityThreshold: c.anonymityThreshold, categories: this.categoriesOf(c) },
      personId: s.personId,
      managerPersonId: s.managerPersonId,
      status: s.status,
      viewer,
      nominationSubmittedAt: s.nominationSubmittedAt,
      approvedAt: s.approvedAt,
      reportGeneratedAt: s.reportGeneratedAt,
      releasedAt: s.releasedAt,
      debriefAt: s.debriefAt,
      debriefNote: viewer === 'self' ? null : s.debriefNote,
      can: {
        nominate: this.canNominate(viewer, s, c),
        submitNominations: this.canNominate(viewer, s, c) && s.status === 'nominating' && viewer !== 'hr' ? true : viewer === 'hr' && s.status === 'nominating' && c.status === 'nomination',
        approve: viewer !== 'self' && c.status === 'nomination' && s.status === 'pending_approval',
        seeReport: this.canSeeReport(viewer, s, c),
        release: viewer !== 'self' && s.status === 'ready' && (c.releaseRule !== 'after_debrief' || !!s.debriefAt),
        debrief: viewer !== 'self' && ['ready', 'released'].includes(s.status),
        addDevAction: this.canSeeReport(viewer, s, c) && (viewer !== 'manager' || true),
      },
    };
  }

  async getSubject(id: string) {
    const { s, c, viewer } = await this.subjectFor(id);
    const reqs = await tx().select().from(f360Requests).where(and(eq(f360Requests.subjectId, id), sql`${f360Requests.status} <> 'rejected'`)).orderBy(f360Requests.category, f360Requests.createdAt);
    const names = await this.namesOf([s.personId, s.managerPersonId, ...reqs.map((r) => r.raterPersonId), ...reqs.map((r) => r.nominatedByPersonId)]);
    const cats = this.categoriesOf(c);
    const nominations = reqs.map((r) => {
      const anonymous = cats.find((x) => x.key === r.category)?.anonymous ?? true;
      // nelle categorie anonime lo stato individuale non distingue mai "ha risposto" da "non ancora"
      const status = anonymous && ['pending', 'submitted', 'expired'].includes(r.status) ? 'invited' : r.status;
      return { id: r.id, category: r.category, categoryLabel: F360CategoryLabels[r.category], anonymous, person: r.raterPersonId ? (names.get(r.raterPersonId) ?? null) : null, externalName: r.externalName, externalEmail: viewer === 'self' || viewer === 'hr' ? r.externalEmail : null, status, declineReason: r.declineReason, nominatedBy: r.nominatedByPersonId ? personName(names.get(r.nominatedByPersonId)) : null, canRemove: r.status === 'proposed' && !['self', 'manager'].includes(r.category) && this.canNominate(viewer, s, c) };
    });
    const byCategory = cats.filter((x) => x.enabled).map((x) => ({ ...x, label: F360CategoryLabels[x.key], nominated: nominations.filter((n) => n.category === x.key).length }));
    const view = this.subjectView(s, c, viewer);
    return {
      ...view,
      person: names.get(s.personId) ?? null,
      manager: s.managerPersonId ? (names.get(s.managerPersonId) ?? null) : null,
      nominations,
      byCategory,
      competencies: await this.competencyDefs(c.competencyKeys as string[]),
      scale: c.scale as F360Scale,
      openQuestions: c.openQuestions as F360OpenQuestion[],
      report: view.can.seeReport ? (s.report as F360Report) : null,
    };
  }

  /** Export PDF del report 360° (F360-024): stesso contenuto della vista web, solo se il report è visibile a chi chiede. Tracciato nell'audit. */
  async subjectPdf(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const s = await this.getSubject(id);
    if (!s.report) throw conflict(ErrorCodes.CONFLICT, 'Report non disponibile o non ancora rilasciato');
    const rep = s.report;
    const fmt = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString('it-IT', { maximumFractionDigits: 2 }));
    const names = Object.fromEntries(s.competencies.map((c) => [c.key, c.name]));
    const name = personName(s.person);
    const pdf = createPdf({ title: `Feedback 360° · ${name}` });
    pdf.h1(`Feedback 360° di ${name}`, `${s.campaign.name} · report generato il ${rep.generatedAt ? new Date(rep.generatedAt).toLocaleDateString('it-IT') : '—'} · scala ${s.scale.min}–${s.scale.max}`);
    const shownCats = rep.categories.filter((c) => c.shown && c.key !== 'self');
    const hidden = rep.categories.filter((c) => !c.shown && c.key !== 'self');
    pdf.kv([
      ['Come la vedono gli altri', `${fmt(rep.overall.others)} (${rep.responses} risposte)`],
      ['Autovalutazione', fmt(rep.overall.self)],
      ['Manager', fmt(rep.overall.manager)],
      ['Risposte per categoria', shownCats.map((c) => `${c.label} ${c.responded}/${c.invited}`).join(' · ') || '—'],
      ['Soglia di anonimato', `${rep.threshold} risposte per categoria`],
    ]);
    if (hidden.length) pdf.p(`Per proteggere l’anonimato ${hidden.map((c) => `${c.label} (${c.responded} risposte)`).join(' e ')} non ${hidden.length === 1 ? 'viene mostrata' : 'vengono mostrate'}.`, { muted: true });
    pdf.h2('Profilo per competenza');
    const hasManager = rep.categories.some((c) => c.key === 'manager' && c.shown);
    const series = [{ label: 'Autovalutazione', color: '#2563eb' }, { label: 'Altri', color: '#f59e0b' }, ...(hasManager ? [{ label: 'Manager', color: '#10b981' }] : [])];
    pdf.radar(rep.competencies.map((c) => ({ label: names[c.competencyKey] ?? c.competencyKey, values: [c.self, c.others, ...(hasManager ? [c.byCategory.manager?.avg ?? null] : [])] })), series, s.scale.min, s.scale.max);
    pdf.table(['Competenza', 'Self', 'Altri', 'Gap', ...shownCats.map((c) => c.label)], rep.competencies.map((c) => [names[c.competencyKey] ?? c.competencyKey, fmt(c.self), c.others == null ? '—' : `${fmt(c.others)} (${c.othersN})`, c.gap == null ? '—' : (c.gap > 0 ? '+' : '') + fmt(c.gap), ...shownCats.map((cat) => (c.byCategory[cat.key] ? fmt(c.byCategory[cat.key]!.avg) : '—'))]));
    if (rep.strengths.length || rep.developmentAreas.length) {
      pdf.h2('Punti di forza e aree di sviluppo');
      pdf.kv([['Punti di forza', rep.strengths.map((k) => names[k] ?? k).join(', ') || '—'], ['Aree di sviluppo', rep.developmentAreas.map((k) => names[k] ?? k).join(', ') || '—']]);
    }
    const comments = rep.competencies.filter((c) => c.comments.length);
    if (comments.length) {
      pdf.h2('Commenti per competenza');
      for (const c of comments) { pdf.p(names[c.competencyKey] ?? c.competencyKey, { size: 10 }); for (const cm of c.comments) pdf.p(`• ${cm.text}${cm.category && cm.category !== 'others_merged' ? ` (${F360CategoryLabels[cm.category as F360Category] ?? cm.category})` : ''}`, { muted: true, size: 9 }); }
    }
    const open = Object.entries(rep.openAnswers).filter(([, v]) => v.length);
    if (open.length) {
      pdf.h2('Domande aperte');
      for (const [k, list] of open) { pdf.p(s.openQuestions.find((q) => q.key === k)?.label ?? k, { size: 10 }); for (const a of list) pdf.p(`• ${a.text}`, { muted: true, size: 9 }); }
    }
    if (s.debriefAt) pdf.kv([['Debrief', new Date(s.debriefAt).toLocaleDateString('it-IT')], ['Nota di debrief', s.debriefNote ?? null]]);
    pdf.p('Documento generato da WorkingBetter · le risposte delle categorie anonime non sono attribuibili · uso interno riservato.', { muted: true, size: 8 });
    await this.audit.log({ action: 'f360.export_pdf', entityType: 'f360_subject', entityId: id });
    return { buffer: await pdf.finish(), filename: `feedback-360-${name.replace(/\s+/g, '-').toLowerCase()}.pdf` };
  }

  /** Suggerimenti di nomina (F360-010): riporti diretti, pari (stesso manager o stessa unità), colleghi con una relazione 1:1. */
  async suggestions(id: string) {
    const { s, c } = await this.subjectFor(id);
    const [subject] = await tx().select().from(persons).where(eq(persons.id, s.personId));
    if (!subject) throw notFound('Persona', s.personId);
    const existing = new Set((await tx().select({ id: f360Requests.raterPersonId }).from(f360Requests).where(and(eq(f360Requests.subjectId, id), sql`${f360Requests.status} <> 'rejected'`))).map((r) => r.id).filter((x): x is string => !!x));
    const active = inArray(persons.status, ['active', 'invited']);
    const reports = await tx().select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName, jobTitle: persons.jobTitle }).from(persons).where(and(eq(persons.managerId, s.personId), active));
    const peerConds: SQL[] = [sql`${persons.id} <> ${s.personId}`, active];
    const peerScope: SQL[] = [];
    if (subject.managerId) peerScope.push(eq(persons.managerId, subject.managerId));
    if (subject.orgUnitId) peerScope.push(eq(persons.orgUnitId, subject.orgUnitId));
    const peers = peerScope.length ? await tx().select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName, jobTitle: persons.jobTitle }).from(persons).where(and(...peerConds, or(...peerScope)!)) : [];
    const rels = await tx().select().from(oneOnOneRelations).where(and(or(eq(oneOnOneRelations.personAId, s.personId), eq(oneOnOneRelations.personBId, s.personId)), isNull(oneOnOneRelations.archivedAt)));
    const counterpartIds = rels.map((r) => (r.personAId === s.personId ? r.personBId : r.personAId));
    const counterparts = counterpartIds.length ? await tx().select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName, jobTitle: persons.jobTitle }).from(persons).where(and(inArray(persons.id, counterpartIds), active)) : [];
    const skip = new Set<string>([s.personId, ...(s.managerPersonId ? [s.managerPersonId] : []), ...existing]);
    const pick = (list: PersonLite[], category: F360Category) => list.filter((p) => !skip.has(p.id) && this.categoryCfg(c, category)).map((p) => { skip.add(p.id); return { ...p, category, reason: category === 'report' ? 'riporto diretto' : category === 'peer' ? (subject.managerId && p.id !== subject.managerId ? 'stesso team' : 'stessa unità') : 'collabora nei 1:1' }; });
    return [...pick(reports, 'report'), ...pick(peers, 'peer'), ...pick(counterparts, 'other')];
  }

  async nominate(id: string, dto: z.infer<typeof nominateDto>) {
    const p = principal();
    const { s, c, viewer } = await this.subjectFor(id);
    if (!this.canNominate(viewer, s, c)) throw forbidden('Le nomine non sono modificabili in questa fase');
    if (dto.category === 'self' || dto.category === 'manager') throw unprocessable(ErrorCodes.VALIDATION, 'Autovalutazione e manager sono inclusi automaticamente');
    const cfg = this.categoryCfg(c, dto.category);
    if (!cfg) throw unprocessable(ErrorCodes.VALIDATION, `Categoria non attiva: ${F360CategoryLabels[dto.category]}`);
    const current = await tx().select().from(f360Requests).where(and(eq(f360Requests.subjectId, id), sql`${f360Requests.status} <> 'rejected'`));
    if (current.filter((r) => r.category === dto.category).length >= cfg.max) throw unprocessable(ErrorCodes.VALIDATION, `Massimo ${cfg.max} valutatori per ${F360CategoryLabels[dto.category]}`);
    if (dto.personId) {
      if (dto.personId === s.personId) throw unprocessable(ErrorCodes.VALIDATION, 'La persona valutata non può nominare sé stessa');
      const [person] = await tx().select({ id: persons.id }).from(persons).where(and(eq(persons.id, dto.personId), inArray(persons.status, ['active', 'invited'])));
      if (!person) throw notFound('Persona', dto.personId);
      if (current.some((r) => r.raterPersonId === dto.personId)) throw conflict(ErrorCodes.CONFLICT, 'Persona già nominata');
    } else if (current.some((r) => r.externalEmail?.toLowerCase() === dto.externalEmail!.toLowerCase())) throw conflict(ErrorCodes.CONFLICT, 'Email già nominata');
    const [row] = await tx().insert(f360Requests).values({ tenantId: p.tenantId, createdBy: p.userId, campaignId: c.id, subjectId: id, category: dto.category, raterPersonId: dto.personId ?? null, externalEmail: dto.externalEmail?.toLowerCase() ?? null, externalName: dto.externalName ?? null, nominatedByPersonId: p.personId ?? null, status: 'proposed' }).returning();
    await this.audit.log({ action: 'f360.nominate', entityType: 'f360_request', entityId: row!.id, after: { subjectId: id, category: dto.category, personId: dto.personId ?? null, external: !!dto.externalEmail } });
    return this.getSubject(id);
  }

  async removeNomination(requestId: string) {
    const [r] = await tx().select().from(f360Requests).where(eq(f360Requests.id, requestId));
    if (!r) throw notFound('Nomina', requestId);
    const { s, c, viewer } = await this.subjectFor(r.subjectId);
    if (!this.canNominate(viewer, s, c) || r.status !== 'proposed' || r.category === 'self' || r.category === 'manager') throw forbidden('Nomina non rimovibile');
    await tx().delete(f360Requests).where(eq(f360Requests.id, requestId));
    await this.audit.log({ action: 'f360.nomination_remove', entityType: 'f360_request', entityId: requestId, before: { subjectId: r.subjectId, category: r.category } });
    return this.getSubject(r.subjectId);
  }

  private async assertMinimums(c: CampaignRow, subjectId: string) {
    const rows = await tx().select({ category: f360Requests.category, n: sql<number>`count(*)::int` }).from(f360Requests).where(and(eq(f360Requests.subjectId, subjectId), inArray(f360Requests.status, ['proposed', 'pending', 'submitted']))).groupBy(f360Requests.category);
    const missing = this.categoriesOf(c).filter((x) => x.enabled && x.min > 0 && (rows.find((r) => r.category === x.key)?.n ?? 0) < x.min).map((x) => `${F360CategoryLabels[x.key]}: almeno ${x.min}`);
    if (missing.length) throw unprocessable(ErrorCodes.VALIDATION, `Nomine insufficienti · ${missing.join(' · ')}`);
  }

  async submitNominations(id: string) {
    const p = principal();
    const { s, c, viewer } = await this.subjectFor(id);
    if (c.status !== 'nomination' || s.status !== 'nominating') throw conflict(ErrorCodes.CONFLICT, 'Le nomine non sono in fase di raccolta');
    if (viewer === 'self' && c.nominationBy !== 'subject') throw forbidden();
    if (viewer === 'manager' && c.nominationBy === 'subject') throw forbidden('Le nomine le invia la persona valutata');
    await this.assertMinimums(c, id);
    const now = new Date();
    const needsApproval = c.requireApproval && viewer === 'self' && !!s.managerPersonId;
    await tx().update(f360Subjects).set({ status: needsApproval ? 'pending_approval' : 'approved', nominationSubmittedAt: now, approvedAt: needsApproval ? null : now, approvedByPersonId: needsApproval ? null : (p.personId ?? null), updatedAt: now }).where(eq(f360Subjects.id, id));
    if (needsApproval) {
      const [n] = await tx().select({ n: sql<number>`count(*)::int` }).from(f360Requests).where(and(eq(f360Requests.subjectId, id), eq(f360Requests.status, 'proposed')));
      const me = await this.namesOf([s.personId]);
      await this.notifier.send({ personId: s.managerPersonId!, type: 'f360.approve', data: { title: c.name, otherName: personName(me.get(s.personId)), count: n?.n ?? 0 }, link: `/f360/subjects/${id}` });
    }
    await this.audit.log({ action: 'f360.nominations_submit', entityType: 'f360_subject', entityId: id, after: { needsApproval } });
    return this.getSubject(id);
  }

  async approveNominations(id: string, rejectIds: string[]) {
    const p = principal();
    const { s, c, viewer } = await this.subjectFor(id);
    if (viewer === 'self') throw forbidden();
    if (c.status !== 'nomination' || !['pending_approval', 'nominating'].includes(s.status)) throw conflict(ErrorCodes.CONFLICT, 'Nessuna nomina da approvare');
    const now = new Date();
    if (rejectIds.length) await tx().update(f360Requests).set({ status: 'rejected', updatedAt: now }).where(and(eq(f360Requests.subjectId, id), inArray(f360Requests.id, rejectIds), sql`${f360Requests.category} NOT IN ('self','manager')`));
    await this.assertMinimums(c, id);
    await tx().update(f360Subjects).set({ status: 'approved', approvedAt: now, approvedByPersonId: p.personId ?? null, nominationSubmittedAt: s.nominationSubmittedAt ?? now, updatedAt: now }).where(eq(f360Subjects.id, id));
    await this.audit.log({ action: 'f360.nominations_approve', entityType: 'f360_subject', entityId: id, after: { rejected: rejectIds.length } });
    return this.getSubject(id);
  }

  async release(id: string) {
    const p = principal();
    const { s, c, viewer } = await this.subjectFor(id);
    if (viewer === 'self') throw forbidden();
    if (s.status !== 'ready') throw conflict(ErrorCodes.CONFLICT, s.status === 'released' ? 'Già rilasciato' : 'Il report non è ancora stato generato');
    if (c.releaseRule === 'after_debrief' && !s.debriefAt) throw conflict(ErrorCodes.CONFLICT, 'Registra prima il debrief: la campagna rilascia il report dopo il colloquio');
    const now = new Date();
    await tx().update(f360Subjects).set({ status: 'released', releasedAt: now, releasedByPersonId: p.personId ?? null, updatedAt: now }).where(eq(f360Subjects.id, id));
    const me = p.personId ? await this.namesOf([p.personId]) : new Map<string, PersonLite>();
    await this.notifier.send({ personId: s.personId, type: 'f360.report_released', data: { title: c.name, fromName: p.personId ? personName(me.get(p.personId)) : null }, link: `/f360/subjects/${id}` });
    await this.audit.log({ action: 'f360.release', entityType: 'f360_subject', entityId: id });
    return this.getSubject(id);
  }

  async debrief(id: string, dto: z.infer<typeof debriefDto>) {
    const { s, c, viewer } = await this.subjectFor(id);
    if (viewer === 'self') throw forbidden();
    if (!['ready', 'released'].includes(s.status)) throw conflict(ErrorCodes.CONFLICT, 'Il debrief si registra dopo la generazione del report');
    const now = new Date();
    await tx().update(f360Subjects).set({ debriefAt: dto.at ? new Date(dto.at) : now, debriefNote: dto.note ?? s.debriefNote, updatedAt: now }).where(eq(f360Subjects.id, id));
    await this.audit.log({ action: 'f360.debrief', entityType: 'f360_subject', entityId: id, after: { at: dto.at ?? null, hasNote: !!dto.note } });
    if (c.releaseRule === 'after_debrief' && s.status === 'ready') return this.release(id);
    return this.getSubject(id);
  }

  /** Da un'area di sviluppo del report a un'azione del piano (F360-026): usa il piano in corso o ne crea uno. */
  async createDevAction(id: string, dto: z.infer<typeof devActionDto>) {
    const { s, c, viewer } = await this.subjectFor(id);
    if (!this.canSeeReport(viewer, s, c)) throw forbidden('Il report non è disponibile');
    if (!(c.competencyKeys as string[]).includes(dto.competencyKey)) throw unprocessable(ErrorCodes.VALIDATION, 'Competenza non presente nel report');
    const [plan] = await tx().select().from(developmentPlans).where(and(eq(developmentPlans.personId, s.personId), inArray(developmentPlans.status, ['draft', 'pending_approval', 'active']))).orderBy(desc(developmentPlans.createdAt)).limit(1);
    const target = plan ?? (await this.dev.createPlan({ personId: s.personId, title: `Piano di sviluppo dal 360° «${c.name}»` }));
    if (!target) throw conflict(ErrorCodes.CONFLICT, 'Impossibile creare il piano di sviluppo');
    const action = await this.dev.addAction(target.id, { title: dto.title, description: dto.description ?? `Area di sviluppo emersa dal feedback 360° «${c.name}».`, kind: dto.kind, competencyKey: dto.competencyKey, dueDate: dto.dueDate ?? null, source: '360' });
    await this.audit.log({ action: 'f360.dev_action', entityType: 'f360_subject', entityId: id, after: { actionId: action.id, competencyKey: dto.competencyKey } });
    return { planId: target.id, action };
  }

  // ---------- valutatori interni (F360-012/013) ----------

  async myRequests(status: 'open' | 'done' | 'all') {
    const p = principal();
    const conds: SQL[] = [eq(f360Requests.raterPersonId, p.personId ?? ''), sql`${f360Requests.status} NOT IN ('proposed','rejected')`];
    if (status === 'open') conds.push(eq(f360Requests.status, 'pending'));
    if (status === 'done') conds.push(inArray(f360Requests.status, ['submitted', 'declined', 'expired']));
    const rows = await tx().select({ r: f360Requests, s: f360Subjects, c: f360Campaigns }).from(f360Requests).innerJoin(f360Subjects, eq(f360Subjects.id, f360Requests.subjectId)).innerJoin(f360Campaigns, eq(f360Campaigns.id, f360Requests.campaignId)).where(and(...conds)).orderBy(desc(f360Requests.invitedAt));
    const names = await this.namesOf(rows.map((x) => x.s.personId));
    return rows.map(({ r, s, c }) => ({ id: r.id, category: r.category, categoryLabel: F360CategoryLabels[r.category], anonymous: this.categoryCfg(c, r.category)?.anonymous ?? true, status: r.status, invitedAt: r.invitedAt, submittedAt: r.submittedAt, expiresAt: r.expiresAt, hasDraft: !!r.draft, subject: names.get(s.personId) ?? null, campaign: { id: c.id, name: c.name, status: c.status, collectionDueAt: c.collectionDueAt } }));
  }

  private async questionnaireFor(t: TenantTx, r: RequestRow) {
    const c = await this.campaignRow(r.campaignId, t);
    const [s] = await t.select().from(f360Subjects).where(eq(f360Subjects.id, r.subjectId));
    const names = await this.namesOf([s?.personId], t);
    const cfg = this.categoryCfg(c, r.category);
    return {
      id: r.id,
      category: r.category,
      categoryLabel: F360CategoryLabels[r.category],
      anonymous: cfg?.anonymous ?? true,
      status: r.status,
      expiresAt: r.expiresAt,
      submittedAt: r.submittedAt,
      subject: s ? (names.get(s.personId) ?? null) : null,
      campaign: { id: c.id, name: c.name, description: c.description, status: c.status, collectionDueAt: c.collectionDueAt, anonymityThreshold: c.anonymityThreshold },
      competencies: await this.competencyDefs(c.competencyKeys as string[], t),
      scale: c.scale as F360Scale,
      openQuestions: c.openQuestions as F360OpenQuestion[],
      draft: (r.draft as Answers | null) ?? null,
      canAnswer: r.status === 'pending' && c.status === 'collection',
    };
  }

  private async myRequestRow(id: string): Promise<RequestRow> {
    const p = principal();
    const [r] = await tx().select().from(f360Requests).where(and(eq(f360Requests.id, id), eq(f360Requests.raterPersonId, p.personId ?? '')));
    if (!r || r.status === 'proposed' || r.status === 'rejected') throw notFound('Richiesta 360°', id);
    return r;
  }

  async questionnaire(id: string) {
    return this.questionnaireFor(tx(), await this.myRequestRow(id));
  }

  private validateAnswers(c: CampaignRow, a: Answers): Answers {
    const keys = c.competencyKeys as string[];
    const scale = c.scale as F360Scale;
    const ratings: Record<string, number | null> = {};
    for (const k of keys) {
      const v = a.ratings[k];
      if (v != null && (v < scale.min || v > scale.max)) throw unprocessable(ErrorCodes.VALIDATION, `Valore fuori scala per ${k}`);
      ratings[k] = v ?? null;
    }
    const comments = Object.fromEntries(Object.entries(a.comments).filter(([k, v]) => keys.includes(k) && v.trim()));
    const openKeys = (c.openQuestions as F360OpenQuestion[]).map((q) => q.key);
    const openAnswers = Object.fromEntries(Object.entries(a.openAnswers).filter(([k, v]) => openKeys.includes(k) && v.trim()));
    return { ratings, comments, openAnswers };
  }

  private async saveDraftFor(t: TenantTx, r: RequestRow, a: Answers) {
    if (r.status !== 'pending') throw conflict(ErrorCodes.CONFLICT, 'La richiesta non è più aperta');
    await t.update(f360Requests).set({ draft: a, updatedAt: new Date() }).where(eq(f360Requests.id, r.id));
    return { ok: true, savedAt: new Date().toISOString() };
  }

  /** Invio: la risposta è collegata alla richiesta solo per le categorie non anonime; la bozza viene cancellata. */
  private async submitFor(t: TenantTx, r: RequestRow, a: Answers) {
    if (r.status !== 'pending') throw conflict(ErrorCodes.CONFLICT, r.status === 'submitted' ? 'Hai già inviato le risposte' : 'La richiesta non è più aperta');
    const c = await this.campaignRow(r.campaignId, t);
    if (c.status !== 'collection') throw conflict(ErrorCodes.CONFLICT, 'La raccolta non è in corso');
    const clean = this.validateAnswers(c, a);
    if (!Object.values(clean.ratings).some((v) => v != null) && !Object.keys(clean.openAnswers).length) throw unprocessable(ErrorCodes.VALIDATION, 'Valuta almeno una competenza o rispondi a una domanda aperta');
    const anonymous = this.categoryCfg(c, r.category)?.anonymous ?? true;
    const now = new Date();
    await t.insert(f360Responses).values({ tenantId: r.tenantId, campaignId: r.campaignId, subjectId: r.subjectId, category: r.category, requestId: anonymous ? null : r.id, ratings: clean.ratings, comments: clean.comments, openAnswers: clean.openAnswers, submittedAt: now });
    await t.update(f360Requests).set({ status: 'submitted', submittedAt: now, draft: null, tokenHash: null, updatedAt: now }).where(eq(f360Requests.id, r.id));
    return { ok: true, submittedAt: now.toISOString(), anonymous };
  }

  async saveDraft(id: string, a: Answers) {
    return this.saveDraftFor(tx(), await this.myRequestRow(id), a);
  }

  async submit(id: string, a: Answers) {
    const r = await this.myRequestRow(id);
    const res = await this.submitFor(tx(), r, a);
    await this.audit.log({ action: 'f360.submit', entityType: 'f360_request', entityId: id, after: { category: r.category } });
    return res;
  }

  async decline(id: string, reason?: string) {
    const r = await this.myRequestRow(id);
    if (r.status !== 'pending') throw conflict(ErrorCodes.CONFLICT, 'La richiesta non è più aperta');
    if (r.category === 'self' || r.category === 'manager') throw forbidden('Autovalutazione e valutazione del manager non si possono declinare');
    const now = new Date();
    await tx().update(f360Requests).set({ status: 'declined', declineReason: reason ?? null, draft: null, updatedAt: now }).where(eq(f360Requests.id, id));
    const [s] = await tx().select().from(f360Subjects).where(eq(f360Subjects.id, r.subjectId));
    const c = await this.campaignRow(r.campaignId);
    if (s) {
      const names = await this.namesOf([s.personId]);
      const to = c.nominationBy === 'subject' ? s.personId : (s.managerPersonId ?? s.personId);
      await this.notifier.send({ personId: to, type: 'f360.declined', data: { title: c.name, otherName: c.nominationBy === 'subject' ? 'tuo' : personName(names.get(s.personId)), reason: reason ?? null }, link: `/f360/subjects/${s.id}` });
    }
    await this.audit.log({ action: 'f360.decline', entityType: 'f360_request', entityId: id, after: { category: r.category } });
    return { ok: true };
  }

  // ---------- valutatori esterni (magic link, F360-011) ----------

  private async externalRow(token: string): Promise<{ tenantId: string; id: string }> {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw notFound('Questionario');
    const [r] = await withPlatform(this.db, (t) => t.select({ id: f360Requests.id, tenantId: f360Requests.tenantId }).from(f360Requests).where(eq(f360Requests.tokenHash, hashToken(token))));
    if (!r) throw notFound('Questionario');
    return r;
  }
  private inTenant<T>(tenantId: string, fn: (t: TenantTx) => Promise<T>) {
    return withTenant(this.db, tenantId, fn, { appRole: this.appRole ?? undefined });
  }
  private async requestIn(t: TenantTx, id: string): Promise<RequestRow> {
    const [r] = await t.select().from(f360Requests).where(eq(f360Requests.id, id));
    if (!r) throw notFound('Questionario');
    return r;
  }

  async externalQuestionnaire(token: string) {
    const ref = await this.externalRow(token);
    return this.inTenant(ref.tenantId, async (t) => {
      const r = await this.requestIn(t, ref.id);
      const q = await this.questionnaireFor(t, r);
      return { ...q, external: { name: r.externalName, email: r.externalEmail } };
    });
  }
  async externalSaveDraft(token: string, a: Answers) {
    const ref = await this.externalRow(token);
    return this.inTenant(ref.tenantId, async (t) => this.saveDraftFor(t, await this.requestIn(t, ref.id), a));
  }
  async externalSubmit(token: string, a: Answers) {
    const ref = await this.externalRow(token);
    return this.inTenant(ref.tenantId, async (t) => this.submitFor(t, await this.requestIn(t, ref.id), a));
  }
}
