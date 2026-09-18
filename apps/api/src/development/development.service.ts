import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { competencies, competencyAssessments, developmentActions, developmentPlans, jobProfiles, persons, reviewCycles, reviewTemplates, reviews, talentAssessments } from '@wb/db';
import { CompetencyPresets, ErrorCodes, Permissions, SuggestedActions, computeGap, hasPermission, nineBoxLabel, performanceBand, planProgress, suggestActions, type Assessment, type ExpectedLevel, type GapPolicy } from '@wb/shared';
import type { z } from 'zod';
import { principal, tx } from '../common/context.js';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { assessDto, competencyDto, createActionDto, createPlanDto, jobProfileDto, talentDto, updateActionDto, updateJobProfileDto, updatePlanDto } from './dto.js';

type PersonRow = typeof persons.$inferSelect;
const lite = (p: PersonRow) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, jobTitle: p.jobTitle, jobLevel: p.jobLevel, managerId: p.managerId, jobProfileId: p.jobProfileId });
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Sviluppo & Carriera (DEV): framework, profilo competenze con gap, piani di sviluppo, 9-box.
 * Visibilità: la persona vede il proprio profilo e piano; il manager quelli dei riporti diretti; l'HR tutto.
 * Il potenziale (9-box) non è mai restituito al collaboratore.
 */
@Injectable()
export class DevelopmentService {
  constructor(private readonly audit: AuditService, private readonly notifier: NotificationsService) {}

  // ---------- accesso ----------

  private async person(id: string): Promise<PersonRow> {
    const [p] = await tx().select().from(persons).where(eq(persons.id, id));
    if (!p) throw notFound('Persona', id);
    return p;
  }
  /** self | manager (riporto diretto) | hr — oppure 404 per non rivelare l'esistenza. */
  private async access(personId: string): Promise<'self' | 'manager' | 'hr'> {
    const p = principal();
    const person = await this.person(personId);
    if (p.personId === personId) return 'self';
    if (hasPermission(p, Permissions.DEV_MANAGE)) return 'hr';
    if (hasPermission(p, Permissions.DEV_TEAM) && p.personId && person.managerId === p.personId) return 'manager';
    throw notFound('Persona', personId);
  }

  // ---------- framework (DEV-001/002) ----------

  async framework() {
    const p = principal();
    const comps = await tx().select().from(competencies).where(eq(competencies.tenantId, p.tenantId)).orderBy(competencies.kind, competencies.name);
    const profiles = await tx().select().from(jobProfiles).where(eq(jobProfiles.tenantId, p.tenantId)).orderBy(jobProfiles.family, jobProfiles.title);
    const counts = await tx().select({ id: persons.jobProfileId, n: sql<number>`count(*)::int` }).from(persons).where(and(eq(persons.tenantId, p.tenantId), inArray(persons.status, ['active', 'leaving']))).groupBy(persons.jobProfileId);
    const byProfile = new Map(counts.map((c) => [c.id, c.n]));
    return { competencies: comps, profiles: profiles.map((pr) => ({ ...pr, people: byProfile.get(pr.id) ?? 0 })), suggestedActions: SuggestedActions };
  }

  async loadPresets() {
    const p = principal();
    const existing = new Set((await tx().select({ key: competencies.key }).from(competencies).where(eq(competencies.tenantId, p.tenantId))).map((c) => c.key));
    const toAdd = CompetencyPresets.filter((c) => !existing.has(c.key));
    if (toAdd.length) await tx().insert(competencies).values(toAdd.map((c) => ({ tenantId: p.tenantId, createdBy: p.userId, key: c.key, name: c.name, kind: c.kind, description: c.description, levels: c.levels })));
    await this.audit.log({ action: 'dev.presets_loaded', entityType: 'competency', after: { added: toAdd.map((c) => c.key) } });
    return { added: toAdd.length, total: existing.size + toAdd.length };
  }

