import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, like, lt, or, sql, type SQL } from 'drizzle-orm';
import { formDefinitions, orgUnits, persons, surveyInvitations, surveyResponses, surveys } from '@wb/db';
import {
  ErrorCodes,
  Permissions,
  buildSurveyForm,
  driverScores,
  enpsOf,
  enpsValues,
  formSchema,
  hasPermission,
  heatmap,
  questionStats,
  scaleQuestions,
  tenureBand,
  textQuestions,
  validateAnswers,
  type Answers,
  type FormSchema,
  type ResultRow,
} from '@wb/shared';
import type { z } from 'zod';
import { principal, tx } from '../common/context.js';
import { AppError, conflict, forbidden, notFound, unprocessable } from '../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import { FormsService } from '../forms/forms.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { CreateSurveyDto, SurveyPopulation, updateSurveyDto } from './dto.js';

type SurveyRow = typeof surveys.$inferSelect;
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

@Injectable()
export class SurveysService {
  constructor(private readonly audit: AuditService, private readonly forms: FormsService, private readonly notifier: NotificationsService) {}

  // ---------- helpers ----------

  private isHr() { return hasPermission(principal(), Permissions.SURVEYS_MANAGE); }
  private async row(id: string): Promise<SurveyRow> {
    const [s] = await tx().select().from(surveys).where(eq(surveys.id, id));
    if (!s) throw notFound('Survey', id);
    return s;
  }
  private async schemaOf(s: SurveyRow): Promise<FormSchema> {
    const [f] = await tx().select().from(formDefinitions).where(eq(formDefinitions.id, s.formDefinitionId));
    if (!f) throw notFound('Form della survey');
    return formSchema.parse(f.schema);
  }
  private async counts(surveyId: string) {
    const [c] = await tx().select({ invited: sql<number>`count(*)::int`, responded: sql<number>`count(${surveyInvitations.respondedAt})::int` }).from(surveyInvitations).where(eq(surveyInvitations.surveyId, surveyId));
    return { invited: c?.invited ?? 0, responded: c?.responded ?? 0, rate: c?.invited ? (c.responded ?? 0) / c.invited : null };
  }
  private async resolvePopulation(pop: SurveyPopulation) {
    const conds: SQL[] = [inArray(persons.status, ['active', 'invited'])];
    if (pop.orgUnitIds?.length) {
      const units = await tx().select({ path: orgUnits.path }).from(orgUnits).where(inArray(orgUnits.id, pop.orgUnitIds));
      const subtree = units.length ? await tx().select({ id: orgUnits.id }).from(orgUnits).where(or(...units.map((u) => like(orgUnits.path, `${u.path}%`)))!) : [];
      const ids = subtree.map((u) => u.id);
      if (pop.personIds?.length) conds.push(or(inArray(persons.orgUnitId, ids.length ? ids : ['00000000-0000-0000-0000-000000000000']), inArray(persons.id, pop.personIds))!);
      else conds.push(inArray(persons.orgUnitId, ids.length ? ids : ['00000000-0000-0000-0000-000000000000']));
    } else if (pop.personIds?.length) conds.push(inArray(persons.id, pop.personIds));
    const rows = await tx().select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName, orgUnitId: persons.orgUnitId, managerId: persons.managerId, hireDate: persons.hireDate }).from(persons).where(and(...conds));
    const excluded = new Set(pop.excludePersonIds ?? []);
    return rows.filter((r) => !excluded.has(r.id));
  }
  private strip(s: SurveyRow) {
    return { id: s.id, title: s.title, description: s.description, kind: s.kind, anonymous: s.anonymous, anonymityThreshold: s.anonymityThreshold, status: s.status, closesAt: s.closesAt, launchedAt: s.launchedAt, closedAt: s.closedAt, sharedAt: s.sharedAt, population: s.population, formDefinitionId: s.formDefinitionId, createdAt: s.createdAt, rotation: s.rotation, hasSummary: !!s.summary };
  }

  // ---------- elenco ----------

  async list(box?: 'mine' | 'all') {
    const p = principal();
    const all = box === 'all' || (box === undefined && this.isHr());
    if (all) {
      if (!this.isHr()) throw forbidden();
      const rows = await tx().select().from(surveys).orderBy(desc(surveys.createdAt));
      return Promise.all(rows.map(async (s) => ({ ...this.strip(s), counts: s.status === 'draft' ? null : await this.counts(s.id) })));
    }
    if (!p.personId) return [];
    const rows = await tx()
      .select({ s: surveys, respondedAt: surveyInvitations.respondedAt })
      .from(surveyInvitations)
      .innerJoin(surveys, eq(surveys.id, surveyInvitations.surveyId))
      .where(and(eq(surveyInvitations.personId, p.personId), inArray(surveys.status, ['open', 'closed', 'shared'])))
      .orderBy(desc(surveys.launchedAt));
    return rows.map((r) => ({ ...this.strip(r.s), responded: !!r.respondedAt, canRespond: r.s.status === 'open' && !r.respondedAt, canReadSummary: r.s.status === 'shared' }));
  }

  // ---------- gestione HR ----------

  async create(dto: CreateSurveyDto) {
    const p = principal();
    let formDefinitionId: string;
    let drivers = dto.drivers ?? {};
    let enpsField = dto.enpsField ?? null;
    if (dto.template) {
      const built = buildSurveyForm(dto.template, dto.title, { rotation: dto.rotation ?? 0 });
      const key = `survey_${dto.template}_${Date.now().toString(36)}`;
      const def = await this.forms.create({ key, name: dto.title, kind: 'survey', schema: built.schema });
      await this.forms.publish(def.id);
      formDefinitionId = def.id;
      drivers = built.drivers;
      enpsField = built.enpsField;
    } else {
      const def = await this.forms.latestPublished(dto.formKey!);
      if (!def) throw unprocessable(ErrorCodes.VALIDATION, `Form ${dto.formKey} non pubblicato`);
      formDefinitionId = def.id;
    }
    const [row] = await tx().insert(surveys).values({ tenantId: p.tenantId, createdBy: p.userId, title: dto.title, description: dto.description ?? null, kind: dto.template ?? 'adhoc', formDefinitionId, anonymous: dto.anonymous, anonymityThreshold: dto.anonymityThreshold, population: dto.population, closesAt: dto.closesAt ? new Date(dto.closesAt) : null, drivers, enpsField, rotation: dto.rotation ?? 0 }).returning();
    await this.audit.log({ action: 'survey.create', entityType: 'survey', entityId: row!.id, after: { title: dto.title, template: dto.template ?? null, anonymous: dto.anonymous } });
    return this.get(row!.id);
  }

  async get(id: string) {
    const s = await this.row(id);
    const schema = await this.schemaOf(s);
    const pop = s.status === 'draft' ? await this.resolvePopulation(s.population as SurveyPopulation) : null;
    const counts = s.status === 'draft' ? null : await this.counts(id);
    // tasso di risposta per unità senza scendere sotto soglia (ENG-012)
    let bySegment: { id: string | null; name: string; invited: number; responded: number | null }[] = [];
    if (counts) {
      const inv = await tx().select({ orgUnitId: persons.orgUnitId, responded: surveyInvitations.respondedAt }).from(surveyInvitations).innerJoin(persons, eq(persons.id, surveyInvitations.personId)).where(eq(surveyInvitations.surveyId, id));
      const unitIds = [...new Set(inv.map((i) => i.orgUnitId).filter((x): x is string => !!x))];
      const units = unitIds.length ? await tx().select({ id: orgUnits.id, name: orgUnits.name }).from(orgUnits).where(inArray(orgUnits.id, unitIds)) : [];
      const m = new Map<string, { invited: number; responded: number }>();
      for (const i of inv) {
        const k = i.orgUnitId ?? '';
        const c = m.get(k) ?? { invited: 0, responded: 0 };
        c.invited++;
        if (i.responded) c.responded++;
        m.set(k, c);
      }
      bySegment = [...m.entries()].map(([k, c]) => ({ id: k || null, name: k ? (units.find((u) => u.id === k)?.name ?? 'Unità') : 'Non assegnato', invited: c.invited, responded: c.invited >= s.anonymityThreshold ? c.responded : null })).sort((a, b) => a.name.localeCompare(b.name, 'it'));
    }
    return { ...this.strip(s), summary: s.summary, drivers: s.drivers, enpsField: s.enpsField, schema, counts, bySegment, populationPreview: pop ? { count: pop.length, sample: pop.slice(0, 12).map((x) => ({ id: x.id, name: fullName(x) })) } : null };
  }

  async update(id: string, dto: z.infer<typeof updateSurveyDto>) {
    const before = await this.row(id);
    if (before.status !== 'draft' && (dto.population || dto.anonymous !== undefined)) throw conflict(ErrorCodes.CONFLICT, 'Popolazione e anonimato non si cambiano dopo il lancio');
    const [row] = await tx().update(surveys).set({ ...dto, closesAt: dto.closesAt === undefined ? undefined : dto.closesAt ? new Date(dto.closesAt) : null, updatedAt: new Date() }).where(eq(surveys.id, id)).returning();
    await this.audit.log({ action: 'survey.update', entityType: 'survey', entityId: id, before: this.strip(before), after: dto });
    return this.strip(row!);
  }

  async launch(id: string, closesAt?: string) {
    const p = principal();
    const s = await this.row(id);
    if (s.status !== 'draft') throw conflict(ErrorCodes.CONFLICT, `Survey già ${s.status}`);
    const closes = closesAt ? new Date(closesAt) : s.closesAt;
    if (!closes || closes <= new Date()) throw unprocessable(ErrorCodes.VALIDATION, 'Indica una data di chiusura futura');
    const pop = await this.resolvePopulation(s.population as SurveyPopulation);
    if (pop.length < s.anonymityThreshold && s.anonymous) throw unprocessable(ErrorCodes.VALIDATION, `Popolazione (${pop.length}) sotto la soglia di anonimato (${s.anonymityThreshold})`);
    if (!pop.length) throw unprocessable(ErrorCodes.VALIDATION, 'Nessuna persona nella popolazione');
    await tx().update(surveys).set({ status: 'open', launchedAt: new Date(), closesAt: closes, updatedAt: new Date() }).where(eq(surveys.id, id));
    for (const person of pop) {
      await tx().insert(surveyInvitations).values({ tenantId: p.tenantId, createdBy: p.userId, surveyId: id, personId: person.id }).onConflictDoNothing();
      await this.notifier.send({ personId: person.id, type: 'survey.opened', data: { title: s.title, anonymous: s.anonymous ? 1 : null, closesAt: day(closes) }, link: `/surveys/${id}` });
    }
    await this.audit.log({ action: 'survey.launch', entityType: 'survey', entityId: id, after: { invited: pop.length, closesAt: closes } });
    return this.get(id);
  }

  /** Solleciti ai non rispondenti (ENG-011): l'HR riceve solo il numero, mai i nomi. */
  async remind(id: string) {
    const s = await this.row(id);
    if (s.status !== 'open') throw conflict(ErrorCodes.CONFLICT, 'La survey non è aperta');
    const today = new Date().toISOString().slice(0, 10);
    const pending = await tx().select().from(surveyInvitations).where(and(eq(surveyInvitations.surveyId, id), isNull(surveyInvitations.respondedAt)));
    let sent = 0;
    for (const inv of pending) {
      const res = await this.notifier.send({ personId: inv.personId, type: 'survey.reminder', data: { title: s.title, anonymous: s.anonymous ? 1 : null, daysLeft: s.closesAt ? Math.max(0, Math.ceil((s.closesAt.getTime() - Date.now()) / 86400000)) : '?' }, link: `/surveys/${id}`, dedupeKey: `survey_remind:${id}:${inv.personId}:${today}` });
      if (res.created) sent++;
    }
    await tx().update(surveyInvitations).set({ remindedAt: new Date() }).where(and(eq(surveyInvitations.surveyId, id), isNull(surveyInvitations.respondedAt)));
    await this.audit.log({ action: 'survey.remind', entityType: 'survey', entityId: id, after: { sent, pending: pending.length } });
    return { sent, pending: pending.length };
  }

  async close(id: string) {
    const s = await this.row(id);
    if (s.status !== 'open') throw conflict(ErrorCodes.CONFLICT, 'La survey non è aperta');
    await tx().update(surveys).set({ status: 'closed', closedAt: new Date(), updatedAt: new Date() }).where(eq(surveys.id, id));
    await this.audit.log({ action: 'survey.close', entityType: 'survey', entityId: id });
    return this.get(id);
  }
  async extend(id: string, closesAt: string) {
    const s = await this.row(id);
    if (s.status !== 'open') throw conflict(ErrorCodes.CONFLICT, 'La survey non è aperta');
    const d = new Date(closesAt);
    if (d <= new Date()) throw unprocessable(ErrorCodes.VALIDATION, 'La nuova chiusura deve essere futura');
    await tx().update(surveys).set({ closesAt: d, updatedAt: new Date() }).where(eq(surveys.id, id));
    await this.audit.log({ action: 'survey.extend', entityType: 'survey', entityId: id, after: { closesAt: d } });
    return this.get(id);
  }
  /** Pubblica la sintesi ai rispondenti (ENG-027). */
  async share(id: string, summary: string) {
    const s = await this.row(id);
    if (s.status !== 'closed' && s.status !== 'shared') throw conflict(ErrorCodes.CONFLICT, 'Chiudi la survey prima di condividere i risultati');
    await tx().update(surveys).set({ status: 'shared', sharedAt: new Date(), summary, updatedAt: new Date() }).where(eq(surveys.id, id));
    const inv = await tx().select({ personId: surveyInvitations.personId }).from(surveyInvitations).where(eq(surveyInvitations.surveyId, id));
    for (const i of inv) await this.notifier.send({ personId: i.personId, type: 'survey.shared', data: { title: s.title }, link: `/surveys/${id}`, dedupeKey: `survey_shared:${id}:${i.personId}` });
    await this.audit.log({ action: 'survey.share', entityType: 'survey', entityId: id });
    return this.get(id);
  }

  // ---------- compilazione ----------

  async formFor(id: string) {
    const p = principal();
    const s = await this.row(id);
    const [inv] = p.personId ? await tx().select().from(surveyInvitations).where(and(eq(surveyInvitations.surveyId, id), eq(surveyInvitations.personId, p.personId))) : [];
    if (!inv && !this.isHr()) throw forbidden('Non sei tra gli invitati a questa survey');
    const schema = await this.schemaOf(s);
    return { survey: this.strip(s), schema, invited: !!inv, responded: !!inv?.respondedAt, canRespond: !!inv && !inv.respondedAt && s.status === 'open' };
  }

  async respond(id: string, answers: Answers) {
    const p = principal();
    if (!p.personId) throw forbidden();
    const s = await this.row(id);
    if (s.status !== 'open') throw conflict(ErrorCodes.CONFLICT, 'La survey non è aperta');
    if (s.closesAt && s.closesAt < new Date()) throw conflict(ErrorCodes.CONFLICT, 'La survey è scaduta');
    const [inv] = await tx().select().from(surveyInvitations).where(and(eq(surveyInvitations.surveyId, id), eq(surveyInvitations.personId, p.personId)));
    if (!inv) throw forbidden('Non sei tra gli invitati a questa survey');
    if (inv.respondedAt) throw conflict(ErrorCodes.CONFLICT, 'Hai già risposto a questa survey');
    const schema = await this.schemaOf(s);
    const errors = validateAnswers(schema, answers, 'submit');
    if (errors.length) throw new AppError(422, ErrorCodes.VALIDATION, 'Risposte incomplete', undefined, errors);
    const [me] = await tx().select({ orgUnitId: persons.orgUnitId, managerId: persons.managerId, hireDate: persons.hireDate }).from(persons).where(eq(persons.id, p.personId));
    const [unit] = me?.orgUnitId ? await tx().select({ path: orgUnits.path }).from(orgUnits).where(eq(orgUnits.id, me.orgUnitId)) : [];
    // ordine deliberato: prima la risposta (senza identità), poi il flag sull'invito
    await tx().insert(surveyResponses).values({ tenantId: p.tenantId, surveyId: id, answers, personId: s.anonymous ? null : p.personId, orgUnitId: me?.orgUnitId ?? null, orgPath: unit?.path ?? '', managerId: me?.managerId ?? null, tenureBand: tenureBand(me?.hireDate) });
    await tx().update(surveyInvitations).set({ respondedAt: new Date(), updatedAt: new Date() }).where(eq(surveyInvitations.id, inv.id));
    if (!s.anonymous) await this.audit.log({ action: 'survey.respond', entityType: 'survey', entityId: id });
    return { ok: true };
  }

  // ---------- risultati ----------

  async results(id: string, segment: 'org_unit' | 'manager' | 'tenure') {
    const p = principal();
    const s = await this.row(id);
    const hr = this.isHr();
    const teamOnly = !hr && hasPermission(p, Permissions.SURVEYS_RESULTS_TEAM) && p.personId;
    if (!hr && !teamOnly) throw forbidden();
    const schema = await this.schemaOf(s);
    const drivers = s.drivers as Record<string, string>;
    const qs = scaleQuestions(schema, drivers, s.enpsField);
    const where = teamOnly ? and(eq(surveyResponses.surveyId, id), eq(surveyResponses.managerId, p.personId!)) : eq(surveyResponses.surveyId, id);
    const raw = await tx().select({ answers: surveyResponses.answers, orgUnitId: surveyResponses.orgUnitId, managerId: surveyResponses.managerId, tenureBand: surveyResponses.tenureBand }).from(surveyResponses).where(where);
    const threshold = s.anonymityThreshold;
    const total = raw.length;
    if (total < threshold) {
      return { survey: this.strip(s), scope: teamOnly ? 'team' : 'all', threshold, suppressed: true, responses: total, counts: hr ? await this.counts(id) : null, drivers: [], questions: [], enps: null, comments: [], heatmap: [], previous: null, segment };
    }
    const segKey = (r: (typeof raw)[number]) => (segment === 'org_unit' ? r.orgUnitId : segment === 'manager' ? r.managerId : r.tenureBand) ?? null;
    const rows: ResultRow[] = raw.map((r) => ({ answers: r.answers as Answers, segment: segKey(r) }));
    const labels = new Map<string, string>();
    if (segment === 'org_unit') for (const u of await tx().select({ id: orgUnits.id, name: orgUnits.name }).from(orgUnits)) labels.set(u.id, u.name);
    if (segment === 'manager') {
      const ids = [...new Set(raw.map((r) => r.managerId).filter((x): x is string => !!x))];
      if (ids.length) for (const m of await tx().select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName }).from(persons).where(inArray(persons.id, ids))) labels.set(m.id, fullName(m));
    }
    const enps = s.enpsField ? enpsOf(enpsValues(rows, s.enpsField)) : null;
    const comments = hr ? textQuestions(schema).flatMap((q) => rows.map((r) => r.answers[q.key]).filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((text) => ({ question: q.label, text }))) : [];
    // confronto con la survey precedente dello stesso tipo (ENG-022)
    let previous: { id: string; title: string; drivers: Record<string, number | null>; enps: number | null; responses: number } | null = null;
    if (hr && s.launchedAt) {
      const [prev] = await tx().select().from(surveys).where(and(eq(surveys.kind, s.kind), inArray(surveys.status, ['closed', 'shared']), lt(surveys.launchedAt, s.launchedAt))).orderBy(desc(surveys.launchedAt)).limit(1);
      if (prev) {
        const prevRows = (await tx().select({ answers: surveyResponses.answers }).from(surveyResponses).where(eq(surveyResponses.surveyId, prev.id))).map((r) => ({ answers: r.answers as Answers }));
        if (prevRows.length >= prev.anonymityThreshold) {
          const prevSchema = await this.schemaOf(prev);
          const prevQs = scaleQuestions(prevSchema, prev.drivers as Record<string, string>, prev.enpsField);
          previous = { id: prev.id, title: prev.title, drivers: Object.fromEntries(driverScores(prevQs, prevRows).map((d) => [d.key, d.score])), enps: prev.enpsField ? enpsOf(enpsValues(prevRows, prev.enpsField)).score : null, responses: prevRows.length };
        }
      }
    }
    return {
      survey: this.strip(s),
      scope: teamOnly ? 'team' : 'all',
      threshold,
      suppressed: false,
      responses: total,
      counts: hr ? await this.counts(id) : null,
      drivers: driverScores(qs, rows),
      questions: qs.map((q) => questionStats(q, rows)),
      enps,
      comments: comments.sort(() => Math.random() - 0.5),
      heatmap: teamOnly ? [] : heatmap(qs, rows, s.enpsField, threshold, (k) => labels.get(k) ?? (segment === 'tenure' ? k : 'Segmento')),
      previous,
      segment,
    };
  }

  /** Sintesi pubblica per i rispondenti dopo la condivisione (ENG-027). */
  async summary(id: string) {
    const p = principal();
    const s = await this.row(id);
    if (s.status !== 'shared') throw conflict(ErrorCodes.CONFLICT, 'Risultati non ancora condivisi');
    const [inv] = p.personId ? await tx().select({ id: surveyInvitations.id }).from(surveyInvitations).where(and(eq(surveyInvitations.surveyId, id), eq(surveyInvitations.personId, p.personId))) : [];
    if (!inv && !this.isHr()) throw forbidden();
    const schema = await this.schemaOf(s);
    const qs = scaleQuestions(schema, s.drivers as Record<string, string>, s.enpsField);
    const rows = (await tx().select({ answers: surveyResponses.answers }).from(surveyResponses).where(eq(surveyResponses.surveyId, id))).map((r) => ({ answers: r.answers as Answers }));
    const counts = await this.counts(id);
    return { survey: this.strip(s), summary: s.summary, counts, drivers: driverScores(qs, rows), enps: s.enpsField ? enpsOf(enpsValues(rows, s.enpsField)) : null };
  }
}
