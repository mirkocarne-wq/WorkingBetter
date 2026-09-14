import { and, eq, gt, gte, inArray, isNull, lt, lte, sql } from 'drizzle-orm';
import { createHash, randomBytes } from 'node:crypto';
import { dueDateFrom, journeyComplete, matchTemplate, resolveAssignee, type OnboardingPhase, type OnboardingTaskDef, type OnboardingTemplateRules } from '@wb/shared';
import { actionItems, appInstances, appStageRuns, cycles, developmentActions, emailOutbox, f360Campaigns, f360Requests, f360Subjects, onboardingJourneys, onboardingTasks, onboardingTemplates, orgUnits, feedbackRequestRecipients, feedbackRequests, keyResults, meetings, notify, objectives, oneOnOneRelations, persons, reviewCycles, reviews, surveyInvitations, surveys, talkingPoints, tenants, welfareBudgetSources, welfareMovements, welfarePlans, withPlatform, withTenant, type AnyDb } from '@wb/db';

export interface RemindersSummary {
  tenants: number;
  checkInsDue: number;
  meetingsSoon: number;
  actionsOverdue: number;
  feedbackRequestsPending: number;
  reviewStagesDue: number;
  surveyReminders: number;
  surveysClosed: number;
  welfareCredits: number;
  welfareExpiring: number;
  devActionsDue: number;
  f360Reminders: number;
  onboardingStarted: number;
  onboardingTasksDue: number;
  onboardingObjectiveTasksClosed: number;
  appStagesDue: number;
}

/**
 * Promemoria giornalieri (INT-001, OKR-033, ONE §7, FBK-009). Idempotente per giorno grazie a dedupeKey.
 * Gira come owner (senza SET ROLE) ma dentro withTenant, così ogni tenant è processato separatamente.
 */