  async upsertCompetency(dto: z.infer<typeof competencyDto>) {
    const p = principal();
    const [existing] = await tx().select().from(competencies).where(and(eq(competencies.tenantId, p.tenantId), eq(competencies.key, dto.key)));
    const values = { name: dto.name, kind: dto.kind, description: dto.description ?? null, levels: dto.levels, active: dto.active, updatedAt: new Date() };
    const [row] = existing
      ? await tx().update(competencies).set(values).where(eq(competencies.id, existing.id)).returning()
      : await tx().insert(competencies).values({ tenantId: p.tenantId, createdBy: p.userId, key: dto.key, ...values }).returning();
    await this.audit.log({ action: existing ? 'dev.competency_update' : 'dev.competency_create', entityType: 'competency', entityId: row!.id, before: existing, after: dto });
    return row!;
  }

  private async validateExpected(expected: { competencyKey: string }[]) {
    if (!expected.length) return;
    const known = new Set((await tx().select({ key: competencies.key }).from(competencies).where(eq(competencies.tenantId, principal().tenantId))).map((c) => c.key));
    const bad = expected.filter((e) => !known.has(e.competencyKey));
    if (bad.length) throw unprocessable(ErrorCodes.VALIDATION, `Competenze sconosciute: ${bad.map((b) => b.competencyKey).join(', ')}`);
  }

  async createProfile(dto: z.infer<typeof jobProfileDto>) {
    const p = principal();
    await this.validateExpected(dto.expected);
    const [row] = await tx().insert(jobProfiles).values({ tenantId: p.tenantId, createdBy: p.userId, title: dto.title, family: dto.family ?? null, level: dto.level ?? null, description: dto.description ?? null, expected: dto.expected, nextProfileId: dto.nextProfileId ?? null, active: dto.active ?? true }).returning();
    await this.audit.log({ action: 'dev.profile_create', entityType: 'job_profile', entityId: row!.id, after: dto });
    return row!;
  }

  async updateProfile(id: string, dto: z.infer<typeof updateJobProfileDto>) {
    const [before] = await tx().select().from(jobProfiles).where(eq(jobProfiles.id, id));
    if (!before) throw notFound('Job profile', id);
    if (dto.expected) await this.validateExpected(dto.expected);
    if (dto.nextProfileId === id) throw unprocessable(ErrorCodes.VALIDATION, 'Un profilo non può essere il successivo di sé stesso');
    const [row] = await tx().update(jobProfiles).set({ ...dto, updatedAt: new Date() }).where(eq(jobProfiles.id, id)).returning();
    await this.audit.log({ action: 'dev.profile_update', entityType: 'job_profile', entityId: id, before, after: dto });
    return row!;
  }

  async assignProfile(personId: string, profileId: string | null) {
    const person = await this.person(personId);
    if (profileId) {
      const [pr] = await tx().select({ id: jobProfiles.id }).from(jobProfiles).where(eq(jobProfiles.id, profileId));
      if (!pr) throw notFound('Job profile', profileId);
    }
    await tx().update(persons).set({ jobProfileId: profileId, updatedAt: new Date() }).where(eq(persons.id, personId));
    await this.audit.log({ action: 'dev.profile_assign', entityType: 'person', entityId: personId, before: { jobProfileId: person.jobProfileId }, after: { jobProfileId: profileId } });
    return { personId, jobProfileId: profileId };
  }

  // ---------- profilo competenze e gap (DEV-010/011/013) ----------

