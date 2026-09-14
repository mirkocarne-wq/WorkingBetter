import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm';
import { actionItems, emailOutbox, meetings, oneOnOneRelations, persons, reviewCycles, reviews, surveyInvitations, surveys, tenants, users, withPlatform, withTenant, type AnyDb, type TenantTx } from '@wb/db';
import { buildIcs, proposeSlots, tzOffsetMinutes, type IcsEvent, type IcsMethod } from '@wb/shared';
import { principal, tx } from '../common/context.js';
import { forbidden, notFound } from '../common/errors.js';
import { CONFIG, type AppConfig } from '../config.js';
import { AuditService } from '../audit/audit.service.js';
import { DB, DB_APP_ROLE } from '../db/db.module.js';
import { NotificationsService } from '../notifications/notifications.service.js';

export type CalendarEventKind = 'meeting' | 'review_self' | 'review_manager' | 'survey_close' | 'action_due';

/** Evento del calendario personale: solo titoli e date di ciò che l'utente vede già nell'app (ADR-0010). */
export interface CalendarEvent {
  uid: string;
  kind: CalendarEventKind;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  url: string | null;
  location: string | null;
  description: string | null;
  status: 'CONFIRMED' | 'CANCELLED';
  sequence: number;
}

const DAY = 86400000;
const ORGANIZER_NAME = 'WorkingBetter';

@Injectable()
export class CalendarService {
  constructor(
    @Inject(DB) private readonly db: AnyDb,
    @Inject(DB_APP_ROLE) private readonly appRole: string | null,
    @Inject(CONFIG) private readonly cfg: AppConfig,
    private readonly audit: AuditService,
    private readonly notifier: NotificationsService,
  ) {}

  private appUrl(path: string) {
    return `${this.cfg.APP_BASE_URL.replace(/\/$/, '')}${path}`;
  }
  private feedUrl(token: string) {
    const base = (this.cfg.API_PUBLIC_URL ?? `http://localhost:${this.cfg.API_PORT}`).replace(/\/$/, '');
    return `${base}/api/v1/calendar/feed/${token}.ics`;
  }
  private organizer() {
    return { email: this.cfg.CALENDAR_ORGANIZER_EMAIL, name: ORGANIZER_NAME };
  }

  // ---------- feed personale (INT-022) ----------

  async feedStatus() {
    const p = principal();
    const [u] = await tx().select({ token: users.calendarFeedToken }).from(users).where(eq(users.id, p.userId));
    const upcoming = p.personId ? await this.upcomingFor(tx(), p.tenantId, p.personId) : [];
    return { enabled: !!u?.token, url: u?.token ? this.feedUrl(u.token) : null, upcoming };
  }

  async rotateFeed() {
    const p = principal();
    const token = randomBytes(24).toString('base64url');
    await tx().update(users).set({ calendarFeedToken: token, updatedAt: new Date() }).where(eq(users.id, p.userId));
    await this.audit.log({ action: 'calendar.feed_rotate', entityType: 'user', entityId: p.userId });
    return { enabled: true, url: this.feedUrl(token) };
  }

  async disableFeed() {
    const p = principal();
    await tx().update(users).set({ calendarFeedToken: null, updatedAt: new Date() }).where(eq(users.id, p.userId));
    await this.audit.log({ action: 'calendar.feed_disable', entityType: 'user', entityId: p.userId });
    return { enabled: false, url: null };
  }

  /** Feed pubblico per token: null se il token non esiste o l'utente è disattivato. Nessuna sessione: apre la transazione tenant da sé. */
  async feedIcs(token: string): Promise<string | null> {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
    const [u] = await withPlatform(this.db, (t) => t.select({ id: users.id, tenantId: users.tenantId, personId: users.personId, disabledAt: users.disabledAt }).from(users).where(eq(users.calendarFeedToken, token)));
    if (!u || u.disabledAt || !u.personId) return null;
    const personId = u.personId;
    const events = await withTenant(this.db, u.tenantId, (t) => this.upcomingFor(t, u.tenantId, personId), { appRole: this.appRole ?? undefined });
    return buildIcs({ name: 'WorkingBetter', description: '1:1, scadenze di review, survey e azioni', refreshInterval: 'PT1H', events: events.map((e) => this.toIcs(e)) });
  }

