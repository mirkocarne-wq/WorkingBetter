import { Injectable, OnModuleInit } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNull, like, lte, or, sql, type SQL } from 'drizzle-orm';
import {
  appStageRuns,
  feedback,
  formResponses,
  keyResults,
  meetings,
  objectives,
  oneOnOneRelations,
  orgUnits,
  persons,
  recognitionRecipients,
  recognitions,
  reviewCycles,
  reviewTemplates,
  reviews,
} from '@wb/db';
import { ErrorCodes, Permissions, hasPermission, reviewTemplateToApp, scoreToScale, type FormSchema, type Principal } from '@wb/shared';
import type { z } from 'zod';
import { principal, tx } from '../common/context.js';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import { FormsService, type SubmittedResponse } from '../forms/forms.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PeopleService } from '../core/people.service.js';
import { AppsService, type StageDoneEvent } from '../apps/apps.service.js';
import { createPdf } from '../common/pdf.js';
import type { PopulationDto, createCycleDto, createTemplateDto, overrideRatingDto, signDto, updateCycleDto, updateTemplateDto } from './dto.js';

type TemplateRow = typeof reviewTemplates.$inferSelect;
type CycleRow = typeof reviewCycles.$inferSelect;
type ReviewRow = typeof reviews.$inferSelect;
export interface RatingScale { min: number; max: number; labels: Record<string, string> }

