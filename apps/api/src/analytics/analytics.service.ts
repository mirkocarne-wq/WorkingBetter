import { Injectable, OnModuleInit } from '@nestjs/common';
import { and, desc, eq, gte, inArray, isNotNull, like, lte, sql, type SQL } from 'drizzle-orm';
import { martPersonFacts, orgUnits, persons, refreshMartForTenant, reviewCycles, reviews } from '@wb/db';
import {
  DimensionLabels,
  ErrorCodes,
  MetricCatalog,
  Permissions,
  evaluate,
  factsFor,
  formatMetricValue,
  getMetric,
  hasPermission,
  validateCatalog,
  type Dimension,
  type FactGroup,
  type FactKey,
  type MetricDef,
  type MetricRow,
} from '@wb/shared';
import { principal, tx } from '../common/context.js';
import { forbidden, notFound, unprocessable } from '../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import { toCsv } from './csv.js';
import type { Filters, QueryDto, TrendDto } from './dto.js';

type Scope = { kind: 'all' } | { kind: 'team'; managerId: string };

/** Fatti "cose da sistemare" mostrati come alert (ANA-003): chiave → etichetta. */
const ALERT_FACTS: Array<{ fact: FactKey; label: string; hrOnly?: boolean }> = [
  { fact: 'no_objectives', label: 'Senza obiettivi nel periodo' },
  { fact: 'no_one_on_one_30d', label: 'Nessun 1:1 con il manager negli ultimi 30 giorni' },
  { fact: 'reviews_overdue', label: 'Review con fase scaduta' },
  { fact: 'krs_stale', label: 'Key result senza check-in oltre la cadenza' },
  { fact: 'actions_overdue', label: 'Action item scaduti' },
  { fact: 'form_responses_overdue', label: 'Compilazioni in ritardo' },
  { fact: 'no_manager', label: 'Senza manager assegnato', hrOnly: true },
];

const strip = (m: MetricDef) => ({ key: m.key, name: m.name, description: m.description, formula: m.formula, module: m.module, format: m.format, dimensions: m.dimensions, sensitive: m.sensitive, minGroupSize: m.minGroupSize, teamVisible: m.teamVisible });
const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Query engine v1 (ADR-0006): perimetro, aggregazione dei fatti, soglie, export con audit.
 * Il client non riceve mai valori sotto soglia né fatti a grana persona fuori perimetro.
 */
@Injectable()
export class AnalyticsService implements OnModuleInit {
  constructor(private readonly audit: AuditService) {}

  onModuleInit() {
    const errors = validateCatalog();
    if (errors.length) throw new Error(`Catalogo metriche non valido: ${errors.join('; ')}`);
  }

  // ---------- perimetro ----------

  private scope(): Scope {
    const p = principal();
    if (hasPermission(p.roles, Permissions.ANALYTICS_QUERY)) return { kind: 'all' };
    if (hasPermission(p.roles, Permissions.ANALYTICS_QUERY_TEAM) && p.personId) return { kind: 'team', managerId: p.personId };
    throw forbidden('Nessun perimetro di analisi per questo utente');
  }
  private scopeWhere(scope: Scope): SQL[] {
    return scope.kind === 'team' ? [eq(martPersonFacts.managerId, scope.managerId)] : [];
  }
  private filtersWhere(f: Filters): SQL[] {
    const w: SQL[] = [];
    if (f.orgUnitId) w.push(like(martPersonFacts.orgPath, `%/${f.orgUnitId}/%`));
    if (f.managerId) w.push(eq(martPersonFacts.managerId, f.managerId));
    if (f.cycleId) w.push(eq(martPersonFacts.cycleId, f.cycleId));
    return w;
  }
  private resolveMetrics(keys: string[], scope: Scope, dimension?: Dimension): MetricDef[] {
    const defs = keys.map((k) => {
      const m = getMetric(k);
      if (!m) throw unprocessable(ErrorCodes.VALIDATION, `Metrica sconosciuta: ${k}`);
      return m;
    });
    if (scope.kind === 'team') {
      const hidden = defs.filter((m) => !m.teamVisible);
      if (hidden.length) throw forbidden(`Metriche non disponibili per il perimetro team: ${hidden.map((m) => m.key).join(', ')}`);
    }
    if (dimension) {
      const bad = defs.filter((m) => !m.dimensions.includes(dimension));
      if (bad.length) throw unprocessable(ErrorCodes.VALIDATION, `Dimensione "${DimensionLabels[dimension]}" non ammessa per: ${bad.map((m) => m.key).join(', ')}`);
    }
    return defs;
  }

