import { and, eq, gt, gte, inArray, isNull, lt, lte, sql } from 'drizzle-orm';
import { actionItems, cycles, feedbackRequestRecipients, feedbackRequests, keyResults, meetings, notify, objectives, oneOnOneRelations, persons, talkingPoints, tenants, withPlatform, withTenant, type AnyDb } from '@wb/db';

export interface RemindersSummary {
  tenants: number;
  checkInsDue: number;
  meetingsSoon: number;
  actionsOverdue: number;
  feedbackRequestsPending: number;
}

/**
 * Promemoria giornalieri (INT-001, OKR-033, ONE §7, FBK-009). Idempotente per giorno grazie a dedupeKey.
 * Gira come owner (senza SET ROLE) ma dentro withTenant, così ogni tenant è processato separatamente.
 */
export async function runReminders(db: AnyDb, now = new Date()): Promise<RemindersSummary> {
  const today = now.toISOString().slice(0, 10);
  const summary: RemindersSummary = { tenants: 0, checkInsDue: 0, meetingsSoon: 0, actionsOverdue: 0, feedbackRequestsPending: 0 };
  const allTenants = await withPlatform(db, (tx) => tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.status, 'active')));
  for (const t of allTenants) {
    summary.tenants++;
    await withTenant(db, t.id, async (tx) => {
      // 1) check-in in ritardo: KR di obiettivi attivi senza check-in oltre la cadenza del ciclo
      const rows = await tx
        .select({ krId: keyResults.id, title: objectives.title, ownerPersonId: keyResults.ownerPersonId, objOwner: objectives.ownerPersonId, last: keyResults.lastCheckInAt, created: keyResults.createdAt, cadence: cycles.checkInCadenceDays, objId: objectives.id })
        .from(keyResults)
        .innerJoin(objectives, eq(objectives.id, keyResults.objectiveId))
        .innerJoin(cycles, eq(cycles.id, objectives.cycleId))
        .where(and(eq(objectives.status, 'active'), lte(cycles.startDate, today), gte(cycles.endDate, today)));
      const seen = new Set<string>();
      for (const r of rows) {
        const owner = r.ownerPersonId ?? r.objOwner;
        if (!owner) continue;
        const lastMs = r.last ? new Date(r.last).getTime() : r.created.getTime();
        const ageDays = (now.getTime() - lastMs) / 86400000;
        if (ageDays <= r.cadence) continue;
        const k = `${owner}:${r.objId}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const res = await notify(tx, { tenantId: t.id, personId: owner, type: 'objective.check_in_due', data: { title: r.title, lastCheckIn: r.last ?? null }, link: '/objectives?view=mine', dedupeKey: `check_in_due:${r.objId}:${owner}:${today}` });
        if (res.created) summary.checkInsDue++;
      }
      // 2) 1:1 nelle prossime 24h → entrambi
      const soon = await tx
        .select({ id: meetings.id, at: meetings.scheduledAt, relationId: meetings.relationId, a: oneOnOneRelations.personAId, b: oneOnOneRelations.personBId })
        .from(meetings)
        .innerJoin(oneOnOneRelations, eq(oneOnOneRelations.id, meetings.relationId))
        .where(and(eq(meetings.status, 'scheduled'), gt(meetings.scheduledAt, now), lte(meetings.scheduledAt, new Date(now.getTime() + 24 * 3600000))));
      if (soon.length) {
        const pids = [...new Set(soon.flatMap((m) => [m.a, m.b]))];
        const people = await tx.select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName }).from(persons).where(inArray(persons.id, pids));
        const name = (id: string) => { const p = people.find((x) => x.id === id); return p ? `${p.firstName} ${p.lastName}` : 'collega'; };
        for (const m of soon) {
          const [pp] = await tx.select({ n: sql<number>`count(*)::int` }).from(talkingPoints).where(and(eq(talkingPoints.meetingId, m.id), eq(talkingPoints.discussed, false)));
          const when = m.at.toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' });
          for (const [me, other] of [[m.a, m.b], [m.b, m.a]] as const) {
            const res = await notify(tx, { tenantId: t.id, personId: me, type: 'one_on_one.reminder', data: { otherName: name(other), when, pendingPoints: pp?.n ?? 0 }, link: `/one-on-ones/${m.relationId}`, dedupeKey: `meeting_reminder:${m.id}:${me}` });
            if (res.created) summary.meetingsSoon++;
          }
        }
      }
      // 3) action item scadute (aperte, scadenza < oggi)
      const overdue = await tx.select().from(actionItems).where(and(eq(actionItems.status, 'open'), lt(actionItems.dueDate, today)));
      for (const a of overdue) {
        const res = await notify(tx, { tenantId: t.id, personId: a.ownerPersonId, type: 'action_item.overdue', data: { title: a.title, dueDate: a.dueDate }, link: a.relationId ? `/one-on-ones/${a.relationId}` : '/dashboard', dedupeKey: `action_overdue:${a.id}:${today}` });
        if (res.created) summary.actionsOverdue++;
      }
      // 4) richieste di feedback in sospeso da più di 3 giorni (nudge settimanale)
      const pending = await tx
        .select({ id: feedbackRequestRecipients.id, personId: feedbackRequestRecipients.personId, question: feedbackRequests.question, requester: feedbackRequests.requesterPersonId, created: feedbackRequestRecipients.createdAt })
        .from(feedbackRequestRecipients)
        .innerJoin(feedbackRequests, eq(feedbackRequests.id, feedbackRequestRecipients.requestId))
        .where(and(eq(feedbackRequestRecipients.status, 'pending'), isNull(feedbackRequests.closedAt), lt(feedbackRequestRecipients.createdAt, new Date(now.getTime() - 3 * 86400000))));
      for (const r of pending) {
        const [req] = await tx.select({ firstName: persons.firstName, lastName: persons.lastName }).from(persons).where(eq(persons.id, r.requester));
        const week = Math.floor(now.getTime() / (7 * 86400000));
        const res = await notify(tx, { tenantId: t.id, personId: r.personId, type: 'feedback.request.received', data: { fromName: req ? `${req.firstName} ${req.lastName}` : 'Un collega', question: r.question }, link: '/feedback?tab=requests', dedupeKey: `fb_request_nudge:${r.id}:${week}` });
        if (res.created) summary.feedbackRequestsPending++;
      }
    });
  }
  return summary;
}
