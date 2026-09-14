import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { UnsafeUrlError, assertPublicUrl } from '@wb/connectors';
import { CONFIG, type AppConfig } from '../config.js';
import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { actionItems, appInstanceEvents, appInstances, appStageRuns, apps, formDefinitions, formResponses, persons, roleAssignments, users, webhookDeliveries } from '@wb/db';
import {
  AppTemplates,
  DefaultAppNaming,
  DefaultAppPermissions,
  ErrorCodes,
  Permissions,
  afterStageDone,
  canLaunch,
  groupOf,
  hasPermission,
  initialStages,
  stageKeysOf,
  instanceProgress,
  rejectPlan,
  toCsv,
  validateAppDefinition,
  type AppAction,
  type AppActor,
  type AppDefinition,
  type AppOutcome,
  type Principal,
} from '@wb/shared';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { principal, tx } from '../common/context.js';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors.js';
import { FormsService, type SubmittedResponse } from '../forms/forms.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { createAppDto, decideDto, duplicateDto, importDto, launchDto, listInstancesQuery, updateAppDto } from './dto.js';

type AppRow = typeof apps.$inferSelect;
type InstanceRow = typeof appInstances.$inferSelect;
type RunRow = typeof appStageRuns.$inferSelect;
type Actors = { subject: string; manager: string | null; manager_of_manager: string | null; launcher: string | null; hr: string | null };
export interface PersonLite { id: string; firstName: string; lastName: string; jobTitle: string | null }
type Viewer = 'hr' | 'subject' | 'launcher' | 'actor' | 'manager';
/** Evento emesso quando una fase si conclude (prima dell'avanzamento): usato dai moduli nativi che girano sul motore. */
export interface StageDoneEvent { instance: InstanceRow; run: RunRow; stageKey: string; payload: { answers?: Record<string, unknown> | null; outcome?: AppOutcome | null } }
export type StageDoneHook = (e: StageDoneEvent) => Promise<void>;
export interface LaunchInternalInput { definition: AppDefinition; appId?: string | null; appKey?: string; subjectPersonId: string; title?: string | null; launcher?: Principal; moduleLink?: string | null }

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const personName = (p?: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}` : '—');
const HR_ROLES = ['hr_admin', 'tenant_admin', 'hrbp'];
const stageKeysOfGroup = (def: AppDefinition, index: number) => stageKeysOf(def, groupOf(def, index));

/**
 * App Studio (APP, L2): app custom dichiarative. Le istanze fotografano la definizione; le fasi diventano run
 * (un tentativo per riapertura); i form passano dal form engine (hook `app_stage`); le approvazioni approvano o
 * rimandano; le notifiche sono fasi automatiche. Visibilità delle istanze secondo i permessi dell'app.
 */
@Injectable()
export class AppsService implements OnModuleInit {
  private readonly stageHooks: StageDoneHook[] = [];

  constructor(@Inject(CONFIG) private readonly cfg: AppConfig, private readonly audit: AuditService, private readonly notifier: NotificationsService, private readonly forms: FormsService) {}

  onModuleInit() {
    this.forms.onSubmitted('app_stage', (r) => this.onFormSubmitted(r));
  }

  /** Registra un hook chiamato alla conclusione di ogni fase (moduli nativi sul motore, ADR-0011). */
  onStageDone(hook: StageDoneHook) {
    this.stageHooks.push(hook);
  }

  // ---------- helper ----------

  private async appRow(id: string): Promise<AppRow> {
    const [a] = await tx().select().from(apps).where(eq(apps.id, id));
    if (!a) throw notFound('App', id);
    return a;
  }
  private def(a: { definition: unknown }): AppDefinition {
    return a.definition as AppDefinition;
  }
  private async namesOf(ids: readonly (string | null | undefined)[]): Promise<Map<string, PersonLite>> {
    const uniq = [...new Set(ids.filter((x): x is string => !!x))];
    if (!uniq.length) return new Map();
    const rows = await tx().select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName, jobTitle: persons.jobTitle }).from(persons).where(inArray(persons.id, uniq));
    return new Map(rows.map((r) => [r.id, r]));
  }
  private async publishedFormKeys(): Promise<Set<string>> {
    const rows = await tx().select({ key: formDefinitions.key }).from(formDefinitions).where(eq(formDefinitions.status, 'published'));
    return new Set(rows.map((r) => r.key));
  }
  private isHr = (p: Principal) => hasPermission(p.roles, Permissions.APPS_MANAGE);
  private isManager = (p: Principal) => hasPermission(p.roles, Permissions.OBJECTIVES_WRITE_TEAM);
  private async log(instanceId: string, type: string, data: Record<string, unknown> = {}, stageKey?: string | null) {
    const p = principal();
    await tx().insert(appInstanceEvents).values({ tenantId: p.tenantId, instanceId, actorPersonId: p.personId ?? null, type, stageKey: stageKey ?? null, data });
  }

  // ---------- template e import/export (APP-030/031/035) ----------

  listTemplates() {
    return AppTemplates.map((t) => ({ key: t.key, name: t.name, category: t.category, description: t.description, icon: t.app.icon ?? null, stages: t.app.stages.length, forms: t.forms.map((f) => f.key) }));
  }

  private async ensureForms(list: { key: string; name: string; schema: unknown }[]) {
    const published = await this.publishedFormKeys();
    let created = 0;
    for (const f of list) {
      if (published.has(f.key)) continue;
      const [existing] = await tx().select().from(formDefinitions).where(eq(formDefinitions.key, f.key)).orderBy(desc(formDefinitions.version)).limit(1);
      const def = existing ?? (await this.forms.create({ key: f.key, name: f.name, kind: 'app', schema: f.schema }));
      if (def.status !== 'published') await this.forms.publish(def.id);
      created++;
    }
    return created;
  }

  async installTemplate(key: string) {
    const t = AppTemplates.find((x) => x.key === key);
    if (!t) throw notFound('Template', key);
    const forms = await this.ensureForms(t.forms);
    const [existing] = await tx().select({ id: apps.id }).from(apps).where(and(eq(apps.key, t.app.key), isNull(apps.archivedAt)));
    if (existing) throw conflict(ErrorCodes.CONFLICT, `Esiste già un’app con chiave «${t.app.key}»: duplicala o modificala`);
    const app = await this.createApp(t.app, key);
    return { ...app, formsCreated: forms };
  }

  async importApp(dto: z.infer<typeof importDto>) {
    const forms = await this.ensureForms(dto.forms.map((f) => ({ key: f.key, name: f.name, schema: f.schema as unknown })));
    let key = dto.app.key;
    const taken = await tx().select({ key: apps.key }).from(apps).where(isNull(apps.archivedAt));
    let i = 2;
    while (taken.some((t) => t.key === key)) key = `${dto.app.key}_${i++}`;
    const app = await this.createApp({ ...dto.app, key });
    return { ...app, formsCreated: forms };
  }

  async exportApp(id: string) {
    const a = await this.appRow(id);
    const def = this.def(a);
    const keys = [...new Set(def.stages.map((s) => s.formKey).filter((k): k is string => !!k))];
    const forms = keys.length ? await Promise.all(keys.map(async (k) => { const f = await this.forms.latestPublished(k); return f ? { key: f.key, name: f.name, schema: f.schema } : null; })) : [];
    return { exportedAt: new Date().toISOString(), app: def, forms: forms.filter((f): f is NonNullable<typeof f> => !!f) };
  }

  // ---------- app ----------

  async listApps(scope: 'launchable' | 'all') {
    const p = principal();
    const rows = await tx().select().from(apps).where(isNull(apps.archivedAt)).orderBy(apps.key, desc(apps.version));
    const counts = await tx().select({ appKey: appInstances.appKey, status: appInstances.status, n: sql<number>`count(*)::int` }).from(appInstances).groupBy(appInstances.appKey, appInstances.status);
    const view = (a: AppRow) => ({ id: a.id, key: a.key, name: a.name, version: a.version, status: a.status, templateKey: a.templateKey, publishedAt: a.publishedAt, updatedAt: a.updatedAt, definition: this.def(a), instances: Object.fromEntries(counts.filter((c) => c.appKey === a.key).map((c) => [c.status, c.n])) as Record<string, number> });
    if (scope === 'all') {
      if (!this.isHr(p)) throw forbidden();
      return rows.map(view);
    }
    const me = p.personId ? (await tx().select().from(persons).where(eq(persons.id, p.personId)))[0] : undefined;
    const viewer = { personId: p.personId ?? null, isHr: this.isHr(p), isManager: this.isManager(p) };
    return rows
      .filter((a) => a.status === 'published')
      .filter((a) => { const d = this.def(a); return viewer.isHr ? d.permissions.launch.includes('hr') : d.permissions.launch.includes('employee') || (viewer.isManager && d.permissions.launch.includes('manager')); })
      .map((a) => ({ ...view(a), canLaunchForSelf: !!me && canLaunch(this.def(a), viewer, { id: me.id, managerId: me.managerId }), canLaunchForOthers: viewer.isHr || (viewer.isManager && this.def(a).permissions.launch.includes('manager')) || (this.def(a).permissions.launch.includes('employee') && !this.def(a).permissions.launchForSelfOnly) }));
  }

  async getApp(id: string) {
    const p = principal();
    const a = await this.appRow(id);
    if (!this.isHr(p) && a.status !== 'published') throw notFound('App', id);
    const versions = await tx().select({ id: apps.id, version: apps.version, status: apps.status, publishedAt: apps.publishedAt }).from(apps).where(eq(apps.key, a.key)).orderBy(desc(apps.version));
    const published = await this.publishedFormKeys();
    const def = this.def(a);
    const formKeys = [...new Set(def.stages.map((s) => s.formKey).filter((k): k is string => !!k))];
    const forms = formKeys.length ? await tx().select({ id: formDefinitions.id, key: formDefinitions.key, name: formDefinitions.name, version: formDefinitions.version, status: formDefinitions.status }).from(formDefinitions).where(and(inArray(formDefinitions.key, formKeys), eq(formDefinitions.status, 'published'))) : [];
    return { id: a.id, key: a.key, name: a.name, version: a.version, status: a.status, templateKey: a.templateKey, publishedAt: a.publishedAt, definition: def, versions, forms, problems: validateAppDefinition(def, published) };
  }

  async createApp(dto: z.infer<typeof createAppDto> | AppDefinition, templateKey: string | null = null) {
    const p = principal();
    const def = this.normalize(dto as unknown as AppDefinition);
    const errors = validateAppDefinition(def);
    if (errors.length) throw unprocessable(ErrorCodes.VALIDATION, errors.join(' · '));
    const [dup] = await tx().select({ id: apps.id }).from(apps).where(and(eq(apps.key, def.key), isNull(apps.archivedAt)));
    if (dup) throw conflict(ErrorCodes.CONFLICT, `Chiave «${def.key}» già usata`);
    const [row] = await tx().insert(apps).values({ tenantId: p.tenantId, createdBy: p.userId, key: def.key, name: def.name, definition: def, templateKey }).returning();
    await this.audit.log({ action: 'app.create', entityType: 'app', entityId: row!.id, after: { key: def.key, stages: def.stages.length, templateKey } });
    return this.getApp(row!.id);
  }

  private normalize(dto: AppDefinition): AppDefinition {
    return { key: dto.key, name: dto.name, description: dto.description ?? null, icon: dto.icon ?? null, naming: { ...DefaultAppNaming, ...(dto.naming ?? {}) }, permissions: { ...DefaultAppPermissions, ...(dto.permissions ?? {}) }, stages: dto.stages.map((s) => ({ ...s, description: s.description ?? null, formKey: s.formKey ?? null, parallelGroup: s.parallelGroup || null, approval: s.approval ?? null, notify: s.notify ?? null, transitions: s.transitions ?? null })) };
  }

  async updateApp(id: string, dto: z.infer<typeof updateAppDto>) {
    const a = await this.appRow(id);
    if (a.status !== 'draft') throw conflict(ErrorCodes.CONFLICT, 'Le versioni pubblicate sono immutabili: crea una nuova versione');
    const merged = this.normalize({ ...this.def(a), ...dto, key: a.key } as AppDefinition);
    const errors = validateAppDefinition(merged);
    if (errors.length) throw unprocessable(ErrorCodes.VALIDATION, errors.join(' · '));
    await tx().update(apps).set({ name: merged.name, definition: merged, updatedAt: new Date() }).where(eq(apps.id, id));
    await this.audit.log({ action: 'app.update', entityType: 'app', entityId: id, after: { stages: merged.stages.length } });
    return this.getApp(id);
  }

  async publishApp(id: string) {
    const a = await this.appRow(id);
    if (a.status !== 'draft') throw conflict(ErrorCodes.CONFLICT, 'Solo una bozza si può pubblicare');
    const errors = validateAppDefinition(this.def(a), await this.publishedFormKeys());
    if (errors.length) throw unprocessable(ErrorCodes.VALIDATION, errors.join(' · '));
    const now = new Date();
    await tx().update(apps).set({ status: 'archived', archivedAt: now, updatedAt: now }).where(and(eq(apps.key, a.key), eq(apps.status, 'published')));
    await tx().update(apps).set({ status: 'published', publishedAt: now, updatedAt: now }).where(eq(apps.id, id));
    await this.audit.log({ action: 'app.publish', entityType: 'app', entityId: id, after: { key: a.key, version: a.version } });
    return this.getApp(id);
  }

  async newVersion(id: string) {
    const p = principal();
    const a = await this.appRow(id);
    if (a.status !== 'published') throw conflict(ErrorCodes.CONFLICT, 'Le nuove versioni partono da una versione pubblicata');
    const [draft] = await tx().select({ id: apps.id }).from(apps).where(and(eq(apps.key, a.key), eq(apps.status, 'draft')));
    if (draft) throw conflict(ErrorCodes.CONFLICT, 'Esiste già una bozza di questa app');
    const [max] = await tx().select({ v: sql<number>`max(${apps.version})::int` }).from(apps).where(eq(apps.key, a.key));
    const [row] = await tx().insert(apps).values({ tenantId: p.tenantId, createdBy: p.userId, key: a.key, name: a.name, version: (max?.v ?? a.version) + 1, definition: a.definition, templateKey: a.templateKey, parentId: a.id }).returning();
    await this.audit.log({ action: 'app.new_version', entityType: 'app', entityId: row!.id, after: { from: a.id } });
    return this.getApp(row!.id);
  }

  async archiveApp(id: string) {
    const a = await this.appRow(id);
    await tx().update(apps).set({ status: 'archived', archivedAt: new Date(), updatedAt: new Date() }).where(eq(apps.id, id));
    await this.audit.log({ action: 'app.archive', entityType: 'app', entityId: id, before: { status: a.status } });
    return { ok: true };
  }

  async duplicateApp(id: string, dto: z.infer<typeof duplicateDto>) {
    const a = await this.appRow(id);
    return this.createApp({ ...this.def(a), key: dto.key, name: dto.name }, a.templateKey);
  }

  // ---------- attori ----------

  private async hrPerson(launcher: Principal): Promise<string | null> {
    if (this.isHr(launcher) && launcher.personId) return launcher.personId;
    const [row] = await tx().select({ personId: users.personId }).from(roleAssignments).innerJoin(users, eq(users.id, roleAssignments.userId)).where(and(inArray(roleAssignments.role, HR_ROLES), sql`${users.personId} IS NOT NULL`, isNull(users.disabledAt))).orderBy(asc(roleAssignments.createdAt)).limit(1);
    return row?.personId ?? null;
  }
  private async resolveActors(subjectId: string, launcher: Principal): Promise<Actors> {
    const [subject] = await tx().select().from(persons).where(eq(persons.id, subjectId));
    if (!subject) throw notFound('Persona', subjectId);
    const [manager] = subject.managerId ? await tx().select({ managerId: persons.managerId }).from(persons).where(eq(persons.id, subject.managerId)) : [];
    return { subject: subject.id, manager: subject.managerId, manager_of_manager: manager?.managerId ?? null, launcher: launcher.personId ?? null, hr: await this.hrPerson(launcher) };
  }
  private async actorPerson(actor: AppActor, actors: Actors): Promise<string | null> {
    if (actor.startsWith('person:')) return actor.slice(7);
    if (actor.startsWith('role:')) {
      const [row] = await tx().select({ personId: users.personId }).from(roleAssignments).innerJoin(users, eq(users.id, roleAssignments.userId)).where(and(eq(roleAssignments.role, actor.slice(5)), sql`${users.personId} IS NOT NULL`, isNull(users.disabledAt))).orderBy(asc(roleAssignments.createdAt)).limit(1);
      return row?.personId ?? actors.hr ?? actors.launcher;
    }
    const direct = actors[actor as keyof Actors];
    return direct ?? actors.hr ?? actors.launcher;
  }

  // ---------- istanze ----------

  async launch(dto: z.infer<typeof launchDto>) {
    const p = principal();
    const [a] = dto.appId ? await tx().select().from(apps).where(eq(apps.id, dto.appId)) : await tx().select().from(apps).where(and(eq(apps.key, dto.appKey!), eq(apps.status, 'published')));
    if (!a || a.status !== 'published') throw notFound('App', dto.appId ?? dto.appKey);
    const def = this.def(a);
    const subjectId = dto.subjectPersonId ?? p.personId;
    if (!subjectId) throw unprocessable(ErrorCodes.VALIDATION, 'Indica il soggetto');
    const [subject] = await tx().select().from(persons).where(eq(persons.id, subjectId));
    if (!subject) throw notFound('Persona', subjectId);
    if (!canLaunch(def, { personId: p.personId ?? null, isHr: this.isHr(p), isManager: this.isManager(p) }, { id: subject.id, managerId: subject.managerId })) throw forbidden(`Non puoi avviare «${def.name}» per questa persona`);
    const inst = await this.launchInternal({ definition: def, appId: a.id, appKey: a.key, subjectPersonId: subject.id, title: dto.title ?? null, launcher: p }, a.version);
    return this.getInstance(inst.id);
  }

  /** Crea istanza e run e attiva le prime fasi. Usato dal lancio via API e dai moduli nativi (review) senza controlli di permesso. */
  async launchInternal(input: LaunchInternalInput, version = 1): Promise<InstanceRow> {
    const p = input.launcher ?? principal();
    const def = input.definition;
    const [subject] = await tx().select().from(persons).where(eq(persons.id, input.subjectPersonId));
    if (!subject) throw notFound('Persona', input.subjectPersonId);
    const actors = await this.resolveActors(subject.id, p);
    const [inst] = await tx().insert(appInstances).values({ tenantId: p.tenantId, createdBy: p.userId, appId: input.appId ?? null, appKey: input.appKey ?? def.key, appVersion: version, definition: def, subjectPersonId: subject.id, launcherPersonId: p.personId ?? null, actors, title: input.title ?? null, moduleLink: input.moduleLink ?? null, currentStages: [] }).returning();
    await tx().insert(appStageRuns).values(def.stages.map((s) => ({ tenantId: p.tenantId, instanceId: inst!.id, stageKey: s.key, attempt: 1, type: s.type })));
    await this.log(inst!.id, 'launched', { subject: personName(subject), app: def.name });
    await this.activate(inst!, initialStages(def));
    await this.audit.log({ action: 'app.launch', entityType: 'app_instance', entityId: inst!.id, after: { appKey: inst!.appKey, subjectPersonId: subject.id } });
    return inst!;
  }

  /** Attiva le fasi indicate: assegnatario, scadenza, compilazione del form, notifica; le fasi "notify" si concludono da sole. */
  private async activate(inst: InstanceRow, stageKeys: string[]) {
    const p = principal();
    const def = this.def(inst);
    const actors = inst.actors as Actors;
    const now = new Date();
    const names = await this.namesOf([inst.subjectPersonId]);
    const subjectName = personName(names.get(inst.subjectPersonId));
    await tx().update(appInstances).set({ currentStages: stageKeys, updatedAt: now }).where(eq(appInstances.id, inst.id));
    for (const key of stageKeys) {
      const stage = def.stages.find((s) => s.key === key)!;
      const runs = await tx().select().from(appStageRuns).where(and(eq(appStageRuns.instanceId, inst.id), eq(appStageRuns.stageKey, key))).orderBy(desc(appStageRuns.attempt));
      let run = runs.find((r) => r.status === 'pending');
      if (!run) [run] = await tx().insert(appStageRuns).values({ tenantId: p.tenantId, instanceId: inst.id, stageKey: key, attempt: (runs[0]?.attempt ?? 0) + 1, type: stage.type }).returning();
      const actorId = await this.actorPerson(stage.actor, actors);
      const dueDate = addDays(stage.dueDays);
      let formResponseId: string | null = null;
      if (stage.type === 'form' && stage.formKey) {
        const form = await this.forms.latestPublished(stage.formKey);
        if (!form) throw unprocessable(ErrorCodes.VALIDATION, `Form «${stage.formKey}» non pubblicato`);
        const [resp] = await tx().insert(formResponses).values({ tenantId: p.tenantId, createdBy: p.userId, formDefinitionId: form.id, formKey: form.key, formVersion: form.version, respondentPersonId: actorId, subjectPersonId: inst.subjectPersonId, contextType: 'app_stage', contextId: run!.id, dueDate: new Date(`${dueDate}T23:59:59Z`) }).returning();
        formResponseId = resp!.id;
      }
      await tx().update(appStageRuns).set({ status: 'active', actorPersonId: actorId, dueDate, formResponseId, activatedAt: now, updatedAt: now }).where(eq(appStageRuns.id, run!.id));
      await this.log(inst.id, 'stage_activated', { actorPersonId: actorId, dueDate }, key);
      if (stage.type === 'notify') {
        const targets = new Set<string>();
        for (const t of stage.notify?.to ?? []) { const pid = await this.actorPerson(t, actors); if (pid) targets.add(pid); }
        for (const pid of targets) await this.notifier.send({ personId: pid, type: 'app.message', data: { appName: def.name, otherName: pid === inst.subjectPersonId ? null : subjectName, body: stage.notify?.message ?? '' }, link: `/apps/instances/${inst.id}` });
        await tx().update(appStageRuns).set({ status: 'done', outcome: 'notified', completedAt: now, updatedAt: now }).where(eq(appStageRuns.id, run!.id));
        await this.log(inst.id, 'notified', { to: [...targets] }, key);
        await this.advance(inst.id, key, { outcome: 'notified' });
        continue;
      }
      if (stage.type === 'action') {
        const results = [];
        for (const action of stage.actions ?? []) results.push(await this.runAction(inst, stage.key, action, actors, p));
        await tx().update(appStageRuns).set({ status: 'done', outcome: 'executed', completedAt: new Date(), answers: { results }, updatedAt: new Date() }).where(eq(appStageRuns.id, run!.id));
        await this.log(inst.id, 'executed', { results }, key);
        await this.advance(inst.id, key, { outcome: 'executed' });
        continue;
      }
      if (actorId && !def.silent) await this.notifier.send({ personId: actorId, type: 'app.stage_assigned', data: { appName: def.name, title: stage.name, instanceLabel: def.naming.instanceLabel, otherName: actorId === inst.subjectPersonId ? null : subjectName, dueDate }, link: `/apps/instances/${inst.id}` });
    }
  }

  /** Risposte consegnate finora nell'istanza, per chiave di fase (usate da webhook e instradamenti). */
  private async answersSoFar(instanceId: string): Promise<Record<string, Record<string, unknown>>> {
    const rows = await tx().select({ stageKey: appStageRuns.stageKey, answers: appStageRuns.answers, attempt: appStageRuns.attempt }).from(appStageRuns).where(and(eq(appStageRuns.instanceId, instanceId), eq(appStageRuns.status, 'done'))).orderBy(asc(appStageRuns.attempt));
    const out: Record<string, Record<string, unknown>> = {};
    for (const r of rows) if (r.answers && typeof r.answers === 'object') out[r.stageKey] = r.answers as Record<string, unknown>;
    return out;
  }

  /** Esegue un'azione automatica (APP-024). Gli errori non bloccano il processo: finiscono nel log. */
  private async runAction(inst: InstanceRow, stageKey: string, action: AppAction, actors: Actors, p: Principal): Promise<{ type: string; ok: boolean; detail?: string }> {
    const def = this.def(inst);
    try {
      switch (action.type) {
        case 'action_item': {
          const owner = await this.actorPerson(action.assignee, actors);
          if (!owner) return { type: action.type, ok: false, detail: 'assegnatario non risolto' };
          const dueDate = action.dueDays == null ? null : addDays(action.dueDays);
          const [row] = await tx().insert(actionItems).values({ tenantId: p.tenantId, createdBy: p.userId, ownerPersonId: owner, title: action.title, dueDate, source: 'app' }).returning();
          await this.notifier.send({ personId: owner, type: 'action_item.assigned', data: { title: action.title, dueDate, fromName: def.name }, link: '/dashboard' });
          return { type: action.type, ok: true, detail: row!.id };
        }
        case 'person_field': {
          const [person] = await tx().select().from(persons).where(eq(persons.id, inst.subjectPersonId));
          if (!person) return { type: action.type, ok: false, detail: 'persona non trovata' };
          const patch: Partial<typeof persons.$inferInsert> = { updatedAt: new Date() };
          if (action.field.startsWith('custom:')) patch.customFields = { ...((person.customFields as Record<string, unknown>) ?? {}), [action.field.slice(7)]: action.value };
          else patch[action.field as 'jobTitle' | 'jobLevel' | 'location'] = action.value;
          await tx().update(persons).set(patch).where(eq(persons.id, person.id));
          await this.audit.log({ action: 'app.person_field', entityType: 'person', entityId: person.id, after: { field: action.field, value: action.value, instanceId: inst.id } });
          return { type: action.type, ok: true, detail: action.field };
        }
        case 'webhook': {
          const body = { event: 'app.stage', app: { key: inst.appKey, name: def.name }, instance: { id: inst.id, title: inst.title, status: inst.status }, stage: stageKey, subjectPersonId: inst.subjectPersonId, answers: action.includeAnswers ? await this.answersSoFar(inst.id) : undefined, at: new Date().toISOString() };
          // difesa SSRF: niente indirizzi privati o locali fuori da sviluppo e test
          try { await assertPublicUrl(action.url, { allowPrivate: this.cfg.NODE_ENV !== 'production' }); } catch (e) { if (e instanceof UnsafeUrlError) return { type: action.type, ok: false, detail: `URL non consentito: ${e.message}` }; throw e; }
          let status: number | null = null;
          let error: string | null = null;
          try {
            const res = await fetch(action.url, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'WorkingBetter-webhook/1' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
            status = res.status;
            if (res.ok) return { type: action.type, ok: true, detail: `HTTP ${res.status}` };
            error = `HTTP ${res.status}`;
          } catch (e) {
            error = (e as Error).message.slice(0, 200);
          }
          // primo tentativo fallito: in coda per i ritentativi del worker (backoff, al massimo 5 tentativi)
          await tx().insert(webhookDeliveries).values({ tenantId: p.tenantId, createdBy: p.userId, instanceId: inst.id, stageKey, url: action.url, payload: body, status: 'pending', attempts: 1, nextAttemptAt: new Date(Date.now() + 2 * 60000), lastError: error, lastStatus: status });
          return { type: action.type, ok: false, detail: `${error} · in coda per ritentativo` };
        }
        case 'start_app': {
          const [a] = await tx().select().from(apps).where(and(eq(apps.key, action.appKey), eq(apps.status, 'published')));
          if (!a) return { type: action.type, ok: false, detail: `app «${action.appKey}» non pubblicata` };
          const child = await this.launchInternal({ definition: this.def(a), appId: a.id, appKey: a.key, subjectPersonId: inst.subjectPersonId, title: inst.title, launcher: p }, a.version);
          return { type: action.type, ok: true, detail: child.id };
        }
      }
    } catch (e) {
      return { type: action.type, ok: false, detail: (e as Error).message.slice(0, 200) };
    }
  }

  /** Dopo la conclusione di una fase: instradamento, attesa del gruppo, fase successiva o chiusura. */
  private async advance(instanceId: string, stageKey: string, payload: { answers?: Record<string, unknown> | null; outcome?: AppOutcome | null }) {
    const [inst] = await tx().select().from(appInstances).where(eq(appInstances.id, instanceId));
    if (!inst || inst.status !== 'running') return;
    const def = this.def(inst);
    if (this.stageHooks.length) {
      const [run] = await tx().select().from(appStageRuns).where(and(eq(appStageRuns.instanceId, instanceId), eq(appStageRuns.stageKey, stageKey))).orderBy(desc(appStageRuns.attempt)).limit(1);
      if (run) for (const hook of this.stageHooks) await hook({ instance: inst, run, stageKey, payload });
    }
    const runs = await tx().select({ stageKey: appStageRuns.stageKey, status: appStageRuns.status, attempt: appStageRuns.attempt }).from(appStageRuns).where(eq(appStageRuns.instanceId, instanceId));
    const next = afterStageDone(def, stageKey, payload, runs);
    if (next.kind === 'wait') {
      const current = (inst.currentStages as string[]).filter((k) => k !== stageKey);
      await tx().update(appInstances).set({ currentStages: current, updatedAt: new Date() }).where(eq(appInstances.id, instanceId));
      return;
    }
    if (next.kind === 'end') return this.complete(inst, 'completed');
    await this.activate(inst, next.stageKeys);
  }

  private async complete(inst: InstanceRow, outcome: string) {
    const def = this.def(inst);
    const now = new Date();
    await tx().update(appInstances).set({ status: 'completed', outcome, completedAt: now, currentStages: [], updatedAt: now }).where(eq(appInstances.id, inst.id));
    await tx().update(appStageRuns).set({ status: 'skipped', updatedAt: now }).where(and(eq(appStageRuns.instanceId, inst.id), inArray(appStageRuns.status, ['pending', 'active'])));
    await this.log(inst.id, 'completed', { outcome });
    if (def.silent) return;
    const names = await this.namesOf([inst.subjectPersonId]);
    const subjectName = personName(names.get(inst.subjectPersonId));
    for (const pid of new Set([inst.subjectPersonId, inst.launcherPersonId].filter((x): x is string => !!x))) await this.notifier.send({ personId: pid, type: 'app.completed', data: { appName: def.name, instanceLabel: def.naming.instanceLabel, otherName: pid === inst.subjectPersonId ? null : subjectName, outcome: outcome === 'rejected' ? 'respinta' : null }, link: `/apps/instances/${inst.id}` });
  }

  private async onFormSubmitted(resp: SubmittedResponse) {
    if (!resp.contextId) return;
    const [run] = await tx().select().from(appStageRuns).where(and(eq(appStageRuns.id, resp.contextId), eq(appStageRuns.status, 'active')));
    if (!run) return;
    const now = new Date();
    await tx().update(appStageRuns).set({ status: 'done', outcome: 'submitted', answers: resp.answers, completedAt: now, completedByPersonId: resp.respondentPersonId, updatedAt: now }).where(eq(appStageRuns.id, run.id));
    await this.log(run.instanceId, 'submitted', { formKey: resp.formKey }, run.stageKey);
    await this.advance(run.instanceId, run.stageKey, { answers: resp.answers as Record<string, unknown>, outcome: 'submitted' });
  }

  private async runRow(id: string): Promise<{ run: RunRow; inst: InstanceRow }> {
    const [run] = await tx().select().from(appStageRuns).where(eq(appStageRuns.id, id));
    if (!run) throw notFound('Fase', id);
    const [inst] = await tx().select().from(appInstances).where(eq(appInstances.id, run.instanceId));
    if (!inst) throw notFound('Istanza', run.instanceId);
    return { run, inst };
  }

  async decide(runId: string, dto: z.infer<typeof decideDto>) {
    const p = principal();
    const { run, inst } = await this.runRow(runId);
    const def = this.def(inst);
    const stage = def.stages.find((s) => s.key === run.stageKey)!;
    if (run.status !== 'active' || stage.type !== 'approval') throw conflict(ErrorCodes.CONFLICT, 'La fase non è un’approvazione attiva');
    if (inst.status !== 'running') throw conflict(ErrorCodes.CONFLICT, 'Istanza non in corso');
    if (def.silent) throw conflict(ErrorCodes.CONFLICT, 'Questa fase si conclude dal suo modulo (review, onboarding), non dal motore');
    if (run.actorPersonId !== p.personId && !this.isHr(p)) throw forbidden('Solo l’assegnatario (o l’HR) può decidere');
    if (dto.decision === 'reject' && stage.approval?.requireComment && !dto.comment?.trim()) throw unprocessable(ErrorCodes.VALIDATION, 'Il rimando richiede un commento');
    await this.decideInternal(runId, dto);
    return this.getInstance(inst.id);
  }

  /** Decisione su una fase di approvazione senza controllo dell'attore (moduli nativi: la review verifica i propri permessi). */
  async decideInternal(runId: string, dto: { decision: 'approve' | 'reject'; comment?: string }) {
    const p = principal();
    const { run, inst } = await this.runRow(runId);
    const def = this.def(inst);
    const stage = def.stages.find((s) => s.key === run.stageKey)!;
    if (run.status !== 'active' || stage.type !== 'approval') throw conflict(ErrorCodes.CONFLICT, 'La fase non è un’approvazione attiva');
    const now = new Date();
    const approved = dto.decision === 'approve';
    await tx().update(appStageRuns).set({ status: approved ? 'done' : 'rejected', outcome: approved ? 'approved' : 'rejected', comment: dto.comment ?? null, completedAt: now, completedByPersonId: p.personId ?? null, updatedAt: now }).where(eq(appStageRuns.id, runId));
    await this.log(inst.id, approved ? 'approved' : 'rejected', { comment: dto.comment ?? null }, run.stageKey);
    await this.audit.log({ action: approved ? 'app.approve' : 'app.reject', entityType: 'app_instance', entityId: inst.id, after: { stageKey: run.stageKey, comment: dto.comment ?? null } });
    const names = await this.namesOf([p.personId, inst.subjectPersonId]);
    const notifyDecision = async (pid: string | null) => { if (pid && pid !== p.personId && !def.silent) await this.notifier.send({ personId: pid, type: 'app.decided', data: { appName: def.name, title: stage.name, fromName: personName(p.personId ? names.get(p.personId) : null), approved: approved ? 1 : null, comment: dto.comment ?? null }, link: `/apps/instances/${inst.id}` }); };
    if (approved) {
      await notifyDecision(inst.subjectPersonId);
      await this.advance(inst.id, run.stageKey, { outcome: 'approved' });
    } else if (stage.approval?.rejectTo) {
      const plan = rejectPlan(def, run.stageKey, stage.approval.rejectTo);
      for (const key of plan.supersede) {
        const [latest] = await tx().select().from(appStageRuns).where(and(eq(appStageRuns.instanceId, inst.id), eq(appStageRuns.stageKey, key))).orderBy(desc(appStageRuns.attempt)).limit(1);
        if (latest && latest.status !== 'rejected') await tx().update(appStageRuns).set({ status: 'superseded', updatedAt: now }).where(eq(appStageRuns.id, latest.id));
        await tx().insert(appStageRuns).values({ tenantId: p.tenantId, instanceId: inst.id, stageKey: key, attempt: (latest?.attempt ?? 0) + 1, type: def.stages.find((s) => s.key === key)!.type });
      }
      for (const key of plan.reopen) {
        const [latest] = await tx().select().from(appStageRuns).where(and(eq(appStageRuns.instanceId, inst.id), eq(appStageRuns.stageKey, key))).orderBy(desc(appStageRuns.attempt)).limit(1);
        if (latest && ['done', 'active'].includes(latest.status)) await tx().update(appStageRuns).set({ status: 'superseded', updatedAt: now }).where(eq(appStageRuns.id, latest.id));
      }
      const targetActor = await this.actorPerson(def.stages.find((s) => s.key === plan.reopen[0])!.actor, inst.actors as Actors);
      await notifyDecision(targetActor);
      if (targetActor !== inst.subjectPersonId) await notifyDecision(inst.subjectPersonId);
      await this.activate(inst, plan.reopen);
    } else {
      await notifyDecision(inst.subjectPersonId);
      await notifyDecision(inst.launcherPersonId);
      await this.complete(inst, 'rejected');
    }
  }

  /** Riapre una fase (e le successive già concluse) creando nuovi tentativi: usato dalla riapertura delle review (APP-025). */
  async reopenTo(instanceId: string, targetKey: string) {
    const p = principal();
    const [inst] = await tx().select().from(appInstances).where(eq(appInstances.id, instanceId));
    if (!inst) throw notFound('Istanza', instanceId);
    const def = this.def(inst);
    const target = def.stages.findIndex((s) => s.key === targetKey);
    if (target < 0) throw notFound('Fase', targetKey);
    const now = new Date();
    const later = def.stages.slice(target).map((s) => s.key);
    for (const key of later) {
      const [latest] = await tx().select().from(appStageRuns).where(and(eq(appStageRuns.instanceId, instanceId), eq(appStageRuns.stageKey, key))).orderBy(desc(appStageRuns.attempt)).limit(1);
      if (!latest || latest.status === 'pending') continue;
      if (latest.status !== 'superseded') await tx().update(appStageRuns).set({ status: 'superseded', updatedAt: now }).where(eq(appStageRuns.id, latest.id));
      await tx().insert(appStageRuns).values({ tenantId: p.tenantId, instanceId, stageKey: key, attempt: latest.attempt + 1, type: def.stages.find((s) => s.key === key)!.type });
    }
    if (inst.status !== 'running') await tx().update(appInstances).set({ status: 'running', outcome: null, completedAt: null, cancelledAt: null, updatedAt: now }).where(eq(appInstances.id, instanceId));
    await this.log(instanceId, 'reopened', { to: targetKey }, targetKey);
    const fresh = (await tx().select().from(appInstances).where(eq(appInstances.id, instanceId)))[0]!;
    await this.activate(fresh, stageKeysOfGroup(def, target).filter((k) => later.includes(k)));
    return fresh;
  }

  /** Chiude un'istanza da un modulo nativo (es. chiusura del ciclo di review). */
  async completeInternal(instanceId: string, outcome: string) {
    const [inst] = await tx().select().from(appInstances).where(eq(appInstances.id, instanceId));
    if (!inst || inst.status !== 'running') return;
    await this.complete(inst, outcome);
  }

  /** Conclude una fase attiva per conto di un modulo nativo (task di onboarding completato, survey inviata). */
  async completeRunInternal(runId: string, opts: { outcome?: 'approved' | 'submitted'; comment?: string | null; byPersonId?: string | null } = {}) {
    const { run, inst } = await this.runRow(runId);
    if (run.status !== 'active' || inst.status !== 'running') return;
    const now = new Date();
    const outcome = opts.outcome ?? (run.type === 'form' ? 'submitted' : 'approved');
    await tx().update(appStageRuns).set({ status: 'done', outcome, comment: opts.comment ?? null, completedAt: now, completedByPersonId: opts.byPersonId ?? principal().personId ?? null, updatedAt: now }).where(eq(appStageRuns.id, runId));
    await this.log(inst.id, outcome, { comment: opts.comment ?? null }, run.stageKey);
    await this.advance(inst.id, run.stageKey, { outcome });
  }

  /** Salta una fase attiva (task di onboarding saltato): il gruppo la considera conclusa. */
  async skipRunInternal(runId: string, comment?: string | null) {
    const { run, inst } = await this.runRow(runId);
    if (run.status !== 'active' || inst.status !== 'running') return;
    const now = new Date();
    await tx().update(appStageRuns).set({ status: 'skipped', outcome: null, comment: comment ?? null, completedAt: now, completedByPersonId: principal().personId ?? null, updatedAt: now }).where(eq(appStageRuns.id, runId));
    await this.log(inst.id, 'skipped', { comment: comment ?? null }, run.stageKey);
    await this.advance(inst.id, run.stageKey, { outcome: null });
  }

  /** Riapre una sola fase con un nuovo tentativo (le altre restano com'erano): riapertura di un task di onboarding. */
  async reopenStage(instanceId: string, stageKey: string): Promise<RunRow | null> {
    const p = principal();
    const [inst] = await tx().select().from(appInstances).where(eq(appInstances.id, instanceId));
    if (!inst) throw notFound('Istanza', instanceId);
    const def = this.def(inst);
    if (!def.stages.some((s) => s.key === stageKey)) throw notFound('Fase', stageKey);
    const now = new Date();
    const [latest] = await tx().select().from(appStageRuns).where(and(eq(appStageRuns.instanceId, instanceId), eq(appStageRuns.stageKey, stageKey))).orderBy(desc(appStageRuns.attempt)).limit(1);
    if (latest?.status === 'active') return latest;
    if (latest && latest.status !== 'pending') {
      await tx().update(appStageRuns).set({ status: 'superseded', updatedAt: now }).where(eq(appStageRuns.id, latest.id));
      await tx().insert(appStageRuns).values({ tenantId: p.tenantId, instanceId, stageKey, attempt: latest.attempt + 1, type: def.stages.find((s) => s.key === stageKey)!.type });
    }
    if (inst.status !== 'running') await tx().update(appInstances).set({ status: 'running', outcome: null, completedAt: null, cancelledAt: null, updatedAt: now }).where(eq(appInstances.id, instanceId));
    await this.log(instanceId, 'reopened', { to: stageKey }, stageKey);
    const fresh = (await tx().select().from(appInstances).where(eq(appInstances.id, instanceId)))[0]!;
    const current = new Set([...(fresh.currentStages as string[]), stageKey]);
    await this.activate(fresh, [stageKey]);
    await tx().update(appInstances).set({ currentStages: [...current], updatedAt: new Date() }).where(eq(appInstances.id, instanceId));
    return (await this.currentRuns(instanceId)).get(stageKey) ?? null;
  }

  /** Riassegna una fase attiva senza notifiche né controlli (il modulo nativo li ha già fatti). */
  async reassignInternal(runId: string, actorPersonId: string | null) {
    const { run, inst } = await this.runRow(runId);
    if (run.status !== 'active') return;
    await tx().update(appStageRuns).set({ actorPersonId, updatedAt: new Date() }).where(eq(appStageRuns.id, runId));
    if (run.formResponseId && actorPersonId) await tx().update(formResponses).set({ respondentPersonId: actorPersonId, updatedAt: new Date() }).where(eq(formResponses.id, run.formResponseId));
    await this.log(inst.id, 'reassigned', { from: run.actorPersonId, to: actorPersonId }, run.stageKey);
  }

  /** Imposta la scadenza di una fase (e della sua compilazione) da un modulo nativo. */
  async setDueInternal(runId: string, due: string | null) {
    const [run] = await tx().select().from(appStageRuns).where(eq(appStageRuns.id, runId));
    if (!run) return;
    await tx().update(appStageRuns).set({ dueDate: due, updatedAt: new Date() }).where(eq(appStageRuns.id, runId));
    if (run.formResponseId) await tx().update(formResponses).set({ dueDate: due ? new Date(`${due}T23:59:59Z`) : null, updatedAt: new Date() }).where(eq(formResponses.id, run.formResponseId));
  }

  /** Annulla un'istanza da un modulo nativo (percorso di onboarding annullato). */
  async cancelInternal(instanceId: string, reason?: string | null) {
    const [inst] = await tx().select().from(appInstances).where(eq(appInstances.id, instanceId));
    if (!inst || inst.status !== 'running') return;
    const now = new Date();
    await tx().update(appInstances).set({ status: 'cancelled', cancelledAt: now, outcome: reason ?? null, currentStages: [], updatedAt: now }).where(eq(appInstances.id, instanceId));
    await tx().update(appStageRuns).set({ status: 'skipped', updatedAt: now }).where(and(eq(appStageRuns.instanceId, instanceId), inArray(appStageRuns.status, ['pending', 'active'])));
    await this.log(instanceId, 'cancelled', { reason: reason ?? null });
  }

  /** Run correnti di un'istanza per chiave di fase (ultimo tentativo). */
  async currentRuns(instanceId: string): Promise<Map<string, RunRow>> {
    const rows = await tx().select().from(appStageRuns).where(eq(appStageRuns.instanceId, instanceId)).orderBy(asc(appStageRuns.attempt));
    const map = new Map<string, RunRow>();
    for (const r of rows) map.set(r.stageKey, r);
    return map;
  }

  async reassign(runId: string, actorPersonId: string) {
    const { run, inst } = await this.runRow(runId);
    if (run.status !== 'active') throw conflict(ErrorCodes.CONFLICT, 'Solo una fase attiva si può riassegnare');
    const [person] = await tx().select({ id: persons.id }).from(persons).where(eq(persons.id, actorPersonId));
    if (!person) throw notFound('Persona', actorPersonId);
    await tx().update(appStageRuns).set({ actorPersonId, updatedAt: new Date() }).where(eq(appStageRuns.id, runId));
    if (run.formResponseId) await tx().update(formResponses).set({ respondentPersonId: actorPersonId, updatedAt: new Date() }).where(eq(formResponses.id, run.formResponseId));
    const def = this.def(inst);
    const stage = def.stages.find((s) => s.key === run.stageKey)!;
    const names = await this.namesOf([inst.subjectPersonId]);
    await this.notifier.send({ personId: actorPersonId, type: 'app.stage_assigned', data: { appName: def.name, title: stage.name, instanceLabel: def.naming.instanceLabel, otherName: actorPersonId === inst.subjectPersonId ? null : personName(names.get(inst.subjectPersonId)), dueDate: run.dueDate }, link: `/apps/instances/${inst.id}` });
    await this.log(inst.id, 'reassigned', { from: run.actorPersonId, to: actorPersonId }, run.stageKey);
    await this.audit.log({ action: 'app.reassign', entityType: 'app_instance', entityId: inst.id, after: { stageKey: run.stageKey, to: actorPersonId } });
    return this.getInstance(inst.id);
  }

  async extend(runId: string, dueDate: string) {
    const { run, inst } = await this.runRow(runId);
    if (run.status !== 'active') throw conflict(ErrorCodes.CONFLICT, 'Solo una fase attiva si può prorogare');
    await tx().update(appStageRuns).set({ dueDate, updatedAt: new Date() }).where(eq(appStageRuns.id, runId));
    if (run.formResponseId) await tx().update(formResponses).set({ dueDate: new Date(`${dueDate}T23:59:59Z`), updatedAt: new Date() }).where(eq(formResponses.id, run.formResponseId));
    await this.log(inst.id, 'extended', { from: run.dueDate, to: dueDate }, run.stageKey);
    await this.audit.log({ action: 'app.extend', entityType: 'app_instance', entityId: inst.id, after: { stageKey: run.stageKey, dueDate } });
    return this.getInstance(inst.id);
  }

  async cancelInstance(id: string, reason?: string) {
    const p = principal();
    const [inst] = await tx().select().from(appInstances).where(eq(appInstances.id, id));
    if (!inst) throw notFound('Istanza', id);
    if (inst.status !== 'running') throw conflict(ErrorCodes.CONFLICT, 'Istanza non in corso');
    if (this.def(inst).silent) throw conflict(ErrorCodes.CONFLICT, 'Questa istanza è gestita dal suo modulo (es. review): usa le azioni del modulo');
    if (!this.isHr(p) && inst.launcherPersonId !== p.personId) throw forbidden('Solo chi ha avviato l’istanza o l’HR può annullarla');
    const now = new Date();
    await tx().update(appInstances).set({ status: 'cancelled', cancelledAt: now, outcome: reason ?? null, currentStages: [], updatedAt: now }).where(eq(appInstances.id, id));
    await tx().update(appStageRuns).set({ status: 'skipped', updatedAt: now }).where(and(eq(appStageRuns.instanceId, id), inArray(appStageRuns.status, ['pending', 'active'])));
    await this.log(id, 'cancelled', { reason: reason ?? null });
    await this.audit.log({ action: 'app.cancel', entityType: 'app_instance', entityId: id, after: { reason } });
    return this.getInstance(id);
  }

  // ---------- lettura ----------

  private async viewerOf(p: Principal, inst: InstanceRow, runs: RunRow[]): Promise<Viewer | null> {
    const def = this.def(inst);
    const v = def.permissions.viewInstances;
    if (this.isHr(p)) return 'hr';
    if (!p.personId) return null;
    if (v.includes('subject') && inst.subjectPersonId === p.personId) return 'subject';
    if (v.includes('launcher') && inst.launcherPersonId === p.personId) return 'launcher';
    if (runs.some((r) => r.actorPersonId === p.personId)) return 'actor';
    if (v.includes('manager') && this.isManager(p) && (inst.actors as Actors).manager === p.personId) return 'manager';
    return null;
  }

  async getInstance(id: string) {
    const p = principal();
    const [inst] = await tx().select().from(appInstances).where(eq(appInstances.id, id));
    if (!inst) throw notFound('Istanza', id);
    const runs = await tx().select().from(appStageRuns).where(eq(appStageRuns.instanceId, id)).orderBy(asc(appStageRuns.attempt));
    const viewer = await this.viewerOf(p, inst, runs);
    if (!viewer) throw notFound('Istanza', id);
    const def = this.def(inst);
    const events = await tx().select().from(appInstanceEvents).where(eq(appInstanceEvents.instanceId, id)).orderBy(asc(appInstanceEvents.at));
    const names = await this.namesOf([inst.subjectPersonId, inst.launcherPersonId, ...runs.flatMap((r) => [r.actorPersonId, r.completedByPersonId]), ...events.map((e) => e.actorPersonId)]);
    const latestOf = (key: string) => runs.filter((r) => r.stageKey === key).sort((a, b) => b.attempt - a.attempt)[0] ?? null;
    const myActiveKeys = runs.filter((r) => r.status === 'active' && r.actorPersonId === p.personId).map((r) => r.stageKey);
    const stageIndex = (k: string) => def.stages.findIndex((s) => s.key === k);
    const canSeeAnswers = (stageKey: string, run: RunRow | null) => {
      if (viewer === 'hr') return true;
      if (run?.completedByPersonId === p.personId || run?.actorPersonId === p.personId) return true;
      if (viewer === 'subject' && def.permissions.viewInstances.includes('subject') && def.stages[stageIndex(stageKey)]?.actor === 'subject') return true;
      // attore di una fase attiva con seePrevious vede le fasi precedenti
      return myActiveKeys.some((k) => def.stages[stageIndex(k)]?.seePrevious && stageIndex(stageKey) < stageIndex(k));
    };
    const stages = def.stages.map((s) => {
      const run = latestOf(s.key);
      const history = runs.filter((r) => r.stageKey === s.key && r.id !== run?.id).map((r) => ({ attempt: r.attempt, status: r.status, outcome: r.outcome, comment: r.comment, completedAt: r.completedAt, completedBy: r.completedByPersonId ? personName(names.get(r.completedByPersonId)) : null }));
      const seeAnswers = canSeeAnswers(s.key, run);
      return {
        key: s.key, name: s.name, type: s.type, actor: s.actor, description: s.description ?? null, parallelGroup: s.parallelGroup ?? null, formKey: s.formKey ?? null, dueDays: s.dueDays, seePrevious: s.seePrevious, approval: s.approval ?? null,
        run: run ? { id: run.id, attempt: run.attempt, status: run.status, outcome: run.outcome, comment: run.comment, dueDate: run.dueDate, overdue: run.status === 'active' && !!run.dueDate && run.dueDate < today(), activatedAt: run.activatedAt, completedAt: run.completedAt, actor: run.actorPersonId ? (names.get(run.actorPersonId) ?? null) : null, completedBy: run.completedByPersonId ? personName(names.get(run.completedByPersonId)) : null, formResponseId: run.formResponseId, answers: seeAnswers ? (run.answers as Record<string, unknown> | null) : null, isMine: run.status === 'active' && run.actorPersonId === p.personId, canDecide: run.status === 'active' && s.type === 'approval' && !def.silent && (run.actorPersonId === p.personId || viewer === 'hr') } : null,
        history,
      };
    });
    return {
      id: inst.id, appId: inst.appId, appKey: inst.appKey, appVersion: inst.appVersion, name: def.name, icon: def.icon ?? null, naming: def.naming, status: inst.status, outcome: inst.outcome, title: inst.title, currentStages: inst.currentStages as string[],
      managedByModule: !!def.silent, moduleLink: inst.moduleLink,
      subject: names.get(inst.subjectPersonId) ?? null, launcher: inst.launcherPersonId ? (names.get(inst.launcherPersonId) ?? null) : null,
      startedAt: inst.startedAt, completedAt: inst.completedAt, cancelledAt: inst.cancelledAt, viewer,
      progress: instanceProgress(def, runs),
      can: { cancel: inst.status === 'running' && !def.silent && (viewer === 'hr' || inst.launcherPersonId === p.personId), manage: viewer === 'hr' },
      stages,
      events: events.map((e) => ({ at: e.at, type: e.type, stageKey: e.stageKey, actor: e.actorPersonId ? personName(names.get(e.actorPersonId)) : 'sistema', data: viewer === 'hr' || viewer === 'launcher' || viewer === 'subject' ? e.data : {} })),
    };
  }

  async listInstances(q: z.infer<typeof listInstancesQuery>) {
    const p = principal();
    const me = p.personId ?? '';
    const conds: SQL[] = [];
    if (q.appKey) conds.push(eq(appInstances.appKey, q.appKey));
    if (q.status !== 'all') conds.push(eq(appInstances.status, q.status));
    let ids: string[] | null = null;
    if (q.box === 'todo') {
      const runs = await tx().select({ instanceId: appStageRuns.instanceId }).from(appStageRuns).where(and(eq(appStageRuns.actorPersonId, me), eq(appStageRuns.status, 'active')));
      ids = [...new Set(runs.map((r) => r.instanceId))];
      if (!ids.length) return [];
      conds.push(inArray(appInstances.id, ids));
    } else if (q.box === 'mine') conds.push(eq(appInstances.subjectPersonId, me));
    else if (q.box === 'launched') conds.push(eq(appInstances.launcherPersonId, me));
    else if (q.box === 'team') {
      if (!this.isManager(p) && !this.isHr(p)) throw forbidden();
      conds.push(sql`${appInstances.actors}->>'manager' = ${me}`);
    } else if (!this.isHr(p)) throw forbidden();
    const rows = await tx().select().from(appInstances).where(conds.length ? and(...conds) : undefined).orderBy(desc(appInstances.startedAt)).limit(500);
    if (!rows.length) return [];
    const runs = await tx().select().from(appStageRuns).where(inArray(appStageRuns.instanceId, rows.map((r) => r.id)));
    const names = await this.namesOf(rows.flatMap((r) => [r.subjectPersonId, r.launcherPersonId, ...runs.filter((x) => x.instanceId === r.id && x.status === 'active').map((x) => x.actorPersonId)]));
    const day = today();
    return rows
      .filter((r) => q.box !== 'team' || this.def(r).permissions.viewInstances.includes('manager') || this.isHr(p))
      .map((r) => {
        const def = this.def(r);
        const active = runs.filter((x) => x.instanceId === r.id && x.status === 'active');
        return {
          id: r.id, appKey: r.appKey, name: def.name, icon: def.icon ?? null, instanceLabel: def.naming.instanceLabel, status: r.status, outcome: r.outcome, title: r.title, startedAt: r.startedAt, completedAt: r.completedAt,
          subject: names.get(r.subjectPersonId) ?? null, launcher: r.launcherPersonId ? (names.get(r.launcherPersonId) ?? null) : null,
          progress: instanceProgress(def, runs.filter((x) => x.instanceId === r.id)),
          activeStages: active.map((x) => ({ key: x.stageKey, name: def.stages.find((s) => s.key === x.stageKey)?.name ?? x.stageKey, actor: x.actorPersonId ? (names.get(x.actorPersonId) ?? null) : null, dueDate: x.dueDate, overdue: !!x.dueDate && x.dueDate < day, isMine: x.actorPersonId === me, runId: x.id, type: x.type, formResponseId: x.formResponseId })),
        };
      });
  }

  async instancesCsv(q: z.infer<typeof listInstancesQuery>) {
    const rows = await this.listInstances({ ...q, format: 'json' });
    return toCsv(['App', 'Titolo', 'Soggetto', 'Avviata da', 'Stato', 'Esito', 'Avanzamento', 'Fasi attive', 'Assegnatari', 'Scadenza', 'Avvio', 'Chiusura'], rows.map((r) => [r.name, r.title ?? '', personName(r.subject), personName(r.launcher), r.status, r.outcome ?? '', `${r.progress.percent}%`, r.activeStages.map((s) => s.name).join(' / '), r.activeStages.map((s) => personName(s.actor)).join(' / '), r.activeStages.map((s) => s.dueDate ?? '').join(' / '), r.startedAt.toISOString().slice(0, 10), r.completedAt?.toISOString().slice(0, 10) ?? '']));
  }

  /** Dashboard HR (APP-034): per app pubblicata, istanze per stato e fasi attive/scadute. */
  async dashboard() {
    const rows = await tx().select().from(apps).where(and(isNull(apps.archivedAt), eq(apps.status, 'published')));
    const inst = await tx().select({ id: appInstances.id, appKey: appInstances.appKey, status: appInstances.status, startedAt: appInstances.startedAt, completedAt: appInstances.completedAt }).from(appInstances);
    const active = await tx().select({ instanceId: appStageRuns.instanceId, stageKey: appStageRuns.stageKey, dueDate: appStageRuns.dueDate }).from(appStageRuns).where(eq(appStageRuns.status, 'active'));
    const day = today();
    return rows.map((a) => {
      const def = this.def(a);
      const mine = inst.filter((i) => i.appKey === a.key);
      const done = mine.filter((i) => i.status === 'completed' && i.completedAt);
      const avgDays = done.length ? Math.round(done.reduce((s, i) => s + (i.completedAt!.getTime() - i.startedAt.getTime()) / 86400000, 0) / done.length) : null;
      const ids = new Set(mine.map((i) => i.id));
      const act = active.filter((r) => ids.has(r.instanceId));
      return {
        id: a.id, key: a.key, name: def.name, icon: def.icon ?? null, version: a.version,
        counts: { running: mine.filter((i) => i.status === 'running').length, completed: done.length, cancelled: mine.filter((i) => i.status === 'cancelled').length, overdue: act.filter((r) => r.dueDate && r.dueDate < day).length },
        avgDays,
        stages: def.stages.map((s) => ({ key: s.key, name: s.name, type: s.type, active: act.filter((r) => r.stageKey === s.key).length, overdue: act.filter((r) => r.stageKey === s.key && r.dueDate && r.dueDate < day).length })),
      };
    });
  }
}
