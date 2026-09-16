import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import { emailOutbox, formResponses, onboardingJourneys, onboardingSurveyResponses, onboardingTasks, onboardingTemplates, orgUnits, persons, tenants, users, withPlatform, withTenant, type AnyDb } from '@wb/db';
import {
  ErrorCodes,
  OnboardingPresets,
  OnboardingSurveys,
  OnboardingTaskKindLabels,
  Permissions,
  dayIndex,
  dueDateFrom,
  hasPermission,
  journeyComplete,
  journeyProgress,
  matchTemplate,
  onboardingJourneyToApp,
  onboardingSurveyScore,
  resolveAssignee,
  stageKeyForTask,
  suggestBuddies,
  type OnboardingPhase,
  type OnboardingSurveyKey,
  type OnboardingTaskDef,
  type OnboardingTemplateRules,
  type Principal,
  type Answers,
} from '@wb/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { principal, requestContext, tx } from '../common/context.js';
import { CONFIG, type AppConfig } from '../config.js';
import { DB, DB_APP_ROLE } from '../db/db.module.js';
import { AppsService, type StageDoneEvent } from '../apps/apps.service.js';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors.js';
import { FormsService, type SubmittedResponse } from '../forms/forms.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { addTaskDto, createTemplateDto, startJourneyDto, surveyDto, updateJourneyDto, updateTaskDto, updateTemplateDto } from './dto.js';

type TemplateRow = typeof onboardingTemplates.$inferSelect;
type JourneyRow = typeof onboardingJourneys.$inferSelect;
type TaskRow = typeof onboardingTasks.$inferSelect;
type Viewer = 'self' | 'manager' | 'hr' | 'participant';
export interface PersonLite { id: string; firstName: string; lastName: string; jobTitle: string | null }