  async profile(personId: string, policy: GapPolicy = 'manager') {
    const me = principal();
    const role = await this.access(personId);
    const person = await this.person(personId);
    const profileRow = person.jobProfileId ? (await tx().select().from(jobProfiles).where(eq(jobProfiles.id, person.jobProfileId)))[0] ?? null : null;
    const nextRow = profileRow?.nextProfileId ? (await tx().select().from(jobProfiles).where(eq(jobProfiles.id, profileRow.nextProfileId)))[0] ?? null : null;
    const comps = await tx().select().from(competencies).where(and(eq(competencies.tenantId, me.tenantId), eq(competencies.active, true)));
    const rows = await tx().select().from(competencyAssessments).where(eq(competencyAssessments.personId, personId)).orderBy(desc(competencyAssessments.assessedAt));
    const assessments: Assessment[] = rows.map((r) => ({ competencyKey: r.competencyKey, source: r.source, level: r.level, assessedAt: r.assessedAt.toISOString() }));
    const expected = (profileRow?.expected ?? []) as ExpectedLevel[];
    const gaps = computeGap(expected, assessments, policy);
    const nextGaps = nextRow ? computeGap(nextRow.expected as ExpectedLevel[], assessments, policy).filter((g) => g.expected != null) : [];
    const plan = await this.latestPlan(personId);
    const suggestions = suggestActions(gaps).map((a) => ({ ...a, alreadyInPlan: !!plan?.actions.some((x) => x.title === a.title && x.status !== 'cancelled') }));
    const manager = person.managerId ? (await tx().select().from(persons).where(eq(persons.id, person.managerId)))[0] ?? null : null;
    const talent = role === 'self' ? null : (await tx().select().from(talentAssessments).where(eq(talentAssessments.personId, personId)).orderBy(desc(talentAssessments.createdAt)).limit(1))[0] ?? null;
    const performance = await this.performanceOf(personId);
    return {
      person: lite(person), manager: manager ? lite(manager) : null, viewer: role, policy,
      profile: profileRow ? { ...profileRow, expected } : null,
      nextProfile: nextRow ? { id: nextRow.id, title: nextRow.title, level: nextRow.level, family: nextRow.family, expected: nextRow.expected as ExpectedLevel[] } : null,
      competencies: comps.map((c) => ({ key: c.key, name: c.name, kind: c.kind, description: c.description, levels: c.levels })),
      gaps, nextGaps, suggestions, plan,
      lastAssessment: { self: rows.find((r) => r.source === 'self')?.assessedAt ?? null, manager: rows.find((r) => r.source === 'manager')?.assessedAt ?? null },
      can: { assessSelf: role === 'self', assessAsManager: role !== 'self', editPlan: true, approve: role !== 'self', talent: role !== 'self' },
      talent: talent ? { potential: talent.potential, performance: performance ?? talent.performance, label: nineBoxLabel(performance ?? talent.performance, talent.potential), note: talent.note, session: talent.session, at: talent.createdAt } : role === 'self' ? null : { potential: null, performance, label: null, note: null, session: null, at: null },
    };
  }

  async assess(personId: string, dto: z.infer<typeof assessDto>) {
    const me = principal();
    const role = await this.access(personId);
    if (dto.source === 'self' && role !== 'self') throw forbidden('L’autovalutazione la inserisce solo la persona');
    if (dto.source === 'manager' && role === 'self') throw forbidden('La valutazione del manager la inserisce il manager o l’HR');
    const known = new Set((await tx().select({ key: competencies.key }).from(competencies).where(eq(competencies.tenantId, me.tenantId))).map((c) => c.key));
    const bad = dto.items.filter((i) => !known.has(i.competencyKey));
    if (bad.length) throw unprocessable(ErrorCodes.VALIDATION, `Competenze sconosciute: ${bad.map((b) => b.competencyKey).join(', ')}`);
    const now = new Date();
    await tx().insert(competencyAssessments).values(dto.items.map((i) => ({ tenantId: me.tenantId, createdBy: me.userId, personId, competencyKey: i.competencyKey, source: dto.source, level: i.level, note: i.note ?? null, assessedByPersonId: me.personId ?? null, assessedAt: now })));
    await this.audit.log({ action: 'dev.assess', entityType: 'person', entityId: personId, after: { source: dto.source, items: dto.items.length } });
    return { saved: dto.items.length };
  }

