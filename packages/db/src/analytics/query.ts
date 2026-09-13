import { and, eq, gte, inArray, isNotNull, like, lte, sql, type SQL } from 'drizzle-orm';
import { DimensionLabels, evaluate, factsFor, type Dimension, type FactGroup, type FactKey, type MetricDef, type MetricRow } from '@wb/shared';
import { martPersonFacts, orgUnits, persons, reviewCycles } from '../schema/index.js';
import type { TenantTx } from '../tenant.js';

/**
 * Query engine del semantic layer (ADR-0006) come funzioni pure sul data mart, riusate da API e worker.
 * Il perimetro (`scope`) è deciso dal chiamante a partire dai ruoli dell'utente per cui si calcola il report.
 */
export type AnalyticsScope = { kind: 'all' } | { kind: 'team'; managerId: string };

export interface QueryFilters {
  orgUnitId?: string | null;
  managerId?: string | null;
  cycleId?: string | null;
}

export interface MetricQueryInput {
  tenantId: string;
  scope: AnalyticsScope;
  metrics: readonly MetricDef[];
  dimension?: Dimension | null;
  filters?: QueryFilters;
  /** Snapshot da usare (YYYY-MM-DD); se assente, l'ultimo disponibile fino a `upTo`. */
  snapshotDate?: string | null;
  upTo?: string | null;
}

export interface MetricQueryResult {
  snapshotDate: string | null;
  dimension: Dimension | null;
  dimensionLabel: string;
  rows: MetricRow[];
  total: MetricRow | null;
}

const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;
export const todayIso = () => new Date().toISOString().slice(0, 10);

export function scopeWhere(scope: AnalyticsScope): SQL[] {
  return scope.kind === 'team' ? [eq(martPersonFacts.managerId, scope.managerId)] : [];
}
export function filtersWhere(f: QueryFilters | undefined): SQL[] {
  const w: SQL[] = [];
  if (f?.orgUnitId) w.push(like(martPersonFacts.orgPath, `%/${f.orgUnitId}/%`));
  if (f?.managerId) w.push(eq(martPersonFacts.managerId, f.managerId));
  if (f?.cycleId) w.push(eq(martPersonFacts.cycleId, f.cycleId));
  return w;
}

/** Ultimo snapshot disponibile (fino a `upTo`, default oggi). */
export async function latestSnapshot(tx: TenantTx, tenantId: string, upTo?: string | null): Promise<string | null> {
  const [r] = await tx
    .select({ d: sql<string | null>`max(${martPersonFacts.snapshotDate})` })
    .from(martPersonFacts)
    .where(and(eq(martPersonFacts.tenantId, tenantId), lte(martPersonFacts.snapshotDate, upTo ?? todayIso())));
  return r?.d ?? null;
}

export async function dimensionLabels(tx: TenantTx, dimension: Dimension | null | undefined, keys: string[]): Promise<Map<string, string>> {
  const ids = keys.filter(Boolean);
  const out = new Map<string, string>();
  if (!dimension || !ids.length) return out;
  if (dimension === 'org_unit') for (const u of await tx.select({ id: orgUnits.id, name: orgUnits.name }).from(orgUnits).where(inArray(orgUnits.id, ids))) out.set(u.id, u.name);
  if (dimension === 'manager' || dimension === 'person') for (const p of await tx.select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName }).from(persons).where(inArray(persons.id, ids))) out.set(p.id, fullName(p));
  if (dimension === 'cycle') for (const c of await tx.select({ id: reviewCycles.id, name: reviewCycles.name }).from(reviewCycles).where(inArray(reviewCycles.id, ids))) out.set(c.id, c.name);
  return out;
}

