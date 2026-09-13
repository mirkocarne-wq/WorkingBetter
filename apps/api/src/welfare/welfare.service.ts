import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { persons, users, welfareBudgetSources, welfareCatalogItems, welfareCategories, welfareDeclarations, welfareInitiativeMembers, welfareInitiatives, welfareMovements, welfarePlans, welfareRequests, welfareThresholds } from '@wb/db';
import { ErrorCodes, checkThreshold, computeBalance, simulatePremium, usedByCategory, type MovementLike } from '@wb/shared';
import type { z } from 'zod';
import { principal, tx } from '../common/context.js';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { WelfareAdminService } from './welfare-admin.service.js';
import type { createRequestDto, decideDto, declarationDto, premiumChoiceDto } from './dto.js';

interface PremiumConfig { enabled: boolean; amount: number; windowFrom?: string; windowTo?: string; allowedPercents: number[]; taxRate: number; employeeContributionRate: number; employerContributionRate: number }
const money = (n: number) => n.toFixed(2);
const eur = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const OPEN = ['submitted', 'in_review', 'needs_docs'] as const;

/** Esperienza dipendente e flusso richieste (WEL-003/007/020/021/022/024/026/030/050/051). */
@Injectable()
export class WelfareService {
  constructor(private readonly audit: AuditService, private readonly notifier: NotificationsService, private readonly admin: WelfareAdminService) {}

  private me(): string {
    const p = principal();
    if (!p.personId) throw forbidden('Nessuna persona collegata all’utente');
    return p.personId;
  }
  private async movementsOf(personId: string, planId?: string): Promise<(MovementLike & { id: string; createdAt: Date; note: string | null; planId: string; requestId: string | null })[]> {
    const rows = await tx().select().from(welfareMovements).where(planId ? and(eq(welfareMovements.personId, personId), eq(welfareMovements.planId, planId)) : eq(welfareMovements.personId, personId)).orderBy(desc(welfareMovements.createdAt));
    return rows.map((m) => ({ id: m.id, createdAt: m.createdAt, note: m.note, planId: m.planId, requestId: m.requestId, kind: m.kind, amount: Number(m.amount), categoryKey: m.categoryKey, year: m.year, expiresAt: m.expiresAt }));
  }
  private async thresholdFor(year: number, categoryKey: string, personId: string): Promise<number | null> {
    const rows = await tx().select().from(welfareThresholds).where(and(eq(welfareThresholds.year, year), eq(welfareThresholds.categoryKey, categoryKey)));
    if (!rows.length) return null;
    const [decl] = await tx().select().from(welfareDeclarations).where(and(eq(welfareDeclarations.personId, personId), eq(welfareDeclarations.year, year), eq(welfareDeclarations.key, 'children')));
    const variant = decl?.value ? rows.find((r) => r.condition === 'children') : undefined;
    const base = rows.find((r) => !r.condition);
    return Number((variant ?? base ?? rows[0])!.amount);
  }

  // ---------- "Il mio welfare" (WEL-050) ----------