  // ---------- piani di sviluppo (DEV-020…024) ----------

  private async latestPlan(personId: string) {
    const [plan] = await tx().select().from(developmentPlans).where(and(eq(developmentPlans.personId, personId), sql`${developmentPlans.status} <> 'archived'`)).orderBy(desc(developmentPlans.createdAt)).limit(1);
    if (!plan) return null;
    const actions = await tx().select().from(developmentActions).where(eq(developmentActions.planId, plan.id)).orderBy(developmentActions.status, developmentActions.dueDate, developmentActions.createdAt);
    return { ...plan, actions, progress: planProgress(actions) };
  }

  private async planRow(id: string) {
    const [plan] = await tx().select().from(developmentPlans).where(eq(developmentPlans.id, id));
    if (!plan) throw notFound('Piano di sviluppo', id);
    const role = await this.access(plan.personId);
    return { plan, role };
  }

  async createPlan(dto: z.infer<typeof createPlanDto>) {
    const me = principal();
    const personId = dto.personId ?? me.personId;
    if (!personId) throw forbidden('Serve una persona collegata all’utente');
    await this.access(personId);
    const open = await this.latestPlan(personId);
    if (open && open.status !== 'completed') throw conflict(ErrorCodes.CONFLICT, 'Esiste già un piano in corso: completalo o archivialo');
    const [row] = await tx().insert(developmentPlans).values({ tenantId: me.tenantId, createdBy: me.userId, personId, title: dto.title, periodStart: dto.periodStart ?? null, periodEnd: dto.periodEnd ?? null }).returning();
    await this.audit.log({ action: 'dev.plan_create', entityType: 'development_plan', entityId: row!.id, after: dto });
    return this.latestPlan(personId);
  }

  async updatePlan(id: string, dto: z.infer<typeof updatePlanDto>) {
    const me = principal();
    const { plan, role } = await this.planRow(id);
    const set: Partial<typeof developmentPlans.$inferInsert> = { title: dto.title, managerNote: dto.managerNote, periodStart: dto.periodStart, periodEnd: dto.periodEnd, updatedAt: new Date() };
    if (dto.status && dto.status !== plan.status) {
      const allowed: Record<string, string[]> = { draft: ['pending_approval', 'active', 'archived'], pending_approval: ['active', 'draft', 'archived'], active: ['completed', 'archived'], completed: ['archived'], archived: [] };
      if (!allowed[plan.status]?.includes(dto.status)) throw conflict(ErrorCodes.CONFLICT, `Transizione non ammessa: ${plan.status} → ${dto.status}`);
      if (dto.status === 'pending_approval') {
        set.submittedAt = new Date();
        const person = await this.person(plan.personId);
        const n = await tx().select({ n: sql<number>`count(*)::int` }).from(developmentActions).where(and(eq(developmentActions.planId, id), eq(developmentActions.status, 'open')));
        if (person.managerId) await this.notifier.send({ personId: person.managerId, type: 'dev.plan_submitted', data: { otherName: `${person.firstName} ${person.lastName}`, title: plan.title, actions: n[0]?.n ?? 0 }, link: `/development/people/${plan.personId}` });
      }
      if (dto.status === 'active' && plan.status === 'pending_approval') {
        if (role === 'self') throw forbidden('Il piano lo approva il manager o l’HR');
        set.approvedAt = new Date();
        set.approvedByPersonId = me.personId ?? null;
        await this.notifier.send({ personId: plan.personId, type: 'dev.plan_approved', data: { title: plan.title, note: dto.managerNote ?? null }, link: '/development' });
      }
      if (dto.status === 'active' && plan.status === 'draft' && role === 'self') set.approvedAt = null; // piano personale senza approvazione (DEV-024 opzionale)
      if (dto.status === 'completed') set.completedAt = new Date();
      set.status = dto.status;
    }
    await tx().update(developmentPlans).set(set).where(eq(developmentPlans.id, id));
    await this.audit.log({ action: 'dev.plan_update', entityType: 'development_plan', entityId: id, before: plan, after: dto });
    return this.latestPlan(plan.personId);
  }

