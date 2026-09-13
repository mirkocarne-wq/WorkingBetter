import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, like, or, sql, type SQL } from 'drizzle-orm';
import { orgUnits, persons, welfareBudgetSources, welfareCatalogItems, welfareCategories, welfareInitiatives, welfareMovements, welfarePayrollBatches, welfarePlans, welfareRequests, welfareThresholds } from '@wb/db';
import { ErrorCodes, WelfareCategoryPresets, thresholdPresetsFor } from '@wb/shared';
import type { z } from 'zod';
import { principal, tx } from '../common/context.js';
import { conflict, notFound, unprocessable } from '../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { toCsv } from '../analytics/csv.js';
import type { adjustDto, batchDto, catalogItemDto, categoryDto, createPlanDto, initiativeDto, populationDto, sourceDto, thresholdsPutDto, updatePlanDto } from './dto.js';

type PlanRow = typeof welfarePlans.$inferSelect;
const money = (n: number) => n.toFixed(2);

/** Amministrazione welfare (WEL-001/002/005/010/011/012/014/030/040/041). */
@Injectable()
export class WelfareAdminService {
  constructor(private readonly audit: AuditService, private readonly notifier: NotificationsService) {}

  // ---------- categorie e soglie ----------

  listCategories() {
    return tx().select().from(welfareCategories).orderBy(asc(welfareCategories.name));
  }
  async upsertCategory(dto: z.infer<typeof categoryDto>) {
    const p = principal();
    const [existing] = await tx().select().from(welfareCategories).where(eq(welfareCategories.key, dto.key));
    const values = { name: dto.name, description: dto.description ?? null, regime: dto.regime, beneficiaries: dto.beneficiaries, requiredDocs: dto.requiredDocs ?? null, note: dto.note ?? null, active: dto.active };
    const [row] = existing
      ? await tx().update(welfareCategories).set({ ...values, updatedAt: new Date() }).where(eq(welfareCategories.id, existing.id)).returning()
      : await tx().insert(welfareCategories).values({ tenantId: p.tenantId, createdBy: p.userId, key: dto.key, ...values }).returning();
    await this.audit.log({ action: existing ? 'welfare.category.update' : 'welfare.category.create', entityType: 'welfare_category', entityId: row!.id, before: existing, after: values });
    return row!;
  }
  /** Carica i preset (categorie + soglie dell'anno) senza sovrascrivere quanto già personalizzato. */
  async loadPresets(year: number) {
    const existing = new Set((await this.listCategories()).map((c) => c.key));
    let created = 0;
    for (const c of WelfareCategoryPresets) {
      if (existing.has(c.key)) continue;
      await this.upsertCategory({ key: c.key, name: c.name, description: c.description, regime: c.regime, beneficiaries: c.beneficiaries, requiredDocs: c.requiredDocs, note: c.note, active: true });
      created++;
    }
    const current = await tx().select().from(welfareThresholds).where(eq(welfareThresholds.year, year));
    let thresholds = 0;
    for (const t of thresholdPresetsFor(year)) {
      if (current.some((x) => x.categoryKey === t.categoryKey && (x.condition ?? null) === t.condition)) continue;
      await tx().insert(welfareThresholds).values({ tenantId: principal().tenantId, createdBy: principal().userId, year, categoryKey: t.categoryKey, condition: t.condition, amount: money(t.amount) });
      thresholds++;
    }
    await this.audit.log({ action: 'welfare.presets.load', entityType: 'welfare_threshold', after: { year, created, thresholds } });
    return { categoriesCreated: created, thresholdsCreated: thresholds, year };
  }
  async listThresholds(year: number) {
    return tx().select().from(welfareThresholds).where(eq(welfareThresholds.year, year)).orderBy(asc(welfareThresholds.categoryKey));
  }
  async putThresholds(dto: z.infer<typeof thresholdsPutDto>) {
    const p = principal();
    await tx().delete(welfareThresholds).where(eq(welfareThresholds.year, dto.year));
    for (const t of dto.items) await tx().insert(welfareThresholds).values({ tenantId: p.tenantId, createdBy: p.userId, year: dto.year, categoryKey: t.categoryKey, condition: t.condition, amount: money(t.amount) });
    await this.audit.log({ action: 'welfare.thresholds.put', entityType: 'welfare_threshold', after: dto });
    return this.listThresholds(dto.year);
  }

  // ---------- piani e fonti ----------