  async myOverview() {
    const personId = this.me();
    const plans = await tx().select().from(welfarePlans).where(eq(welfarePlans.status, 'active')).orderBy(desc(welfarePlans.year));
    const inPlans: typeof plans = [];
    for (const pl of plans) if ((await this.admin.resolvePopulation(pl.population as { orgUnitIds?: string[]; personIds?: string[]; excludePersonIds?: string[] })).some((x) => x.id === personId)) inPlans.push(pl);
    const movements = await this.movementsOf(personId);
    const balance = computeBalance(movements);
    const soon = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);
    const expiring = movements.filter((m) => m.kind === 'credit' && m.expiresAt && m.expiresAt <= soon).reduce((a, m) => a + m.amount, 0);
    const requests = await tx().select().from(welfareRequests).where(eq(welfareRequests.personId, personId)).orderBy(desc(welfareRequests.createdAt));
    const categories = await tx().select().from(welfareCategories).where(eq(welfareCategories.active, true));
    const year = new Date().getFullYear();
    const used = usedByCategory(movements, year);
    const enabledKeys = new Set(inPlans.flatMap((pl) => pl.enabledCategories as string[]));
    const cats = await Promise.all(categories.filter((c) => enabledKeys.size === 0 || enabledKeys.has(c.key)).map(async (c) => ({ key: c.key, name: c.name, description: c.description, regime: c.regime, beneficiaries: c.beneficiaries, requiredDocs: c.requiredDocs, note: c.note, used: used[c.key] ?? 0, threshold: await this.thresholdFor(year, c.key, personId) })));
    const catalog = inPlans.length ? await tx().select().from(welfareCatalogItems).where(and(eq(welfareCatalogItems.available, true), or(isNull(welfareCatalogItems.planId), inArray(welfareCatalogItems.planId, inPlans.map((p) => p.id)))!)).orderBy(asc(welfareCatalogItems.name)) : [];
    const declarations = await tx().select().from(welfareDeclarations).where(and(eq(welfareDeclarations.personId, personId), eq(welfareDeclarations.year, year)));
    const initiatives = await tx().select().from(welfareInitiatives).where(eq(welfareInitiatives.active, true)).orderBy(asc(welfareInitiatives.name));
    const memberships = await tx().select({ initiativeId: welfareInitiativeMembers.initiativeId }).from(welfareInitiativeMembers).where(eq(welfareInitiativeMembers.personId, personId));
    const counts = initiatives.length ? await tx().select({ id: welfareInitiativeMembers.initiativeId, n: sql<number>`count(*)::int` }).from(welfareInitiativeMembers).where(inArray(welfareInitiativeMembers.initiativeId, initiatives.map((i) => i.id))).groupBy(welfareInitiativeMembers.initiativeId) : [];
    const premium = await Promise.all(inPlans.filter((pl) => (pl.premium as PremiumConfig).enabled).map(async (pl) => ({ planId: pl.id, planName: pl.name, ...(await this.premiumStatus(pl, personId)) })));
    return {
      plans: inPlans.map((pl) => ({ id: pl.id, name: pl.name, year: pl.year, periodStart: pl.periodStart, periodEnd: pl.periodEnd, regulation: pl.regulation, rolloverRule: pl.rolloverRule, rolloverPercent: pl.rolloverPercent })),
      balance,
      expiringSoon: Math.round(expiring * 100) / 100,
      movements: movements.slice(0, 50),
      requests,
      categories: cats.filter((c) => c.regime !== 'taxable' || true),
      catalog,
      declarations: declarations.map((d) => ({ key: d.key, value: d.value, year: d.year })),
      initiatives: initiatives.map((i) => ({ ...i, joined: memberships.some((m) => m.initiativeId === i.id), members: counts.find((c) => c.id === i.id)?.n ?? 0 })),
      premium,
      year,
    };
  }

  // ---------- richieste ----------

  async createRequest(dto: z.infer<typeof createRequestDto>) {
    const p = principal();
    const personId = this.me();
    const pl = await this.admin.planRow(dto.planId);
    if (pl.status !== 'active') throw conflict(ErrorCodes.CONFLICT, 'Il piano non è attivo');
    if (!(await this.admin.resolvePopulation(pl.population as { orgUnitIds?: string[] })).some((x) => x.id === personId)) throw forbidden('Non sei nella popolazione del piano');
    let item: typeof welfareCatalogItems.$inferSelect | undefined;
    if (dto.itemId) {
      [item] = await tx().select().from(welfareCatalogItems).where(eq(welfareCatalogItems.id, dto.itemId));
      if (!item || !item.available) throw notFound('Voce di catalogo', dto.itemId);
      if (item.price != null && Math.abs(Number(item.price) - dto.amount) > 0.004) throw unprocessable(ErrorCodes.VALIDATION, `L’importo della voce è fisso: ${eur(Number(item.price))} €`);
      if (item.minAmount != null && dto.amount < Number(item.minAmount)) throw unprocessable(ErrorCodes.VALIDATION, `Importo minimo ${eur(Number(item.minAmount))} €`);
      if (item.maxAmount != null && dto.amount > Number(item.maxAmount)) throw unprocessable(ErrorCodes.VALIDATION, `Importo massimo ${eur(Number(item.maxAmount))} €`);
    }
    const categoryKey = item?.categoryKey ?? dto.categoryKey;
    const kind = item?.kind ?? dto.kind ?? 'reimbursement';
    if (!categoryKey) throw unprocessable(ErrorCodes.VALIDATION, 'Indica una categoria');
    const enabled = pl.enabledCategories as string[];
    if (enabled.length && !enabled.includes(categoryKey)) throw unprocessable(ErrorCodes.VALIDATION, 'Categoria non abilitata nel piano');
    const [cat] = await tx().select().from(welfareCategories).where(and(eq(welfareCategories.key, categoryKey), eq(welfareCategories.active, true)));
    if (!cat) throw notFound('Categoria', categoryKey);
    if (!(cat.beneficiaries as string[]).includes(dto.beneficiary)) throw unprocessable(ErrorCodes.VALIDATION, 'Beneficiario non ammesso per questa categoria');
    if (kind === 'reimbursement' && !dto.attachmentName) throw unprocessable(ErrorCodes.VALIDATION, 'Il giustificativo è obbligatorio per i rimborsi');
    if (!dto.declarationAccepted) throw unprocessable(ErrorCodes.VALIDATION, 'Conferma la dichiarazione di veridicità');
    const movements = await this.movementsOf(personId, pl.id);
    const bal = computeBalance(movements);
    if (dto.amount > bal.available + 0.004) throw unprocessable(ErrorCodes.VALIDATION, `Disponibile insufficiente: ${eur(bal.available)} €`);
    const threshold = await this.thresholdFor(pl.year, categoryKey, personId);
    const used = usedByCategory(await this.movementsOf(personId), pl.year)[categoryKey] ?? 0;
    const check = checkThreshold(cat.regime as 'exempt' | 'threshold' | 'taxable', threshold, used, dto.amount);
    const [req] = await tx().insert(welfareRequests).values({ tenantId: p.tenantId, createdBy: p.userId, planId: pl.id, personId, itemId: item?.id ?? null, kind, categoryKey, amount: money(dto.amount), beneficiary: dto.beneficiary, beneficiaryName: dto.beneficiaryName ?? null, expenseDate: dto.expenseDate ?? null, attachmentName: dto.attachmentName ?? null, declarationAccepted: true, note: dto.note ?? null, taxablePortion: money(check.taxablePortion) }).returning();
    await tx().insert(welfareMovements).values({ tenantId: p.tenantId, createdBy: p.userId, planId: pl.id, personId, kind: 'reserve', amount: money(dto.amount), year: pl.year, categoryKey, requestId: req!.id, note: `Richiesta ${kind}` });
    if (check.nearThreshold) await this.notifier.send({ personId, type: 'welfare.threshold_near', data: { categoryName: cat.name, cumulative: eur(check.cumulative), threshold: eur(threshold ?? 0) }, link: '/welfare', dedupeKey: `welfare_thr:${personId}:${categoryKey}:${pl.year}` });
    // avvisa gli approvatori (utenti con welfare:manage) senza dettagli sensibili
    const [me] = await tx().select({ firstName: persons.firstName, lastName: persons.lastName }).from(persons).where(eq(persons.id, personId));
    const approvers = await tx().select({ userId: users.id }).from(users).where(sql`${users.id} in (select user_id from role_assignments where role in ('hr_admin','tenant_admin'))`);
    for (const a of approvers) await this.notifier.send({ userId: a.userId, type: 'welfare.request_submitted', data: { personName: me ? `${me.firstName} ${me.lastName}` : '', categoryName: cat.name, amount: eur(dto.amount) }, link: '/welfare/admin?tab=requests', dedupeKey: `welfare_req:${req!.id}:${a.userId}` });
    await this.audit.log({ action: 'welfare.request.create', entityType: 'welfare_request', entityId: req!.id, after: { categoryKey, kind, amount: dto.amount, taxablePortion: check.taxablePortion } });
    return { ...req!, thresholdCheck: check };
  }

  async cancelRequest(id: string) {
    const personId = this.me();
    const [req] = await tx().select().from(welfareRequests).where(and(eq(welfareRequests.id, id), eq(welfareRequests.personId, personId)));
    if (!req) throw notFound('Richiesta', id);
    if (!OPEN.includes(req.status as (typeof OPEN)[number])) throw conflict(ErrorCodes.CONFLICT, 'La richiesta non è più annullabile');
    await tx().update(welfareRequests).set({ status: 'cancelled', decidedAt: new Date(), updatedAt: new Date() }).where(eq(welfareRequests.id, id));
    await tx().insert(welfareMovements).values({ tenantId: req.tenantId, createdBy: principal().userId, planId: req.planId, personId, kind: 'release', amount: req.amount, year: (await this.admin.planRow(req.planId)).year, categoryKey: req.categoryKey, requestId: id, note: 'Annullata dal dipendente' });
    await this.audit.log({ action: 'welfare.request.cancel', entityType: 'welfare_request', entityId: id });
    return { id, status: 'cancelled' };
  }

  /** Coda approvatori (WEL-021): dettagli visibili solo a chi verifica. */
  async listRequests(q: { status?: string; planId?: string }) {
    const conds = [q.status ? (q.status === 'open' ? inArray(welfareRequests.status, [...OPEN]) : eq(welfareRequests.status, q.status as 'approved')) : sql`true`, q.planId ? eq(welfareRequests.planId, q.planId) : sql`true`];
    const rows = await tx().select().from(welfareRequests).where(and(...conds)).orderBy(asc(welfareRequests.createdAt));
    const ids = [...new Set(rows.map((r) => r.personId))];
    const people = ids.length ? await tx().select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName }).from(persons).where(inArray(persons.id, ids)) : [];
    const cats = await tx().select({ key: welfareCategories.key, name: welfareCategories.name }).from(welfareCategories);
    return rows.map((r) => ({ ...r, person: people.find((x) => x.id === r.personId) ?? null, categoryName: cats.find((c) => c.key === r.categoryKey)?.name ?? r.categoryKey }));
  }

  async decide(id: string, dto: z.infer<typeof decideDto>) {
    const p = principal();
    const [req] = await tx().select().from(welfareRequests).where(eq(welfareRequests.id, id));
    if (!req) throw notFound('Richiesta', id);
    if (!OPEN.includes(req.status as (typeof OPEN)[number])) throw conflict(ErrorCodes.CONFLICT, `Richiesta già ${req.status}`);
    const pl = await this.admin.planRow(req.planId);
    const [cat] = await tx().select().from(welfareCategories).where(eq(welfareCategories.key, req.categoryKey));
    const now = new Date();
    if (dto.decision === 'needs_docs') {
      await tx().update(welfareRequests).set({ status: 'needs_docs', reviewerUserId: p.userId, reviewNote: dto.note ?? null, updatedAt: now }).where(eq(welfareRequests.id, id));
      await this.notifier.send({ personId: req.personId, type: 'welfare.request_decided', data: { outcome: 'in attesa di integrazione', categoryName: cat?.name ?? req.categoryKey, amount: eur(Number(req.amount)), note: dto.note }, link: '/welfare' });
    } else if (dto.decision === 'reject') {
      await tx().update(welfareRequests).set({ status: 'rejected', reviewerUserId: p.userId, reviewNote: dto.note ?? null, decidedAt: now, updatedAt: now }).where(eq(welfareRequests.id, id));
      await tx().insert(welfareMovements).values({ tenantId: req.tenantId, createdBy: p.userId, planId: req.planId, personId: req.personId, kind: 'release', amount: req.amount, year: pl.year, categoryKey: req.categoryKey, requestId: id, note: 'Richiesta rifiutata' });
      await this.notifier.send({ personId: req.personId, type: 'welfare.request_decided', data: { outcome: 'rifiutata', categoryName: cat?.name ?? req.categoryKey, amount: eur(Number(req.amount)), note: dto.note }, link: '/welfare' });
    } else {
      const status = req.kind === 'reimbursement' || Number(req.taxablePortion) > 0 ? 'approved' : 'fulfilled';
      await tx().update(welfareRequests).set({ status, reviewerUserId: p.userId, reviewNote: dto.note ?? null, decidedAt: now, voucherCode: dto.voucherCode ?? (req.kind === 'voucher' ? `WB-${id.slice(0, 8).toUpperCase()}` : null), fulfilledAt: status === 'fulfilled' ? now : null, updatedAt: now }).where(eq(welfareRequests.id, id));
      await tx().insert(welfareMovements).values([
        { tenantId: req.tenantId, createdBy: p.userId, planId: req.planId, personId: req.personId, kind: 'release', amount: req.amount, year: pl.year, categoryKey: req.categoryKey, requestId: id, note: 'Approvata' },
        { tenantId: req.tenantId, createdBy: p.userId, planId: req.planId, personId: req.personId, kind: 'spend', amount: req.amount, year: pl.year, categoryKey: req.categoryKey, requestId: id, note: `${req.kind} · ${cat?.name ?? req.categoryKey}` },
      ]);
      await this.notifier.send({ personId: req.personId, type: 'welfare.request_decided', data: { outcome: status === 'fulfilled' ? 'approvata ed evasa' : 'approvata', categoryName: cat?.name ?? req.categoryKey, amount: eur(Number(req.amount)), note: dto.note }, link: '/welfare' });
    }
    await this.audit.log({ action: `welfare.request.${dto.decision}`, entityType: 'welfare_request', entityId: id, after: { note: dto.note ?? null } });
    const [after] = await tx().select().from(welfareRequests).where(eq(welfareRequests.id, id));
    return after!;
  }

  // ---------- dichiarazioni, iniziative, premio ----------

  async declare(dto: z.infer<typeof declarationDto>) {
    const p = principal();
    const personId = this.me();
    const [row] = await tx().insert(welfareDeclarations).values({ tenantId: p.tenantId, createdBy: p.userId, personId, year: dto.year, key: dto.key, value: dto.value, declaredAt: new Date() }).onConflictDoUpdate({ target: [welfareDeclarations.tenantId, welfareDeclarations.personId, welfareDeclarations.year, welfareDeclarations.key], set: { value: dto.value, declaredAt: new Date(), updatedAt: new Date() } }).returning();
    await this.audit.log({ action: 'welfare.declaration', entityType: 'welfare_declaration', entityId: row!.id, after: dto });
    return row!;
  }
  async joinInitiative(id: string, join: boolean) {
    const p = principal();
    const personId = this.me();
    const [ini] = await tx().select().from(welfareInitiatives).where(and(eq(welfareInitiatives.id, id), eq(welfareInitiatives.active, true)));
    if (!ini) throw notFound('Iniziativa', id);
    if (join) {
      if (ini.capacity != null) {
        const [c] = await tx().select({ n: sql<number>`count(*)::int` }).from(welfareInitiativeMembers).where(eq(welfareInitiativeMembers.initiativeId, id));
        if ((c?.n ?? 0) >= ini.capacity) throw conflict(ErrorCodes.CONFLICT, 'Posti esauriti');
      }
      await tx().insert(welfareInitiativeMembers).values({ tenantId: p.tenantId, createdBy: p.userId, initiativeId: id, personId }).onConflictDoNothing();
    } else await tx().delete(welfareInitiativeMembers).where(and(eq(welfareInitiativeMembers.initiativeId, id), eq(welfareInitiativeMembers.personId, personId)));
    return { id, joined: join };
  }
  private async premiumStatus(pl: typeof welfarePlans.$inferSelect, personId: string) {
    const cfg = pl.premium as PremiumConfig;
    const today = new Date().toISOString().slice(0, 10);
    const [choice] = await tx().select().from(welfareMovements).where(and(eq(welfareMovements.planId, pl.id), eq(welfareMovements.personId, personId), eq(welfareMovements.kind, 'credit'), sql`${welfareMovements.note} like 'Conversione premio%'`));
    const windowOpen = (!cfg.windowFrom || cfg.windowFrom <= today) && (!cfg.windowTo || cfg.windowTo >= today);
    return { amount: cfg.amount, windowFrom: cfg.windowFrom ?? null, windowTo: cfg.windowTo ?? null, allowedPercents: cfg.allowedPercents, windowOpen, chosen: choice ? { amount: Number(choice.amount), at: choice.createdAt } : null, params: { taxRate: cfg.taxRate, employeeContributionRate: cfg.employeeContributionRate, employerContributionRate: cfg.employerContributionRate } };
  }
  async simulate(planId: string, percent: number) {
    const pl = await this.admin.planRow(planId);
    const cfg = pl.premium as PremiumConfig;
    if (!cfg.enabled) throw unprocessable(ErrorCodes.VALIDATION, 'Conversione del premio non prevista dal piano');
    return { percent, ...simulatePremium(cfg.amount, percent, cfg), disclaimer: 'Stima indicativa con i parametri configurati dall’azienda: non sostituisce il cedolino.' };
  }
  /** Scelta di conversione (WEL-003): una sola volta, dentro la finestra, con presa visione del regolamento; accredita subito. */
  async choosePremium(dto: z.infer<typeof premiumChoiceDto>) {
    const p = principal();
    const personId = this.me();
    const pl = await this.admin.planRow(dto.planId);
    const cfg = pl.premium as PremiumConfig;
    if (!cfg.enabled || pl.status !== 'active') throw unprocessable(ErrorCodes.VALIDATION, 'Conversione del premio non disponibile');
    const st = await this.premiumStatus(pl, personId);
    if (!st.windowOpen) throw conflict(ErrorCodes.CONFLICT, 'Finestra di scelta chiusa');
    if (st.chosen) throw conflict(ErrorCodes.CONFLICT, 'Scelta già registrata: è irrevocabile');
    if (!cfg.allowedPercents.includes(dto.percent)) throw unprocessable(ErrorCodes.VALIDATION, `Percentuali ammesse: ${cfg.allowedPercents.join(', ')}`);
    const amount = Math.round(((cfg.amount * dto.percent) / 100) * 100) / 100;
    let [source] = await tx().select().from(welfareBudgetSources).where(and(eq(welfareBudgetSources.planId, pl.id), eq(welfareBudgetSources.kind, 'premium_conversion')));
    if (!source) [source] = await tx().insert(welfareBudgetSources).values({ tenantId: p.tenantId, createdBy: p.userId, planId: pl.id, name: 'Conversione premio di risultato', kind: 'premium_conversion', amountPerPerson: '0', creditAt: pl.periodStart, expiresAt: pl.periodEnd, creditedAt: new Date() }).returning();
    if (amount > 0) {
      await tx().insert(welfareMovements).values({ tenantId: p.tenantId, createdBy: p.userId, planId: pl.id, personId, kind: 'credit', amount: money(amount), year: pl.year, sourceId: source!.id, expiresAt: pl.periodEnd, note: `Conversione premio ${dto.percent}%` });
      await this.notifier.send({ personId, type: 'welfare.credited', data: { amount: eur(amount), planName: pl.name, sourceName: `Conversione premio ${dto.percent}%`, expiresAt: pl.periodEnd }, link: '/welfare' });
    } else await tx().insert(welfareMovements).values({ tenantId: p.tenantId, createdBy: p.userId, planId: pl.id, personId, kind: 'credit', amount: '0.00', year: pl.year, sourceId: source!.id, note: 'Conversione premio 0% (scelta: tutto in busta paga)' });
    await this.audit.log({ action: 'welfare.premium.choice', entityType: 'welfare_plan', entityId: pl.id, after: { percent: dto.percent, amount, regulationAccepted: true } });
    return { percent: dto.percent, amount };
  }
}