const STAGE_LABEL = { self: 'Self-review', manager: 'Manager review' } as const;
const personName = (p?: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}` : '—');

@Injectable()
export class ReviewsService implements OnModuleInit {
  constructor(
    private readonly audit: AuditService,
    private readonly forms: FormsService,
    private readonly notifier: NotificationsService,
    private readonly people: PeopleService,
    private readonly apps: AppsService,
  ) {}

  onModuleInit() {
    // review create prima della convergenza sul motore (compilazioni con contesto `review_stage`)
    this.forms.onSubmitted('review_stage', (r) => this.onStageSubmitted(r));
    // review eseguite dal motore dei processi (ADR-0011): una fase conclusa aggiorna la review
    this.apps.onStageDone((e) => this.onEngineStageDone(e));
  }

  // ---------- template ----------

  listTemplates() {
    return tx().select().from(reviewTemplates).where(isNull(reviewTemplates.archivedAt)).orderBy(desc(reviewTemplates.updatedAt));
  }
  async getTemplate(id: string): Promise<TemplateRow> {
    const [t] = await tx().select().from(reviewTemplates).where(eq(reviewTemplates.id, id));
    if (!t) throw notFound('Template di review', id);
    return t;
  }
  async createTemplate(dto: z.infer<typeof createTemplateDto>) {
    const p = principal();
    await this.assertFormPublished(dto.managerFormKey);
    if (dto.selfFormKey) await this.assertFormPublished(dto.selfFormKey);
    const [row] = await tx().insert(reviewTemplates).values({ tenantId: p.tenantId, createdBy: p.userId, ...dto, selfFormKey: dto.selfFormKey ?? null, overallRatingField: dto.overallRatingField ?? null }).returning();
    await this.audit.log({ action: 'review_template.create', entityType: 'review_template', entityId: row!.id, after: dto });
    return row!;
  }
  async updateTemplate(id: string, dto: z.infer<typeof updateTemplateDto>) {
    const before = await this.getTemplate(id);
    if (dto.managerFormKey) await this.assertFormPublished(dto.managerFormKey);
    if (dto.selfFormKey) await this.assertFormPublished(dto.selfFormKey);
    const { archived, ...rest } = dto;
    const [row] = await tx().update(reviewTemplates).set({ ...rest, archivedAt: archived === undefined ? undefined : archived ? new Date() : null, updatedAt: new Date() }).where(eq(reviewTemplates.id, id)).returning();
    await this.audit.log({ action: 'review_template.update', entityType: 'review_template', entityId: id, before, after: dto });
    return row!;
  }

  // ---------- cicli ----------

  async listCycles() {
    const rows = await tx().select().from(reviewCycles).orderBy(desc(reviewCycles.createdAt));
    return Promise.all(rows.map(async (c) => ({ ...c, progress: c.status === 'draft' ? null : await this.progressCounts(c.id) })));
  }
  async getCycle(id: string) {
    const c = await this.cycleRow(id);
    const template = await this.getTemplate(c.templateId);
    return { ...c, template, progress: c.status === 'draft' ? null : await this.progress(c.id) };
  }
  async createCycle(dto: z.infer<typeof createCycleDto>) {
    const p = principal();
    await this.getTemplate(dto.templateId);
    const [row] = await tx().insert(reviewCycles).values({ tenantId: p.tenantId, createdBy: p.userId, ...dto, okrCycleId: dto.okrCycleId ?? null }).returning();
    await this.audit.log({ action: 'review_cycle.create', entityType: 'review_cycle', entityId: row!.id, after: dto });
    return this.getCycle(row!.id);
  }
  async updateCycle(id: string, dto: z.infer<typeof updateCycleDto>) {
    const before = await this.cycleRow(id);
    if (before.status === 'closed') throw conflict(ErrorCodes.CONFLICT, 'Ciclo chiuso');
    if (before.status === 'active' && dto.population) throw conflict(ErrorCodes.CONFLICT, 'La popolazione di un ciclo attivo si modifica aggiungendo o rimuovendo singole review');
    const [row] = await tx().update(reviewCycles).set({ ...dto, updatedAt: new Date() }).where(eq(reviewCycles.id, id)).returning();
    await this.audit.log({ action: 'review_cycle.update', entityType: 'review_cycle', entityId: id, before, after: dto });
    return row!;
  }

  /** Anteprima della popolazione (REV-021): persone attive nel perimetro, con manager; segnala chi verrebbe escluso. */
  async previewPopulation(cycleId: string) {
    const c = await this.cycleRow(cycleId);
    return this.resolvePopulation(c.population as PopulationDto);
  }

  /**
   * Lancio (REV-020/022): il ciclo diventa un'app del motore dei processi (ADR-0011, `reviewTemplateToApp`) e per ogni
   * persona viene avviata un'istanza silenziosa; la review nativa resta la vista di dominio (rating, contesto, firma)
   * e si collega all'istanza con `appInstanceId`. Le notifiche restano quelle del modulo review.
   */
  async launch(cycleId: string, launchDate?: string) {
    const p = principal();
    const c = await this.cycleRow(cycleId);
    if (c.status !== 'draft') throw conflict(ErrorCodes.CONFLICT, `Ciclo già ${c.status}`);
    const t = await this.getTemplate(c.templateId);
    const pop = await this.resolvePopulation(c.population as PopulationDto);
    if (!pop.included.length) throw unprocessable(ErrorCodes.VALIDATION, 'Nessuna persona nella popolazione');
    const start = launchDate ? new Date(`${launchDate}T00:00:00Z`) : new Date();
    const addDays = (d: number) => new Date(start.getTime() + d * 86400000).toISOString().slice(0, 10);
    const selfDueAt = t.selfFormKey ? addDays(t.selfDueDays) : null;
    const managerDueAt = addDays(t.managerDueDays);
    const selfForm = t.selfFormKey ? await this.forms.latestPublished(t.selfFormKey) : null;
    const managerForm = await this.forms.latestPublished(t.managerFormKey);
    if (!managerForm || (t.selfFormKey && !selfForm)) throw unprocessable(ErrorCodes.VALIDATION, 'I form del template devono essere pubblicati');
    const definition = reviewTemplateToApp(t, { id: c.id, name: c.name });
    await tx()
      .update(reviewCycles)
      .set({ status: 'active', launchedAt: new Date(), selfDueAt, managerDueAt, templateSnapshot: { ...t }, updatedAt: new Date() })
      .where(eq(reviewCycles.id, cycleId));
    const byManager = new Map<string, number>();
    for (const person of pop.included) {
      const [review] = await tx()
        .insert(reviews)
        .values({ tenantId: p.tenantId, createdBy: p.userId, cycleId, subjectPersonId: person.id, managerPersonId: person.managerId, status: selfForm ? 'pending_self' : 'pending_manager' })
        .returning();
      const inst = await this.apps.launchInternal({ definition, subjectPersonId: person.id, title: null });
      const runs = await this.apps.currentRuns(inst.id);
      const selfRun = runs.get('self');
      const mgrRun = runs.get('manager');
      // le scadenze del ciclo (anche con data di lancio futura) prevalgono su quelle calcolate dal motore
      if (selfRun?.formResponseId && selfDueAt) await this.setDue(selfRun.id, selfRun.formResponseId, selfDueAt);
      if (mgrRun?.formResponseId) await this.setDue(mgrRun.id, mgrRun.formResponseId, managerDueAt);
      await tx().update(reviews).set({ appInstanceId: inst.id, selfResponseId: selfRun?.formResponseId ?? null, managerResponseId: mgrRun?.formResponseId ?? null }).where(eq(reviews.id, review!.id));
      await this.notifier.send({ personId: person.id, type: 'review.launched', data: { cycleName: c.name, stageLabel: selfForm ? 'Compila la tua self-review' : 'Il tuo manager compilerà la review', dueDate: selfDueAt }, link: `/reviews/${review!.id}` });
      byManager.set(person.managerId!, (byManager.get(person.managerId!) ?? 0) + 1);
    }
    for (const [managerId, n] of byManager) {
      await this.notifier.send({ personId: managerId, type: 'review.launched', data: { cycleName: c.name, stageLabel: `Compila la manager review per ${n} person${n === 1 ? 'a' : 'e'}`, dueDate: managerDueAt }, link: '/reviews?box=team', dedupeKey: `review_launch:${cycleId}:${managerId}` });
    }
    await this.audit.log({ action: 'review_cycle.launch', entityType: 'review_cycle', entityId: cycleId, after: { reviews: pop.included.length, skipped: pop.skipped.length, appKey: definition.key } });
    return this.getCycle(cycleId);
  }

  /** Solleciti (REV-061): notifica chi ha una fase in sospeso; dedupe per giorno. */
  async remind(cycleId: string) {
    const c = await this.cycleRow(cycleId);
    if (c.status !== 'active') throw conflict(ErrorCodes.CONFLICT, 'Il ciclo non è attivo');
    const rows = await tx().select().from(reviews).where(and(eq(reviews.cycleId, cycleId), inArray(reviews.status, ['pending_self', 'pending_manager', 'pending_share'])));
    const today = new Date().toISOString().slice(0, 10);
    let sent = 0;
    const names = await this.namesOf([...new Set(rows.map((r) => r.subjectPersonId))]);
    for (const r of rows) {
      const toSubject = r.status === 'pending_self';
      const to = toSubject ? r.subjectPersonId : r.managerPersonId;
      if (!to) continue;
      const res = await this.notifier.send({
        personId: to,
        type: 'review.stage_due',
        data: { cycleName: c.name, stageLabel: toSubject ? STAGE_LABEL.self : r.status === 'pending_share' ? 'Condivisione' : STAGE_LABEL.manager, subjectName: toSubject ? null : personName(names.get(r.subjectPersonId)), dueDate: toSubject ? c.selfDueAt : c.managerDueAt },
        link: `/reviews/${r.id}`,
        dedupeKey: `review_remind:${r.id}:${r.status}:${today}`,
      });
      if (res.created) sent++;
    }
    await this.audit.log({ action: 'review_cycle.remind', entityType: 'review_cycle', entityId: cycleId, after: { sent } });
    return { sent, pending: rows.length };
  }

  /** Chiusura (REV-055): le review condivise/firmate diventano storiche; quelle mai completate vengono annullate. */
  async closeCycle(cycleId: string) {
    const c = await this.cycleRow(cycleId);
    if (c.status !== 'active') throw conflict(ErrorCodes.CONFLICT, 'Il ciclo non è attivo');
    const now = new Date();
    const rows = await tx().select({ id: reviews.id, status: reviews.status, appInstanceId: reviews.appInstanceId }).from(reviews).where(eq(reviews.cycleId, cycleId));
    await tx().update(reviews).set({ status: 'closed', closedAt: now, updatedAt: now }).where(and(eq(reviews.cycleId, cycleId), inArray(reviews.status, ['shared', 'signed'])));
    await tx().update(reviews).set({ status: 'cancelled', closedAt: now, updatedAt: now }).where(and(eq(reviews.cycleId, cycleId), inArray(reviews.status, ['pending_self', 'pending_manager', 'pending_share'])));
    for (const r of rows) if (r.appInstanceId) await this.apps.completeInternal(r.appInstanceId, ['shared', 'signed'].includes(r.status) ? 'closed' : 'cancelled');
    await tx().update(reviewCycles).set({ status: 'closed', closedAt: now, updatedAt: now }).where(eq(reviewCycles.id, cycleId));
    await this.audit.log({ action: 'review_cycle.close', entityType: 'review_cycle', entityId: cycleId });
    return this.getCycle(cycleId);
  }

  async progress(cycleId: string) {
    const rows = await tx().select().from(reviews).where(eq(reviews.cycleId, cycleId));
    const names = await this.namesOf([...new Set(rows.flatMap((r) => [r.subjectPersonId, r.managerPersonId]).filter((x): x is string => !!x))]);
    const byManager = new Map<string, { managerId: string; managerName: string; total: number; pending: number }>();
    for (const r of rows) {
      const m = r.managerPersonId ?? 'none';
      const e = byManager.get(m) ?? { managerId: m, managerName: personName(names.get(m)), total: 0, pending: 0 };
      e.total++;
      if (['pending_manager', 'pending_share'].includes(r.status)) e.pending++;
      byManager.set(m, e);
    }
    return {
      counts: await this.progressCounts(cycleId),
      byManager: [...byManager.values()].sort((a, b) => b.pending - a.pending),
      reviews: rows.map((r) => ({ id: r.id, status: r.status, subject: personName(names.get(r.subjectPersonId)), subjectPersonId: r.subjectPersonId, manager: personName(r.managerPersonId ? names.get(r.managerPersonId) : null), finalRating: r.finalRating, finalRatingLabel: r.finalRatingLabel, sharedAt: r.sharedAt, signedAt: r.signedAt })),
    };
  }

  // ---------- review ----------

  async list(q: { box: 'mine' | 'team' | 'all'; cycleId?: string; status?: string }) {
    const p = principal();
    const conds: SQL[] = [];
    if (q.box === 'mine') conds.push(eq(reviews.subjectPersonId, p.personId ?? ''));
    else if (q.box === 'team') conds.push(eq(reviews.managerPersonId, p.personId ?? ''));
    else if (!hasPermission(p.roles, Permissions.REVIEWS_MANAGE)) throw forbidden();
    if (q.cycleId) conds.push(eq(reviews.cycleId, q.cycleId));
    if (q.status) conds.push(eq(reviews.status, q.status as ReviewRow['status']));
    const rows = await tx().select().from(reviews).where(conds.length ? and(...conds) : undefined).orderBy(desc(reviews.createdAt));
    const cycleIds = [...new Set(rows.map((r) => r.cycleId))];
    const cycles = cycleIds.length ? await tx().select().from(reviewCycles).where(inArray(reviewCycles.id, cycleIds)) : [];
    const cmap = new Map(cycles.map((c) => [c.id, c]));
    const names = await this.namesOf([...new Set(rows.flatMap((r) => [r.subjectPersonId, r.managerPersonId]).filter((x): x is string => !!x))]);
    return rows.map((r) => {
      const c = cmap.get(r.cycleId);
      return { ...this.view(r), cycle: c ? { id: c.id, name: c.name, status: c.status, selfDueAt: c.selfDueAt, managerDueAt: c.managerDueAt, periodStart: c.periodStart, periodEnd: c.periodEnd } : null, subject: names.get(r.subjectPersonId) ?? null, manager: r.managerPersonId ? (names.get(r.managerPersonId) ?? null) : null, ...this.flags(p, r, c) };
    });
  }

  async get(id: string) {
    const p = principal();
    const r = await this.reviewRow(id);
    const c = await this.cycleRow(r.cycleId);
    const t = (c.templateSnapshot as TemplateRow | null) ?? (await this.getTemplate(c.templateId));
    const flags = this.flags(p, r, c, t);
    const [selfResp, mgrResp] = await Promise.all([
      r.selfResponseId ? tx().select().from(formResponses).where(eq(formResponses.id, r.selfResponseId)).then((x) => x[0] ?? null) : null,
      r.managerResponseId ? tx().select().from(formResponses).where(eq(formResponses.id, r.managerResponseId)).then((x) => x[0] ?? null) : null,
    ]);
    const names = await this.namesOf([r.subjectPersonId, r.managerPersonId].filter((x): x is string => !!x));
    const strip = (resp: typeof selfResp, visible: boolean) => (resp ? { id: resp.id, status: resp.status, submittedAt: resp.submittedAt, dueDate: resp.dueDate, answers: visible ? resp.answers : null, score: visible && resp.score != null ? Number(resp.score) : null, formKey: resp.formKey } : null);
    return {
      ...this.view(r),
      cycle: { id: c.id, name: c.name, status: c.status, periodStart: c.periodStart, periodEnd: c.periodEnd, selfDueAt: c.selfDueAt, managerDueAt: c.managerDueAt, okrCycleId: c.okrCycleId },
      template: { name: t.name, managerSeesSelf: t.managerSeesSelf, requireSignature: t.requireSignature, includeObjectives: t.includeObjectives, ratingScale: t.ratingScale as RatingScale },
      subject: names.get(r.subjectPersonId) ?? null,
      manager: r.managerPersonId ? (names.get(r.managerPersonId) ?? null) : null,
      selfResponse: strip(selfResp, flags.canSeeSelf),
      managerResponse: strip(mgrResp, flags.canSeeManager),
      ...flags,
    };
  }

  /** Pannello di contesto (REV-031): obiettivi, feedback condivisi, riconoscimenti, review precedenti, 1:1 nel periodo. */
  async context(id: string) {
    const p = principal();
    const r = await this.reviewRow(id);
    const c = await this.cycleRow(r.cycleId);
    const isManager = r.managerPersonId === p.personId;
    const isSubject = r.subjectPersonId === p.personId;
    const isHr = hasPermission(p.roles, Permissions.REVIEWS_MANAGE);
    if (!isManager && !isSubject && !isHr) throw notFound('Review', id);
    const from = new Date(`${c.periodStart}T00:00:00Z`);
    const to = new Date(`${c.periodEnd}T23:59:59Z`);
    const objConds: SQL[] = [eq(objectives.ownerPersonId, r.subjectPersonId)];
    if (c.okrCycleId) objConds.push(eq(objectives.cycleId, c.okrCycleId));
    else objConds.push(inArray(objectives.status, ['active', 'closed']));
    const objs = await tx().select().from(objectives).where(and(...objConds)).orderBy(asc(objectives.createdAt));
    const krs = objs.length ? await tx().select().from(keyResults).where(inArray(keyResults.objectiveId, objs.map((o) => o.id))) : [];
    const fbConds: SQL[] = [eq(feedback.toPersonId, r.subjectPersonId), gte(feedback.createdAt, from), lte(feedback.createdAt, to)];
    if (!isSubject) fbConds.push(or(eq(feedback.visibility, 'manager'), sql`${feedback.inRecordAt} IS NOT NULL`)!);
    const fb = await tx().select().from(feedback).where(and(...fbConds)).orderBy(desc(feedback.createdAt)).limit(20);
    const recs = await tx()
      .select({ id: recognitions.id, message: recognitions.message, createdAt: recognitions.createdAt, fromPersonId: recognitions.fromPersonId })
      .from(recognitionRecipients)
      .innerJoin(recognitions, eq(recognitions.id, recognitionRecipients.recognitionId))
      .where(and(eq(recognitionRecipients.personId, r.subjectPersonId), isNull(recognitions.hiddenAt), gte(recognitions.createdAt, from), lte(recognitions.createdAt, to)))
      .orderBy(desc(recognitions.createdAt))
      .limit(10);
    const prev = await tx()
      .select({ id: reviews.id, cycleId: reviews.cycleId, finalRating: reviews.finalRating, finalRatingLabel: reviews.finalRatingLabel, sharedAt: reviews.sharedAt, status: reviews.status })
      .from(reviews)
      .where(and(eq(reviews.subjectPersonId, r.subjectPersonId), inArray(reviews.status, ['shared', 'signed', 'closed']), sql`${reviews.id} <> ${id}`))
      .orderBy(desc(reviews.sharedAt))
      .limit(3);
    const prevCycles = prev.length ? await tx().select({ id: reviewCycles.id, name: reviewCycles.name }).from(reviewCycles).where(inArray(reviewCycles.id, prev.map((x) => x.cycleId))) : [];
    const [oneOnOne] = r.managerPersonId
      ? await tx()
          .select({ n: sql<number>`count(*)::int` })
          .from(meetings)
          .innerJoin(oneOnOneRelations, eq(oneOnOneRelations.id, meetings.relationId))
          .where(and(eq(meetings.status, 'done'), gte(meetings.scheduledAt, from), lte(meetings.scheduledAt, to), or(and(eq(oneOnOneRelations.personAId, r.managerPersonId), eq(oneOnOneRelations.personBId, r.subjectPersonId)), and(eq(oneOnOneRelations.personBId, r.managerPersonId), eq(oneOnOneRelations.personAId, r.subjectPersonId)))))
      : [{ n: 0 }];
    const names = await this.namesOf([...new Set([...fb.map((f) => f.fromPersonId), ...recs.map((x) => x.fromPersonId)])]);
    return {
      objectives: objs.map((o) => ({ id: o.id, title: o.title, status: o.status, progress: o.progress == null ? null : Number(o.progress), confidence: o.confidence, outcome: o.outcome, finalScore: o.finalScore == null ? null : Number(o.finalScore), weight: o.weight == null ? null : Number(o.weight), keyResults: krs.filter((k) => k.objectiveId === o.id).map((k) => ({ id: k.id, title: k.title, progress: Number(k.progress), currentValue: Number(k.currentValue), targetValue: Number(k.targetValue), unit: k.unit })) })),
      feedback: fb.map((f) => ({ id: f.id, kind: f.kind, body: f.body, createdAt: f.createdAt, from: personName(names.get(f.fromPersonId)) })),
      recognitions: recs.map((x) => ({ id: x.id, message: x.message, createdAt: x.createdAt, from: personName(names.get(x.fromPersonId)) })),
      previousReviews: prev.map((x) => ({ ...x, cycleName: prevCycles.find((pc) => pc.id === x.cycleId)?.name ?? '' })),
      oneOnOnesDone: oneOnOne?.n ?? 0,
    };
  }

  async share(id: string) {
    const p = principal();
    const r = await this.reviewRow(id);
    const c = await this.cycleRow(r.cycleId);
    if (c.status !== 'active') throw conflict(ErrorCodes.CONFLICT, 'Ciclo non attivo');
    if (r.managerPersonId !== p.personId && !hasPermission(p.roles, Permissions.REVIEWS_MANAGE)) throw forbidden();
    if (!r.managerSubmittedAt) throw conflict(ErrorCodes.CONFLICT, 'La manager review non è ancora stata inviata');
    if (r.sharedAt) throw conflict(ErrorCodes.CONFLICT, 'Già condivisa');
    const ctx = await this.context(id);
    await tx().update(reviews).set({ status: 'shared', sharedAt: new Date(), sharedByPersonId: p.personId, objectivesSnapshot: ctx.objectives, updatedAt: new Date() }).where(eq(reviews.id, id));
    await this.engineDecide(r, 'share');
    const me = p.personId ? await this.people.get(p.personId).catch(() => null) : null;
    await this.notifier.send({ personId: r.subjectPersonId, type: 'review.shared', data: { fromName: personName(me), cycleName: c.name }, link: `/reviews/${id}` });
    await this.audit.log({ action: 'review.share', entityType: 'review', entityId: id });
    return this.get(id);
  }

  async sign(id: string, dto: z.infer<typeof signDto>) {
    const p = principal();
    const r = await this.reviewRow(id);
    if (r.subjectPersonId !== p.personId) throw forbidden('Solo la persona valutata può firmare');
    if (r.status !== 'shared') throw conflict(ErrorCodes.CONFLICT, 'La review non è in stato condiviso');
    await tx().update(reviews).set({ status: 'signed', signedAt: new Date(), signComment: dto.comment, disagreed: dto.disagree, updatedAt: new Date() }).where(eq(reviews.id, id));
    await this.engineDecide(r, 'sign', dto.disagree ? `Dissenso: ${dto.comment ?? ''}`.trim() : dto.comment);
    const c = await this.cycleRow(r.cycleId);
    const me = await this.people.get(p.personId!);
    if (r.managerPersonId) await this.notifier.send({ personId: r.managerPersonId, type: 'review.signed', data: { fromName: personName(me), cycleName: c.name, disagreed: dto.disagree ? 1 : null }, link: `/reviews/${id}` });
    await this.audit.log({ action: 'review.sign', entityType: 'review', entityId: id, after: dto });
    return this.get(id);
  }

  async conversation(id: string, at?: string) {
    const p = principal();
    const r = await this.reviewRow(id);
    if (r.managerPersonId !== p.personId && !hasPermission(p.roles, Permissions.REVIEWS_MANAGE)) throw forbidden();
    await tx().update(reviews).set({ conversationAt: at ? new Date(at) : new Date(), updatedAt: new Date() }).where(eq(reviews.id, id));
    await this.audit.log({ action: 'review.conversation', entityType: 'review', entityId: id, after: { at } });
    return this.get(id);
  }

  /** HR può correggere il rating finale con motivazione (tracciato, REV-043 in forma semplice). */
  async overrideRating(id: string, dto: z.infer<typeof overrideRatingDto>) {
    const p = principal();
    const r = await this.reviewRow(id);
    const c = await this.cycleRow(r.cycleId);
    const scale = ((c.templateSnapshot as TemplateRow | null)?.ratingScale ?? (await this.getTemplate(c.templateId)).ratingScale) as RatingScale;
    if (dto.rating < scale.min || dto.rating > scale.max) throw unprocessable(ErrorCodes.VALIDATION, `Rating fuori scala ${scale.min}–${scale.max}`);
    await tx().update(reviews).set({ finalRating: dto.rating, finalRatingLabel: scale.labels[String(dto.rating)] ?? String(dto.rating), ratingOverriddenBy: p.userId, ratingOverrideNote: dto.note, updatedAt: new Date() }).where(eq(reviews.id, id));
    await this.audit.log({ action: 'review.rating_override', entityType: 'review', entityId: id, before: { rating: r.finalRating }, after: dto });
    return this.get(id);
  }

  /** Riapertura di una fase da parte dell'HR (REV §6): la compilazione torna bozza, le fasi successive vengono invalidate. */
  async reopen(id: string, stage: 'self' | 'manager') {
    const r = await this.reviewRow(id);
    const respId = stage === 'self' ? r.selfResponseId : r.managerResponseId;
    if (!respId) throw unprocessable(ErrorCodes.VALIDATION, 'Fase non presente');
    let responseIds: { selfResponseId?: string | null; managerResponseId?: string | null } = {};
    if (r.appInstanceId) {
      // motore: nuovi tentativi per la fase e le successive; le risposte precedenti vengono ricopiate come bozza
      const c = await this.cycleRow(r.cycleId);
      if (c.status !== 'active') throw conflict(ErrorCodes.CONFLICT, 'Ciclo non attivo');
      await this.apps.reopenTo(r.appInstanceId, stage);
      const runs = await this.apps.currentRuns(r.appInstanceId);
      const copy = async (oldId: string | null, run?: { formResponseId: string | null }) => {
        const newId = run?.formResponseId ?? null;
        if (!oldId || !newId || oldId === newId) return newId ?? oldId;
        const [prev] = await tx().select({ answers: formResponses.answers }).from(formResponses).where(eq(formResponses.id, oldId));
        if (prev) await tx().update(formResponses).set({ answers: prev.answers, updatedAt: new Date() }).where(eq(formResponses.id, newId));
        return newId;
      };
      responseIds = { selfResponseId: await copy(r.selfResponseId, runs.get('self')), managerResponseId: await copy(r.managerResponseId, runs.get('manager')) };
    } else {
      await tx().update(formResponses).set({ status: 'draft', submittedAt: null, updatedAt: new Date() }).where(eq(formResponses.id, respId));
    }
    await tx()
      .update(reviews)
      .set({
        ...responseIds,
        status: stage === 'self' ? 'pending_self' : 'pending_manager',
        selfSubmittedAt: stage === 'self' ? null : r.selfSubmittedAt,
        managerSubmittedAt: null,
        sharedAt: null,
        signedAt: null,
        signComment: null,
        disagreed: false,
        finalScore: null,
        finalRating: null,
        finalRatingLabel: null,
        updatedAt: new Date(),
      })
      .where(eq(reviews.id, id));
    await this.audit.log({ action: 'review.reopen', entityType: 'review', entityId: id, after: { stage } });
    return this.get(id);
  }

  /** Export PDF della review (REV-054): intestazione, rating, fasi visibili a chi chiede, obiettivi del periodo, firma. Tracciato nell'audit. */
  async pdf(id: string): Promise<{ buffer: Buffer; filename: string }> {
    const r = await this.get(id);
    const ctx = await this.context(id);
    const subject = personName(r.subject);
    const pdf = createPdf({ title: `Review · ${subject}` });
    pdf.h1(`Review di ${subject}`, `${r.cycle.name} · periodo ${r.cycle.periodStart} → ${r.cycle.periodEnd} · template ${r.template.name}`);
    pdf.kv([
      ['Persona valutata', `${subject}${r.subject?.jobTitle ? ` · ${r.subject.jobTitle}` : ''}`],
      ['Manager', personName(r.manager)],
      ['Stato', r.status],
      ['Rating finale', r.canSeeManager && r.finalRating != null ? `${r.finalRating} · ${r.finalRatingLabel ?? ''} (scala ${r.template.ratingScale.min}–${r.template.ratingScale.max})` : null],
      ['Nota di correzione HR', r.canSeeManager ? r.ratingOverrideNote : null],
      ['Condivisa il', r.sharedAt ? new Date(r.sharedAt).toLocaleDateString('it-IT') : null],
      ['Colloquio', r.conversationAt ? new Date(r.conversationAt).toLocaleDateString('it-IT') : null],
      ['Presa visione', r.signedAt ? `${new Date(r.signedAt).toLocaleDateString('it-IT')}${r.disagreed ? ' · con dissenso' : ''}` : null],
    ]);
    const renderStage = async (title: string, resp: { id: string; submittedAt: Date | null; answers: unknown } | null) => {
      if (!resp) return;
      pdf.h2(`${title}${resp.submittedAt ? ` · inviata il ${new Date(resp.submittedAt).toLocaleDateString('it-IT')}` : ' · non inviata'}`);
      if (!resp.answers) { pdf.p('Contenuto non visibile con il tuo ruolo.', { muted: true }); return; }
      const [row] = await tx().select({ formDefinitionId: formResponses.formDefinitionId }).from(formResponses).where(eq(formResponses.id, resp.id));
      const form = row ? await this.forms.get(row.formDefinitionId) : null;
      const answers = resp.answers as Record<string, unknown>;
      const schema = form?.schema as FormSchema | undefined;
      const rows: [string, string][] = [];
      for (const sec of schema?.sections ?? []) {
        for (const f of sec.fields) {
          if (f.type === 'info') continue;
          const v = answers[f.key];
          if (v == null || v === '') continue;
          const shown = f.type === 'scale' ? `${v}${f.scale?.labels?.[String(v)] ? ` · ${f.scale.labels[String(v)]}` : ''}` : f.type === 'single_choice' ? (f.options?.find((o) => o.value === v)?.label ?? String(v)) : Array.isArray(v) ? v.map((x) => f.options?.find((o) => o.value === x)?.label ?? String(x)).join(', ') : typeof v === 'boolean' ? (v ? 'Sì' : 'No') : String(v);
          rows.push([f.label, shown]);
        }
      }
      if (!rows.length) for (const [k, v] of Object.entries(answers)) rows.push([k, Array.isArray(v) ? v.join(', ') : String(v)]);
      pdf.table(['Domanda', 'Risposta'], rows, [200, 299]);
    };
    await renderStage('Self-review', r.selfResponse);
    await renderStage('Manager review', r.managerResponse);
    if (r.template.includeObjectives && ctx.objectives.length) {
      pdf.h2('Obiettivi del periodo');
      pdf.table(['Obiettivo', 'Stato', 'Progresso', 'Esito'], ctx.objectives.map((o) => [o.title, o.status, o.progress == null ? null : `${Math.round(o.progress * 100)}%`, o.outcome ?? (o.finalScore == null ? null : String(o.finalScore))]), [239, 80, 80, 100]);
    }
    if (r.signComment && r.canSeeManager) { pdf.h2('Commento alla presa visione'); pdf.p(r.signComment); }
    pdf.p(`Documento generato da WorkingBetter per ${personName(await this.people.get(principal().personId ?? '').catch(() => null))} · uso interno riservato.`, { muted: true, size: 8 });
    await this.audit.log({ action: 'review.export_pdf', entityType: 'review', entityId: id });
    return { buffer: await pdf.finish(), filename: `review-${subject.replace(/\s+/g, '-').toLowerCase()}.pdf` };
  }

  // ---------- hook dal form engine ----------

  private async onStageSubmitted(resp: SubmittedResponse) {
    if (!resp.contextId) return;
    const [r] = await tx().select().from(reviews).where(eq(reviews.id, resp.contextId));
    if (!r) return;
    await this.applySubmission(r, resp);
  }

  /** Fase del motore conclusa: le fasi form (self/manager) aggiornano la review; condivisione e firma le gestisce già il modulo. */
  private async onEngineStageDone(e: StageDoneEvent) {
    if (!e.instance.appKey.startsWith('review_') || e.run.type !== 'form' || !e.run.formResponseId) return;
    const [r] = await tx().select().from(reviews).where(eq(reviews.appInstanceId, e.instance.id));
    if (!r) return;
    const [resp] = await tx().select().from(formResponses).where(eq(formResponses.id, e.run.formResponseId));
    if (!resp) return;
    await this.applySubmission(r, { id: resp.id, answers: (resp.answers ?? {}) as Record<string, unknown>, score: resp.score == null ? null : Number(resp.score) });
  }

  private async applySubmission(r: ReviewRow, resp: { id: string; answers: unknown; score: number | null }) {
    const now = new Date();
    const patch: Partial<ReviewRow> = { updatedAt: now };
    if (resp.id === r.selfResponseId) patch.selfSubmittedAt = now;
    if (resp.id === r.managerResponseId) {
      patch.managerSubmittedAt = now;
      const c = await this.cycleRow(r.cycleId);
      const t = (c.templateSnapshot as TemplateRow | null) ?? (await this.getTemplate(c.templateId));
      const scale = t.ratingScale as RatingScale;
      let rating: number | null = null;
      const answers = resp.answers as Record<string, unknown>;
      if (t.overallRatingField && typeof answers[t.overallRatingField] === 'number') rating = answers[t.overallRatingField] as number;
      else if (resp.score != null) rating = scoreToScale(resp.score, scale.min, scale.max);
      patch.finalScore = resp.score == null ? null : (resp.score.toString() as unknown as ReviewRow['finalScore']);
      patch.finalRating = rating;
      patch.finalRatingLabel = rating == null ? null : (scale.labels[String(rating)] ?? String(rating));
    }
    const selfDone = !r.selfResponseId || !!(patch.selfSubmittedAt ?? r.selfSubmittedAt);
    const managerDone = !!(patch.managerSubmittedAt ?? r.managerSubmittedAt);
    if (!['shared', 'signed', 'closed', 'cancelled'].includes(r.status)) patch.status = !selfDone ? 'pending_self' : !managerDone ? 'pending_manager' : 'pending_share';
    await tx().update(reviews).set(patch).where(eq(reviews.id, r.id));
    await this.audit.log({ action: resp.id === r.selfResponseId ? 'review.self_submitted' : 'review.manager_submitted', entityType: 'review', entityId: r.id });
  }

  // ---------- interni ----------

  /** Approva la fase di approvazione indicata sull'istanza del motore (no-op per le review precedenti alla convergenza). */
  private async engineDecide(r: ReviewRow, stageKey: 'share' | 'sign', comment?: string) {
    if (!r.appInstanceId) return;
    const run = (await this.apps.currentRuns(r.appInstanceId)).get(stageKey);
    if (run?.status === 'active') await this.apps.decideInternal(run.id, { decision: 'approve', comment });
  }
  private async setDue(runId: string, responseId: string, due: string) {
    await tx().update(formResponses).set({ dueDate: new Date(`${due}T23:59:59Z`), updatedAt: new Date() }).where(eq(formResponses.id, responseId));
    await tx().update(appStageRuns).set({ dueDate: due, updatedAt: new Date() }).where(eq(appStageRuns.id, runId));
  }

  private flags(p: Principal, r: ReviewRow, c?: CycleRow, t?: TemplateRow) {
    const isSubject = r.subjectPersonId === p.personId;
    const isManager = !!r.managerPersonId && r.managerPersonId === p.personId;
    const isHr = hasPermission(p.roles, Permissions.REVIEWS_MANAGE);
    const active = c?.status === 'active';
    const tpl = t ?? (c?.templateSnapshot as TemplateRow | null) ?? null;
    const seesSelfRule = tpl?.managerSeesSelf ?? 'after_submit';
    const canSeeSelf = isSubject || isHr || (isManager && (seesSelfRule === 'immediately' || (seesSelfRule === 'after_submit' && !!r.managerSubmittedAt)));
    const canSeeManager = isManager || isHr || (isSubject && !!r.sharedAt);
    return {
      isSubject,
      isManager,
      isHr,
      canFillSelf: isSubject && active && !!r.selfResponseId && !r.selfSubmittedAt,
      canFillManager: isManager && active && !r.managerSubmittedAt,
      canShare: (isManager || isHr) && active && !!r.managerSubmittedAt && !r.sharedAt,
      canSign: isSubject && r.status === 'shared' && (tpl?.requireSignature ?? true),
      canSeeSelf,
      canSeeManager,
    };
  }

  private view(r: ReviewRow) {
    return { ...r, finalScore: r.finalScore == null ? null : Number(r.finalScore) };
  }

  private async reviewRow(id: string): Promise<ReviewRow> {
    const p = principal();
    const [r] = await tx().select().from(reviews).where(eq(reviews.id, id));
    if (!r) throw notFound('Review', id);
    const ok = r.subjectPersonId === p.personId || r.managerPersonId === p.personId || hasPermission(p.roles, Permissions.REVIEWS_MANAGE);
    if (!ok) throw notFound('Review', id);
    return r;
  }
  private async cycleRow(id: string): Promise<CycleRow> {
    const [c] = await tx().select().from(reviewCycles).where(eq(reviewCycles.id, id));
    if (!c) throw notFound('Ciclo di review', id);
    return c;
  }
  private async assertFormPublished(key: string) {
    const f = await this.forms.latestPublished(key);
    if (!f) throw unprocessable(ErrorCodes.VALIDATION, `Il form "${key}" non esiste o non è pubblicato`);
  }
  private async namesOf(ids: string[]) {
    if (!ids.length) return new Map<string, { id: string; firstName: string; lastName: string; jobTitle: string | null }>();
    const rows = await tx().select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName, jobTitle: persons.jobTitle }).from(persons).where(inArray(persons.id, ids));
    return new Map(rows.map((x) => [x.id, x]));
  }
  private async resolvePopulation(pop: PopulationDto) {
    const conds: SQL[] = [inArray(persons.status, ['active', 'invited'])];
    if (pop.orgUnitIds?.length) {
      const units = await tx().select({ path: orgUnits.path }).from(orgUnits).where(inArray(orgUnits.id, pop.orgUnitIds));
      const subtree = units.length ? await tx().select({ id: orgUnits.id }).from(orgUnits).where(or(...units.map((u) => like(orgUnits.path, `${u.path}%`)))!) : [];
      conds.push(subtree.length ? inArray(persons.orgUnitId, subtree.map((s) => s.id)) : sql`false`);
    }
    if (pop.personIds?.length) conds.push(inArray(persons.id, pop.personIds));
    if (pop.excludeHiredAfter) conds.push(or(isNull(persons.hireDate), lte(persons.hireDate, pop.excludeHiredAfter))!);
    const rows = await tx().select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName, managerId: persons.managerId, jobTitle: persons.jobTitle, hireDate: persons.hireDate }).from(persons).where(and(...conds)).orderBy(asc(persons.lastName));
    const excluded = new Set(pop.excludePersonIds ?? []);
    const included = rows.filter((r) => r.managerId && !excluded.has(r.id));
    const skipped = rows.filter((r) => !r.managerId && !excluded.has(r.id)).map((r) => ({ ...r, reason: 'Nessun manager assegnato' }));
    return { included, skipped, excluded: rows.filter((r) => excluded.has(r.id)).length };
  }
  private async progressCounts(cycleId: string) {
    const rows = await tx().select({ status: reviews.status, n: sql<number>`count(*)::int` }).from(reviews).where(eq(reviews.cycleId, cycleId)).groupBy(reviews.status);
    const counts: Record<string, number> = { total: 0 };
    for (const r of rows) { counts[r.status] = r.n; counts.total! += r.n; }
    return counts;
  }
}