  /** Eventi dei prossimi 120 giorni (e 1:1 degli ultimi 30) per una persona, dentro una transazione tenant. */
  async upcomingFor(t: TenantTx, tenantId: string, personId: string): Promise<CalendarEvent[]> {
    const now = new Date();
    const from = new Date(now.getTime() - 30 * DAY);
    const to = new Date(now.getTime() + 120 * DAY);
    const out: CalendarEvent[] = [];

    // 1:1
    const rels = await t.select().from(oneOnOneRelations).where(and(eq(oneOnOneRelations.tenantId, tenantId), or(eq(oneOnOneRelations.personAId, personId), eq(oneOnOneRelations.personBId, personId)), isNull(oneOnOneRelations.archivedAt)));
    if (rels.length) {
      const others = rels.map((r) => (r.personAId === personId ? r.personBId : r.personAId));
      const ppl = await t.select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName }).from(persons).where(inArray(persons.id, others));
      const nameOf = new Map(ppl.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
      const ms = await t.select().from(meetings).where(and(inArray(meetings.relationId, rels.map((r) => r.id)), gte(meetings.scheduledAt, from), lte(meetings.scheduledAt, to), inArray(meetings.status, ['scheduled', 'done']))).orderBy(asc(meetings.scheduledAt));
      for (const m of ms) {
        const r = rels.find((x) => x.id === m.relationId)!;
        const other = nameOf.get(r.personAId === personId ? r.personBId : r.personAId) ?? '—';
        out.push({
          uid: `meeting-${m.id}@workingbetter`, kind: 'meeting', title: `1:1 con ${other}`, start: m.scheduledAt.toISOString(), end: new Date(m.scheduledAt.getTime() + m.durationMin * 60000).toISOString(), allDay: false,
          url: this.appUrl(`/one-on-ones/${r.id}?meeting=${m.id}`), location: r.meetingUrl ?? null, description: `Agenda, note e azioni: ${this.appUrl(`/one-on-ones/${r.id}?meeting=${m.id}`)}`, status: 'CONFIRMED', sequence: m.icalSequence,
        });
      }
    }