  async listPlans() {
    const rows = await tx().select().from(welfarePlans).orderBy(desc(welfarePlans.year), desc(welfarePlans.createdAt));
    return Promise.all(rows.map(async (pl) => ({ ...pl, stats: await this.planStats(pl.id) })));
  }
  async planRow(id: string): Promise<PlanRow> {
    const [pl] = await tx().select().from(welfarePlans).where(eq(welfarePlans.id, id));
    if (!pl) throw notFound('Piano welfare', id);
    return pl;
  }
  private async planStats(planId: string) {
    const [m] = await tx()
      .select({
        people: sql<number>`count(distinct ${welfareMovements.personId})::int`,
        credited: sql<number>`coalesce(sum(case when ${welfareMovements.kind} = 'credit' then ${welfareMovements.amount} else 0 end), 0)::float`,
        spent: sql<number>`coalesce(sum(case when ${welfareMovements.kind} = 'spend' then ${welfareMovements.amount} when ${welfareMovements.kind} = 'refund' then -${welfareMovements.amount} else 0 end), 0)::float`,
        reserved: sql<number>`coalesce(sum(case when ${welfareMovements.kind} = 'reserve' then ${welfareMovements.amount} when ${welfareMovements.kind} = 'release' then -${welfareMovements.amount} else 0 end), 0)::float`,
      })
      .from(welfareMovements)
      .where(eq(welfareMovements.planId, planId));
    const [r] = await tx().select({ requests: sql<number>`count(*)::int`, pending: sql<number>`count(*) filter (where ${welfareRequests.status} in ('submitted','in_review','needs_docs'))::int`, requesters: sql<number>`count(distinct ${welfareRequests.personId}) filter (where ${welfareRequests.status} <> 'cancelled')::int` }).from(welfareRequests).where(eq(welfareRequests.planId, planId));
    return { people: m?.people ?? 0, credited: m?.credited ?? 0, spent: m?.spent ?? 0, reserved: m?.reserved ?? 0, requests: r?.requests ?? 0, pending: r?.pending ?? 0, requesters: r?.requesters ?? 0 };
  }
  async getPlan(id: string) {
    const pl = await this.planRow(id);
    const sources = await tx().select().from(welfareBudgetSources).where(eq(welfareBudgetSources.planId, id)).orderBy(asc(welfareBudgetSources.creditAt));
    const pop = await this.resolvePopulation(pl.population as z.infer<typeof populationDto>);
    return { ...pl, sources, stats: await this.planStats(id), populationCount: pop.length };
  }
  async createPlan(dto: z.infer<typeof createPlanDto>) {
    const p = principal();
    if (dto.periodStart > dto.periodEnd) throw unprocessable(ErrorCodes.VALIDATION, 'Periodo non valido');
    const [row] = await tx().insert(welfarePlans).values({ tenantId: p.tenantId, createdBy: p.userId, ...dto, regulation: dto.regulation ?? null }).returning();
    await this.audit.log({ action: 'welfare.plan.create', entityType: 'welfare_plan', entityId: row!.id, after: { name: dto.name, year: dto.year } });
    return this.getPlan(row!.id);
  }
  async updatePlan(id: string, dto: z.infer<typeof updatePlanDto>) {
    const before = await this.planRow(id);
    if (before.status === 'closed') throw conflict(ErrorCodes.CONFLICT, 'Piano chiuso');
    const [row] = await tx().update(welfarePlans).set({ ...dto, updatedAt: new Date() }).where(eq(welfarePlans.id, id)).returning();
    await this.audit.log({ action: 'welfare.plan.update', entityType: 'welfare_plan', entityId: id, before: { name: before.name }, after: dto });
    return { ...row! };
  }
  async activatePlan(id: string) {
    const pl = await this.planRow(id);
    if (pl.status !== 'draft') throw conflict(ErrorCodes.CONFLICT, `Piano già ${pl.status}`);
    await tx().update(welfarePlans).set({ status: 'active', activatedAt: new Date(), updatedAt: new Date() }).where(eq(welfarePlans.id, id));
    await this.audit.log({ action: 'welfare.plan.activate', entityType: 'welfare_plan', entityId: id });
    const credited = await this.creditDueSources(id, new Date());
    return { ...(await this.getPlan(id)), credited };
  }
  async closePlan(id: string) {
    const pl = await this.planRow(id);
    if (pl.status !== 'active') throw conflict(ErrorCodes.CONFLICT, 'Il piano non è attivo');
    // scadenza del residuo secondo la regola di roll-over: il residuo non riportato viene "expire"
    const people = await tx().select({ personId: welfareMovements.personId, balance: sql<number>`sum(case when ${welfareMovements.kind} in ('credit','adjust','refund') then ${welfareMovements.amount} when ${welfareMovements.kind} in ('spend','expire') then -${welfareMovements.amount} else 0 end)::float` }).from(welfareMovements).where(eq(welfareMovements.planId, id)).groupBy(welfareMovements.personId);
    let expired = 0;
    for (const x of people) {
      const keep = pl.rolloverRule === 'total' ? x.balance : pl.rolloverRule === 'partial' ? (x.balance * pl.rolloverPercent) / 100 : 0;
      const lose = Math.max(0, x.balance - keep);
      if (lose > 0.004) {
        await tx().insert(welfareMovements).values({ tenantId: pl.tenantId, createdBy: principal().userId, planId: id, personId: x.personId, kind: 'expire', amount: money(lose), year: pl.year, note: `Chiusura piano (roll-over: ${pl.rolloverRule})` });
        expired += lose;
      }
    }
    await tx().update(welfarePlans).set({ status: 'closed', closedAt: new Date(), updatedAt: new Date() }).where(eq(welfarePlans.id, id));
    await this.audit.log({ action: 'welfare.plan.close', entityType: 'welfare_plan', entityId: id, after: { expired } });
    return this.getPlan(id);
  }
  async addSource(planId: string, dto: z.infer<typeof sourceDto>) {
    const pl = await this.planRow(planId);
    if (pl.status === 'closed') throw conflict(ErrorCodes.CONFLICT, 'Piano chiuso');
    const [row] = await tx().insert(welfareBudgetSources).values({ tenantId: pl.tenantId, createdBy: principal().userId, planId, name: dto.name, kind: dto.kind, amountPerPerson: money(dto.amountPerPerson), creditAt: dto.creditAt, expiresAt: dto.expiresAt ?? null }).returning();
    await this.audit.log({ action: 'welfare.source.create', entityType: 'welfare_source', entityId: row!.id, after: dto });
    if (pl.status === 'active') await this.creditDueSources(planId, new Date());
    return this.getPlan(planId);
  }
  /** Accredita le fonti con data di accredito raggiunta e non ancora erogate (WEL-002/006): chiamato all'attivazione, all'aggiunta e dal worker. */
  async creditDueSources(planId: string, now: Date) {
    const pl = await this.planRow(planId);
    if (pl.status !== 'active') return 0;
    const today = now.toISOString().slice(0, 10);
    const due = await tx().select().from(welfareBudgetSources).where(and(eq(welfareBudgetSources.planId, planId), isNull(welfareBudgetSources.creditedAt), sql`${welfareBudgetSources.creditAt} <= ${today}`));
    if (!due.length) return 0;
    const pop = await this.resolvePopulation(pl.population as z.infer<typeof populationDto>);
    let n = 0;
    for (const s of due) {
      if (s.kind === 'premium_conversion') continue; // accreditata dalla scelta del dipendente
      const amount = Number(s.amountPerPerson);
      for (const person of pop) {
        // pro-rata (WEL-006): ingressi dopo l'inizio del piano ricevono la quota dei mesi restanti
        let credit = amount;
        if (person.hireDate && person.hireDate > pl.periodStart) {
          const start = new Date(pl.periodStart).getTime();
          const end = new Date(pl.periodEnd).getTime();
          const hire = new Date(person.hireDate).getTime();
          credit = Math.round(amount * Math.max(0, (end - hire) / (end - start)) * 100) / 100;
        }
        if (credit <= 0) continue;
        await tx().insert(welfareMovements).values({ tenantId: pl.tenantId, createdBy: principal().userId, planId, personId: person.id, kind: 'credit', amount: money(credit), year: pl.year, sourceId: s.id, expiresAt: s.expiresAt ?? pl.periodEnd, note: s.name });
        await this.notifier.send({ personId: person.id, type: 'welfare.credited', data: { amount: credit.toLocaleString('it-IT', { minimumFractionDigits: 2 }), planName: pl.name, sourceName: s.name, expiresAt: s.expiresAt ?? pl.periodEnd }, link: '/welfare', dedupeKey: `welfare_credit:${s.id}:${person.id}` });
        n++;
      }
      await tx().update(welfareBudgetSources).set({ creditedAt: now, updatedAt: now }).where(eq(welfareBudgetSources.id, s.id));
    }
    await this.audit.log({ action: 'welfare.source.credit', entityType: 'welfare_plan', entityId: planId, after: { movements: n } });
    return n;
  }
  async adjust(dto: z.infer<typeof adjustDto>) {
    const pl = await this.planRow(dto.planId);
    const p = principal();
    const [row] = await tx().insert(welfareMovements).values({ tenantId: p.tenantId, createdBy: p.userId, planId: dto.planId, personId: dto.personId, kind: 'adjust', amount: money(dto.amount), year: pl.year, note: dto.note }).returning();
    await this.audit.log({ action: 'welfare.adjust', entityType: 'welfare_movement', entityId: row!.id, after: dto });
    return row!;
  }
  async resolvePopulation(pop: z.infer<typeof populationDto>) {
    const conds: SQL[] = [inArray(persons.status, ['active', 'invited', 'leaving'])];
    if (pop.orgUnitIds?.length) {
      const units = await tx().select({ path: orgUnits.path }).from(orgUnits).where(inArray(orgUnits.id, pop.orgUnitIds));
      const subtree = units.length ? await tx().select({ id: orgUnits.id }).from(orgUnits).where(or(...units.map((u) => like(orgUnits.path, `${u.path}%`)))!) : [];
      const ids = subtree.map((u) => u.id);
      const unitCond = inArray(persons.orgUnitId, ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
      conds.push(pop.personIds?.length ? or(unitCond, inArray(persons.id, pop.personIds))! : unitCond);
    } else if (pop.personIds?.length) conds.push(inArray(persons.id, pop.personIds));
    const rows = await tx().select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName, hireDate: persons.hireDate }).from(persons).where(and(...conds));
    const excluded = new Set(pop.excludePersonIds ?? []);
    return rows.filter((r) => !excluded.has(r.id));
  }

  // ---------- catalogo ----------

  listCatalog(planId?: string | null) {
    return tx().select().from(welfareCatalogItems).where(planId ? or(isNull(welfareCatalogItems.planId), eq(welfareCatalogItems.planId, planId))! : sql`true`).orderBy(asc(welfareCatalogItems.name));
  }
  async upsertCatalogItem(dto: z.infer<typeof catalogItemDto>, id?: string) {
    const p = principal();
    const values = { planId: dto.planId ?? null, name: dto.name, description: dto.description ?? null, categoryKey: dto.categoryKey, kind: dto.kind, price: dto.price == null ? null : money(dto.price), minAmount: dto.minAmount == null ? null : money(dto.minAmount), maxAmount: dto.maxAmount == null ? null : money(dto.maxAmount), instructions: dto.instructions ?? null, available: dto.available };
    const [row] = id
      ? await tx().update(welfareCatalogItems).set({ ...values, updatedAt: new Date() }).where(eq(welfareCatalogItems.id, id)).returning()
      : await tx().insert(welfareCatalogItems).values({ tenantId: p.tenantId, createdBy: p.userId, ...values }).returning();
    if (!row) throw notFound('Voce di catalogo', id);
    await this.audit.log({ action: id ? 'welfare.catalog.update' : 'welfare.catalog.create', entityType: 'welfare_catalog_item', entityId: row.id, after: values });
    return row;
  }

  // ---------- iniziative ----------

  listInitiatives() {
    return tx().select().from(welfareInitiatives).orderBy(asc(welfareInitiatives.name));
  }
  async upsertInitiative(dto: z.infer<typeof initiativeDto>, id?: string) {
    const p = principal();
    const values = { name: dto.name, description: dto.description ?? null, conditions: dto.conditions ?? null, howTo: dto.howTo ?? null, kind: dto.kind, capacity: dto.capacity ?? null, active: dto.active };
    const [row] = id ? await tx().update(welfareInitiatives).set({ ...values, updatedAt: new Date() }).where(eq(welfareInitiatives.id, id)).returning() : await tx().insert(welfareInitiatives).values({ tenantId: p.tenantId, createdBy: p.userId, ...values }).returning();
    if (!row) throw notFound('Iniziativa', id);
    await this.audit.log({ action: id ? 'welfare.initiative.update' : 'welfare.initiative.create', entityType: 'welfare_initiative', entityId: row.id, after: values });
    return row;
  }

  // ---------- payroll (WEL-040/041) ----------

  async payrollPreview() {
    const rows = await tx().select().from(welfareRequests).where(and(eq(welfareRequests.status, 'approved'), isNull(welfareRequests.payrollBatchId)));
    const toPay = rows.filter((r) => r.kind === 'reimbursement' || Number(r.taxablePortion) > 0);
    return { count: toPay.length, total: toPay.reduce((a, r) => a + (r.kind === 'reimbursement' ? Number(r.amount) : 0), 0), taxable: toPay.reduce((a, r) => a + Number(r.taxablePortion), 0) };
  }
  async createBatch(dto: z.infer<typeof batchDto>) {
    const p = principal();
    const rows = await tx().select().from(welfareRequests).where(and(eq(welfareRequests.status, 'approved'), isNull(welfareRequests.payrollBatchId)));
    const toPay = rows.filter((r) => r.kind === 'reimbursement' || Number(r.taxablePortion) > 0);
    if (!toPay.length) throw unprocessable(ErrorCodes.VALIDATION, 'Nessuna voce da inviare a payroll');
    const total = toPay.reduce((a, r) => a + (r.kind === 'reimbursement' ? Number(r.amount) : 0), 0);
    const [batch] = await tx().insert(welfarePayrollBatches).values({ tenantId: p.tenantId, createdBy: p.userId, period: dto.period, status: 'exported', itemsCount: toPay.length, totalAmount: money(total), exportedAt: new Date() }).returning();
    await tx().update(welfareRequests).set({ status: 'in_payroll', payrollBatchId: batch!.id, updatedAt: new Date() }).where(inArray(welfareRequests.id, toPay.map((r) => r.id)));
    await this.audit.log({ action: 'welfare.payroll.export', entityType: 'welfare_payroll_batch', entityId: batch!.id, after: { period: dto.period, items: toPay.length, total } });
    return batch!;
  }
  listBatches() {
    return tx().select().from(welfarePayrollBatches).orderBy(desc(welfarePayrollBatches.createdAt));
  }
  async batchCsv(batchId: string) {
    const [batch] = await tx().select().from(welfarePayrollBatches).where(eq(welfarePayrollBatches.id, batchId));
    if (!batch) throw notFound('Lotto payroll', batchId);
    const rows = await tx().select().from(welfareRequests).where(eq(welfareRequests.payrollBatchId, batchId));
    const people = rows.length ? await tx().select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName, employeeNumber: persons.employeeNumber }).from(persons).where(inArray(persons.id, [...new Set(rows.map((r) => r.personId))])) : [];
    const by = new Map(people.map((x) => [x.id, x]));
    const out = rows.flatMap((r) => {
      const pp = by.get(r.personId);
      const base = [pp?.employeeNumber ?? '', pp ? `${pp.lastName} ${pp.firstName}` : '', batch.period, r.categoryKey];
      const lines: (string | number | null)[][] = [];
      if (r.kind === 'reimbursement') lines.push([...base, 'RIMBORSO_WELFARE', Number(r.amount) - Number(r.taxablePortion), r.id]);
      if (Number(r.taxablePortion) > 0) lines.push([...base, 'ECCEDENZA_IMPONIBILE', Number(r.taxablePortion), r.id]);
      return lines;
    });
    await this.audit.log({ action: 'welfare.payroll.download', entityType: 'welfare_payroll_batch', entityId: batchId });
    return toCsv(['Matricola', 'Dipendente', 'Periodo', 'Categoria', 'Voce', 'Importo', 'Riferimento'], out);
  }
  async confirmBatch(batchId: string) {
    const [batch] = await tx().select().from(welfarePayrollBatches).where(eq(welfarePayrollBatches.id, batchId));
    if (!batch) throw notFound('Lotto payroll', batchId);
    if (batch.status === 'confirmed') throw conflict(ErrorCodes.CONFLICT, 'Lotto già confermato');
    await tx().update(welfareRequests).set({ status: 'paid', fulfilledAt: new Date(), updatedAt: new Date() }).where(and(eq(welfareRequests.payrollBatchId, batchId), eq(welfareRequests.status, 'in_payroll')));
    const [after] = await tx().update(welfarePayrollBatches).set({ status: 'confirmed', confirmedAt: new Date(), updatedAt: new Date() }).where(eq(welfarePayrollBatches.id, batchId)).returning();
    await this.audit.log({ action: 'welfare.payroll.confirm', entityType: 'welfare_payroll_batch', entityId: batchId });
    return after!;
  }
}