const today = () => new Date().toISOString().slice(0, 10);
const personName = (p?: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}` : '—');
const MILESTONES = [25, 50, 75, 100];
const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
const EXTERNAL_USER = '00000000-0000-0000-0000-000000000000';
/** Fasi di pre-boarding: iniziano prima della data di riferimento (ONB-011). */
const isPreboardingPhase = (ph: OnboardingPhase) => ph.fromDay < 0;

/**
 * Onboarding (ONB): template con fasi e task, percorsi per persona con scadenze relative, task per ruolo
 * (persona, manager, HR, buddy, IT), mini-survey nominali con alert, dashboard. La persona vede il proprio percorso;
 * il manager quelli dei riporti; buddy e IT solo i propri task; l'HR tutto.
 */
@Injectable()
export class OnboardingService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: AnyDb,
    @Inject(DB_APP_ROLE) private readonly appRole: string | null,
    @Inject(CONFIG) private readonly cfg: AppConfig,
    private readonly audit: AuditService,
    private readonly notifier: NotificationsService,
    private readonly forms: FormsService,
    private readonly apps: AppsService,
  ) {}

  onModuleInit() {
    // percorsi precedenti alla convergenza (compilazioni con contesto `onboarding_task`)
    this.forms.onSubmitted('onboarding_task', (r) => this.onFormSubmitted(r));
    // percorsi sul motore (ADR-0011): una fase form conclusa chiude il task
    this.apps.onStageDone((e) => this.onEngineStageDone(e));
  }

  // ---------- helper ----------

  private async templateRow(id: string): Promise<TemplateRow> {
    const [t] = await tx().select().from(onboardingTemplates).where(eq(onboardingTemplates.id, id));
    if (!t) throw notFound('Template di onboarding', id);
    return t;
  }
  private async journeyRow(id: string): Promise<JourneyRow> {
    const [j] = await tx().select().from(onboardingJourneys).where(eq(onboardingJourneys.id, id));
    if (!j) throw notFound('Percorso di onboarding', id);
    return j;
  }
  private async namesOf(ids: readonly (string | null | undefined)[]): Promise<Map<string, PersonLite>> {
    const uniq = [...new Set(ids.filter((x): x is string => !!x))];
    if (!uniq.length) return new Map();
    const rows = await tx().select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName, jobTitle: persons.jobTitle }).from(persons).where(inArray(persons.id, uniq));
    return new Map(rows.map((r) => [r.id, r]));
  }
  private async viewerOf(p: Principal, j: JourneyRow): Promise<Viewer | null> {
    if (hasPermission(p, Permissions.ONBOARDING_MANAGE)) return 'hr';
    if (!p.personId) return null;
    if (j.personId === p.personId) return 'self';
    if (j.managerPersonId === p.personId && hasPermission(p, Permissions.ONBOARDING_TEAM)) return 'manager';
    if (j.buddyPersonId === p.personId || j.itPersonId === p.personId || j.hrPersonId === p.personId) return 'participant';
    const [t] = await tx().select({ id: onboardingTasks.id }).from(onboardingTasks).where(and(eq(onboardingTasks.journeyId, j.id), eq(onboardingTasks.assigneePersonId, p.personId))).limit(1);
    return t ? 'participant' : null;
  }
  private async journeyFor(id: string) {
    const p = principal();
    const j = await this.journeyRow(id);
    const viewer = await this.viewerOf(p, j);
    if (!viewer) throw notFound('Percorso di onboarding', id);
    return { j, viewer, p };
  }
  private templateView(t: TemplateRow) {
    return { ...t, phases: t.phases as OnboardingPhase[], tasks: t.tasks as OnboardingTaskDef[], rules: t.rules as OnboardingTemplateRules };
  }

  // ---------- template (ONB-001/002/003) ----------

  async listTemplates() {
    const rows = await tx().select().from(onboardingTemplates).orderBy(onboardingTemplates.kind, desc(onboardingTemplates.isDefault), onboardingTemplates.name);
    const counts = await tx().select({ templateId: onboardingJourneys.templateId, n: sql<number>`count(*)::int` }).from(onboardingJourneys).groupBy(onboardingJourneys.templateId);
    return rows.map((t) => ({ ...this.templateView(t), journeys: counts.find((c) => c.templateId === t.id)?.n ?? 0 }));
  }
  async getTemplate(id: string) {
    return this.templateView(await this.templateRow(id));
  }
  async createTemplate(dto: z.infer<typeof createTemplateDto>) {
    const p = principal();
    if (dto.isDefault) await tx().update(onboardingTemplates).set({ isDefault: false }).where(and(eq(onboardingTemplates.kind, dto.kind), eq(onboardingTemplates.isDefault, true)));
    const [row] = await tx().insert(onboardingTemplates).values({ tenantId: p.tenantId, createdBy: p.userId, name: dto.name, kind: dto.kind, description: dto.description ?? null, phases: dto.phases, tasks: dto.tasks, rules: dto.rules, isDefault: dto.isDefault, active: dto.active }).returning();
    await this.audit.log({ action: 'onboarding.template_create', entityType: 'onboarding_template', entityId: row!.id, after: { name: dto.name, kind: dto.kind, tasks: dto.tasks.length } });
    return this.templateView(row!);
  }
  async updateTemplate(id: string, dto: z.infer<typeof updateTemplateDto>) {
    const before = await this.templateRow(id);
    const phases = dto.phases ?? (before.phases as OnboardingPhase[]);
    const tasks = dto.tasks ?? (before.tasks as OnboardingTaskDef[]);
    if (!tasks.every((x) => phases.some((ph) => ph.key === x.phase))) throw unprocessable(ErrorCodes.VALIDATION, 'Ogni task deve appartenere a una fase esistente');
    if (new Set(tasks.map((x) => x.key)).size !== tasks.length) throw unprocessable(ErrorCodes.VALIDATION, 'Chiavi dei task duplicate');
    if (dto.isDefault) await tx().update(onboardingTemplates).set({ isDefault: false }).where(and(eq(onboardingTemplates.kind, before.kind), eq(onboardingTemplates.isDefault, true)));
    const [row] = await tx().update(onboardingTemplates).set({ ...dto, updatedAt: new Date() }).where(eq(onboardingTemplates.id, id)).returning();
    await this.audit.log({ action: 'onboarding.template_update', entityType: 'onboarding_template', entityId: id, before: { name: before.name, tasks: (before.tasks as unknown[]).length }, after: { ...dto, tasks: dto.tasks?.length } });
    return this.templateView(row!);
  }
  async loadPresets() {
    const p = principal();
    const existing = new Set((await tx().select({ name: onboardingTemplates.name }).from(onboardingTemplates)).map((t) => t.name));
    const hasDefault = new Set((await tx().select({ kind: onboardingTemplates.kind }).from(onboardingTemplates).where(eq(onboardingTemplates.isDefault, true))).map((t) => t.kind));
    const toAdd = OnboardingPresets.filter((t) => !existing.has(t.name));
    if (toAdd.length) await tx().insert(onboardingTemplates).values(toAdd.map((t) => ({ tenantId: p.tenantId, createdBy: p.userId, name: t.name, kind: t.kind, description: t.description ?? null, phases: t.phases, tasks: t.tasks, rules: t.rules ?? {}, isDefault: !!t.isDefault && !hasDefault.has(t.kind) })));
    await this.audit.log({ action: 'onboarding.presets_loaded', entityType: 'onboarding_template', after: { added: toAdd.map((t) => t.name) } });
    return { added: toAdd.length, total: existing.size + toAdd.length };
  }

  // ---------- avvio (ONB-010) ----------

  private async personRow(id: string) {
    const [person] = await tx().select().from(persons).where(eq(persons.id, id));
    if (!person) throw notFound('Persona', id);
    return person;
  }
  private async pickTemplate(person: typeof persons.$inferSelect, kind: 'onboarding' | 'role_change' | 'offboarding') {
    const templates = (await tx().select().from(onboardingTemplates).where(eq(onboardingTemplates.active, true))).map((t) => this.templateView(t));
    const unit = person.orgUnitId ? (await tx().select({ path: orgUnits.path }).from(orgUnits).where(eq(orgUnits.id, person.orgUnitId)))[0] : undefined;
    return matchTemplate(templates, { orgUnitId: person.orgUnitId, orgUnitPath: unit?.path ?? null, location: person.location, jobTitle: person.jobTitle }, kind);
  }

  /** Crea percorso e task per una persona (usato dall'avvio manuale, automatico e dal worker). */
  async start(dto: z.infer<typeof startJourneyDto>, opts: { silent?: boolean } = {}) {
    const p = principal();
    const person = await this.personRow(dto.personId);
    const isHr = hasPermission(p, Permissions.ONBOARDING_MANAGE);
    if (!isHr && person.managerId !== p.personId) throw forbidden('Puoi avviare l’onboarding solo per i tuoi riporti diretti');
    const kind = dto.kind ?? (dto.templateId ? (await this.templateRow(dto.templateId)).kind : 'onboarding');
    const [existing] = await tx().select({ id: onboardingJourneys.id }).from(onboardingJourneys).where(and(eq(onboardingJourneys.personId, dto.personId), eq(onboardingJourneys.kind, kind), eq(onboardingJourneys.status, 'active')));
    if (existing) throw conflict(ErrorCodes.CONFLICT, 'La persona ha già un percorso attivo di questo tipo');
    const template = dto.templateId ? this.templateView(await this.templateRow(dto.templateId)) : await this.pickTemplate(person, kind);
    if (!template) throw unprocessable(ErrorCodes.VALIDATION, 'Nessun template disponibile: caricane uno dai predefiniti');
    const anchorDate = dto.anchorDate ?? (kind === 'offboarding' ? person.terminationDate : person.hireDate) ?? today();
    const hrPersonId = isHr ? (p.personId ?? null) : null;
    const [j] = await tx()
      .insert(onboardingJourneys)
      .values({ tenantId: p.tenantId, createdBy: p.userId, templateId: template.id, personId: person.id, kind, managerPersonId: person.managerId, buddyPersonId: dto.buddyPersonId ?? null, hrPersonId, anchorDate, templateName: template.name, phases: template.phases })
      .returning();
    const ctx = { personId: person.id, managerId: person.managerId, buddyId: dto.buddyPersonId ?? null, hrId: hrPersonId, itId: null };
    const rows = template.tasks.map((x) => ({ tenantId: p.tenantId, createdBy: p.userId, journeyId: j!.id, personId: person.id, key: x.key, phase: x.phase, title: x.title, description: x.description ?? null, role: x.role, kind: x.kind, assigneePersonId: resolveAssignee(x, ctx), dueDate: dueDateFrom(anchorDate, x.dueDay), link: x.link ?? null, formKey: x.formKey ?? null, surveyKey: x.surveyKey ?? null, required: x.required }));
    if (rows.length) await tx().insert(onboardingTasks).values(rows);
    await this.launchOnEngine(j!);
    await this.attachForms(j!.id);
    if (!opts.silent) await this.notifyStart(j!, person, rows);
    const external = kind === 'onboarding' ? await this.issueExternalLink(j!, person, { onlyIfNoAccount: true }) : null;
    await this.audit.log({ action: 'onboarding.start', entityType: 'onboarding_journey', entityId: j!.id, after: { personId: person.id, template: template.name, kind, anchorDate, tasks: rows.length, external: !!external } });
    return this.getJourney(j!.id);
  }

  /**
   * Convergenza sul motore (ADR-0011): il percorso diventa un'istanza silenziosa con una fase per task, tutte attive
   * dall'avvio; le fasi form nascono nel form engine dal motore (il link del task punta a quella compilazione).
   */
  private async launchOnEngine(j: JourneyRow) {
    const p = principal();
    const tasks = await tx().select().from(onboardingTasks).where(eq(onboardingTasks.journeyId, j.id)).orderBy(asc(onboardingTasks.createdAt), asc(onboardingTasks.id));
    if (!tasks.length) return;
    const published = new Set<string>();
    for (const key of new Set(tasks.map((t) => t.formKey).filter((x): x is string => !!x))) if (await this.forms.latestPublished(key)) published.add(key);
    const like = tasks.map((t) => ({ ...t, formKey: t.formKey && published.has(t.formKey) ? t.formKey : null }));
    const definition = onboardingJourneyToApp({ id: j.id, templateName: j.templateName, kind: j.kind, anchorDate: j.anchorDate }, like, today());
    const inst = await this.apps.launchInternal({ definition, subjectPersonId: j.personId, title: null, moduleLink: `/onboarding/journeys/${j.id}`, launcher: p });
    const runs = await this.apps.currentRuns(inst.id);
    for (const [i, t] of tasks.entries()) {
      const stageKey = stageKeyForTask(t, i);
      const run = runs.get(stageKey);
      await tx().update(onboardingTasks).set({ stageKey, link: run?.formResponseId ? `/forms/responses/${run.formResponseId}` : t.link, updatedAt: new Date() }).where(eq(onboardingTasks.id, t.id));
      if (run) await this.apps.setDueInternal(run.id, t.dueDate);
    }
    await tx().update(onboardingJourneys).set({ appInstanceId: inst.id, updatedAt: new Date() }).where(eq(onboardingJourneys.id, j.id));
  }

  /** Run del motore che rispecchia un task (null per i percorsi precedenti e i task ad hoc). */
  private async runFor(j: JourneyRow, t: TaskRow) {
    if (!j.appInstanceId || !t.stageKey) return null;
    return (await this.apps.currentRuns(j.appInstanceId)).get(t.stageKey) ?? null;
  }
  private async syncTaskToEngine(j: JourneyRow, t: TaskRow, change: { status?: 'open' | 'done' | 'skipped'; dueDate?: string | null; assigneePersonId?: string | null; note?: string | null }) {
    const run = await this.runFor(j, t);
    if (!run) return;
    if (change.dueDate !== undefined) await this.apps.setDueInternal(run.id, change.dueDate);
    if (change.assigneePersonId !== undefined) await this.apps.reassignInternal(run.id, change.assigneePersonId);
    if (change.status === 'done') await this.apps.completeRunInternal(run.id, { outcome: run.type === 'form' ? 'submitted' : 'approved', comment: change.note ?? null });
    else if (change.status === 'skipped') await this.apps.skipRunInternal(run.id, change.note ?? null);
    else if (change.status === 'open') {
      const fresh = await this.apps.reopenStage(j.appInstanceId!, t.stageKey!);
      if (fresh?.formResponseId && fresh.formResponseId !== run.formResponseId) {
        // nuova compilazione: le risposte precedenti restano disponibili come bozza
        if (run.formResponseId) {
          const [prev] = await tx().select({ answers: formResponses.answers }).from(formResponses).where(eq(formResponses.id, run.formResponseId));
          if (prev) await tx().update(formResponses).set({ answers: prev.answers, updatedAt: new Date() }).where(eq(formResponses.id, fresh.formResponseId));
        }
        await tx().update(onboardingTasks).set({ link: `/forms/responses/${fresh.formResponseId}`, updatedAt: new Date() }).where(eq(onboardingTasks.id, t.id));
      }
    }
  }

  // ---------- pre-boarding con identità esterna (ONB-011) ----------

  private externalUrl(token: string) {
    return `${this.cfg.APP_BASE_URL.replace(/\/$/, '')}/onboarding/external/${token}`;
  }

  /** Genera (o rigenera) il magic link della persona senza account e invia l'email; ritorna null se non serve o non c'è email. */
  private async issueExternalLink(j: JourneyRow, person: typeof persons.$inferSelect, opts: { onlyIfNoAccount?: boolean } = {}) {
    if (!person.email) return null;
    if (opts.onlyIfNoAccount) {
      const [account] = await tx().select({ id: users.id }).from(users).where(eq(users.personId, person.id));
      if (account) return null;
    }
    const preTasks = await tx().select({ id: onboardingTasks.id, phase: onboardingTasks.phase, role: onboardingTasks.role, status: onboardingTasks.status }).from(onboardingTasks).where(eq(onboardingTasks.journeyId, j.id));
    const phases = (j.phases as OnboardingPhase[]).filter(isPreboardingPhase).map((ph) => ph.key);
    const n = preTasks.filter((t) => t.role === 'newcomer' && phases.includes(t.phase) && t.status === 'open').length;
    if (!n) return null;
    const token = randomBytes(24).toString('base64url');
    const expires = new Date(`${dueDateFrom(j.anchorDate, 30)}T23:59:59Z`);
    await tx().update(onboardingJourneys).set({ externalEmail: person.email, externalTokenHash: hashToken(token), externalTokenExpiresAt: expires, updatedAt: new Date() }).where(eq(onboardingJourneys.id, j.id));
    const [tenant] = await tx().select({ name: tenants.name }).from(tenants).where(eq(tenants.id, j.tenantId));
    const org = tenant?.name ?? 'WorkingBetter';
    await tx().insert(emailOutbox).values({
      tenantId: j.tenantId,
      toEmail: person.email,
      toName: `${person.firstName} ${person.lastName}`,
      subject: `Benvenuto/a in ${org}: il tuo pre-boarding`,
      text: `Ciao ${person.firstName},\n\nprima del tuo ingresso (${j.anchorDate}) ci sono ${n} attività da completare: documenti da leggere e firmare, informazioni da inviarci.\n\nApri il tuo percorso qui: ${this.externalUrl(token)}\n\nIl link è personale, vale fino a 30 giorni dopo l'ingresso e non richiede una password. Dal primo giorno userai il tuo account.\n\nA presto,\n${org}`,
    });
    return { email: person.email, tasks: n, expiresAt: expires };
  }

  /** HR o manager (ri)inviano il link di pre-boarding (anche se la persona ha già un account). */
  async sendExternalLink(id: string) {
    const { j, viewer } = await this.journeyFor(id);
    if (viewer !== 'hr' && viewer !== 'manager') throw forbidden();
    if (j.status !== 'active') throw conflict(ErrorCodes.CONFLICT, 'Il percorso non è attivo');
    const person = await this.personRow(j.personId);
    const r = await this.issueExternalLink(j, person);
    if (!r) throw unprocessable(ErrorCodes.VALIDATION, person.email ? 'Nessun task di pre-boarding aperto per la persona' : 'La persona non ha un indirizzo email');
    await this.audit.log({ action: 'onboarding.external_link', entityType: 'onboarding_journey', entityId: id, after: { email: r.email, tasks: r.tasks } });
    return { sent: true, email: r.email, tasks: r.tasks, expiresAt: r.expiresAt };
  }

  /** Risolve il token (fuori da ogni tenant) e ritorna tenant e percorso; scaduto o inesistente → 404. */
  private async externalRef(token: string): Promise<{ tenantId: string; journeyId: string }> {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw notFound('Percorso');
    const [j] = await withPlatform(this.db, (t) => t.select({ id: onboardingJourneys.id, tenantId: onboardingJourneys.tenantId, expires: onboardingJourneys.externalTokenExpiresAt, status: onboardingJourneys.status }).from(onboardingJourneys).where(eq(onboardingJourneys.externalTokenHash, hashToken(token))));
    if (!j || j.status !== 'active' || (j.expires && j.expires < new Date())) throw notFound('Percorso');
    return { tenantId: j.tenantId, journeyId: j.id };
  }

  /** Esegue `fn` come la persona del percorso (principal sintetico, transazione del tenant): stesse regole degli utenti autenticati. */
  private async asNewcomer<T>(ref: { tenantId: string; journeyId: string }, fn: (j: JourneyRow) => Promise<T>): Promise<T> {
    return withTenant(this.db, ref.tenantId, async (t) => {
      const [j] = await t.select().from(onboardingJourneys).where(eq(onboardingJourneys.id, ref.journeyId));
      if (!j) throw notFound('Percorso');
      const [person] = await t.select().from(persons).where(eq(persons.id, j.personId));
      const base = requestContext.getStore();
      const principalLike: Principal = { userId: EXTERNAL_USER, tenantId: ref.tenantId, personId: j.personId, roles: ['employee'], email: person?.email ?? undefined, name: person ? `${person.firstName} ${person.lastName}` : undefined };
      return requestContext.run({ requestId: base?.requestId ?? randomUUID(), principal: principalLike, tx: t, ip: base?.ip, userAgent: base?.userAgent }, () => fn(j));
    }, { appRole: this.appRole ?? undefined });
  }

  /** Percorso di pre-boarding per il link esterno: solo i task della persona nelle fasi prima dell'ingresso. */
  async externalJourney(token: string) {
    const ref = await this.externalRef(token);
    return this.asNewcomer(ref, async (j) => {
      const phases = (j.phases as OnboardingPhase[]).filter(isPreboardingPhase);
      const keys = phases.map((ph) => ph.key);
      const rows = await tx().select().from(onboardingTasks).where(and(eq(onboardingTasks.journeyId, j.id), eq(onboardingTasks.role, 'newcomer'), inArray(onboardingTasks.phase, keys.length ? keys : ['__none__']))).orderBy(asc(onboardingTasks.dueDate), asc(onboardingTasks.createdAt));
      const [person] = await tx().select({ firstName: persons.firstName, lastName: persons.lastName, jobTitle: persons.jobTitle }).from(persons).where(eq(persons.id, j.personId));
      const [tenant] = await tx().select({ name: tenants.name }).from(tenants).where(eq(tenants.id, j.tenantId));
      const names = await this.namesOf([j.managerPersonId, j.buddyPersonId, j.hrPersonId]);
      const day = today();
      const tasks = [];
      for (const t of rows) {
        const form = t.kind === 'form' && t.link?.startsWith('/forms/responses/') ? await this.forms.getResponse(t.link.slice('/forms/responses/'.length)).catch(() => null) : null;
        tasks.push({ ...this.taskView(t, names, principal(), day), form: form ? { responseId: form.id, status: form.status, schema: form.form.schema, answers: form.answers as Record<string, unknown> } : null });
      }
      return {
        organization: tenant?.name ?? 'WorkingBetter',
        person: person ?? null,
        templateName: j.templateName,
        anchorDate: j.anchorDate,
        manager: j.managerPersonId ? (names.get(j.managerPersonId) ?? null) : null,
        buddy: j.buddyPersonId ? (names.get(j.buddyPersonId) ?? null) : null,
        phases,
        tasks,
        progress: { total: tasks.length, done: tasks.filter((t) => t.status !== 'open').length },
      };
    });
  }

  /** Completa un task di pre-boarding dal link esterno (todo, lettura, presa visione, incontro). */
  async externalCompleteTask(token: string, taskId: string, dto: { acknowledged?: boolean; note?: string | null }) {
    const ref = await this.externalRef(token);
    return this.asNewcomer(ref, async (j) => {
      const [t] = await tx().select().from(onboardingTasks).where(and(eq(onboardingTasks.id, taskId), eq(onboardingTasks.journeyId, j.id), eq(onboardingTasks.role, 'newcomer')));
      if (!t) throw notFound('Task di onboarding', taskId);
      if (!(j.phases as OnboardingPhase[]).filter(isPreboardingPhase).some((ph) => ph.key === t.phase)) throw forbidden('Dal link esterno si completano solo i task di pre-boarding');
      if (t.kind === 'form' || t.kind === 'survey') throw unprocessable(ErrorCodes.VALIDATION, 'Questo task si chiude inviando il modulo');
      return this.updateTask(taskId, { status: 'done', acknowledged: dto.acknowledged, note: dto.note });
    });
  }

  /** Invia un modulo di pre-boarding dal link esterno: passa dal form engine (validazione, punteggi, hook del motore). */
  async externalSubmitForm(token: string, taskId: string, answers: Record<string, unknown>) {
    const ref = await this.externalRef(token);
    return this.asNewcomer(ref, async (j) => {
      const [t] = await tx().select().from(onboardingTasks).where(and(eq(onboardingTasks.id, taskId), eq(onboardingTasks.journeyId, j.id), eq(onboardingTasks.role, 'newcomer'), eq(onboardingTasks.kind, 'form')));
      if (!t?.link?.startsWith('/forms/responses/')) throw notFound('Task di onboarding', taskId);
      if (!(j.phases as OnboardingPhase[]).filter(isPreboardingPhase).some((ph) => ph.key === t.phase)) throw forbidden('Dal link esterno si completano solo i task di pre-boarding');
      const responseId = t.link.slice('/forms/responses/'.length);
      await this.forms.submit(responseId, answers as Answers);
      const [fresh] = await tx().select().from(onboardingTasks).where(eq(onboardingTasks.id, taskId));
      return this.taskView(fresh!, await this.namesOf([fresh!.assigneePersonId]), principal(), today());
    });
  }

  /** Per i task "form" crea la compilazione nel form engine, così la consegna chiude il task. */
  private async attachForms(journeyId: string) {
    const rows = await tx().select().from(onboardingTasks).where(and(eq(onboardingTasks.journeyId, journeyId), eq(onboardingTasks.kind, 'form'), eq(onboardingTasks.status, 'open')));
    for (const t of rows) {
      if (!t.formKey || !t.assigneePersonId || t.link) continue;
      const form = await this.forms.latestPublished(t.formKey);
      if (!form) continue;
      // compilazione creata dal sistema (come nelle review): il form engine chiude il task alla consegna
      const p = principal();
      const [resp] = await tx().insert(formResponses).values({ tenantId: p.tenantId, createdBy: p.userId, formDefinitionId: form.id, formKey: form.key, formVersion: form.version, respondentPersonId: t.assigneePersonId, subjectPersonId: t.personId, contextType: 'onboarding_task', contextId: t.id, dueDate: t.dueDate ? new Date(`${t.dueDate}T23:59:59Z`) : null }).returning();
      await tx().update(onboardingTasks).set({ link: `/forms/responses/${resp!.id}`, updatedAt: new Date() }).where(eq(onboardingTasks.id, t.id));
    }
  }

  private async notifyStart(j: JourneyRow, person: typeof persons.$inferSelect, rows: { assigneePersonId: string | null; role: string }[]) {
    const byAssignee = new Map<string, { role: string; n: number }>();
    for (const r of rows) if (r.assigneePersonId && r.assigneePersonId !== person.id) byAssignee.set(r.assigneePersonId, { role: byAssignee.get(r.assigneePersonId)?.role ?? r.role, n: (byAssignee.get(r.assigneePersonId)?.n ?? 0) + 1 });
    const roleLabel: Record<string, string> = { manager: 'manager', hr: 'HR', buddy: 'buddy', it: 'IT', newcomer: 'persona' };
    for (const [pid, info] of byAssignee) await this.notifier.send({ personId: pid, type: 'onboarding.started', data: { otherName: personName(person), title: j.templateName, anchorDate: j.anchorDate, role: roleLabel[info.role] ?? info.role, tasks: info.n }, link: `/onboarding/journeys/${j.id}`, dedupeKey: `onb_start:${j.id}:${pid}` });
    await this.notifier.send({ personId: person.id, type: 'onboarding.started', data: { otherName: 'te', title: j.templateName, anchorDate: j.anchorDate, role: 'persona', tasks: rows.filter((r) => r.assigneePersonId === person.id).length }, link: '/onboarding', dedupeKey: `onb_start:${j.id}:${person.id}` });
  }

  /** Avvio automatico: nuovi ingressi recenti senza percorso e persone in uscita con data (ONB-010/018). */
  async autoStart(sinceDays = 30) {
    const since = dueDateFrom(today(), -sinceDays);
    const active = await tx().select({ personId: onboardingJourneys.personId, kind: onboardingJourneys.kind }).from(onboardingJourneys);
    const has = (pid: string, kind: string) => active.some((a) => a.personId === pid && a.kind === kind);
    const hires = await tx().select().from(persons).where(and(inArray(persons.status, ['active', 'invited']), gte(persons.hireDate, since)));
    const leaving = await tx().select().from(persons).where(and(eq(persons.status, 'leaving'), sql`${persons.terminationDate} IS NOT NULL`));
    const started: { personId: string; kind: string; journeyId: string }[] = [];
    for (const person of hires) {
      if (has(person.id, 'onboarding')) continue;
      const j = await this.start({ personId: person.id, kind: 'onboarding' }).catch(() => null);
      if (j) started.push({ personId: person.id, kind: 'onboarding', journeyId: j.id });
    }
    for (const person of leaving) {
      if (has(person.id, 'offboarding')) continue;
      const j = await this.start({ personId: person.id, kind: 'offboarding' }).catch(() => null);
      if (j) started.push({ personId: person.id, kind: 'offboarding', journeyId: j.id });
    }
    return { started: started.length, journeys: started };
  }

  // ---------- percorsi ----------

  async listJourneys(q: { box: 'mine' | 'team' | 'all'; status: 'active' | 'completed' | 'cancelled' | 'all' }) {
    const p = principal();
    const conds: SQL[] = [];
    if (q.box === 'mine') conds.push(eq(onboardingJourneys.personId, p.personId ?? ''));
    else if (q.box === 'team') {
      if (!hasPermission(p, Permissions.ONBOARDING_TEAM) && !hasPermission(p, Permissions.ONBOARDING_MANAGE)) throw forbidden();
      conds.push(eq(onboardingJourneys.managerPersonId, p.personId ?? ''));
    } else if (!hasPermission(p, Permissions.ONBOARDING_MANAGE)) throw forbidden();
    if (q.status !== 'all') conds.push(eq(onboardingJourneys.status, q.status));
    const rows = await tx().select().from(onboardingJourneys).where(conds.length ? and(...conds) : undefined).orderBy(desc(onboardingJourneys.anchorDate));
    return this.summaries(rows);
  }

  private async summaries(rows: JourneyRow[]) {
    if (!rows.length) return [];
    const tasks = await tx().select({ journeyId: onboardingTasks.journeyId, status: onboardingTasks.status, dueDate: onboardingTasks.dueDate, required: onboardingTasks.required }).from(onboardingTasks).where(inArray(onboardingTasks.journeyId, rows.map((r) => r.id)));
    const surveys = await tx().select({ journeyId: onboardingSurveyResponses.journeyId, surveyKey: onboardingSurveyResponses.surveyKey, score: onboardingSurveyResponses.score, low: onboardingSurveyResponses.low }).from(onboardingSurveyResponses).where(inArray(onboardingSurveyResponses.journeyId, rows.map((r) => r.id)));
    const names = await this.namesOf(rows.flatMap((r) => [r.personId, r.managerPersonId, r.buddyPersonId]));
    const day = today();
    return rows.map((j) => ({
      id: j.id,
      kind: j.kind,
      status: j.status,
      templateName: j.templateName,
      anchorDate: j.anchorDate,
      day: dayIndex(j.anchorDate, day),
      startedAt: j.startedAt,
      completedAt: j.completedAt,
      person: names.get(j.personId) ?? null,
      manager: j.managerPersonId ? (names.get(j.managerPersonId) ?? null) : null,
      buddy: j.buddyPersonId ? (names.get(j.buddyPersonId) ?? null) : null,
      progress: journeyProgress(tasks.filter((t) => t.journeyId === j.id), day),
      surveys: surveys.filter((s) => s.journeyId === j.id).map((s) => ({ key: s.surveyKey, score: s.score == null ? null : Number(s.score), low: s.low })),
    }));
  }

  async getJourney(id: string) {
    const { j, viewer, p } = await this.journeyFor(id);
    const all = await tx().select().from(onboardingTasks).where(eq(onboardingTasks.journeyId, id)).orderBy(asc(onboardingTasks.dueDate), asc(onboardingTasks.createdAt));
    const tasks = viewer === 'participant' ? all.filter((t) => t.assigneePersonId === p.personId) : all;
    const names = await this.namesOf([j.personId, j.managerPersonId, j.buddyPersonId, j.hrPersonId, j.itPersonId, ...all.map((t) => t.assigneePersonId), ...all.map((t) => t.completedByPersonId)]);
    const responses = viewer === 'participant' ? [] : await tx().select().from(onboardingSurveyResponses).where(eq(onboardingSurveyResponses.journeyId, id));
    const day = today();
    const [summary] = await this.summaries([j]);
    return {
      ...summary!,
      viewer,
      phases: j.phases as OnboardingPhase[],
      hr: j.hrPersonId ? (names.get(j.hrPersonId) ?? null) : null,
      it: j.itPersonId ? (names.get(j.itPersonId) ?? null) : null,
      appInstanceId: j.appInstanceId,
      external: viewer === 'hr' || viewer === 'manager' ? { email: j.externalEmail, expiresAt: j.externalTokenExpiresAt, active: !!j.externalTokenHash && (!j.externalTokenExpiresAt || j.externalTokenExpiresAt > new Date()) } : null,
      can: { edit: viewer === 'hr' || viewer === 'manager', addTask: viewer === 'hr' || viewer === 'manager', assignBuddy: viewer === 'hr' || viewer === 'manager', sendExternalLink: (viewer === 'hr' || viewer === 'manager') && j.status === 'active' && j.kind === 'onboarding' },
      tasks: tasks.map((t) => this.taskView(t, names, p, day)),
      surveys: responses.map((r) => ({ key: r.surveyKey, title: OnboardingSurveys[r.surveyKey as OnboardingSurveyKey]?.title ?? r.surveyKey, score: r.score == null ? null : Number(r.score), low: r.low, answers: viewer === 'self' || viewer === 'hr' || viewer === 'manager' ? (r.answers as Record<string, number>) : null, comment: r.comment, submittedAt: r.submittedAt })),
      surveyDefs: OnboardingSurveys,
    };
  }

  private taskView(t: TaskRow, names: Map<string, PersonLite>, p: Principal, day: string) {
    const isAssignee = !!p.personId && t.assigneePersonId === p.personId;
    return {
      id: t.id, journeyId: t.journeyId, key: t.key, phase: t.phase, title: t.title, description: t.description, role: t.role, kind: t.kind, kindLabel: OnboardingTaskKindLabels[t.kind], link: t.link, formKey: t.formKey, surveyKey: t.surveyKey, required: t.required, status: t.status, dueDate: t.dueDate,
      overdue: t.status === 'open' && !!t.dueDate && t.dueDate < day,
      assignee: t.assigneePersonId ? (names.get(t.assigneePersonId) ?? null) : null,
      completedAt: t.completedAt, completedBy: t.completedByPersonId ? personName(names.get(t.completedByPersonId)) : null, note: t.note,
      isMine: isAssignee,
    };
  }

  async updateJourney(id: string, dto: z.infer<typeof updateJourneyDto>) {
    const { j, viewer } = await this.journeyFor(id);
    if (viewer !== 'hr' && viewer !== 'manager') throw forbidden();
    const now = new Date();
    const patch: Partial<typeof onboardingJourneys.$inferInsert> = { updatedAt: now };
    if (dto.buddyPersonId !== undefined) {
      if (dto.buddyPersonId) { if (dto.buddyPersonId === j.personId) throw unprocessable(ErrorCodes.VALIDATION, 'Il buddy deve essere un’altra persona'); await this.personRow(dto.buddyPersonId); }
      patch.buddyPersonId = dto.buddyPersonId;
      await this.reassignRole(j, 'buddy', dto.buddyPersonId ?? j.managerPersonId ?? j.hrPersonId);
      if (dto.buddyPersonId) {
        const [n] = await tx().select({ n: sql<number>`count(*)::int` }).from(onboardingTasks).where(and(eq(onboardingTasks.journeyId, id), eq(onboardingTasks.role, 'buddy'), eq(onboardingTasks.status, 'open')));
        const names = await this.namesOf([j.personId]);
        await this.notifier.send({ personId: dto.buddyPersonId, type: 'onboarding.started', data: { otherName: personName(names.get(j.personId)), title: j.templateName, anchorDate: j.anchorDate, role: 'buddy', tasks: n?.n ?? 0 }, link: `/onboarding/journeys/${id}`, dedupeKey: `onb_buddy:${id}:${dto.buddyPersonId}` });
      }
    }
    if (dto.itPersonId !== undefined) { patch.itPersonId = dto.itPersonId; await this.reassignRole(j, 'it', dto.itPersonId ?? j.hrPersonId ?? j.managerPersonId); }
    if (dto.hrPersonId !== undefined) { patch.hrPersonId = dto.hrPersonId; await this.reassignRole(j, 'hr', dto.hrPersonId ?? j.managerPersonId); }
    if (dto.anchorDate && dto.anchorDate !== j.anchorDate) {
      // ricalcolo delle scadenze aperte (ONB §6): stesso offset dalla nuova data
      patch.anchorDate = dto.anchorDate;
      const open = await tx().select().from(onboardingTasks).where(and(eq(onboardingTasks.journeyId, id), eq(onboardingTasks.status, 'open')));
      for (const t of open) if (t.dueDate) {
        const dueDate = dueDateFrom(dto.anchorDate, dayIndex(j.anchorDate, t.dueDate));
        await tx().update(onboardingTasks).set({ dueDate, updatedAt: now }).where(eq(onboardingTasks.id, t.id));
        await this.syncTaskToEngine(j, t, { dueDate });
      }
    }
    if (dto.status && dto.status !== j.status) {
      patch.status = dto.status;
      if (dto.status === 'completed') patch.completedAt = now;
      if (dto.status === 'cancelled') patch.cancelledAt = now;
      if (dto.status === 'active') { patch.completedAt = null; patch.cancelledAt = null; }
      if (j.appInstanceId) {
        if (dto.status === 'completed') await this.apps.completeInternal(j.appInstanceId, 'completed');
        else if (dto.status === 'cancelled') await this.apps.cancelInternal(j.appInstanceId, 'Percorso annullato');
        else { const open = await tx().select().from(onboardingTasks).where(and(eq(onboardingTasks.journeyId, id), eq(onboardingTasks.status, 'open'))); for (const t of open) if (t.stageKey) await this.apps.reopenStage(j.appInstanceId, t.stageKey); }
      }
    }
    await tx().update(onboardingJourneys).set(patch).where(eq(onboardingJourneys.id, id));
    await this.audit.log({ action: 'onboarding.journey_update', entityType: 'onboarding_journey', entityId: id, before: { buddy: j.buddyPersonId, anchorDate: j.anchorDate, status: j.status }, after: dto });
    return this.getJourney(id);
  }

  /** Riassegna i task aperti di un ruolo (buddy, IT, HR) e le fasi corrispondenti sul motore. */
  private async reassignRole(j: JourneyRow, role: 'buddy' | 'it' | 'hr', assignee: string | null) {
    const open = await tx().select().from(onboardingTasks).where(and(eq(onboardingTasks.journeyId, j.id), eq(onboardingTasks.role, role), eq(onboardingTasks.status, 'open')));
    for (const t of open) {
      await tx().update(onboardingTasks).set({ assigneePersonId: assignee, updatedAt: new Date() }).where(eq(onboardingTasks.id, t.id));
      await this.syncTaskToEngine(j, t, { assigneePersonId: assignee });
    }
  }

  async buddySuggestions(id: string) {
    const { j, viewer } = await this.journeyFor(id);
    if (viewer !== 'hr' && viewer !== 'manager') throw forbidden();
    const person = await this.personRow(j.personId);
    const scope: SQL[] = [];
    if (person.managerId) scope.push(eq(persons.managerId, person.managerId));
    if (person.orgUnitId) scope.push(eq(persons.orgUnitId, person.orgUnitId));
    if (!scope.length) return [];
    const candidates = await tx().select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName, jobTitle: persons.jobTitle, managerId: persons.managerId, orgUnitId: persons.orgUnitId, hireDate: persons.hireDate }).from(persons).where(and(eq(persons.status, 'active'), or(...scope)!));
    const load = await tx().select({ id: onboardingJourneys.buddyPersonId, n: sql<number>`count(*)::int` }).from(onboardingJourneys).where(and(eq(onboardingJourneys.status, 'active'), sql`${onboardingJourneys.buddyPersonId} IS NOT NULL`)).groupBy(onboardingJourneys.buddyPersonId);
    return suggestBuddies(candidates.map((c) => ({ ...c, activeBuddies: load.find((l) => l.id === c.id)?.n ?? 0 })), { id: person.id, managerId: person.managerId, orgUnitId: person.orgUnitId }, today());
  }

  async addTask(id: string, dto: z.infer<typeof addTaskDto>) {
    const { j, viewer, p } = await this.journeyFor(id);
    if (viewer !== 'hr' && viewer !== 'manager') throw forbidden();
    if (j.status !== 'active') throw conflict(ErrorCodes.CONFLICT, 'Il percorso non è attivo');
    const phases = j.phases as OnboardingPhase[];
    if (!phases.some((ph) => ph.key === dto.phase)) throw unprocessable(ErrorCodes.VALIDATION, 'Fase non presente nel percorso');
    const assignee = dto.assigneePersonId ?? resolveAssignee({ role: dto.role }, { personId: j.personId, managerId: j.managerPersonId, buddyId: j.buddyPersonId, hrId: j.hrPersonId ?? p.personId ?? null, itId: j.itPersonId });
    const [row] = await tx().insert(onboardingTasks).values({ tenantId: p.tenantId, createdBy: p.userId, journeyId: id, personId: j.personId, key: `adhoc_${Date.now().toString(36)}`, phase: dto.phase, title: dto.title, description: dto.description ?? null, role: dto.role, kind: dto.kind, assigneePersonId: assignee, dueDate: dto.dueDate ?? null, link: dto.link ?? null, formKey: dto.formKey ?? null, surveyKey: dto.surveyKey ?? null, required: dto.required }).returning();
    if (assignee && assignee !== p.personId) {
      const names = await this.namesOf([j.personId]);
      await this.notifier.send({ personId: assignee, type: 'onboarding.task_assigned', data: { title: dto.title, otherName: assignee === j.personId ? null : personName(names.get(j.personId)), dueDate: dto.dueDate ?? null }, link: assignee === j.personId ? '/onboarding' : `/onboarding/journeys/${id}` });
    }
    await this.audit.log({ action: 'onboarding.task_add', entityType: 'onboarding_task', entityId: row!.id, after: dto });
    return this.getJourney(id);
  }

  // ---------- task (ONB-014) ----------

  async me() {
    const p = principal();
    if (!p.personId) throw forbidden('Serve una persona collegata all’utente');
    const [journey] = await tx().select().from(onboardingJourneys).where(eq(onboardingJourneys.personId, p.personId)).orderBy(sql`case when ${onboardingJourneys.status} = 'active' then 0 else 1 end`, desc(onboardingJourneys.startedAt)).limit(1);
    return { journey: journey ? await this.getJourney(journey.id) : null, tasks: await this.myTasks('open') };
  }

  async myTasks(box: 'open' | 'done' | 'all') {
    const p = principal();
    const conds: SQL[] = [eq(onboardingTasks.assigneePersonId, p.personId ?? '')];
    if (box === 'open') conds.push(eq(onboardingTasks.status, 'open'));
    if (box === 'done') conds.push(inArray(onboardingTasks.status, ['done', 'skipped']));
    const rows = await tx().select({ t: onboardingTasks, j: onboardingJourneys }).from(onboardingTasks).innerJoin(onboardingJourneys, eq(onboardingJourneys.id, onboardingTasks.journeyId)).where(and(...conds, eq(onboardingJourneys.status, 'active'))).orderBy(asc(onboardingTasks.dueDate));
    const names = await this.namesOf(rows.flatMap((r) => [r.j.personId, r.t.assigneePersonId, r.t.completedByPersonId]));
    const day = today();
    return rows.map(({ t, j }) => ({ ...this.taskView(t, names, p, day), journey: { id: j.id, kind: j.kind, templateName: j.templateName, anchorDate: j.anchorDate, person: names.get(j.personId) ?? null, isMe: j.personId === p.personId } }));
  }

  async updateTask(id: string, dto: z.infer<typeof updateTaskDto>) {
    const p = principal();
    const [t] = await tx().select().from(onboardingTasks).where(eq(onboardingTasks.id, id));
    if (!t) throw notFound('Task di onboarding', id);
    const j = await this.journeyRow(t.journeyId);
    const viewer = await this.viewerOf(p, j);
    const isAssignee = !!p.personId && t.assigneePersonId === p.personId;
    if (!viewer || (!isAssignee && viewer !== 'hr' && viewer !== 'manager')) throw forbidden('Solo l’assegnatario, il manager o l’HR possono aggiornare il task');
    if (j.status !== 'active') throw conflict(ErrorCodes.CONFLICT, 'Il percorso non è attivo');
    if ((dto.dueDate !== undefined || dto.assigneePersonId !== undefined) && viewer !== 'hr' && viewer !== 'manager') throw forbidden('Scadenza e assegnatario li cambiano manager o HR');
    if (dto.status === 'done' && t.kind === 'sign' && !isAssignee) throw forbidden('La presa visione la conferma solo l’assegnatario');
    if (dto.status === 'done' && t.kind === 'sign' && !dto.acknowledged) throw unprocessable(ErrorCodes.VALIDATION, 'Conferma esplicitamente la presa visione');
    if (dto.status === 'done' && t.kind === 'survey') throw unprocessable(ErrorCodes.VALIDATION, 'Il task si chiude inviando la survey');
    const now = new Date();
    const patch: Partial<typeof onboardingTasks.$inferInsert> = { updatedAt: now };
    if (dto.note !== undefined) patch.note = dto.note;
    if (dto.dueDate !== undefined) patch.dueDate = dto.dueDate;
    if (dto.assigneePersonId !== undefined) patch.assigneePersonId = dto.assigneePersonId;
    if (dto.status && dto.status !== t.status) {
      patch.status = dto.status;
      patch.completedAt = dto.status === 'open' ? null : now;
      patch.completedByPersonId = dto.status === 'open' ? null : (p.personId ?? null);
      if (dto.status === 'done' && t.kind === 'sign') patch.note = dto.note ?? `Presa visione confermata il ${now.toISOString().slice(0, 10)}`;
    }
    await tx().update(onboardingTasks).set(patch).where(eq(onboardingTasks.id, id));
    await this.syncTaskToEngine(j, t, { status: dto.status && dto.status !== t.status ? dto.status : undefined, dueDate: dto.dueDate, assigneePersonId: dto.assigneePersonId, note: patch.note ?? dto.note ?? null });
    await this.audit.log({ action: 'onboarding.task_update', entityType: 'onboarding_task', entityId: id, before: { status: t.status }, after: { ...dto, external: p.userId === EXTERNAL_USER || undefined } });
    if (dto.status && dto.status !== t.status) await this.afterProgress(j);
    const names = await this.namesOf([t.assigneePersonId, p.personId]);
    const [fresh] = await tx().select().from(onboardingTasks).where(eq(onboardingTasks.id, id));
    return this.taskView(fresh!, names, p, today());
  }

  /** Traguardi (25/50/75/100) e completamento automatico quando i task obbligatori sono chiusi. */
  private async afterProgress(j: JourneyRow) {
    const [fresh] = await tx().select().from(onboardingJourneys).where(eq(onboardingJourneys.id, j.id));
    if (!fresh || fresh.status !== 'active') return;
    const tasks = await tx().select({ status: onboardingTasks.status, dueDate: onboardingTasks.dueDate, required: onboardingTasks.required }).from(onboardingTasks).where(eq(onboardingTasks.journeyId, j.id));
    const progress = journeyProgress(tasks, today());
    const reached = (fresh.milestones as number[]) ?? [];
    const names = await this.namesOf([fresh.personId]);
    const name = personName(names.get(fresh.personId));
    const newOnes = MILESTONES.filter((m) => progress.percent >= m && !reached.includes(m));
    if (newOnes.length) {
      await tx().update(onboardingJourneys).set({ milestones: [...reached, ...newOnes], updatedAt: new Date() }).where(eq(onboardingJourneys.id, j.id));
      const m = Math.max(...newOnes);
      if (m < 100) {
        await this.notifier.send({ personId: fresh.personId, type: 'onboarding.milestone', data: { title: `${m}% del percorso`, percent: progress.percent }, link: '/onboarding', dedupeKey: `onb_ms:${j.id}:${m}:${fresh.personId}` });
        if (fresh.managerPersonId) await this.notifier.send({ personId: fresh.managerPersonId, type: 'onboarding.milestone', data: { title: `${m}% del percorso`, otherName: name, percent: progress.percent }, link: `/onboarding/journeys/${j.id}`, dedupeKey: `onb_ms:${j.id}:${m}:${fresh.managerPersonId}` });
      }
    }
    if (journeyComplete(tasks)) {
      await tx().update(onboardingJourneys).set({ status: 'completed', completedAt: new Date(), updatedAt: new Date() }).where(eq(onboardingJourneys.id, j.id));
      if (fresh.appInstanceId) await this.apps.completeInternal(fresh.appInstanceId, 'completed');
      for (const pid of [fresh.personId, fresh.managerPersonId, fresh.hrPersonId]) if (pid) await this.notifier.send({ personId: pid, type: 'onboarding.completed', data: { title: fresh.templateName, otherName: pid === fresh.personId ? null : name }, link: pid === fresh.personId ? '/onboarding' : `/onboarding/journeys/${j.id}`, dedupeKey: `onb_done:${j.id}:${pid}` });
    }
  }

  private async onFormSubmitted(resp: SubmittedResponse) {
    if (!resp.contextId) return;
    const [t] = await tx().select().from(onboardingTasks).where(and(eq(onboardingTasks.id, resp.contextId), eq(onboardingTasks.status, 'open')));
    if (!t) return;
    await tx().update(onboardingTasks).set({ status: 'done', completedAt: new Date(), completedByPersonId: resp.respondentPersonId, updatedAt: new Date() }).where(eq(onboardingTasks.id, t.id));
    await this.afterProgress(await this.journeyRow(t.journeyId));
  }

  /** Fase form del motore conclusa (compilazione consegnata dal link del task o dalla pagina dell'istanza): chiude il task. */
  private async onEngineStageDone(e: StageDoneEvent) {
    if (!e.instance.appKey.startsWith('onboarding_') || e.run.type !== 'form') return;
    const [j] = await tx().select().from(onboardingJourneys).where(eq(onboardingJourneys.appInstanceId, e.instance.id));
    if (!j) return;
    const [t] = await tx().select().from(onboardingTasks).where(and(eq(onboardingTasks.journeyId, j.id), eq(onboardingTasks.stageKey, e.stageKey), eq(onboardingTasks.status, 'open')));
    if (!t) return;
    await tx().update(onboardingTasks).set({ status: 'done', completedAt: new Date(), completedByPersonId: e.run.completedByPersonId ?? null, updatedAt: new Date() }).where(eq(onboardingTasks.id, t.id));
    await this.afterProgress(j);
  }

  // ---------- survey (ONB-017) ----------

  async submitSurvey(journeyId: string, key: string, dto: z.infer<typeof surveyDto>) {
    const p = principal();
    const j = await this.journeyRow(journeyId);
    if (j.personId !== p.personId) throw forbidden('La survey di onboarding la compila la persona');
    if (!(key in OnboardingSurveys)) throw notFound('Survey', key);
    const def = OnboardingSurveys[key as OnboardingSurveyKey];
    const answers = Object.fromEntries(def.questions.map((q) => [q.key, dto.answers[q.key]]).filter(([, v]) => typeof v === 'number')) as Record<string, number>;
    const { score, low, answered } = onboardingSurveyScore(def.key, answers);
    if (!answered) throw unprocessable(ErrorCodes.VALIDATION, 'Rispondi ad almeno una domanda');
    const [existing] = await tx().select({ id: onboardingSurveyResponses.id }).from(onboardingSurveyResponses).where(and(eq(onboardingSurveyResponses.journeyId, journeyId), eq(onboardingSurveyResponses.surveyKey, key)));
    if (existing) throw conflict(ErrorCodes.CONFLICT, 'Survey già inviata');
    const now = new Date();
    await tx().insert(onboardingSurveyResponses).values({ tenantId: p.tenantId, createdBy: p.userId, journeyId, personId: j.personId, surveyKey: key, answers, comment: dto.comment ?? null, score: score == null ? null : score.toFixed(2), low, submittedAt: now });
    const surveyTasks = await tx().select().from(onboardingTasks).where(and(eq(onboardingTasks.journeyId, journeyId), eq(onboardingTasks.kind, 'survey'), eq(onboardingTasks.surveyKey, key), eq(onboardingTasks.status, 'open')));
    for (const st of surveyTasks) {
      await tx().update(onboardingTasks).set({ status: 'done', completedAt: now, completedByPersonId: p.personId ?? null, updatedAt: now }).where(eq(onboardingTasks.id, st.id));
      await this.syncTaskToEngine(j, st, { status: 'done' });
    }
    if (low) {
      const names = await this.namesOf([j.personId]);
      for (const pid of [j.managerPersonId, j.hrPersonId]) if (pid) await this.notifier.send({ personId: pid, type: 'onboarding.survey_low', data: { otherName: personName(names.get(j.personId)), title: def.title, score: score?.toFixed(1) ?? '' }, link: `/onboarding/journeys/${journeyId}`, dedupeKey: `onb_low:${journeyId}:${key}:${pid}` });
    }
    await this.audit.log({ action: 'onboarding.survey_submit', entityType: 'onboarding_journey', entityId: journeyId, after: { key, score, low } });
    await this.afterProgress(j);
    return { ok: true, score, low };
  }

  // ---------- dashboard (ONB-016) ----------

  async dashboard() {
    const p = principal();
    const isHr = hasPermission(p, Permissions.ONBOARDING_MANAGE);
    const conds: SQL[] = [];
    if (!isHr) conds.push(eq(onboardingJourneys.managerPersonId, p.personId ?? ''));
    const rows = await tx().select().from(onboardingJourneys).where(conds.length ? and(...conds) : undefined).orderBy(desc(onboardingJourneys.anchorDate));
    const journeys = await this.summaries(rows);
    const ids = rows.map((r) => r.id);
    const day = today();
    const overdue = ids.length ? await tx().select({ role: onboardingTasks.role, assigneePersonId: onboardingTasks.assigneePersonId, n: sql<number>`count(*)::int` }).from(onboardingTasks).where(and(inArray(onboardingTasks.journeyId, ids), eq(onboardingTasks.status, 'open'), lt(onboardingTasks.dueDate, day))).groupBy(onboardingTasks.role, onboardingTasks.assigneePersonId) : [];
    const names = await this.namesOf(overdue.map((o) => o.assigneePersonId));
    const byRole: Record<string, number> = {};
    for (const o of overdue) byRole[o.role] = (byRole[o.role] ?? 0) + o.n;
    const byAssignee = overdue.filter((o) => o.assigneePersonId).map((o) => ({ person: names.get(o.assigneePersonId!) ?? null, role: o.role, n: o.n })).sort((a, b) => b.n - a.n).slice(0, 10);
    const surveyRows = ids.length ? await tx().select().from(onboardingSurveyResponses).where(inArray(onboardingSurveyResponses.journeyId, ids)) : [];
    const surveys = (Object.keys(OnboardingSurveys) as OnboardingSurveyKey[]).map((k) => {
      const rs = surveyRows.filter((r) => r.surveyKey === k && r.score != null);
      return { key: k, title: OnboardingSurveys[k].title, n: rs.length, avg: rs.length ? Math.round((rs.reduce((a, r) => a + Number(r.score), 0) / rs.length) * 100) / 100 : null, low: rs.filter((r) => r.low).length };
    });
    const active = journeys.filter((j) => j.status === 'active');
    return {
      scope: isHr ? 'all' : 'team',
      totals: { active: active.length, completed: journeys.filter((j) => j.status === 'completed').length, overdueTasks: overdue.reduce((a, o) => a + o.n, 0), lowSurveys: surveyRows.filter((r) => r.low).length, avgPercent: active.length ? Math.round(active.reduce((a, j) => a + j.progress.percent, 0) / active.length) : null },
      overdueByRole: byRole,
      overdueByAssignee: byAssignee,
      surveys,
      journeys,
    };
  }
}