export async function runReminders(db: AnyDb, now = new Date(), opts: { appBaseUrl?: string } = {}): Promise<RemindersSummary> {
  const appBaseUrl = (opts.appBaseUrl ?? process.env.APP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const today = now.toISOString().slice(0, 10);
  const summary: RemindersSummary = { tenants: 0, checkInsDue: 0, meetingsSoon: 0, actionsOverdue: 0, feedbackRequestsPending: 0, reviewStagesDue: 0, surveyReminders: 0, surveysClosed: 0, welfareCredits: 0, welfareExpiring: 0, devActionsDue: 0, f360Reminders: 0, onboardingStarted: 0, onboardingTasksDue: 0, onboardingObjectiveTasksClosed: 0, appStagesDue: 0 };
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
      // 5) review: fasi in scadenza entro 2 giorni o scadute (REV-061), una notifica al giorno per review
      const activeCycles = await tx.select().from(reviewCycles).where(eq(reviewCycles.status, 'active'));
      for (const c of activeCycles) {
        const soonDate = new Date(now.getTime() + 2 * 86400000).toISOString().slice(0, 10);
        const pend = await tx.select().from(reviews).where(and(eq(reviews.cycleId, c.id), inArray(reviews.status, ['pending_self', 'pending_manager', 'pending_share'])));
        const subjectIds = [...new Set(pend.map((r) => r.subjectPersonId))];
        const names = subjectIds.length ? await tx.select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName }).from(persons).where(inArray(persons.id, subjectIds)) : [];
        for (const r of pend) {
          const toSubject = r.status === 'pending_self';
          const due = toSubject ? c.selfDueAt : c.managerDueAt;
          if (!due || due > soonDate) continue;
          const to = toSubject ? r.subjectPersonId : r.managerPersonId;
          if (!to) continue;
          const subj = names.find((n) => n.id === r.subjectPersonId);
          const res = await notify(tx, { tenantId: t.id, personId: to, type: 'review.stage_due', data: { cycleName: c.name, stageLabel: toSubject ? 'Self-review' : r.status === 'pending_share' ? 'Condivisione' : 'Manager review', subjectName: toSubject ? null : subj ? `${subj.firstName} ${subj.lastName}` : null, dueDate: due }, link: `/reviews/${r.id}`, dedupeKey: `review_due:${r.id}:${r.status}:${today}` });
          if (res.created) summary.reviewStagesDue++;
        }
      }
      // 6) survey (ENG-011/013): chiusura automatica alla scadenza e promemoria ai non rispondenti a 3 giorni e a 1 giorno dalla chiusura
      const openSurveys = await tx.select().from(surveys).where(eq(surveys.status, 'open'));
      for (const s of openSurveys) {
        if (!s.closesAt) continue;
        if (s.closesAt <= now) {
          await tx.update(surveys).set({ status: 'closed', closedAt: now, updatedAt: now }).where(eq(surveys.id, s.id));
          const [c] = await tx.select({ invited: sql<number>`count(*)::int`, responded: sql<number>`count(${surveyInvitations.respondedAt})::int` }).from(surveyInvitations).where(eq(surveyInvitations.surveyId, s.id));
          // avvisa chi ha creato la survey (HR)
          if (s.createdBy) await notify(tx, { tenantId: t.id, userId: s.createdBy, type: 'survey.closed', data: { title: s.title, invited: c?.invited ?? 0, responded: c?.responded ?? 0 }, link: `/surveys/${s.id}/results`, dedupeKey: `survey_closed:${s.id}` });
          summary.surveysClosed++;
          continue;
        }
        const daysLeft = Math.ceil((s.closesAt.getTime() - now.getTime()) / 86400000);
        if (daysLeft !== 3 && daysLeft !== 1) continue;
        const pending = await tx.select({ personId: surveyInvitations.personId }).from(surveyInvitations).where(and(eq(surveyInvitations.surveyId, s.id), isNull(surveyInvitations.respondedAt)));
        for (const inv of pending) {
          const res = await notify(tx, { tenantId: t.id, personId: inv.personId, type: 'survey.reminder', data: { title: s.title, anonymous: s.anonymous ? 1 : null, daysLeft }, link: `/surveys/${s.id}`, dedupeKey: `survey_remind:${s.id}:${inv.personId}:${today}` });
          if (res.created) summary.surveyReminders++;
        }
      }
      // 8) sviluppo (DEV-023): azioni del piano scadute o in scadenza entro 3 giorni, una notifica al giorno per azione
      {
        const soon = new Date(now.getTime() + 3 * 86400000).toISOString().slice(0, 10);
        const acts = await tx.select().from(developmentActions).where(and(eq(developmentActions.tenantId, t.id), eq(developmentActions.status, 'open'), lte(developmentActions.dueDate, soon)));
        for (const a of acts) {
          const overdue = a.dueDate! < today;
          const res = await notify(tx, { tenantId: t.id, personId: a.personId, type: 'dev.action_due', data: { title: a.title, dueDate: a.dueDate, overdue: overdue ? '1' : null, competency: a.competencyKey }, link: '/development', dedupeKey: `dev-action:${a.id}:${overdue ? 'overdue' : 'due'}:${today}` });
          if (res.created) summary.devActionsDue++;
        }
      }
      // 9) feedback 360° (F360 §7): promemoria ai valutatori con richiesta aperta a 3 giorni e a 1 giorno dalla scadenza della raccolta
      {
        const open = await tx.select().from(f360Campaigns).where(eq(f360Campaigns.status, 'collection'));
        for (const c of open) {
          if (!c.collectionDueAt) continue;
          const daysLeft = Math.round((new Date(`${c.collectionDueAt}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) / 86400000);
          if (daysLeft !== 3 && daysLeft !== 1) continue;
          const reqs = await tx.select({ r: f360Requests, subjectPersonId: f360Subjects.personId }).from(f360Requests).innerJoin(f360Subjects, eq(f360Subjects.id, f360Requests.subjectId)).where(and(eq(f360Requests.campaignId, c.id), eq(f360Requests.status, 'pending')));
          const subjectIds = [...new Set(reqs.map((x) => x.subjectPersonId))];
          const names = subjectIds.length ? await tx.select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName }).from(persons).where(inArray(persons.id, subjectIds)) : [];
          const nameOf = (id: string) => { const p = names.find((x) => x.id === id); return p ? `${p.firstName} ${p.lastName}` : 'un collega'; };
          for (const { r, subjectPersonId } of reqs) {
            if (r.raterPersonId) {
              const res = await notify(tx, { tenantId: t.id, personId: r.raterPersonId, type: 'f360.reminder', data: { title: c.name, otherName: r.category === 'self' ? 'di te' : nameOf(subjectPersonId), daysLeft }, link: `/f360/requests/${r.id}`, dedupeKey: `f360_remind:${r.id}:${today}` });
              if (res.created) summary.f360Reminders++;
            } else if (r.externalEmail && (!r.remindedAt || r.remindedAt.toISOString().slice(0, 10) !== today)) {
              // esterni: nuova email con nuovo link (il precedente smette di funzionare)
              const token = randomBytes(24).toString('base64url');
              await tx.update(f360Requests).set({ tokenHash: createHash('sha256').update(token).digest('hex'), remindedAt: now, updatedAt: now }).where(eq(f360Requests.id, r.id));
              await tx.insert(emailOutbox).values({ tenantId: t.id, toEmail: r.externalEmail, toName: r.externalName, subject: `Promemoria: feedback su ${nameOf(subjectPersonId)} · ${c.name}`, text: `Gentile ${r.externalName ?? ''},\n\nmancano ${daysLeft} giorni alla chiusura della raccolta «${c.name}». Le tue risposte sono anonime.\n\nCompila qui: ${appBaseUrl}/f360/external/${token}\n\nGrazie,\nWorkingBetter` });
              summary.f360Reminders++;
            }
          }
        }
      }
      // 10) onboarding (ONB-010/015 e §7): avvio automatico per ingressi recenti e uscite, task in scadenza/scaduti, task "obiettivi" chiusi quando esiste un obiettivo attivo
      {
        const templates = (await tx.select().from(onboardingTemplates).where(eq(onboardingTemplates.active, true))).map((x) => ({ ...x, phases: x.phases as OnboardingPhase[], tasks: x.tasks as OnboardingTaskDef[], rules: x.rules as OnboardingTemplateRules }));
        if (templates.length) {
          const existing = await tx.select({ personId: onboardingJourneys.personId, kind: onboardingJourneys.kind }).from(onboardingJourneys);
          const units = await tx.select({ id: orgUnits.id, path: orgUnits.path }).from(orgUnits);
          const since = dueDateFrom(today, -30);
          const hires = await tx.select().from(persons).where(and(inArray(persons.status, ['active', 'invited']), gte(persons.hireDate, since)));
          const leaving = await tx.select().from(persons).where(and(eq(persons.status, 'leaving'), sql`${persons.terminationDate} IS NOT NULL`));
          for (const [list, kind] of [[hires, 'onboarding'], [leaving, 'offboarding']] as const) {
            for (const person of list) {
              if (existing.some((e) => e.personId === person.id && e.kind === kind)) continue;
              const tpl = matchTemplate(templates, { orgUnitId: person.orgUnitId, orgUnitPath: units.find((u) => u.id === person.orgUnitId)?.path ?? null, location: person.location, jobTitle: person.jobTitle }, kind);
              if (!tpl) continue;
              const anchorDate = (kind === 'offboarding' ? person.terminationDate : person.hireDate) ?? today;
              const [j] = await tx.insert(onboardingJourneys).values({ tenantId: t.id, templateId: tpl.id, personId: person.id, kind, managerPersonId: person.managerId, anchorDate, templateName: tpl.name, phases: tpl.phases }).returning();
              const ctx = { personId: person.id, managerId: person.managerId, buddyId: null, hrId: null, itId: null };
              const rows = tpl.tasks.map((x) => ({ tenantId: t.id, journeyId: j!.id, personId: person.id, key: x.key, phase: x.phase, title: x.title, description: x.description ?? null, role: x.role, kind: x.kind, assigneePersonId: resolveAssignee(x, ctx), dueDate: dueDateFrom(anchorDate, x.dueDay), link: x.link ?? null, formKey: x.formKey ?? null, surveyKey: x.surveyKey ?? null, required: x.required }));
              if (rows.length) await tx.insert(onboardingTasks).values(rows);
              const name = `${person.firstName} ${person.lastName}`;
              const byAssignee = new Map<string, { role: string; n: number }>();
              for (const r of rows) if (r.assigneePersonId && r.assigneePersonId !== person.id) byAssignee.set(r.assigneePersonId, { role: byAssignee.get(r.assigneePersonId)?.role ?? r.role, n: (byAssignee.get(r.assigneePersonId)?.n ?? 0) + 1 });
              for (const [pid, info] of byAssignee) await notify(tx, { tenantId: t.id, personId: pid, type: 'onboarding.started', data: { otherName: name, title: tpl.name, anchorDate, role: info.role === 'hr' ? 'HR' : info.role, tasks: info.n }, link: `/onboarding/journeys/${j!.id}`, dedupeKey: `onb_start:${j!.id}:${pid}` });
              await notify(tx, { tenantId: t.id, personId: person.id, type: 'onboarding.started', data: { otherName: 'te', title: tpl.name, anchorDate, role: 'persona', tasks: rows.filter((r) => r.assigneePersonId === person.id).length }, link: '/onboarding', dedupeKey: `onb_start:${j!.id}:${person.id}` });
              summary.onboardingStarted++;
            }
          }
        }
        const activeJourneys = await tx.select().from(onboardingJourneys).where(eq(onboardingJourneys.status, 'active'));
        if (activeJourneys.length) {
          const jIds = activeJourneys.map((j) => j.id);
          const soon = dueDateFrom(today, 2);
          const open = await tx.select().from(onboardingTasks).where(and(inArray(onboardingTasks.journeyId, jIds), eq(onboardingTasks.status, 'open')));
          // task "obiettivi": chiusi se la persona ha un obiettivo attivo
          for (const task of open.filter((x) => x.kind === 'objective')) {
            const [o] = await tx.select({ id: objectives.id }).from(objectives).where(and(eq(objectives.ownerPersonId, task.personId), eq(objectives.status, 'active'))).limit(1);
            if (!o) continue;
            await tx.update(onboardingTasks).set({ status: 'done', completedAt: now, note: 'Chiuso automaticamente: obiettivo attivo presente', updatedAt: now }).where(eq(onboardingTasks.id, task.id));
            task.status = 'done';
            summary.onboardingObjectiveTasksClosed++;
          }
          const subjectIds = [...new Set(activeJourneys.map((j) => j.personId))];
          const names = await tx.select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName }).from(persons).where(inArray(persons.id, subjectIds));
          const nameOf = (id: string) => { const p = names.find((x) => x.id === id); return p ? `${p.firstName} ${p.lastName}` : 'una persona'; };
          for (const task of open) {
            if (task.status !== 'open' || !task.assigneePersonId || !task.dueDate || task.dueDate > soon) continue;
            const overdue = task.dueDate < today;
            const isSelf = task.assigneePersonId === task.personId;
            const res = await notify(tx, { tenantId: t.id, personId: task.assigneePersonId, type: 'onboarding.task_due', data: { title: task.title, otherName: isSelf ? null : nameOf(task.personId), dueDate: task.dueDate, overdue: overdue ? '1' : null }, link: isSelf ? '/onboarding' : `/onboarding/journeys/${task.journeyId}`, dedupeKey: `onb_due:${task.id}:${overdue ? 'overdue' : 'due'}:${today}` });
            if (res.created) summary.onboardingTasksDue++;
          }
          // completamento automatico quando non restano task obbligatori aperti
          for (const j of activeJourneys) {
            const ts = await tx.select({ status: onboardingTasks.status, required: onboardingTasks.required }).from(onboardingTasks).where(eq(onboardingTasks.journeyId, j.id));
            if (journeyComplete(ts)) await tx.update(onboardingJourneys).set({ status: 'completed', completedAt: now, updatedAt: now }).where(eq(onboardingJourneys.id, j.id));
          }
        }
      }
      // 11) app studio (APP §7): fasi attive in scadenza entro 2 giorni o scadute, una notifica al giorno per fase
      {
        const soon = dueDateFrom(today, 2);
        const runs = await tx.select({ r: appStageRuns, i: appInstances }).from(appStageRuns).innerJoin(appInstances, eq(appInstances.id, appStageRuns.instanceId)).where(and(eq(appStageRuns.status, 'active'), eq(appInstances.status, 'running'), lte(appStageRuns.dueDate, soon)));
        if (runs.length) {
          const subjectIds = [...new Set(runs.map((x) => x.i.subjectPersonId))];
          const names = await tx.select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName }).from(persons).where(inArray(persons.id, subjectIds));
          const nameOf = (id: string) => { const p = names.find((x) => x.id === id); return p ? `${p.firstName} ${p.lastName}` : 'una persona'; };
          for (const { r, i } of runs) {
            if (!r.actorPersonId || !r.dueDate) continue;
            const def = i.definition as { name: string; naming: { instanceLabel: string }; stages: { key: string; name: string }[] };
            const overdue = r.dueDate < today;
            const res = await notify(tx, { tenantId: t.id, personId: r.actorPersonId, type: 'app.stage_due', data: { appName: def.name, title: def.stages.find((s) => s.key === r.stageKey)?.name ?? r.stageKey, instanceLabel: def.naming.instanceLabel, otherName: r.actorPersonId === i.subjectPersonId ? null : nameOf(i.subjectPersonId), dueDate: r.dueDate, overdue: overdue ? '1' : null }, link: `/apps/instances/${i.id}`, dedupeKey: `app_due:${r.id}:${overdue ? 'overdue' : 'due'}:${today}` });
            if (res.created) summary.appStagesDue++;
          }
        }
      }
      // 7) welfare (WEL-002/052): accredito delle fonti con data raggiunta e avvisi di credito in scadenza a 60/30/7 giorni
      const activePlans = await tx.select().from(welfarePlans).where(eq(welfarePlans.status, 'active'));
      for (const pl of activePlans) {
        const due = await tx.select().from(welfareBudgetSources).where(and(eq(welfareBudgetSources.planId, pl.id), isNull(welfareBudgetSources.creditedAt), lte(welfareBudgetSources.creditAt, today)));
        for (const src of due) {
          if (src.kind === 'premium_conversion') continue;
          const pop = (pl.population ?? {}) as { orgUnitIds?: string[]; personIds?: string[]; excludePersonIds?: string[] };
          let people = await tx.select({ id: persons.id, orgUnitId: persons.orgUnitId, hireDate: persons.hireDate }).from(persons).where(inArray(persons.status, ['active', 'invited', 'leaving']));
          if (pop.personIds?.length && !pop.orgUnitIds?.length) people = people.filter((x) => pop.personIds!.includes(x.id));
          if (pop.orgUnitIds?.length) people = people.filter((x) => (x.orgUnitId && pop.orgUnitIds!.includes(x.orgUnitId)) || pop.personIds?.includes(x.id));
          if (pop.excludePersonIds?.length) people = people.filter((x) => !pop.excludePersonIds!.includes(x.id));
          for (const person of people) {
            let credit = Number(src.amountPerPerson);
            if (person.hireDate && person.hireDate > pl.periodStart) {
              const start = new Date(pl.periodStart).getTime(); const end = new Date(pl.periodEnd).getTime(); const hire = new Date(person.hireDate).getTime();
              credit = Math.round(credit * Math.max(0, (end - hire) / (end - start)) * 100) / 100;
            }
            if (credit <= 0) continue;
            await tx.insert(welfareMovements).values({ tenantId: t.id, planId: pl.id, personId: person.id, kind: 'credit', amount: credit.toFixed(2), year: pl.year, sourceId: src.id, expiresAt: src.expiresAt ?? pl.periodEnd, note: src.name });
            await notify(tx, { tenantId: t.id, personId: person.id, type: 'welfare.credited', data: { amount: credit.toLocaleString('it-IT', { minimumFractionDigits: 2 }), planName: pl.name, sourceName: src.name, expiresAt: src.expiresAt ?? pl.periodEnd }, link: '/welfare', dedupeKey: `welfare_credit:${src.id}:${person.id}` });
            summary.welfareCredits++;
          }
          await tx.update(welfareBudgetSources).set({ creditedAt: now, updatedAt: now }).where(eq(welfareBudgetSources.id, src.id));
        }
        // credito in scadenza: saldo per persona con crediti che scadono tra 60/30/7 giorni
        for (const days of [60, 30, 7]) {
          const target = new Date(now.getTime() + days * 86400000).toISOString().slice(0, 10);
          const expiring = await tx.select({ personId: welfareMovements.personId, amount: sql<number>`sum(${welfareMovements.amount})::float` }).from(welfareMovements).where(and(eq(welfareMovements.planId, pl.id), eq(welfareMovements.kind, 'credit'), eq(welfareMovements.expiresAt, target))).groupBy(welfareMovements.personId);
          for (const e of expiring) {
            const bal = await tx.select({ balance: sql<number>`sum(case when ${welfareMovements.kind} in ('credit','adjust','refund','release') then ${welfareMovements.amount} when ${welfareMovements.kind} in ('spend','expire','reserve') then -${welfareMovements.amount} else 0 end)::float` }).from(welfareMovements).where(and(eq(welfareMovements.planId, pl.id), eq(welfareMovements.personId, e.personId)));
            const available = Math.min(e.amount, bal[0]?.balance ?? 0);
            if (available <= 0.5) continue;
            const res = await notify(tx, { tenantId: t.id, personId: e.personId, type: 'welfare.budget_expiring', data: { amount: available.toLocaleString('it-IT', { minimumFractionDigits: 2 }), expiresAt: target, daysLeft: days }, link: '/welfare', dedupeKey: `welfare_expiring:${pl.id}:${e.personId}:${days}` });
            if (res.created) summary.welfareExpiring++;
          }
        }
      }
    });
  }
  return summary;
}
