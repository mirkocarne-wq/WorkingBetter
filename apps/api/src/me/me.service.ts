import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import { actionItems, appInstances, appStageRuns, cycles, f360Campaigns, f360Requests, f360Subjects, keyResults, meetings, objectives, oneOnOneRelations, persons, surveyInvitations, surveys, talkingPoints } from '@wb/db';
import type { AppDefinition } from '@wb/shared';
import { principal, tx } from '../common/context.js';

export type TodoKind = 'action' | 'check_in' | 'review' | 'approval' | 'onboarding' | 'process' | 'survey' | 'f360';

export interface TodoItem {
  kind: TodoKind;
  /** etichetta breve del modulo/origine («Azione dal 1:1», «Check-in settimanale»…) */
  kicker: string;
  title: string;
  /** dettaglio secondario (da dove nasce, scadenza in parole) */
  detail: string | null;
  href: string;
  dueDate: string | null;
  overdue: boolean;
  /** giorni di ritardo (positivo) o mancanti (negativo); null senza scadenza */
  daysDelta: number | null;
  /** etichetta dell'azione («Segna fatto», «Fai il check-in»…) */
  action: string;
}

export interface NextOneOnOne {
  meetingId: string;
  relationId: string;
  scheduledAt: string;
  durationMin: number | null;
  meetingUrl: string | null;
  cadenceDays: number | null;
  other: { id: string; firstName: string; lastName: string; jobTitle: string | null };
  agenda: string[];
  agendaCount: number;
}

const today = () => new Date().toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000);