  // ---------- catalogo (data dictionary, ANA-043) ----------

  catalog() {
    const scope = this.scope();
    return MetricCatalog.filter((m) => scope.kind === 'all' || m.teamVisible).map(strip);
  }

  // ---------- snapshot ----------

  async latestSnapshot(upTo?: string): Promise<string | null> {
    const p = principal();
    const [r] = await tx()
      .select({ d: sql<string | null>`max(${martPersonFacts.snapshotDate})` })
      .from(martPersonFacts)
      .where(and(eq(martPersonFacts.tenantId, p.tenantId), lte(martPersonFacts.snapshotDate, upTo ?? today())));
    return r?.d ?? null;
  }

  async refresh() {
    const p = principal();
    if (!hasPermission(p.roles, Permissions.ANALYTICS_QUERY)) throw forbidden();
    const res = await refreshMartForTenant(tx(), p.tenantId, new Date());
    await this.audit.log({ action: 'analytics.refresh', entityType: 'mart_snapshot', after: res });
    return res;
  }

  // ---------- query ----------

  async query(q: QueryDto) {
    const scope = this.scope();
    const dimension = q.dimension;
    const defs = this.resolveMetrics(q.metrics, scope, dimension);
    if (dimension === 'person' && defs.some((m) => m.sensitive)) throw forbidden('Le metriche sensibili non sono disponibili a livello persona');
    const snapshotDate = await this.latestSnapshot(q.date);
    const meta = { snapshotDate, dimension: dimension ?? null, dimensionLabel: dimension ? DimensionLabels[dimension] : 'Totale', metrics: defs.map(strip), filters: { orgUnitId: q.orgUnitId ?? null, managerId: q.managerId ?? null, cycleId: q.cycleId ?? null } };
    if (!snapshotDate) return { ...meta, rows: [] as MetricRow[], total: null as MetricRow | null };

    // `headcount` è sempre incluso: definisce l'appartenenza al gruppo e il numero di persone anche quando gli altri fatti sono assenti (= 0).
    const byCycle = dimension === 'cycle' || !!q.cycleId;
    const facts = byCycle ? factsFor(defs) : [...new Set<FactKey>([...factsFor(defs), 'headcount'])];
    const where = and(eq(martPersonFacts.tenantId, principal().tenantId), eq(martPersonFacts.snapshotDate, snapshotDate), inArray(martPersonFacts.factKey, facts), ...(dimension === 'cycle' ? [isNotNull(martPersonFacts.cycleId)] : []), ...this.scopeWhere(scope), ...this.filtersWhere(q))!;
    const dimCol = dimension === 'org_unit' ? martPersonFacts.orgUnitId : dimension === 'manager' ? martPersonFacts.managerId : dimension === 'person' ? martPersonFacts.personId : dimension === 'cycle' ? martPersonFacts.cycleId : null;
    const keyExpr = dimCol ? sql<string | null>`${dimCol}::text` : sql<string | null>`'total'`;

    const sums = await tx()
      .select({ key: keyExpr, fact: martPersonFacts.factKey, total: sql<number>`sum(${martPersonFacts.value})::float` })
      .from(martPersonFacts)
      .where(where)
      .groupBy(...(dimCol ? [dimCol, martPersonFacts.factKey] : [martPersonFacts.factKey]));
    const counts = await tx()
      .select({ key: keyExpr, persons: sql<number>`count(distinct ${martPersonFacts.personId})::int` })
      .from(martPersonFacts)
      .where(where)
      .groupBy(...(dimCol ? [dimCol] : []));
    const [overall] = await tx().select({ persons: sql<number>`count(distinct ${martPersonFacts.personId})::int` }).from(martPersonFacts).where(where);

    const groups = new Map<string, FactGroup>();
    for (const c of counts) groups.set(c.key ?? '', { key: c.key ?? '', label: '', persons: c.persons, facts: {} });
    const totalGroup: FactGroup = { key: 'total', label: 'Totale', persons: overall?.persons ?? 0, facts: {} };
    for (const s of sums) {
      const g = groups.get(s.key ?? '');
      if (g) g.facts[s.fact as FactKey] = (g.facts[s.fact as FactKey] ?? 0) + s.total;
      totalGroup.facts[s.fact as FactKey] = (totalGroup.facts[s.fact as FactKey] ?? 0) + s.total;
    }
    const labels = await this.labelsFor(dimension, [...groups.keys()]);
    for (const g of groups.values()) g.label = labels.get(g.key) ?? (g.key ? 'Non assegnato' : 'Non assegnato');
    const rows = evaluate(defs, [...groups.values()].sort((a, b) => a.label.localeCompare(b.label, 'it')), { withTotal: !!dimension, personLevel: dimension === 'person' });
    const total = dimension ? evaluate(defs, [totalGroup])[0]! : rows[0] ?? evaluate(defs, [totalGroup])[0]!;
    return { ...meta, rows: dimension ? rows : [], total };
  }