  async addAction(planId: string, dto: z.infer<typeof createActionDto>) {
    const me = principal();
    const { plan } = await this.planRow(planId);
    if (plan.status === 'completed' || plan.status === 'archived') throw conflict(ErrorCodes.CONFLICT, 'Il piano è chiuso');
    const [row] = await tx().insert(developmentActions).values({ tenantId: me.tenantId, createdBy: me.userId, planId, personId: plan.personId, title: dto.title, description: dto.description ?? null, kind: dto.kind, competencyKey: dto.competencyKey ?? null, source: dto.source, dueDate: dto.dueDate ?? null, createdByPersonId: me.personId ?? null }).returning();
    await this.audit.log({ action: 'dev.action_create', entityType: 'development_action', entityId: row!.id, after: dto });
    return row!;
  }

  async updateAction(id: string, dto: z.infer<typeof updateActionDto>) {
    const [a] = await tx().select().from(developmentActions).where(eq(developmentActions.id, id));
    if (!a) throw notFound('Azione', id);
    await this.access(a.personId);
    const [row] = await tx().update(developmentActions).set({ ...dto, completedAt: dto.status === 'done' ? new Date() : dto.status === 'open' ? null : undefined, updatedAt: new Date() }).where(eq(developmentActions.id, id)).returning();
    await this.audit.log({ action: 'dev.action_update', entityType: 'development_action', entityId: id, before: a, after: dto });
    return row!;
  }

  /** Azioni aperte di una persona (per i suggerimenti del 1:1, DEV-023). */
  async openActionsFor(personId: string) {
    return tx().select().from(developmentActions).where(and(eq(developmentActions.personId, personId), eq(developmentActions.status, 'open'))).orderBy(developmentActions.dueDate);
  }

  // ---------- 9-box (DEV-032) ----------

  /** Fascia di performance dall'ultima review condivisa/firmata con rating, sulla scala del template. */
  private async performanceOf(personId: string): Promise<number | null> {
    const [r] = await tx()
      .select({ rating: reviews.finalRating, scale: reviewTemplates.ratingScale })
      .from(reviews)
      .innerJoin(reviewCycles, eq(reviews.cycleId, reviewCycles.id))
      .innerJoin(reviewTemplates, eq(reviewCycles.templateId, reviewTemplates.id))
      .where(and(eq(reviews.subjectPersonId, personId), inArray(reviews.status, ['shared', 'signed', 'closed']), sql`${reviews.finalRating} is not null`))
      .orderBy(desc(reviews.sharedAt), desc(reviews.updatedAt))
      .limit(1);
    if (!r) return null;
    const scale = r.scale as { min: number; max: number };
    return performanceBand(r.rating, scale);
  }

  async talentGrid() {
    const me = principal();
    const all = hasPermission(me, Permissions.DEV_MANAGE);
    if (!all && !hasPermission(me, Permissions.DEV_TEAM)) throw forbidden();
    const conds = [eq(persons.tenantId, me.tenantId), inArray(persons.status, ['active', 'leaving'])];
    if (!all) conds.push(eq(persons.managerId, me.personId ?? '00000000-0000-0000-0000-000000000000'));
    const people = await tx().select().from(persons).where(and(...conds)).orderBy(persons.lastName);
    const items = [];
    for (const p of people) {
      const [t] = await tx().select().from(talentAssessments).where(eq(talentAssessments.personId, p.id)).orderBy(desc(talentAssessments.createdAt)).limit(1);
      const performance = (await this.performanceOf(p.id)) ?? t?.performance ?? null;
      items.push({ person: lite(p), performance, potential: t?.potential ?? null, label: nineBoxLabel(performance, t?.potential ?? null), note: t?.note ?? null, session: t?.session ?? null, at: t?.createdAt ?? null });
    }
    const cells: Record<string, number> = {};
    for (const i of items) if (i.performance && i.potential) cells[`${i.performance}-${i.potential}`] = (cells[`${i.performance}-${i.potential}`] ?? 0) + 1;
    return { scope: all ? 'all' : 'team', items, cells, unplaced: items.filter((i) => !i.performance || !i.potential).length };
  }