/** Metriche × dimensione × filtri a uno snapshot, con soglie e protezione per differenza applicate da `evaluate`. */
export async function runMetricQuery(tx: TenantTx, q: MetricQueryInput): Promise<MetricQueryResult> {
  const dimension = q.dimension ?? null;
  const defs = q.metrics;
  const snapshotDate = q.snapshotDate ?? (await latestSnapshot(tx, q.tenantId, q.upTo));
  const meta = { snapshotDate, dimension, dimensionLabel: dimension ? DimensionLabels[dimension] : 'Totale' };
  if (!snapshotDate) return { ...meta, rows: [], total: null };

  // `headcount` è sempre incluso: definisce l'appartenenza al gruppo e il numero di persone anche quando gli altri fatti sono assenti (= 0).
  const byCycle = dimension === 'cycle' || !!q.filters?.cycleId;
  const facts = byCycle ? factsFor(defs) : [...new Set<FactKey>([...factsFor(defs), 'headcount'])];
  const where = and(eq(martPersonFacts.tenantId, q.tenantId), eq(martPersonFacts.snapshotDate, snapshotDate), inArray(martPersonFacts.factKey, facts), ...(dimension === 'cycle' ? [isNotNull(martPersonFacts.cycleId)] : []), ...scopeWhere(q.scope), ...filtersWhere(q.filters))!;
  const dimCol = dimension === 'org_unit' ? martPersonFacts.orgUnitId : dimension === 'manager' ? martPersonFacts.managerId : dimension === 'person' ? martPersonFacts.personId : dimension === 'cycle' ? martPersonFacts.cycleId : null;
  const keyExpr = dimCol ? sql<string | null>`${dimCol}::text` : sql<string | null>`'total'`;

  const sums = await tx
    .select({ key: keyExpr, fact: martPersonFacts.factKey, total: sql<number>`sum(${martPersonFacts.value})::float` })
    .from(martPersonFacts)
    .where(where)
    .groupBy(...(dimCol ? [dimCol, martPersonFacts.factKey] : [martPersonFacts.factKey]));
  const counts = await tx
    .select({ key: keyExpr, persons: sql<number>`count(distinct ${martPersonFacts.personId})::int` })
    .from(martPersonFacts)
    .where(where)
    .groupBy(...(dimCol ? [dimCol] : []));
  const [overall] = await tx.select({ persons: sql<number>`count(distinct ${martPersonFacts.personId})::int` }).from(martPersonFacts).where(where);

  const groups = new Map<string, FactGroup>();
  for (const c of counts) groups.set(c.key ?? '', { key: c.key ?? '', label: '', persons: c.persons, facts: {} });
  const totalGroup: FactGroup = { key: 'total', label: 'Totale', persons: overall?.persons ?? 0, facts: {} };
  for (const s of sums) {
    const g = groups.get(s.key ?? '');
    if (g) g.facts[s.fact as FactKey] = (g.facts[s.fact as FactKey] ?? 0) + s.total;
    totalGroup.facts[s.fact as FactKey] = (totalGroup.facts[s.fact as FactKey] ?? 0) + s.total;
  }
  const labels = await dimensionLabels(tx, dimension, [...groups.keys()]);
  for (const g of groups.values()) g.label = labels.get(g.key) ?? 'Non assegnato';
  const rows = evaluate(defs, [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, 'it')), { withTotal: !!dimension, personLevel: dimension === 'person' });
  const total = dimension ? evaluate(defs, [totalGroup])[0]! : (rows[0] ?? evaluate(defs, [totalGroup])[0]!);
  return { ...meta, rows: dimension ? rows : [], total };
}

/** Serie giornaliera di una metrica tra due date. */
export async function runTrend(tx: TenantTx, q: { tenantId: string; scope: AnalyticsScope; metric: MetricDef; from: string; to: string; filters?: QueryFilters }) {
  const facts = factsFor([q.metric]);
  const where = and(eq(martPersonFacts.tenantId, q.tenantId), gte(martPersonFacts.snapshotDate, q.from), lte(martPersonFacts.snapshotDate, q.to), inArray(martPersonFacts.factKey, facts), ...scopeWhere(q.scope), ...filtersWhere(q.filters))!;
  const sums = await tx
    .select({ date: martPersonFacts.snapshotDate, fact: martPersonFacts.factKey, total: sql<number>`sum(${martPersonFacts.value})::float`, persons: sql<number>`count(distinct ${martPersonFacts.personId})::int` })
    .from(martPersonFacts)
    .where(where)
    .groupBy(martPersonFacts.snapshotDate, martPersonFacts.factKey)
    .orderBy(martPersonFacts.snapshotDate);
  const byDate = new Map<string, FactGroup>();
  for (const s of sums) {
    const g = byDate.get(s.date) ?? { key: s.date, label: s.date, persons: 0, facts: {} };
    g.facts[s.fact as FactKey] = s.total;
    g.persons = Math.max(g.persons, s.persons);
    byDate.set(s.date, g);
  }
  const rows = evaluate([q.metric], [...byDate.values()]);
  return rows.map((r) => ({ date: r.key, value: r.cells[q.metric.key]!.value, size: r.cells[q.metric.key]!.size, suppressed: r.cells[q.metric.key]!.suppressed }));
}