  async queryCsv(q: QueryDto) {
    const r = await this.query(q);
    const header = [r.dimensionLabel, 'Persone', ...r.metrics.map((m) => m.name)];
    const line = (row: MetricRow) => [row.label, row.persons, ...r.metrics.map((m) => (row.cells[m.key]?.suppressed ? `n<${m.minGroupSize}` : formatMetricValue(getMetric(m.key)!, row.cells[m.key]?.value ?? null)))];
    const rows = [...r.rows.map(line), ...(r.total ? [line({ ...r.total, label: 'Totale' })] : [])];
    await this.audit.log({ action: 'analytics.export', entityType: 'report', after: { report: 'query', metrics: q.metrics, dimension: q.dimension ?? null, filters: r.filters, snapshotDate: r.snapshotDate } });
    return toCsv(header, rows);
  }

  private async labelsFor(dimension: Dimension | undefined, keys: string[]): Promise<Map<string, string>> {
    const ids = keys.filter(Boolean);
    const out = new Map<string, string>();
    if (!dimension || !ids.length) return out;
    if (dimension === 'org_unit') for (const u of await tx().select({ id: orgUnits.id, name: orgUnits.name }).from(orgUnits).where(inArray(orgUnits.id, ids))) out.set(u.id, u.name);
    if (dimension === 'manager' || dimension === 'person') for (const p of await tx().select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName }).from(persons).where(inArray(persons.id, ids))) out.set(p.id, fullName(p));
    if (dimension === 'cycle') for (const c of await tx().select({ id: reviewCycles.id, name: reviewCycles.name }).from(reviewCycles).where(inArray(reviewCycles.id, ids))) out.set(c.id, c.name);
    return out;
  }

  // ---------- trend ----------

  async trend(q: TrendDto) {
    const scope = this.scope();
    const [def] = this.resolveMetrics([q.metric], scope);
    const to = q.to ?? today();
    const from = new Date(new Date(to).getTime() - (q.days - 1) * 86400000).toISOString().slice(0, 10);
    const facts = factsFor([def!]);
    const where = and(eq(martPersonFacts.tenantId, principal().tenantId), gte(martPersonFacts.snapshotDate, from), lte(martPersonFacts.snapshotDate, to), inArray(martPersonFacts.factKey, facts), ...this.scopeWhere(scope), ...this.filtersWhere(q))!;
    const sums = await tx()
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
    const rows = evaluate([def!], [...byDate.values()]);
    return { metric: strip(def!), from, to, points: rows.map((r) => ({ date: r.key, value: r.cells[def!.key]!.value, size: r.cells[def!.key]!.size, suppressed: r.cells[def!.key]!.suppressed })) };
  }

  // ---------- alert (ANA-003) ----------

  async alerts() {
    const scope = this.scope();
    const snapshotDate = await this.latestSnapshot();
    const defs = ALERT_FACTS.filter((a) => scope.kind === 'all' || !a.hrOnly);
    if (!snapshotDate) return { snapshotDate: null, alerts: defs.map((a) => ({ key: a.fact, label: a.label, count: 0, people: [] })) };
    const rows = await tx()
      .select({ personId: martPersonFacts.personId, managerId: martPersonFacts.managerId, fact: martPersonFacts.factKey, value: sql<number>`sum(${martPersonFacts.value})::float` })
      .from(martPersonFacts)
      .where(and(eq(martPersonFacts.tenantId, principal().tenantId), eq(martPersonFacts.snapshotDate, snapshotDate), inArray(martPersonFacts.factKey, defs.map((d) => d.fact)), sql`${martPersonFacts.value} > 0`, ...this.scopeWhere(scope)))
      .groupBy(martPersonFacts.personId, martPersonFacts.managerId, martPersonFacts.factKey);
    const ids = [...new Set(rows.flatMap((r) => [r.personId, r.managerId ?? '']).filter(Boolean))];
    const people = ids.length ? await tx().select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName, jobTitle: persons.jobTitle }).from(persons).where(inArray(persons.id, ids)) : [];
    const byId = new Map(people.map((p) => [p.id, p]));
    const alerts = defs.map((a) => {
      const mine = rows.filter((r) => r.fact === a.fact);
      return {
        key: a.fact,
        label: a.label,
        count: mine.length,
        people: mine
          .map((r) => ({ personId: r.personId, name: byId.get(r.personId) ? fullName(byId.get(r.personId)!) : '—', jobTitle: byId.get(r.personId)?.jobTitle ?? null, managerName: r.managerId && byId.get(r.managerId) ? fullName(byId.get(r.managerId)!) : null, value: r.value }))
          .sort((x, y) => y.value - x.value || x.name.localeCompare(y.name, 'it')),
      };
    });
    return { snapshotDate, alerts };
  }
  async alertsCsv() {
    const r = await this.alerts();
    const rows = r.alerts.flatMap((a) => a.people.map((p) => [a.label, p.name, p.jobTitle, p.managerName, p.value]));
    await this.audit.log({ action: 'analytics.export', entityType: 'report', after: { report: 'alerts', snapshotDate: r.snapshotDate, rows: rows.length } });
    return toCsv(['Segnale', 'Persona', 'Ruolo', 'Manager', 'Valore'], rows);
  }

  // ---------- report di processo per ciclo di review (ANA-014) ----------

  async processReport(cycleId: string) {
    const scope = this.scope();
    const [c] = await tx().select().from(reviewCycles).where(eq(reviewCycles.id, cycleId));
    if (!c) throw notFound('Ciclo di review', cycleId);
    const rvs = (await tx().select().from(reviews).where(and(eq(reviews.cycleId, cycleId), ...(scope.kind === 'team' ? [eq(reviews.managerPersonId, scope.managerId)] : [])))).filter((r) => r.status !== 'cancelled');
    const ids = [...new Set(rvs.flatMap((r) => [r.subjectPersonId, r.managerPersonId ?? '']).filter(Boolean))];
    const people = ids.length ? await tx().select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName, orgUnitId: persons.orgUnitId }).from(persons).where(inArray(persons.id, ids)) : [];
    const byId = new Map(people.map((p) => [p.id, p]));
    const unitIds = [...new Set(people.map((p) => p.orgUnitId ?? '').filter(Boolean))];
    const units = unitIds.length ? await tx().select({ id: orgUnits.id, name: orgUnits.name }).from(orgUnits).where(inArray(orgUnits.id, unitIds)) : [];
    const unitName = new Map(units.map((u) => [u.id, u.name]));
    const now = new Date();
    const day = today();
    const launched = c.launchedAt?.getTime() ?? null;
    const days = (d: Date | null) => (d && launched ? (d.getTime() - launched) / 86400000 : null);
    const avg = (xs: (number | null)[]) => {
      const v = xs.filter((x): x is number => x != null);
      return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
    };
    const stage = (done: (r: typeof rvs[number]) => Date | null, overdue: (r: typeof rvs[number]) => boolean) => ({
      total: rvs.length,
      done: rvs.filter((r) => done(r)).length,
      overdue: rvs.filter((r) => !done(r) && overdue(r)).length,
      avgDays: avg(rvs.map((r) => days(done(r)))),
    });
    const hasSelf = rvs.some((r) => r.selfResponseId);
    const stages = {
      self: hasSelf ? stage((r) => r.selfSubmittedAt, () => !!c.selfDueAt && c.selfDueAt < day) : null,
      manager: stage((r) => r.managerSubmittedAt, () => !!c.managerDueAt && c.managerDueAt < day),
      share: stage((r) => r.sharedAt, () => !!c.managerDueAt && c.managerDueAt < day),
      sign: stage((r) => r.signedAt, () => false),
    };
    const groupBy = (keyOf: (r: typeof rvs[number]) => string | null, labelOf: (k: string) => string) => {
      const m = new Map<string, typeof rvs>();
      for (const r of rvs) {
        const k = keyOf(r) ?? '';
        m.set(k, [...(m.get(k) ?? []), r]);
      }
      return [...m.entries()]
        .map(([k, list]) => ({
          id: k || null,
          name: k ? labelOf(k) : 'Non assegnato',
          total: list.length,
          selfDone: list.filter((r) => r.selfSubmittedAt).length,
          managerDone: list.filter((r) => r.managerSubmittedAt).length,
          shared: list.filter((r) => r.sharedAt).length,
          signed: list.filter((r) => r.signedAt).length,
          overdue: list.filter((r) => (r.status === 'pending_self' && c.selfDueAt && c.selfDueAt < day) || (r.status === 'pending_manager' && c.managerDueAt && c.managerDueAt < day)).length,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'it'));
    };
    const late = rvs
      .filter((r) => r.status === 'pending_self' || r.status === 'pending_manager')
      .map((r) => {
        const dueAt = r.status === 'pending_self' ? c.selfDueAt : c.managerDueAt;
        const daysLate = dueAt ? Math.floor((now.getTime() - new Date(dueAt).getTime()) / 86400000) : null;
        return { reviewId: r.id, personName: byId.get(r.subjectPersonId) ? fullName(byId.get(r.subjectPersonId)!) : '—', managerName: r.managerPersonId && byId.get(r.managerPersonId) ? fullName(byId.get(r.managerPersonId)!) : null, stage: r.status === 'pending_self' ? 'self' : 'manager', dueAt, daysLate };
      })
      .filter((x) => x.daysLate != null && x.daysLate > 0)
      .sort((a, b) => (b.daysLate ?? 0) - (a.daysLate ?? 0));
    // distribuzione rating: solo HR e solo se il gruppo raggiunge la soglia sensibile
    const rated = rvs.filter((r) => r.finalRating != null && ['shared', 'signed', 'closed'].includes(r.status));
    const ratingDistribution = scope.kind === 'all' && rated.length >= 5 ? Object.entries(rated.reduce<Record<string, number>>((acc, r) => ((acc[r.finalRatingLabel ?? String(r.finalRating)] = (acc[r.finalRatingLabel ?? String(r.finalRating)] ?? 0) + 1), acc), {})).map(([label, count]) => ({ label, count })) : null;
    return {
      cycle: { id: c.id, name: c.name, status: c.status, periodStart: c.periodStart, periodEnd: c.periodEnd, launchedAt: c.launchedAt, selfDueAt: c.selfDueAt, managerDueAt: c.managerDueAt, closedAt: c.closedAt },
      scope: scope.kind,
      stages,
      byOrgUnit: groupBy((r) => byId.get(r.subjectPersonId)?.orgUnitId ?? null, (k) => unitName.get(k) ?? 'Unità'),
      byManager: groupBy((r) => r.managerPersonId, (k) => (byId.get(k) ? fullName(byId.get(k)!) : 'Manager')),
      late,
      ratingDistribution,
      ratingSuppressed: scope.kind === 'all' && rated.length > 0 && rated.length < 5,
    };
  }
  async processCsv(cycleId: string) {
    const r = await this.processReport(cycleId);
    const rows: (string | number | null)[][] = [
      ...r.byOrgUnit.map((x) => ['Unità', x.name, x.total, x.selfDone, x.managerDone, x.shared, x.signed, x.overdue]),
      ...r.byManager.map((x) => ['Manager', x.name, x.total, x.selfDone, x.managerDone, x.shared, x.signed, x.overdue]),
    ];
    await this.audit.log({ action: 'analytics.export', entityType: 'report', after: { report: 'process', cycleId } });
    return toCsv(['Raggruppamento', 'Nome', 'Review', 'Self inviate', 'Manager inviate', 'Condivise', 'Firmate', 'In ritardo'], rows);
  }

  /** Cicli di review per cui esiste un report di processo (HR: tutti i lanciati; manager: quelli con proprie review). */
  async processCycles() {
    const scope = this.scope();
    const cyc = await tx().select({ id: reviewCycles.id, name: reviewCycles.name, status: reviewCycles.status, periodStart: reviewCycles.periodStart, periodEnd: reviewCycles.periodEnd }).from(reviewCycles).where(inArray(reviewCycles.status, ['active', 'closed'])).orderBy(desc(reviewCycles.createdAt));
    if (scope.kind === 'all') return cyc;
    const mine = await tx().select({ cycleId: reviews.cycleId }).from(reviews).where(eq(reviews.managerPersonId, scope.managerId)).groupBy(reviews.cycleId);
    const ids = new Set(mine.map((m) => m.cycleId));
    return cyc.filter((c) => ids.has(c.id));
  }
}