    // scadenze review (solo cicli attivi)
    const rv = await t.select({ r: reviews, c: reviewCycles }).from(reviews).innerJoin(reviewCycles, eq(reviews.cycleId, reviewCycles.id)).where(and(eq(reviews.tenantId, tenantId), eq(reviewCycles.status, 'active'), or(and(eq(reviews.subjectPersonId, personId), eq(reviews.status, 'pending_self')), and(eq(reviews.managerPersonId, personId), inArray(reviews.status, ['pending_self', 'pending_manager'])))));
    if (rv.length) {
      const subjectIds = [...new Set(rv.map((x) => x.r.subjectPersonId))];
      const ppl = await t.select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName }).from(persons).where(inArray(persons.id, subjectIds));
      const nameOf = new Map(ppl.map((p) => [p.id, `${p.firstName} ${p.lastName}`]));
      for (const { r, c } of rv) {
        if (r.subjectPersonId === personId && r.status === 'pending_self' && c.selfDueAt) {
          out.push({ uid: `review-${r.id}-self@workingbetter`, kind: 'review_self', title: `Self-review da consegnare · ${c.name}`, start: new Date(`${c.selfDueAt}T00:00:00Z`).toISOString(), end: null, allDay: true, url: this.appUrl(`/reviews/${r.id}`), location: null, description: null, status: 'CONFIRMED', sequence: 0 });
        }
        if (r.managerPersonId === personId && c.managerDueAt) {
          out.push({ uid: `review-${r.id}-manager@workingbetter`, kind: 'review_manager', title: `Manager review di ${nameOf.get(r.subjectPersonId) ?? '—'} · ${c.name}`, start: new Date(`${c.managerDueAt}T00:00:00Z`).toISOString(), end: null, allDay: true, url: this.appUrl(`/reviews/${r.id}`), location: null, description: null, status: 'CONFIRMED', sequence: 0 });
        }
      }
    }

    // survey aperte a cui sono invitato e non ho risposto
    const sv = await t.select({ s: surveys, i: surveyInvitations }).from(surveyInvitations).innerJoin(surveys, eq(surveyInvitations.surveyId, surveys.id)).where(and(eq(surveyInvitations.tenantId, tenantId), eq(surveyInvitations.personId, personId), isNull(surveyInvitations.respondedAt), eq(surveys.status, 'open'), isNotNull(surveys.closesAt)));
    for (const { s } of sv) {
      out.push({ uid: `survey-${s.id}@workingbetter`, kind: 'survey_close', title: `Survey «${s.title}» chiude`, start: s.closesAt!.toISOString(), end: null, allDay: true, url: this.appUrl(`/surveys/${s.id}`), location: null, description: null, status: 'CONFIRMED', sequence: 0 });
    }

    // azioni dei 1:1 in scadenza
    const acts = await t.select().from(actionItems).where(and(eq(actionItems.tenantId, tenantId), eq(actionItems.ownerPersonId, personId), eq(actionItems.status, 'open'), isNotNull(actionItems.dueDate))).orderBy(asc(actionItems.dueDate)).limit(50);
    for (const a of acts) {
      const due = new Date(`${a.dueDate}T00:00:00Z`);
      if (due < from || due > to) continue;
      out.push({ uid: `action-${a.id}@workingbetter`, kind: 'action_due', title: `Azione: ${a.title}`, start: due.toISOString(), end: null, allDay: true, url: this.appUrl(`/one-on-ones/${a.relationId}`), location: null, description: null, status: 'CONFIRMED', sequence: 0 });
    }

    return out.sort((a, b) => a.start.localeCompare(b.start));
  }

  private toIcs(e: CalendarEvent, extra: Partial<IcsEvent> = {}): IcsEvent {
    return { uid: e.uid, sequence: e.sequence, start: new Date(e.start), end: e.end ? new Date(e.end) : undefined, allDay: e.allDay, summary: e.title, description: e.description, location: e.location, url: e.url, status: e.status, categories: ['WorkingBetter'], alarmMinutes: e.kind === 'meeting' ? 10 : null, ...extra };
  }

  // ---------- 1:1: inviti .ics (INT-023) e .ics singolo ----------

  private async meetingContext(meetingId: string) {
    const [m] = await tx().select().from(meetings).where(eq(meetings.id, meetingId));
    if (!m) throw notFound('Incontro', meetingId);
    const [r] = await tx().select().from(oneOnOneRelations).where(eq(oneOnOneRelations.id, m.relationId));
    if (!r) throw notFound('Relazione 1:1', m.relationId);
    const ppl = await tx().select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName, email: persons.email }).from(persons).where(inArray(persons.id, [r.personAId, r.personBId]));
    const us = await tx().select({ personId: users.personId, email: users.email }).from(users).where(and(inArray(users.personId, [r.personAId, r.personBId]), isNull(users.disabledAt)));
    const participants = ppl.map((p) => ({ ...p, name: `${p.firstName} ${p.lastName}`, email: us.find((u) => u.personId === p.id)?.email ?? p.email ?? null }));
    return { m, r, participants };
  }

  private meetingEvent(m: typeof meetings.$inferSelect, r: typeof oneOnOneRelations.$inferSelect, participants: { id: string; name: string; email: string | null }[], method: IcsMethod) {
    const names = participants.map((p) => p.name).join(' e ');
    const url = this.appUrl(`/one-on-ones/${r.id}?meeting=${m.id}`);
    const ev: IcsEvent = {
      uid: `meeting-${m.id}@workingbetter`, sequence: m.icalSequence, start: m.scheduledAt, durationMin: m.durationMin, summary: `1:1 ${names}`,
      description: `Agenda, note e azioni su WorkingBetter: ${url}${r.meetingUrl ? `\nVideocall: ${r.meetingUrl}` : ''}`, location: r.meetingUrl ?? null, url,
      status: method === 'CANCEL' || m.status === 'cancelled' || m.status === 'skipped' ? 'CANCELLED' : 'CONFIRMED',
      organizer: this.organizer(), attendees: participants.filter((p) => p.email).map((p) => ({ email: p.email!, name: p.name })), alarmMinutes: 10, categories: ['WorkingBetter', '1:1'],
    };
    return ev;
  }

  /** .ics del singolo incontro (METHOD PUBLISH) per il pulsante "Aggiungi al calendario". Solo per i partecipanti. */
  async meetingIcs(meetingId: string): Promise<{ filename: string; content: string }> {
    const p = principal();
    const { m, r, participants } = await this.meetingContext(meetingId);
    if (r.personAId !== p.personId && r.personBId !== p.personId) throw forbidden('Solo i partecipanti possono scaricare l’invito');
    return { filename: `1-1-${m.scheduledAt.toISOString().slice(0, 10)}.ics`, content: buildIcs({ method: 'PUBLISH', events: [this.meetingEvent(m, r, participants, 'PUBLISH')] }) };
  }

  /**
   * Accoda a entrambi i partecipanti un'email con l'invito iCalendar (REQUEST) o l'annullamento (CANCEL).
   * Passa dalle preferenze di notifica del tipo `one_on_one.invite` (email attiva di default, mai in-app).
   */
  async sendMeetingInvites(meetingId: string, method: 'REQUEST' | 'CANCEL', action: 'Invito' | 'Riprogrammato' | 'Annullato') {
    const { m, r, participants } = await this.meetingContext(meetingId);
    const ics = buildIcs({ method, events: [this.meetingEvent(m, r, participants, method)] });
    const when = new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short', timeZone: await this.tenantTimezone() }).format(m.scheduledAt);
    let queued = 0;
    for (const p of participants) {
      const other = participants.find((x) => x.id !== p.id)?.name ?? '—';
      const res = await this.notifier.send({ personId: p.id, type: 'one_on_one.invite', data: { otherName: other, when, action }, link: this.appUrl(`/one-on-ones/${r.id}?meeting=${m.id}`), force: { inApp: false } });
      if (res.notificationId && res.emailQueued) {
        await tx().update(emailOutbox).set({ attachments: [{ filename: 'invito.ics', contentType: `text/calendar; charset=utf-8; method=${method}`, content: ics, method }] }).where(eq(emailOutbox.notificationId, res.notificationId));
        queued++;
      }
    }
    return { queued };
  }

  // ---------- proposta di slot (INT-024) ----------

  private async tenantTimezone(): Promise<string> {
    const [t] = await tx().select({ tz: tenants.timezone }).from(tenants).where(eq(tenants.id, principal().tenantId));
    return t?.tz ?? 'Europe/Rome';
  }

  async slotsFor(relationId: string, durationMin?: number) {
    const p = principal();
    const [r] = await tx().select().from(oneOnOneRelations).where(eq(oneOnOneRelations.id, relationId));
    if (!r || (r.personAId !== p.personId && r.personBId !== p.personId)) throw notFound('Relazione 1:1', relationId);
    const now = new Date();
    const horizon = new Date(now.getTime() + 21 * DAY);
    const relIds = (await tx().select({ id: oneOnOneRelations.id }).from(oneOnOneRelations).where(or(inArray(oneOnOneRelations.personAId, [r.personAId, r.personBId]), inArray(oneOnOneRelations.personBId, [r.personAId, r.personBId])))).map((x) => x.id);
    const busyRows = await tx().select({ start: meetings.scheduledAt, dur: meetings.durationMin }).from(meetings).where(and(inArray(meetings.relationId, relIds), eq(meetings.status, 'scheduled'), gte(meetings.scheduledAt, now), lte(meetings.scheduledAt, horizon)));
    const [last] = await tx().select({ at: meetings.scheduledAt }).from(meetings).where(and(eq(meetings.relationId, r.id), eq(meetings.status, 'done'))).orderBy(desc(meetings.scheduledAt)).limit(1);
    const timeZone = await this.tenantTimezone();
    const tzOffsetMin = tzOffsetMinutes(timeZone, now);
    const preferredHour = last ? Math.floor(((last.at.getTime() + tzOffsetMin * 60000) % DAY) / 3600000) : null;
    const slots = proposeSlots({ after: new Date(now.getTime() + 60 * 60000), durationMin: durationMin ?? r.durationMin, busy: busyRows.map((b) => ({ start: b.start, end: new Date(b.start.getTime() + b.dur * 60000) })), tzOffsetMin, count: 3, preferredHour });
    return { timeZone, durationMin: durationMin ?? r.durationMin, preferredHour, slots: slots.map((d) => d.toISOString()) };
  }
}
