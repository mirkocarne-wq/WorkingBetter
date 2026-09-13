import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { actionItems, feedback, keyResults, meetingNotes, meetings, objectives, oneOnOneRelations, persons, talkingPoints } from '@wb/db';
import { ErrorCodes, Permissions, hasPermission, type Principal } from '@wb/shared';
import type { z } from 'zod';
import { principal, tx } from '../common/context.js';
import { TenantCipher } from '../common/crypto.js';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors.js';
import { CONFIG, type AppConfig } from '../config.js';
import { AuditService } from '../audit/audit.service.js';
import { PeopleService } from '../core/people.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CalendarService } from '../calendar/calendar.service.js';
import type {
  completeMeetingDto,
  createActionItemDto,
  createMeetingDto,
  createRelationDto,
  createTalkingPointDto,
  updateActionItemDto,
  updateMeetingDto,
  updateRelationDto,
  updateTalkingPointDto,
} from './dto.js';

type RelationRow = typeof oneOnOneRelations.$inferSelect;
type MeetingRow = typeof meetings.$inferSelect;

@Injectable()
export class OneOnOneService {
  private readonly cipher: TenantCipher;
  constructor(@Inject(CONFIG) cfg: AppConfig, private readonly audit: AuditService, private readonly people: PeopleService, private readonly notifier: NotificationsService, private readonly calendar: CalendarService) {
    this.cipher = new TenantCipher(cfg.NOTES_MASTER_KEY);
  }

  // ---------- relazioni ----------

  async listMine() {
    const p = this.me();
    const rows = await tx()
      .select()
      .from(oneOnOneRelations)
      .where(and(isNull(oneOnOneRelations.archivedAt), or(eq(oneOnOneRelations.personAId, p.personId!), eq(oneOnOneRelations.personBId, p.personId!))))
      .orderBy(desc(oneOnOneRelations.createdAt));
    return Promise.all(rows.map((r) => this.relationSummary(r)));
  }

  async getRelation(id: string) {
    const r = await this.relationRow(id);
    const history = await tx().select().from(meetings).where(eq(meetings.relationId, id)).orderBy(desc(meetings.scheduledAt)).limit(50);
    const openActions = await tx().select().from(actionItems).where(and(eq(actionItems.relationId, id), eq(actionItems.status, 'open'))).orderBy(asc(actionItems.dueDate));
    return { ...(await this.relationSummary(r)), meetings: history, openActionItems: openActions };
  }