  async setPotential(personId: string, dto: z.infer<typeof talentDto>) {
    const me = principal();
    const role = await this.access(personId);
    if (role === 'self') throw forbidden('Il potenziale lo valuta il manager o l’HR');
    const performance = await this.performanceOf(personId);
    const [row] = await tx().insert(talentAssessments).values({ tenantId: me.tenantId, createdBy: me.userId, personId, potential: dto.potential, performance, note: dto.note, session: dto.session ?? null, assessedByPersonId: me.personId ?? personId }).returning();
    await this.audit.log({ action: 'dev.talent_assess', entityType: 'person', entityId: personId, after: { potential: dto.potential, performance, session: dto.session ?? null } });
    return { ...row!, label: nineBoxLabel(performance, dto.potential) };
  }

  /** Persone del perimetro con stato del profilo/piano (vista manager e HR). */
  async people() {
    const me = principal();
    const all = hasPermission(me, Permissions.DEV_MANAGE);
    if (!all && !hasPermission(me, Permissions.DEV_TEAM)) throw forbidden();
    const conds = [eq(persons.tenantId, me.tenantId), inArray(persons.status, ['active', 'leaving'])];
    if (!all) conds.push(or(eq(persons.managerId, me.personId ?? ''), eq(persons.id, me.personId ?? ''))!);
    const rows = await tx().select().from(persons).where(and(...conds)).orderBy(persons.lastName, persons.firstName);
    const ids = rows.map((r) => r.id);
    const plans = ids.length ? await tx().select({ personId: developmentPlans.personId, status: developmentPlans.status }).from(developmentPlans).where(and(inArray(developmentPlans.personId, ids), sql`${developmentPlans.status} <> 'archived'`)) : [];
    const acts = ids.length ? await tx().select({ personId: developmentActions.personId, n: sql<number>`count(*)::int`, overdue: sql<number>`count(*) filter (where ${developmentActions.dueDate} < ${today()}::date)::int` }).from(developmentActions).where(and(inArray(developmentActions.personId, ids), eq(developmentActions.status, 'open'))).groupBy(developmentActions.personId) : [];
    const lastAssess = ids.length ? await tx().select({ personId: competencyAssessments.personId, source: competencyAssessments.source, at: sql<string>`max(${competencyAssessments.assessedAt})` }).from(competencyAssessments).where(inArray(competencyAssessments.personId, ids)).groupBy(competencyAssessments.personId, competencyAssessments.source) : [];
    const profiles = await tx().select({ id: jobProfiles.id, title: jobProfiles.title, level: jobProfiles.level }).from(jobProfiles).where(eq(jobProfiles.tenantId, me.tenantId));
    const profById = new Map(profiles.map((p) => [p.id, p]));
    return rows.map((p) => ({
      person: lite(p),
      profile: p.jobProfileId ? profById.get(p.jobProfileId) ?? null : null,
      plan: plans.find((x) => x.personId === p.id)?.status ?? null,
      openActions: acts.find((x) => x.personId === p.id)?.n ?? 0,
      overdueActions: acts.find((x) => x.personId === p.id)?.overdue ?? 0,
      lastSelf: lastAssess.find((x) => x.personId === p.id && x.source === 'self')?.at ?? null,
      lastManager: lastAssess.find((x) => x.personId === p.id && x.source === 'manager')?.at ?? null,
    }));
  }

}
