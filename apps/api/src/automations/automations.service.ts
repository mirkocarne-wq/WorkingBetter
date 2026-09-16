import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { UnsafeUrlError, assertPublicUrl } from '@wb/connectors';
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { actionItems, appInstances, apps, automationRules, automationRuns, notify, persons, roleAssignments, tenants, users, webhookDeliveries, withPlatform, withTenant, type AnyDb } from '@wb/db';
import {
  AutomationEventCatalog, AutomationLimits, ErrorCodes, RolePermissions, automationDedupeKey, evaluateConditions, matchTrigger,
  type AutomationAction, type AutomationActor, type AutomationCondition, type AutomationEventPayload, type AutomationTrigger, type Principal,
} from '@wb/shared';
import { CONFIG, type AppConfig } from '../config.js';
import { AppsService } from '../apps/apps.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ctx, principal, requestContext, tx } from '../common/context.js';
import { conflict, notFound, unprocessable } from '../common/errors.js';
import { DB, DB_APP_ROLE } from '../db/db.module.js';
import { PlatformEventsService } from '../events/platform-events.service.js';
import type { CreateAutomationDto, UpdateAutomationDto } from './dto.js';

export type RuleRow = typeof automationRules.$inferSelect;
type ActionResult = { type: string; ok: boolean; detail?: string };
interface Actors { subject: string | null; manager: string | null; manager_of_manager: string | null; hr: string | null }