  async createRelation(dto: z.infer<typeof createRelationDto>) {
    const p = this.me();
    if (dto.otherPersonId === p.personId) throw unprocessable(ErrorCodes.VALIDATION, 'Un 1:1 richiede due persone diverse');
    const other = await this.people.get(dto.otherPersonId);
    // manager_report: chi crea deve essere il manager (A) o il riporto (B)
    let a = p.personId!;
    let b = other.id;
    if (dto.kind === 'manager_report') {
      const me = await this.people.get(p.personId!);
      if (other.managerId === p.personId) [a, b] = [p.personId!, other.id];
      else if (me.managerId === other.id) [a, b] = [other.id, p.personId!];
      else throw unprocessable(ErrorCodes.VALIDATION, 'La relazione manager–riporto richiede una linea gerarchica diretta; usa kind "mentoring", "peer" o "skip_level"');
    }
    const [dup] = await tx()
      .select()
      .from(oneOnOneRelations)
      .where(and(isNull(oneOnOneRelations.archivedAt), eq(oneOnOneRelations.kind, dto.kind), or(and(eq(oneOnOneRelations.personAId, a), eq(oneOnOneRelations.personBId, b)), and(eq(oneOnOneRelations.personAId, b), eq(oneOnOneRelations.personBId, a)))));
    if (dup) throw conflict(ErrorCodes.CONFLICT, 'Esiste già una relazione 1:1 attiva tra queste persone');
    const [row] = await tx()
      .insert(oneOnOneRelations)
      .values({ tenantId: p.tenantId, createdBy: p.userId, personAId: a, personBId: b, kind: dto.kind, cadenceDays: dto.cadenceDays ?? null, durationMin: dto.durationMin, meetingUrl: dto.meetingUrl ?? null })
      .returning();
    const first = dto.firstMeetingAt ? await this.insertMeeting(row!, new Date(dto.firstMeetingAt)) : null;
    await this.audit.log({ action: 'one_on_one.create', entityType: 'one_on_one_relation', entityId: row!.id, after: dto });
    if (first) await this.calendar.sendMeetingInvites(first.id, 'REQUEST', 'Invito');
    const me = await this.people.get(p.personId!);
    await this.notifier.send({ personId: other.id, type: 'one_on_one.scheduled', data: { otherName: `${me.firstName} ${me.lastName}`, when: dto.firstMeetingAt ? new Date(dto.firstMeetingAt).toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' }) : null }, link: `/one-on-ones/${row!.id}` });
    return this.getRelation(row!.id);
  }

  async updateRelation(id: string, dto: z.infer<typeof updateRelationDto>) {
    const r = await this.relationRow(id);
    await tx()
      .update(oneOnOneRelations)
      .set({ cadenceDays: dto.cadenceDays, durationMin: dto.durationMin, meetingUrl: dto.meetingUrl, archivedAt: dto.archived === undefined ? undefined : dto.archived ? new Date() : null, updatedAt: new Date() })
      .where(eq(oneOnOneRelations.id, id));
    await this.audit.log({ action: 'one_on_one.update', entityType: 'one_on_one_relation', entityId: id, before: r, after: dto });
    return this.getRelation(id);
  }

  // ---------- incontri ----------

  async createMeeting(relationId: string, dto: z.infer<typeof createMeetingDto>) {
    const r = await this.relationRow(relationId);
    const m = await this.insertMeeting(r, new Date(dto.scheduledAt), dto.durationMin);
    await this.audit.log({ action: 'meeting.create', entityType: 'meeting', entityId: m.id, after: dto });
    await this.calendar.sendMeetingInvites(m.id, 'REQUEST', 'Invito');
    return this.getMeeting(m.id);
  }

  async getMeeting(id: string) {
    const p = this.me();
    const m = await this.meetingRow(id);
    const points = await tx().select().from(talkingPoints).where(eq(talkingPoints.meetingId, id)).orderBy(asc(talkingPoints.position), asc(talkingPoints.createdAt));
    const notes = await tx().select().from(meetingNotes).where(eq(meetingNotes.meetingId, id));
    const shared = notes.find((n) => n.visibility === 'shared');
    const mine = notes.find((n) => n.visibility === 'private' && n.authorPersonId === p.personId);
    const actions = await tx().select().from(actionItems).where(eq(actionItems.meetingId, id)).orderBy(asc(actionItems.createdAt));
    return {
      ...m,
      talkingPoints: points,
      sharedNote: shared?.body ?? '',
      privateNote: mine ? this.readNote(p.tenantId, mine) : '',
      actionItems: actions,
    };
  }

  async updateMeeting(id: string, dto: z.infer<typeof updateMeetingDto>) {
    const m = await this.meetingRow(id);
    if (m.status === 'done') throw conflict(ErrorCodes.CONFLICT, 'Incontro già chiuso');
    const rescheduled = (dto.scheduledAt && new Date(dto.scheduledAt).getTime() !== m.scheduledAt.getTime()) || (dto.durationMin != null && dto.durationMin !== m.durationMin) || (dto.status === 'scheduled' && m.status !== 'scheduled');
    const cancelled = (dto.status === 'cancelled' || dto.status === 'skipped') && m.status === 'scheduled';
    await tx()
      .update(meetings)
      .set({ scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined, durationMin: dto.durationMin, status: dto.status, icalSequence: rescheduled || cancelled ? m.icalSequence + 1 : undefined, updatedAt: new Date() })
      .where(eq(meetings.id, id));
    await this.audit.log({ action: 'meeting.update', entityType: 'meeting', entityId: id, before: m, after: dto });
    // inviti iCalendar (INT-023): stesso UID, SEQUENCE maggiore → i calendari aggiornano o annullano l'evento
    if (cancelled) await this.calendar.sendMeetingInvites(id, 'CANCEL', 'Annullato');
    else if (rescheduled) await this.calendar.sendMeetingInvites(id, 'REQUEST', 'Riprogrammato');
    return this.getMeeting(id);
  }

  /** Chiude l'incontro; i punti non discussi passano al prossimo (ONE-011), creato secondo la cadenza (ONE-002). */
  async completeMeeting(id: string, dto: z.infer<typeof completeMeetingDto>) {
    const p = this.me();
    const m = await this.meetingRow(id);
    if (m.status === 'done') throw conflict(ErrorCodes.CONFLICT, 'Incontro già chiuso');
    const r = await this.relationRow(m.relationId);
    await tx().update(meetings).set({ status: 'done', completedAt: new Date(), completedByPersonId: p.personId, updatedAt: new Date() }).where(eq(meetings.id, id));
    let next: MeetingRow | null = null;
    if (dto.scheduleNext && (dto.nextAt || r.cadenceDays)) {
      const nextAt = dto.nextAt ? new Date(dto.nextAt) : new Date(m.scheduledAt.getTime() + r.cadenceDays! * 86400000);
      next = await this.insertMeeting(r, nextAt);
      await this.calendar.sendMeetingInvites(next.id, 'REQUEST', 'Invito');
      const undiscussed = await tx().select().from(talkingPoints).where(and(eq(talkingPoints.meetingId, id), eq(talkingPoints.discussed, false)));
      let pos = 0;
      for (const tp of undiscussed) {
        await tx().insert(talkingPoints).values({
          tenantId: p.tenantId,
          createdBy: p.userId,
          meetingId: next.id,
          relationId: r.id,
          authorPersonId: tp.authorPersonId,
          text: tp.text,
          source: 'carry_over',
          refType: tp.refType,
          refId: tp.refId,
          position: pos++,
          carriedFromMeetingId: id,
        });
      }
    }
    await this.audit.log({ action: 'meeting.complete', entityType: 'meeting', entityId: id, after: { nextMeetingId: next?.id ?? null } });
    return { meeting: await this.getMeeting(id), nextMeeting: next ? await this.getMeeting(next.id) : null };
  }

  // ---------- punti di agenda ----------

  async addTalkingPoint(meetingId: string, dto: z.infer<typeof createTalkingPointDto>) {
    const p = this.me();
    const m = await this.meetingRow(meetingId);
    if (m.status === 'done') throw conflict(ErrorCodes.CONFLICT, 'Incontro già chiuso');
    const [last] = await tx().select({ n: talkingPoints.position }).from(talkingPoints).where(eq(talkingPoints.meetingId, meetingId)).orderBy(desc(talkingPoints.position)).limit(1);
    const [row] = await tx()
      .insert(talkingPoints)
      .values({ tenantId: p.tenantId, createdBy: p.userId, meetingId, relationId: m.relationId, authorPersonId: p.personId, text: dto.text, source: dto.source, refType: dto.refType, refId: dto.refId, position: (last?.n ?? -1) + 1 })
      .returning();
    return row!;
  }

  async updateTalkingPoint(id: string, dto: z.infer<typeof updateTalkingPointDto>) {
    const [tp] = await tx().select().from(talkingPoints).where(eq(talkingPoints.id, id));
    if (!tp) throw notFound('Punto di agenda', id);
    await this.meetingRow(tp.meetingId);
    const [row] = await tx().update(talkingPoints).set({ text: dto.text, discussed: dto.discussed, position: dto.position, updatedAt: new Date() }).where(eq(talkingPoints.id, id)).returning();
    return row!;
  }

  async deleteTalkingPoint(id: string) {
    const [tp] = await tx().select().from(talkingPoints).where(eq(talkingPoints.id, id));
    if (!tp) throw notFound('Punto di agenda', id);
    await this.meetingRow(tp.meetingId);
    await tx().delete(talkingPoints).where(eq(talkingPoints.id, id));
  }

  // ---------- note ----------

  async upsertNote(meetingId: string, visibility: 'shared' | 'private', body: string) {
    const p = this.me();
    const m = await this.meetingRow(meetingId);
    const cond = visibility === 'shared'
      ? and(eq(meetingNotes.meetingId, meetingId), eq(meetingNotes.visibility, 'shared'))
      : and(eq(meetingNotes.meetingId, meetingId), eq(meetingNotes.visibility, 'private'), eq(meetingNotes.authorPersonId, p.personId!));
    const stored = visibility === 'private' && this.cipher.enabled ? this.cipher.encrypt(p.tenantId, body) : body;
    const encrypted = visibility === 'private' && this.cipher.enabled;
    const [existing] = await tx().select().from(meetingNotes).where(cond);
    if (existing) await tx().update(meetingNotes).set({ body: stored, encrypted, updatedAt: new Date() }).where(eq(meetingNotes.id, existing.id));
    else await tx().insert(meetingNotes).values({ tenantId: p.tenantId, createdBy: p.userId, meetingId, relationId: m.relationId, authorPersonId: p.personId!, visibility, body: stored, encrypted });
    if (visibility === 'shared') await this.audit.log({ action: 'meeting.note.shared', entityType: 'meeting', entityId: meetingId });
    return { visibility, body };
  }

  // ---------- action item ----------

  async createActionItem(meetingId: string, dto: z.infer<typeof createActionItemDto>) {
    const p = this.me();
    const m = await this.meetingRow(meetingId);
    const r = await this.relationRow(m.relationId);
    const owner = dto.ownerPersonId ?? p.personId!;
    if (![r.personAId, r.personBId].includes(owner)) throw unprocessable(ErrorCodes.VALIDATION, 'L\'owner deve essere uno dei due partecipanti');
    const [row] = await tx()
      .insert(actionItems)
      .values({ tenantId: p.tenantId, createdBy: p.userId, relationId: r.id, meetingId, ownerPersonId: owner, title: dto.title, dueDate: dto.dueDate ?? null })
      .returning();
    await this.audit.log({ action: 'action_item.create', entityType: 'action_item', entityId: row!.id, after: dto });
    if (owner !== p.personId) {
      const me = await this.people.get(p.personId!);
      await this.notifier.send({ personId: owner, type: 'action_item.assigned', data: { title: dto.title, dueDate: dto.dueDate ?? null, fromName: `${me.firstName} ${me.lastName}` }, link: `/one-on-ones/${r.id}` });
    }
    return row!;
  }

  async updateActionItem(id: string, dto: z.infer<typeof updateActionItemDto>) {
    const p = this.me();
    const [ai] = await tx().select().from(actionItems).where(eq(actionItems.id, id));
    if (!ai) throw notFound('Action item', id);
    if (ai.relationId) await this.relationRow(ai.relationId);
    else if (ai.ownerPersonId !== p.personId) throw forbidden();
    const [row] = await tx()
      .update(actionItems)
      .set({ title: dto.title, dueDate: dto.dueDate, status: dto.status, doneAt: dto.status === 'done' ? new Date() : dto.status ? null : undefined, updatedAt: new Date() })
      .where(eq(actionItems.id, id))
      .returning();
    await this.audit.log({ action: 'action_item.update', entityType: 'action_item', entityId: id, before: ai, after: dto });
    return row!;
  }

  async listActionItems(q: { mine?: boolean; relationId?: string; status?: 'open' | 'done' | 'cancelled' }) {
    const p = this.me();
    const conds: SQL[] = [];
    if (q.relationId) {
      await this.relationRow(q.relationId);
      conds.push(eq(actionItems.relationId, q.relationId));
    } else {
      // le mie azioni + quelle delle mie relazioni 1:1
      const rels = await tx().select({ id: oneOnOneRelations.id }).from(oneOnOneRelations).where(or(eq(oneOnOneRelations.personAId, p.personId!), eq(oneOnOneRelations.personBId, p.personId!)));
      const relIds = rels.map((r) => r.id);
      conds.push(q.mine || relIds.length === 0 ? eq(actionItems.ownerPersonId, p.personId!) : or(eq(actionItems.ownerPersonId, p.personId!), inArray(actionItems.relationId, relIds))!);
    }
    if (q.status) conds.push(eq(actionItems.status, q.status));
    return tx().select().from(actionItems).where(and(...conds)).orderBy(asc(actionItems.status), asc(actionItems.dueDate), desc(actionItems.createdAt));
  }

  // ---------- suggerimenti (ONE-012) ----------

  async suggestions(relationId: string) {
    const p = this.me();
    const r = await this.relationRow(relationId);
    const other = r.personAId === p.personId ? r.personBId : r.personAId;
    const since = new Date(Date.now() - 30 * 86400000);
    const items: Array<{ type: string; text: string; refType: string; refId: string; severity: 'info' | 'warn' | 'crit' }> = [];

    const objs = await tx().select().from(objectives).where(and(eq(objectives.ownerPersonId, other), eq(objectives.status, 'active')));
    const krs = objs.length ? await tx().select().from(keyResults).where(inArray(keyResults.objectiveId, objs.map((o) => o.id))) : [];
    for (const o of objs) {
      if (o.visibility === 'private' && r.kind !== 'manager_report') continue;
      const oKrs = krs.filter((k) => k.objectiveId === o.id);
      const lastCheckIn = oKrs.map((k) => k.lastCheckInAt).filter((d): d is string => !!d).sort().at(-1);
      const daysSince = lastCheckIn ? (Date.now() - new Date(lastCheckIn).getTime()) / 86400000 : null;
      if (o.confidence === 'off_track') items.push({ type: 'objective_off_track', text: `Obiettivo off track: "${o.title}"`, refType: 'objective', refId: o.id, severity: 'crit' });
      else if (o.confidence === 'at_risk') items.push({ type: 'objective_at_risk', text: `Obiettivo a rischio: "${o.title}"`, refType: 'objective', refId: o.id, severity: 'warn' });
      if (oKrs.length && (daysSince == null || daysSince > 14)) items.push({ type: 'objective_stale', text: `Nessun check-in da ${daysSince == null ? 'sempre' : `${Math.floor(daysSince)} giorni`}: "${o.title}"`, refType: 'objective', refId: o.id, severity: 'warn' });
    }
    const overdue = await tx().select().from(actionItems).where(and(eq(actionItems.relationId, relationId), eq(actionItems.status, 'open'), lt(actionItems.dueDate, new Date().toISOString().slice(0, 10))));
    for (const a of overdue) items.push({ type: 'action_overdue', text: `Azione scaduta: "${a.title}"`, refType: 'action_item', refId: a.id, severity: 'warn' });
    const recentFb = await tx()
      .select()
      .from(feedback)
      .where(and(eq(feedback.toPersonId, other), gte(feedback.createdAt, since), or(eq(feedback.visibility, 'manager'), eq(feedback.fromPersonId, p.personId!))));
    if (recentFb.length && r.kind === 'manager_report') items.push({ type: 'feedback_recent', text: `${recentFb.length} feedback ricevut${recentFb.length === 1 ? 'o' : 'i'} negli ultimi 30 giorni`, refType: 'person', refId: other, severity: 'info' });
    return items;
  }

  // ---------- metriche di adozione (solo aggregati, ONE-032) ----------

  async metrics(days: number) {
    const p = principal();
    if (!hasPermission(p.roles, Permissions.ONE_ON_ONES_METRICS)) throw forbidden();
    const since = new Date(Date.now() - days * 86400000);
    const scopeManager = !hasPermission(p.roles, Permissions.OBJECTIVES_WRITE_ANY) && !hasPermission(p.roles, Permissions.ANALYTICS_QUERY);
    const reportIds = scopeManager && p.personId ? await this.people.directReportIds(p.personId) : null;
    const rows = await tx()
      .select({ personBId: oneOnOneRelations.personBId, personAId: oneOnOneRelations.personAId, lastDone: sql<string | null>`max(case when ${meetings.status} = 'done' then ${meetings.scheduledAt} end)`, doneCount: sql<number>`count(case when ${meetings.status} = 'done' and ${meetings.scheduledAt} >= ${since.toISOString()}::timestamptz then 1 end)::int` })
      .from(oneOnOneRelations)
      .leftJoin(meetings, eq(meetings.relationId, oneOnOneRelations.id))
      .where(and(eq(oneOnOneRelations.kind, 'manager_report'), isNull(oneOnOneRelations.archivedAt), reportIds ? (reportIds.length ? inArray(oneOnOneRelations.personBId, reportIds) : sql`false`) : undefined))
      .groupBy(oneOnOneRelations.id, oneOnOneRelations.personBId, oneOnOneRelations.personAId);
    const withMeeting = rows.filter((r) => r.lastDone && new Date(r.lastDone) >= since).length;
    return {
      windowDays: days,
      relations: rows.length,
      withMeetingInWindow: withMeeting,
      coverage: rows.length ? Math.round((withMeeting / rows.length) * 100) / 100 : null,
      byPerson: rows.map((r) => ({ personId: r.personBId, managerId: r.personAId, lastMeetingAt: r.lastDone, meetingsInWindow: r.doneCount })),
    };
  }

  // ---------- interni ----------

  private me(): Principal & { personId: string } {
    const p = principal();
    if (!p.personId) throw forbidden('Serve una persona collegata all\'utente');
    return p as Principal & { personId: string };
  }

  private async relationRow(id: string): Promise<RelationRow> {
    const p = this.me();
    const [r] = await tx().select().from(oneOnOneRelations).where(eq(oneOnOneRelations.id, id));
    if (!r || (r.personAId !== p.personId && r.personBId !== p.personId)) throw notFound('Relazione 1:1', id);
    return r;
  }

  private async meetingRow(id: string): Promise<MeetingRow> {
    const [m] = await tx().select().from(meetings).where(eq(meetings.id, id));
    if (!m) throw notFound('Incontro', id);
    await this.relationRow(m.relationId);
    return m;
  }

  private async insertMeeting(r: RelationRow, at: Date, durationMin?: number): Promise<MeetingRow> {
    const p = principal();
    const [m] = await tx().insert(meetings).values({ tenantId: p.tenantId, createdBy: p.userId, relationId: r.id, scheduledAt: at, durationMin: durationMin ?? r.durationMin }).returning();
    return m!;
  }

  private readNote(tenantId: string, n: typeof meetingNotes.$inferSelect): string {
    if (!n.encrypted) return n.body;
    try {
      return this.cipher.decrypt(tenantId, n.body);
    } catch {
      return '[nota non decifrabile: chiave mancante]';
    }
  }

  private async relationSummary(r: RelationRow) {
    const p = this.me();
    const otherId = r.personAId === p.personId ? r.personBId : r.personAId;
    const [other] = await tx().select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName, jobTitle: persons.jobTitle }).from(persons).where(eq(persons.id, otherId));
    const [next] = await tx().select().from(meetings).where(and(eq(meetings.relationId, r.id), eq(meetings.status, 'scheduled'))).orderBy(asc(meetings.scheduledAt)).limit(1);
    const [last] = await tx().select().from(meetings).where(and(eq(meetings.relationId, r.id), eq(meetings.status, 'done'))).orderBy(desc(meetings.scheduledAt)).limit(1);
    const [oa] = await tx().select({ n: sql<number>`count(*)::int` }).from(actionItems).where(and(eq(actionItems.relationId, r.id), eq(actionItems.status, 'open')));
    const openActions = oa?.n ?? 0;
    const [pp] = next
      ? await tx().select({ n: sql<number>`count(*)::int` }).from(talkingPoints).where(and(eq(talkingPoints.meetingId, next.id), eq(talkingPoints.discussed, false)))
      : [{ n: 0 }];
    const pending = pp?.n ?? 0;
    const daysSinceLast = last ? Math.floor((Date.now() - last.scheduledAt.getTime()) / 86400000) : null;
    return {
      id: r.id,
      kind: r.kind,
      cadenceDays: r.cadenceDays,
      durationMin: r.durationMin,
      meetingUrl: r.meetingUrl ?? null,
      role: r.personAId === p.personId ? 'lead' : 'member',
      other,
      nextMeeting: next ?? null,
      lastMeeting: last ?? null,
      daysSinceLast,
      overdue: r.cadenceDays != null && daysSinceLast != null && daysSinceLast > r.cadenceDays * 1.5,
      openActions,
      pendingPoints: pending,
    };
  }
}

