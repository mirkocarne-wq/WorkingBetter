/**
 * Refresh del data mart v1 (ADR-0006): calcola i fatti giornalieri a grana persona per un tenant
 * e riscrive le righe dello snapshot indicato. Va eseguito dentro una transazione tenant.
 *
 * Le finestre mobili (30/90 giorni) e le scadenze sono relative ad `asOf`, così il seed e i test
 * possono ricostruire snapshot di giorni passati; lo stato corrente (progresso obiettivi, stato review)
 * è invece quello del momento in cui gira il refresh.
 */
import { and, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { FactKey } from '@wb/shared';
import {
  actionItems,
  cycles,
  feedback,
  formResponses,
  keyResults,
  martPersonFacts,
  meetings,
  objectives,
  oneOnOneRelations,
  orgUnits,
  persons,
  recognitionRecipients,
  recognitions,
  reviewCycles,
  reviews,
  surveyInvitations,
  surveys,
  welfareMovements,
  welfarePlans,
  welfareRequests,
} from '../schema/index.js';
import type { TenantTx } from '../tenant.js';

export interface RefreshResult {
  snapshotDate: string;
  persons: number;
  rows: number;
}

type Facts = Partial<Record<FactKey, number>>;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const daysBefore = (d: Date, n: number) => new Date(d.getTime() - n * 86400000);

export async function refreshMartForTenant(tx: TenantTx, tenantId: string, asOf: Date = new Date()): Promise<RefreshResult> {
  const day = isoDay(asOf);
  const since30 = daysBefore(asOf, 30);
  const since90 = isoDay(daysBefore(asOf, 90));

  const people = await tx
    .select({ id: persons.id, managerId: persons.managerId, orgUnitId: persons.orgUnitId, hireDate: persons.hireDate })
    .from(persons)
    .where(and(eq(persons.tenantId, tenantId), inArray(persons.status, ['active', 'leaving'])));
  const units = await tx.select({ id: orgUnits.id, path: orgUnits.path }).from(orgUnits).where(eq(orgUnits.tenantId, tenantId));
  const unitPath = new Map(units.map((u) => [u.id, u.path]));
  const byPerson = new Map(people.map((p) => [p.id, p]));
  const facts = new Map<string, Facts>(people.map((p) => [p.id, {}]));
  const inc = (personId: string | null | undefined, key: FactKey, v = 1) => {
    if (!personId) return;
    const f = facts.get(personId);
    if (!f) return; // persona non attiva: non entra nello snapshot
    f[key] = (f[key] ?? 0) + v;
  };
  const set = (personId: string, key: FactKey, v: number) => {
    const f = facts.get(personId);
    if (f) f[key] = v;
  };

  // ---- core ----
  for (const p of people) {
    set(p.id, 'headcount', 1);
    set(p.id, p.managerId && byPerson.has(p.managerId) ? 'has_manager' : 'no_manager', 1);
    if (p.hireDate && p.hireDate >= since90 && p.hireDate <= day) set(p.id, 'new_hire_90d', 1);
  }

  // ---- obiettivi: attivi nei periodi in corso alla data ----
  const objs = await tx
    .select({ id: objectives.id, owner: objectives.ownerPersonId, progress: objectives.progress, confidence: objectives.confidence, cadence: cycles.checkInCadenceDays })
    .from(objectives)
    .innerJoin(cycles, eq(cycles.id, objectives.cycleId))
    .where(and(eq(objectives.tenantId, tenantId), eq(objectives.status, 'active'), lte(cycles.startDate, day), gte(cycles.endDate, day)));
  const objById = new Map(objs.map((o) => [o.id, o]));
  for (const o of objs) {
    if (!o.owner) continue;
    inc(o.owner, 'objectives_active');
    inc(o.owner, 'objectives_progress_sum', o.progress == null ? 0 : Number(o.progress));
    if (o.confidence === 'at_risk' || o.confidence === 'off_track') inc(o.owner, 'objectives_at_risk');
  }
  if (objs.length) {
    const krs = await tx
      .select({ objectiveId: keyResults.objectiveId, owner: keyResults.ownerPersonId, last: keyResults.lastCheckInAt, created: keyResults.createdAt })
      .from(keyResults)
      .where(and(eq(keyResults.tenantId, tenantId), inArray(keyResults.objectiveId, objs.map((o) => o.id))));
    for (const k of krs) {
      const o = objById.get(k.objectiveId);
      const owner = k.owner ?? o?.owner;
      if (!o || !owner) continue;
      inc(owner, 'krs_active');
      const lastMs = k.last ? new Date(k.last).getTime() : k.created.getTime();
      if ((asOf.getTime() - lastMs) / 86400000 > o.cadence) inc(owner, 'krs_stale');
    }
  }
  for (const p of people) set(p.id, (facts.get(p.id)?.objectives_active ?? 0) > 0 ? 'has_objectives' : 'no_objectives', 1);

  // ---- 1:1: incontri conclusi negli ultimi 30 giorni ----
  const done = await tx
    .select({ a: oneOnOneRelations.personAId, b: oneOnOneRelations.personBId, at: meetings.completedAt, sched: meetings.scheduledAt })
    .from(meetings)
    .innerJoin(oneOnOneRelations, eq(oneOnOneRelations.id, meetings.relationId))
    .where(and(eq(meetings.tenantId, tenantId), eq(meetings.status, 'done'), gte(meetings.scheduledAt, since30), lte(meetings.scheduledAt, asOf)));
  for (const m of done) {
    for (const [me, other] of [[m.a, m.b], [m.b, m.a]] as const) {
      inc(me, 'one_on_ones_done_30d');
      if (byPerson.get(me)?.managerId === other) set(me, 'has_one_on_one_30d', 1);
    }
  }
  for (const p of people) if (facts.get(p.id)?.has_manager && !facts.get(p.id)?.has_one_on_one_30d) set(p.id, 'no_one_on_one_30d', 1);

  const actions = await tx.select({ owner: actionItems.ownerPersonId, due: actionItems.dueDate }).from(actionItems).where(and(eq(actionItems.tenantId, tenantId), eq(actionItems.status, 'open')));
  for (const a of actions) {
    inc(a.owner, 'actions_open');
    if (a.due && a.due < day) inc(a.owner, 'actions_overdue');
  }

  // ---- feedback e riconoscimenti negli ultimi 30 giorni ----
  const fb = await tx.select({ from: feedback.fromPersonId, to: feedback.toPersonId }).from(feedback).where(and(eq(feedback.tenantId, tenantId), gte(feedback.createdAt, since30), lte(feedback.createdAt, asOf)));
  for (const f of fb) {
    inc(f.from, 'feedback_given_30d');
    inc(f.to, 'feedback_received_30d');
  }
  const recs = await tx
    .select({ from: recognitions.fromPersonId, to: recognitionRecipients.personId })
    .from(recognitionRecipients)
    .innerJoin(recognitions, eq(recognitions.id, recognitionRecipients.recognitionId))
    .where(and(eq(recognitions.tenantId, tenantId), gte(recognitions.createdAt, since30), lte(recognitions.createdAt, asOf), sql`${recognitions.hiddenAt} is null`));
  const givers = new Map<string, Set<string>>(); // un riconoscimento a più persone conta 1 per l'autore
  for (const r of recs) {
    inc(r.to, 'recognitions_received_30d');
    if (!givers.has(r.from)) givers.set(r.from, new Set());
  }
  const recGiven = await tx.select({ from: recognitions.fromPersonId, n: sql<number>`count(*)::int` }).from(recognitions).where(and(eq(recognitions.tenantId, tenantId), gte(recognitions.createdAt, since30), lte(recognitions.createdAt, asOf), sql`${recognitions.hiddenAt} is null`)).groupBy(recognitions.fromPersonId);
  for (const r of recGiven) inc(r.from, 'recognitions_given_30d', r.n);

  // ---- review: cicli lanciati (attivi o chiusi) alla data ----
  const cyc = await tx.select({ id: reviewCycles.id, selfDue: reviewCycles.selfDueAt, mgrDue: reviewCycles.managerDueAt }).from(reviewCycles).where(and(eq(reviewCycles.tenantId, tenantId), inArray(reviewCycles.status, ['active', 'closed']), lte(reviewCycles.launchedAt, asOf)));
  const reviewRows: Array<{ personId: string; managerId: string | null; cycleId: string; facts: Facts }> = [];
  if (cyc.length) {
    const cycById = new Map(cyc.map((c) => [c.id, c]));
    const rvs = await tx.select().from(reviews).where(and(eq(reviews.tenantId, tenantId), inArray(reviews.cycleId, cyc.map((c) => c.id))));
    for (const r of rvs) {
      if (r.status === 'cancelled' || !facts.has(r.subjectPersonId)) continue;
      const c = cycById.get(r.cycleId)!;
      const f: Facts = { reviews: 1 };
      if (r.selfSubmittedAt) f.reviews_self_submitted = 1;
      if (r.managerSubmittedAt) f.reviews_manager_submitted = 1;
      if (['shared', 'signed', 'closed'].includes(r.status)) {
        f.reviews_completed = 1;
        if (r.finalRating != null) {
          f.reviews_rated = 1;
          f.review_rating_sum = r.finalRating;
        }
      }
      if (r.status === 'signed' || (r.status === 'closed' && r.signedAt)) {
        f.reviews_signed = 1;
        if (r.disagreed) f.reviews_disagreed = 1;
      }
      if ((r.status === 'pending_self' && c.selfDue && c.selfDue < day) || (r.status === 'pending_manager' && c.mgrDue && c.mgrDue < day)) f.reviews_overdue = 1;
      reviewRows.push({ personId: r.subjectPersonId, managerId: r.managerPersonId, cycleId: r.cycleId, facts: f });
    }
  }

  // ---- form: compilazioni in bozza scadute ----
  const overdueForms = await tx
    .select({ who: formResponses.respondentPersonId, n: sql<number>`count(*)::int` })
    .from(formResponses)
    .where(and(eq(formResponses.tenantId, tenantId), eq(formResponses.status, 'draft'), lte(formResponses.dueDate, asOf)))
    .groupBy(formResponses.respondentPersonId);
  for (const r of overdueForms) inc(r.who, 'form_responses_overdue', r.n);

  // ---- survey: inviti e risposte delle survey lanciate negli ultimi 90 giorni (solo conteggi, mai chi ha risposto) ----
  const since90Date = daysBefore(asOf, 90);
  const recentSurveys = await tx.select({ id: surveys.id }).from(surveys).where(and(eq(surveys.tenantId, tenantId), inArray(surveys.status, ['open', 'closed', 'shared']), gte(surveys.launchedAt, since90Date), lte(surveys.launchedAt, asOf)));
  if (recentSurveys.length) {
    const inv = await tx.select({ personId: surveyInvitations.personId, responded: surveyInvitations.respondedAt }).from(surveyInvitations).where(and(eq(surveyInvitations.tenantId, tenantId), inArray(surveyInvitations.surveyId, recentSurveys.map((s) => s.id))));
    for (const i of inv) {
      inc(i.personId, 'survey_invited_90d');
      if (i.responded && i.responded <= asOf) inc(i.personId, 'survey_responded_90d');
    }
  }

  // ---- welfare: solo aggregati per persona nell'anno (take-up e budget), mai categorie o importi singoli ----
  const year = asOf.getUTCFullYear();
  const plans = await tx.select({ id: welfarePlans.id }).from(welfarePlans).where(and(eq(welfarePlans.tenantId, tenantId), eq(welfarePlans.year, year), inArray(welfarePlans.status, ['active', 'closed'])));
  if (plans.length) {
    const planIds = plans.map((p) => p.id);
    const mv = await tx.select({ personId: welfareMovements.personId, kind: welfareMovements.kind, amount: welfareMovements.amount }).from(welfareMovements).where(and(eq(welfareMovements.tenantId, tenantId), inArray(welfareMovements.planId, planIds), lte(welfareMovements.createdAt, asOf)));
    const seenInPlan = new Set<string>();
    for (const m of mv) {
      if (!seenInPlan.has(m.personId)) { seenInPlan.add(m.personId); set(m.personId, 'welfare_in_plan', 1); }
      if (m.kind === 'credit') inc(m.personId, 'welfare_credited_year', Number(m.amount));
      if (m.kind === 'spend') inc(m.personId, 'welfare_spent_year', Number(m.amount));
      if (m.kind === 'refund') inc(m.personId, 'welfare_spent_year', -Number(m.amount));
    }
    const reqs = await tx.select({ personId: welfareRequests.personId }).from(welfareRequests).where(and(eq(welfareRequests.tenantId, tenantId), inArray(welfareRequests.planId, planIds), lte(welfareRequests.createdAt, asOf), sql`${welfareRequests.status} <> 'cancelled'`)).groupBy(welfareRequests.personId);
    for (const r of reqs) set(r.personId, 'welfare_has_request_year', 1);
  }

  // ---- scrittura idempotente dello snapshot ----
  await tx.delete(martPersonFacts).where(and(eq(martPersonFacts.tenantId, tenantId), eq(martPersonFacts.snapshotDate, day)));
  const rows: (typeof martPersonFacts.$inferInsert)[] = [];
  const base = (personId: string) => {
    const p = byPerson.get(personId)!;
    return { tenantId, snapshotDate: day, personId, managerId: p.managerId ?? null, orgUnitId: p.orgUnitId ?? null, orgPath: (p.orgUnitId && unitPath.get(p.orgUnitId)) || '' };
  };
  for (const [personId, f] of facts) for (const [k, v] of Object.entries(f)) if (v) rows.push({ ...base(personId), cycleId: null, factKey: k, value: String(v) });
  for (const r of reviewRows) for (const [k, v] of Object.entries(r.facts)) if (v) rows.push({ ...base(r.personId), managerId: r.managerId ?? base(r.personId).managerId, cycleId: r.cycleId, factKey: k, value: String(v) });
  for (let i = 0; i < rows.length; i += 500) await tx.insert(martPersonFacts).values(rows.slice(i, i + 500));
  return { snapshotDate: day, persons: people.length, rows: rows.length };
}