const HR_ROLES = ['hr_admin', 'tenant_admin', 'hrbp'];
const SYSTEM_USER = '00000000-0000-0000-0000-000000000000';
const today = (d = new Date()) => d.toISOString().slice(0, 10);
const addDays = (n: number, from = new Date()) => { const d = new Date(from); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/**
 * Automazioni «quando → se → allora» (APP-037/038, ADR-0015): regole per tenant valutate nella transazione
 * dell'evento; trigger a tempo generati dal tick giornaliero chiamato dal worker.
 */
@Injectable()
export class AutomationsService implements OnModuleInit {
  private readonly log = new Logger('Automations');
  constructor(
    private readonly events: PlatformEventsService,
    private readonly appsSvc: AppsService,
    private readonly audit: AuditService,
    @Inject(CONFIG) private readonly cfg: AppConfig,
    @Inject(DB) private readonly db: AnyDb,
    @Inject(DB_APP_ROLE) private readonly appRole: string | null,
  ) {}

  onModuleInit() {
    this.events.on((e) => this.handle(e));
  }

  // ---------- CRUD ----------
  list(includeArchived = false) {
    return tx().select().from(automationRules).where(includeArchived ? undefined : isNull(automationRules.archivedAt)).orderBy(asc(automationRules.createdAt));
  }
  async get(id: string): Promise<RuleRow> {
    const [r] = await tx().select().from(automationRules).where(eq(automationRules.id, id));
    if (!r) throw notFound('Automazione', id);
    return r;
  }
  private validateTrigger(t: AutomationTrigger) {
    const info = AutomationEventCatalog[t.event];
    if (!info) throw unprocessable(ErrorCodes.VALIDATION, `Evento sconosciuto: ${t.event}`);
    if (info.timed && t.days == null) throw unprocessable(ErrorCodes.VALIDATION, 'Questo evento richiede il numero di giorni');
  }
  async create(dto: CreateAutomationDto): Promise<RuleRow> {
    const p = principal();
    this.validateTrigger(dto.trigger);
    const [cnt] = await tx().select({ n: sql<number>`count(*)::int` }).from(automationRules).where(isNull(automationRules.archivedAt));
    if ((cnt?.n ?? 0) >= AutomationLimits.rulesPerTenant) throw conflict(ErrorCodes.CONFLICT, `Limite di ${AutomationLimits.rulesPerTenant} automazioni per tenant raggiunto`);
    const [row] = await tx().insert(automationRules).values({ tenantId: p.tenantId, createdBy: p.userId, name: dto.name, description: dto.description ?? null, enabled: dto.enabled, trigger: dto.trigger, conditions: dto.conditions, actions: dto.actions }).returning();
    await this.audit.log({ action: 'automation.create', entityType: 'automation_rule', entityId: row!.id, after: row });
    return row!;
  }
  async update(id: string, dto: UpdateAutomationDto): Promise<RuleRow> {
    const before = await this.get(id);
    if (dto.trigger) this.validateTrigger(dto.trigger);
    const { archived, ...rest } = dto;
    const [row] = await tx().update(automationRules).set({ ...rest, ...(archived !== undefined ? { archivedAt: archived ? (before.archivedAt ?? new Date()) : null, enabled: archived ? false : (rest.enabled ?? before.enabled) } : {}), updatedAt: new Date() }).where(eq(automationRules.id, id)).returning();
    await this.audit.log({ action: 'automation.update', entityType: 'automation_rule', entityId: id, before, after: row });
    return row!;
  }
  async runs(ruleId: string, limit = 50) {
    await this.get(ruleId);
    const rows = await tx().select({ run: automationRuns, first: persons.firstName, last: persons.lastName }).from(automationRuns).leftJoin(persons, eq(persons.id, automationRuns.subjectPersonId)).where(eq(automationRuns.ruleId, ruleId)).orderBy(desc(automationRuns.at)).limit(limit);
    return rows.map((r) => ({ ...r.run, subjectName: r.first ? `${r.first} ${r.last ?? ''}`.trim() : null }));
  }
  /** Prova a secco: quali regole scatterebbero per un evento sintetico (nessuna azione eseguita). */
  async dryRun(event: AutomationEventPayload) {
    const person = event.subjectPersonId ? await this.personView(event.subjectPersonId) : null;
    const rules = await tx().select().from(automationRules).where(and(eq(automationRules.enabled, true), isNull(automationRules.archivedAt)));
    return rules.map((r) => ({ id: r.id, name: r.name, matches: matchTrigger(r.trigger as AutomationTrigger, event) && evaluateConditions(r.conditions as AutomationCondition[], event, person) }));
  }

  // ---------- motore ----------
  private async personView(id: string) {
    const [p] = await tx().select().from(persons).where(eq(persons.id, id));
    return p ? { jobTitle: p.jobTitle, jobLevel: p.jobLevel, location: p.location, orgUnitId: p.orgUnitId, managerId: p.managerId, status: p.status, customFields: (p.customFields as Record<string, unknown>) ?? {} } : null;
  }

  /** Handler degli eventi: cerca le regole attive che corrispondono e le esegue, una volta sola per chiave. */
  async handle(event: AutomationEventPayload): Promise<void> {
    const store = requestContext.getStore();
    if (!store?.tx || !store.principal) return;
    const depth = event.depth ?? store.automationDepth ?? 0;
    if (depth >= AutomationLimits.maxDepth) return;
    const rules = await tx().select().from(automationRules).where(and(eq(automationRules.enabled, true), isNull(automationRules.archivedAt)));
    const matching = rules.filter((r) => matchTrigger(r.trigger as AutomationTrigger, event));
    if (!matching.length) return;
    const person = event.subjectPersonId ? await this.personView(event.subjectPersonId) : null;
    for (const rule of matching) {
      if (!evaluateConditions(rule.conditions as AutomationCondition[], event, person)) continue;
      const dedupeKey = automationDedupeKey(rule.id, event);
      const [dup] = await tx().select({ id: automationRuns.id }).from(automationRuns).where(eq(automationRuns.dedupeKey, dedupeKey));
      if (dup) continue;
      const prev = store.automationDepth;
      store.automationDepth = depth + 1;
      const results: ActionResult[] = [];
      try {
        for (const action of rule.actions as AutomationAction[]) results.push(await this.runAction(rule, event, action));
      } finally {
        store.automationDepth = prev;
      }
      const ok = results.every((r) => r.ok);
      await tx().insert(automationRuns).values({ tenantId: rule.tenantId, ruleId: rule.id, event: event.type, subjectPersonId: event.subjectPersonId, dedupeKey, ok, results, data: event.data }).onConflictDoNothing();
      await tx().update(automationRules).set({ runsCount: sql`${automationRules.runsCount} + 1`, lastRunAt: new Date() }).where(eq(automationRules.id, rule.id));
    }
  }

  private async actors(subjectId: string | null): Promise<Actors> {
    const subject = subjectId ? (await tx().select().from(persons).where(eq(persons.id, subjectId)))[0] : undefined;
    const [manager] = subject?.managerId ? await tx().select({ managerId: persons.managerId }).from(persons).where(eq(persons.id, subject.managerId)) : [];
    const [hr] = await tx().select({ personId: users.personId }).from(roleAssignments).innerJoin(users, eq(users.id, roleAssignments.userId)).where(and(inArray(roleAssignments.role, HR_ROLES), sql`${users.personId} IS NOT NULL`, isNull(users.disabledAt))).orderBy(asc(roleAssignments.createdAt)).limit(1);
    return { subject: subject?.id ?? null, manager: subject?.managerId ?? null, manager_of_manager: manager?.managerId ?? null, hr: hr?.personId ?? null };
  }
  private async actorPerson(actor: AutomationActor, actors: Actors): Promise<string | null> {
    if (actor.startsWith('person:')) return actor.slice(7);
    if (actor.startsWith('role:')) {
      const [row] = await tx().select({ personId: users.personId }).from(roleAssignments).innerJoin(users, eq(users.id, roleAssignments.userId)).where(and(eq(roleAssignments.role, actor.slice(5)), sql`${users.personId} IS NOT NULL`, isNull(users.disabledAt))).orderBy(asc(roleAssignments.createdAt)).limit(1);
      return row?.personId ?? actors.hr;
    }
    return actors[actor as keyof Actors] ?? actors.hr;
  }

  private async runAction(rule: RuleRow, event: AutomationEventPayload, action: AutomationAction): Promise<ActionResult> {
    const p = principal();
    try {
      const actors = await this.actors(event.subjectPersonId);
      switch (action.type) {
        case 'start_app': {
          if (!event.subjectPersonId) return { type: action.type, ok: false, detail: 'evento senza persona soggetto' };
          const [a] = await tx().select().from(apps).where(and(eq(apps.key, action.appKey), eq(apps.status, 'published')));
          if (!a) return { type: action.type, ok: false, detail: `app «${action.appKey}» non pubblicata` };
          const child = await this.appsSvc.launchInternal({ definition: a.definition as never, appId: a.id, appKey: a.key, subjectPersonId: event.subjectPersonId, title: `${rule.name}`, launcher: p }, a.version);
          return { type: action.type, ok: true, detail: child.id };
        }
        case 'action_item': {
          const owner = await this.actorPerson(action.assignee, actors);
          if (!owner) return { type: action.type, ok: false, detail: 'assegnatario non risolto' };
          const dueDate = action.dueDays == null ? null : addDays(action.dueDays);
          const [row] = await tx().insert(actionItems).values({ tenantId: p.tenantId, createdBy: p.userId === SYSTEM_USER ? null : p.userId, ownerPersonId: owner, title: action.title, dueDate, source: 'app' }).returning();
          await notify(tx(), { tenantId: p.tenantId, personId: owner, type: 'action_item.assigned', data: { title: action.title, dueDate, fromName: rule.name }, link: '/dashboard' });
          return { type: action.type, ok: true, detail: row!.id };
        }
        case 'person_field': {
          if (!event.subjectPersonId) return { type: action.type, ok: false, detail: 'evento senza persona soggetto' };
          const [person] = await tx().select().from(persons).where(eq(persons.id, event.subjectPersonId));
          if (!person) return { type: action.type, ok: false, detail: 'persona non trovata' };
          const patch: Partial<typeof persons.$inferInsert> = { updatedAt: new Date() };
          if (action.field.startsWith('custom:')) patch.customFields = { ...((person.customFields as Record<string, unknown>) ?? {}), [action.field.slice(7)]: action.value };
          else patch[action.field as 'jobTitle' | 'jobLevel' | 'location'] = action.value;
          await tx().update(persons).set(patch).where(eq(persons.id, person.id));
          await this.audit.log({ action: 'automation.person_field', entityType: 'person', entityId: person.id, after: { field: action.field, value: action.value, ruleId: rule.id } });
          return { type: action.type, ok: true, detail: action.field };
        }
        case 'webhook': {
          const body = { event: event.type, rule: { id: rule.id, name: rule.name }, subjectPersonId: event.subjectPersonId, data: event.data, at: new Date().toISOString() };
          try { await assertPublicUrl(action.url, { allowPrivate: this.cfg.NODE_ENV !== 'production' }); } catch (e) { if (e instanceof UnsafeUrlError) return { type: action.type, ok: false, detail: `URL non consentito: ${e.message}` }; throw e; }
          let status: number | null = null;
          let error: string | null = null;
          try {
            const res = await fetch(action.url, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'WorkingBetter-webhook/1' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
            status = res.status;
            if (res.ok) return { type: action.type, ok: true, detail: `HTTP ${res.status}` };
            error = `HTTP ${res.status}`;
          } catch (e) { error = (e as Error).message.slice(0, 200); }
          await tx().insert(webhookDeliveries).values({ tenantId: p.tenantId, createdBy: p.userId === SYSTEM_USER ? null : p.userId, instanceId: null, stageKey: `automation:${rule.id}`, url: action.url, payload: body, status: 'pending', attempts: 1, nextAttemptAt: new Date(Date.now() + 2 * 60000), lastError: error, lastStatus: status });
          return { type: action.type, ok: false, detail: `${error} · in coda per ritentativo` };
        }
        case 'notify': {
          const recipients = new Set<string>();
          for (const a of action.to) { const pid = await this.actorPerson(a, actors); if (pid) recipients.add(pid); }
          if (!recipients.size) return { type: action.type, ok: false, detail: 'nessun destinatario risolto' };
          const subject = actors.subject ? (await tx().select({ firstName: persons.firstName, lastName: persons.lastName }).from(persons).where(eq(persons.id, actors.subject)))[0] : undefined;
          for (const pid of recipients) await notify(tx(), { tenantId: p.tenantId, personId: pid, type: 'automation.message', data: { ruleName: rule.name, body: action.message, otherName: subject && pid !== actors.subject ? `${subject.firstName} ${subject.lastName}` : null }, link: actors.subject && pid !== actors.subject ? `/people/${actors.subject}` : '/dashboard' });
          return { type: action.type, ok: true, detail: `${recipients.size} destinatari` };
        }
      }
    } catch (e) {
      this.log.warn(`azione ${action.type} della regola ${rule.id} fallita: ${(e as Error).message}`);
      return { type: action.type, ok: false, detail: (e as Error).message.slice(0, 200) };
    }
    return { type: (action as AutomationAction).type, ok: false, detail: 'azione sconosciuta' };
  }

  // ---------- trigger a tempo (tick giornaliero) ----------
  /** Per ogni tenant attivo genera gli eventi `person.tenure` e `person.leaving_in` richiesti dalle regole e li consegna al motore. */
  async tick(day = today()): Promise<{ tenants: number; events: number }> {
    const all = await withPlatform(this.db, (t) => t.select({ id: tenants.id }).from(tenants).where(eq(tenants.status, 'active')));
    let events = 0;
    for (const t of all) {
      events += await withTenant(this.db, t.id, async (trx) => {
        const system: Principal = { userId: SYSTEM_USER, tenantId: t.id, personId: null, roles: ['hr_admin'], permissions: [...RolePermissions.hr_admin] };
        return requestContext.run({ requestId: randomUUID(), principal: system, tx: trx }, async () => {
          const rules = await trx.select().from(automationRules).where(and(eq(automationRules.enabled, true), isNull(automationRules.archivedAt)));
          let n = 0;
          for (const rule of rules) {
            const trig = rule.trigger as AutomationTrigger;
            if (trig.days == null) continue;
            if (trig.event === 'person.tenure') {
              const hire = addDays(-trig.days, new Date(`${day}T00:00:00Z`));
              const people = await trx.select({ id: persons.id }).from(persons).where(and(eq(persons.hireDate, hire), inArray(persons.status, ['active', 'invited'])));
              for (const pp of people) { await this.handle({ type: 'person.tenure', subjectPersonId: pp.id, sourceId: day, data: { days: trig.days } }); n++; }
            } else if (trig.event === 'person.leaving_in') {
              const term = addDays(trig.days, new Date(`${day}T00:00:00Z`));
              const people = await trx.select({ id: persons.id }).from(persons).where(and(eq(persons.terminationDate, term), inArray(persons.status, ['active', 'leaving'])));
              for (const pp of people) { await this.handle({ type: 'person.leaving_in', subjectPersonId: pp.id, sourceId: day, data: { days: trig.days } }); n++; }
            }
          }
          return n;
        });
      }, { appRole: this.appRole ?? undefined });
    }
    return { tenants: all.length, events };
  }

  /** Istanze avviate dalle automazioni (per il log): titolo = nome della regola. */
  async instancesOf(ruleName: string) {
    return tx().select({ id: appInstances.id }).from(appInstances).where(eq(appInstances.title, ruleName));
  }
  depth() { return ctx().automationDepth ?? 0; }
}