/** Home «Da fare» (CORE-063): tutto ciò che la persona ha in sospeso nei vari moduli, in una sola chiamata. */
@Injectable()
export class MeService {
  async todo(): Promise<{ items: TodoItem[]; nextOneOnOne: NextOneOnOne | null; generatedAt: string }> {
    const me = principal().personId;
    if (!me) return { items: [], nextOneOnOne: null, generatedAt: new Date().toISOString() };
    const day = today();
    const [runs, actions, stale, openSurveys, ratings, next] = await Promise.all([
      this.stageRuns(me, day), this.actionItems(me, day), this.staleKeyResults(me, day), this.surveys(me, day), this.f360(me, day), this.nextOneOnOne(me),
    ]);
    const items = [...runs, ...actions, ...stale, ...openSurveys, ...ratings];
    // ordine: scadute (più in ritardo prima), poi per scadenza crescente, poi senza scadenza
    items.sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      if (a.dueDate && b.dueDate) return a.overdue ? (b.daysDelta ?? 0) - (a.daysDelta ?? 0) : a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate || b.dueDate) return a.dueDate ? -1 : 1;
      return 0;
    });
    return { items, nextOneOnOne: next, generatedAt: new Date().toISOString() };
  }

  private due(dueDate: string | null, day: string): Pick<TodoItem, 'dueDate' | 'overdue' | 'daysDelta'> {
    if (!dueDate) return { dueDate: null, overdue: false, daysDelta: null };
    const delta = daysBetween(dueDate, day);
    return { dueDate, overdue: delta > 0, daysDelta: delta };
  }

  /** Passi di processo assegnati a me sul motore: review, approvazioni, onboarding, app dell'App Studio. */
  private async stageRuns(me: string, day: string): Promise<TodoItem[]> {
    const rows = await tx()
      .select({ run: appStageRuns, inst: appInstances, subjectFirst: persons.firstName, subjectLast: persons.lastName })
      .from(appStageRuns)
      .innerJoin(appInstances, eq(appInstances.id, appStageRuns.instanceId))
      .leftJoin(persons, eq(persons.id, appInstances.subjectPersonId))
      .where(and(eq(appStageRuns.actorPersonId, me), eq(appStageRuns.status, 'active'), eq(appInstances.status, 'running')))
      .orderBy(asc(appStageRuns.dueDate));
    return rows.map(({ run, inst, subjectFirst, subjectLast }) => {
      const def = inst.definition as AppDefinition;
      const stage = def.stages.find((s) => s.key === run.stageKey);
      const stageName = stage?.name ?? run.stageKey;
      const subject = subjectFirst ? `${subjectFirst} ${subjectLast ?? ''}`.trim() : null;
      const isMe = inst.subjectPersonId === me;
      const href = inst.moduleLink ?? `/apps/instances/${inst.id}`;
      const d = this.due(run.dueDate, day);
      if (inst.appKey.startsWith('review_')) {
        const approval = /^approve_\d+$/.test(run.stageKey);
        const title = run.stageKey === 'self' ? 'Compila la tua self-review'
          : run.stageKey === 'manager' ? `Manager review di ${subject ?? 'un collaboratore'}`
          : approval ? `Approva la review di ${subject ?? 'un collaboratore'}`
          : run.stageKey === 'share' ? `Condividi la review con ${subjectFirst ?? 'la persona'}`
          : run.stageKey === 'sign' ? 'Leggi e firma la tua review'
          : `${stageName}${subject && !isMe ? ` · ${subject}` : ''}`;
        return { kind: approval ? 'approval' : 'review', kicker: def.name ?? inst.title ?? 'Review', title, detail: null, href, action: approval ? 'Decidi' : 'Apri', ...d };
      }
      if (inst.appKey.startsWith('onboarding_')) {
        return { kind: 'onboarding', kicker: isMe ? 'Il tuo onboarding' : `Onboarding di ${subject ?? 'un nuovo collega'}`, title: stageName, detail: inst.title, href, action: 'Apri', ...d };
      }
      const approval = run.type === 'approval';
      return { kind: 'process', kicker: def.name ?? 'Processo', title: `${stageName}${subject && !isMe ? ` · ${subject}` : ''}`, detail: inst.title, href, action: approval ? 'Decidi' : 'Compila', ...d };
    });
  }

  /** Azioni dei 1:1 (e degli altri moduli) di cui sono owner e ancora aperte. */
  private async actionItems(me: string, day: string): Promise<TodoItem[]> {
    const rows = await tx().select().from(actionItems)
      .where(and(eq(actionItems.ownerPersonId, me), eq(actionItems.status, 'open')))
      .orderBy(asc(actionItems.dueDate));
    return rows.map((a) => ({
      kind: 'action' as const, kicker: a.source === 'one_on_one' ? 'Azione dal 1:1' : 'Azione', title: a.title, detail: null,
      href: a.relationId ? `/one-on-ones/${a.relationId}` : '/one-on-ones', action: 'Segna fatto', ...this.due(a.dueDate, day),
    }));
  }

  /** Obiettivi miei attivi con KR il cui ultimo check-in supera la cadenza del ciclo. */
  private async staleKeyResults(me: string, day: string): Promise<TodoItem[]> {
    const rows = await tx()
      .select({ id: objectives.id, title: objectives.title, createdAt: objectives.createdAt, cadence: cycles.checkInCadenceDays, cycleStatus: cycles.status, krLast: keyResults.lastCheckInAt })
      .from(objectives)
      .innerJoin(cycles, eq(cycles.id, objectives.cycleId))
      .innerJoin(keyResults, eq(keyResults.objectiveId, objectives.id))
      .where(and(eq(objectives.ownerPersonId, me), eq(objectives.status, 'active'), eq(cycles.status, 'open')));
    const byObj = new Map<string, { title: string; createdAt: Date; cadence: number; last: string | null }>();
    for (const r of rows) {
      const cur = byObj.get(r.id) ?? { title: r.title, createdAt: r.createdAt, cadence: r.cadence ?? 7, last: null };
      if (r.krLast && (!cur.last || r.krLast > cur.last)) cur.last = r.krLast;
      byObj.set(r.id, cur);
    }
    const out: TodoItem[] = [];
    for (const o of byObj.values()) {
      const lastDay = o.last ?? o.createdAt.toISOString().slice(0, 10);
      const age = daysBetween(lastDay, day);
      if (age <= o.cadence) continue;
      out.push({
        kind: 'check_in', kicker: `Check-in ogni ${o.cadence} giorni`, title: o.title,
        detail: o.last ? `ultimo check-in ${age} giorni fa` : 'nessun check-in finora',
        href: `/objectives?view=mine`, action: 'Fai il check-in', dueDate: null, overdue: true, daysDelta: age - o.cadence,
      });
    }
    return out;
  }

  /** Survey aperte a cui sono invitato e non ho ancora risposto. */
  private async surveys(me: string, day: string): Promise<TodoItem[]> {
    const rows = await tx().select({ s: surveys })
      .from(surveyInvitations)
      .innerJoin(surveys, eq(surveys.id, surveyInvitations.surveyId))
      .where(and(eq(surveyInvitations.personId, me), isNull(surveyInvitations.respondedAt), eq(surveys.status, 'open')));
    return rows.map(({ s }) => {
      const closes = s.closesAt ? s.closesAt.toISOString().slice(0, 10) : null;
      const d = this.due(closes, day);
      return { kind: 'survey' as const, kicker: s.anonymous ? 'Survey anonima' : 'Survey', title: s.title, detail: s.description ?? null, href: `/surveys/${s.id}`, action: 'Rispondi', ...d, overdue: false };
    });
  }

  /** Richieste di feedback 360° in cui sono valutatore e non ho ancora risposto. */
  private async f360(me: string, day: string): Promise<TodoItem[]> {
    const rows = await tx()
      .select({ req: f360Requests, campaign: f360Campaigns.name, dueAt: f360Campaigns.collectionDueAt, first: persons.firstName, last: persons.lastName })
      .from(f360Requests)
      .innerJoin(f360Campaigns, eq(f360Campaigns.id, f360Requests.campaignId))
      .innerJoin(f360Subjects, eq(f360Subjects.id, f360Requests.subjectId))
      .innerJoin(persons, eq(persons.id, f360Subjects.personId))
      .where(and(eq(f360Requests.raterPersonId, me), eq(f360Requests.status, 'pending')));
    return rows.map((r) => ({
      kind: 'f360' as const, kicker: r.campaign, title: r.req.category === 'self' ? 'La tua autovalutazione 360°' : `Feedback 360° per ${r.first} ${r.last}`,
      detail: r.req.draft ? 'bozza salvata' : null, href: `/f360/requests/${r.req.id}`, action: 'Compila', ...this.due(r.dueAt, day),
    }));
  }

  /** Il prossimo 1:1 in calendario, con i punti in agenda. */
  private async nextOneOnOne(me: string): Promise<NextOneOnOne | null> {
    const [m] = await tx()
      .select({ meeting: meetings, rel: oneOnOneRelations })
      .from(meetings)
      .innerJoin(oneOnOneRelations, eq(oneOnOneRelations.id, meetings.relationId))
      .where(and(eq(meetings.status, 'scheduled'), isNull(oneOnOneRelations.archivedAt), or(eq(oneOnOneRelations.personAId, me), eq(oneOnOneRelations.personBId, me)), sql`${meetings.scheduledAt} >= now() - interval '1 hour'`))
      .orderBy(asc(meetings.scheduledAt)).limit(1);
    if (!m) return null;
    const otherId = m.rel.personAId === me ? m.rel.personBId : m.rel.personAId;
    const [other] = await tx().select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName, jobTitle: persons.jobTitle }).from(persons).where(eq(persons.id, otherId));
    if (!other) return null;
    const points = await tx().select({ text: talkingPoints.text }).from(talkingPoints).where(and(eq(talkingPoints.meetingId, m.meeting.id), eq(talkingPoints.discussed, false))).orderBy(asc(talkingPoints.position)).limit(6);
    return {
      meetingId: m.meeting.id, relationId: m.rel.id, scheduledAt: m.meeting.scheduledAt.toISOString(), durationMin: m.meeting.durationMin ?? m.rel.durationMin ?? null,
      meetingUrl: m.rel.meetingUrl ?? null, cadenceDays: m.rel.cadenceDays ?? null, other, agenda: points.slice(0, 3).map((p) => p.text), agendaCount: points.length,
    };
  }
}
