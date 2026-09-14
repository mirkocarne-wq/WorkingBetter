import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { emailOutbox, latestSnapshot, roleAssignments, runMetricQuery, runTrend, savedReports, tenants, type AnalyticsScope } from '@wb/db';
import { DimensionLabels, ErrorCodes, compareRows, getMetric, nextRunAt, reportCsv, tzOffsetMinutes, type MetricDef, type ReportDefinition, type ReportSchedule, type ReportSharing } from '@wb/shared';
import type { z } from 'zod';
import { principal, tx } from '../common/context.js';
import { forbidden, notFound, unprocessable } from '../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { AnalyticsService } from './analytics.service.js';
import type { createReportDto, updateReportDto, RunReportQuery } from './reports.dto.js';

type ReportRow = typeof savedReports.$inferSelect;
const strip = (m: MetricDef) => ({ key: m.key, name: m.name, description: m.description, formula: m.formula, module: m.module, format: m.format, dimensions: m.dimensions, sensitive: m.sensitive, minGroupSize: m.minGroupSize, teamVisible: m.teamVisible });

/**
 * Report salvati (ANA-050…054, ANA-060): la definizione è del proprietario, ma l'esecuzione usa sempre
 * perimetro e soglie di chi apre il report (ANA-052). Nessun valore viene memorizzato: si ricalcola dal mart.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly analytics: AnalyticsService, private readonly audit: AuditService, private readonly notifier: NotificationsService) {}

  private canSee(r: ReportRow): boolean {
    const p = principal();
    if (r.ownerUserId === p.userId) return true;
    const sh = r.sharing as ReportSharing;
    return sh.userIds.includes(p.userId) || sh.roles.some((role) => p.roles.includes(role));
  }
  private async row(id: string): Promise<ReportRow> {
    const [r] = await tx().select().from(savedReports).where(eq(savedReports.id, id));
    if (!r || !this.canSee(r)) throw notFound('Report', id);
    return r;
  }
  private serialize(r: ReportRow) {
    const p = principal();
    return { id: r.id, name: r.name, description: r.description, folder: r.folder, definition: r.definition as ReportDefinition, sharing: r.sharing as ReportSharing, schedule: (r.schedule as ReportSchedule | null) ?? null, nextRunAt: r.nextRunAt, lastRunAt: r.lastRunAt, ownerUserId: r.ownerUserId, isOwner: r.ownerUserId === p.userId, createdAt: r.createdAt, updatedAt: r.updatedAt };
  }
  private async tenantTz(): Promise<string> {
    const [t] = await tx().select({ tz: tenants.timezone }).from(tenants).where(eq(tenants.id, principal().tenantId));
    return t?.tz ?? 'Europe/Rome';
  }

  /** La definizione deve essere eseguibile da chi la salva: metriche note, ammesse nel suo perimetro e per la dimensione scelta. */
  private validateDefinition(def: ReportDefinition, scope: AnalyticsScope): MetricDef[] {
    const defs = this.analytics.resolveMetrics(def.metrics, scope, def.dimension ?? null);
    if (def.dimension === 'person' && defs.some((m) => m.sensitive)) throw forbidden('Le metriche sensibili non sono disponibili a livello persona');
    if (def.visualization === 'trend' && def.trendMetric && !def.metrics.includes(def.trendMetric)) throw unprocessable(ErrorCodes.VALIDATION, 'La metrica del trend deve essere tra quelle del report');
    return defs;
  }
  private validateSharing(sharing: ReportSharing, scope: AnalyticsScope) {
    if (scope.kind !== 'all' && (sharing.roles.length || sharing.userIds.length)) throw forbidden('Solo chi ha il perimetro completo può condividere un report');
  }

  async list() {
    const p = principal();
    const rows = await tx().select().from(savedReports).where(eq(savedReports.tenantId, p.tenantId)).orderBy(desc(savedReports.updatedAt));
    return rows.filter((r) => this.canSee(r)).map((r) => this.serialize(r));
  }

  async get(id: string) {
    return this.serialize(await this.row(id));
  }

  async create(dto: z.infer<typeof createReportDto>) {
    const p = principal();
    const scope = this.analytics.scope();
    this.validateDefinition(dto.definition, scope);
    this.validateSharing(dto.sharing, scope);
    const tz = await this.tenantTz();
    const now = new Date();
    const [row] = await tx()
      .insert(savedReports)
      .values({ tenantId: p.tenantId, createdBy: p.userId, ownerUserId: p.userId, name: dto.name, description: dto.description ?? null, folder: dto.folder ?? null, definition: dto.definition, sharing: dto.sharing, schedule: dto.schedule ?? null, nextRunAt: dto.schedule ? nextRunAt(dto.schedule, now, tzOffsetMinutes(tz, now)) : null })
      .returning();
    await this.audit.log({ action: 'report.create', entityType: 'saved_report', entityId: row!.id, after: dto });
    return this.serialize(row!);
  }

  async update(id: string, dto: z.infer<typeof updateReportDto>) {
    const p = principal();
    const r = await this.row(id);
    if (r.ownerUserId !== p.userId) throw forbidden('Solo il proprietario può modificare il report (duplicalo per farne una copia)');
    const scope = this.analytics.scope();
    if (dto.definition) this.validateDefinition(dto.definition, scope);
    if (dto.sharing) this.validateSharing(dto.sharing, scope);
    const tz = await this.tenantTz();
    const now = new Date();
    const schedule = dto.schedule === undefined ? (r.schedule as ReportSchedule | null) : dto.schedule;
    const [after] = await tx()
      .update(savedReports)
      .set({ name: dto.name, description: dto.description, folder: dto.folder, definition: dto.definition, sharing: dto.sharing, schedule: dto.schedule === undefined ? undefined : dto.schedule, nextRunAt: dto.schedule === undefined ? undefined : schedule ? nextRunAt(schedule, now, tzOffsetMinutes(tz, now)) : null, updatedAt: now })
      .where(eq(savedReports.id, id))
      .returning();
    await this.audit.log({ action: 'report.update', entityType: 'saved_report', entityId: id, before: r, after: dto });
    return this.serialize(after!);
  }

  async remove(id: string) {
    const p = principal();
    const r = await this.row(id);
    if (r.ownerUserId !== p.userId) throw forbidden('Solo il proprietario può eliminare il report');
    await tx().delete(savedReports).where(eq(savedReports.id, id));
    await this.audit.log({ action: 'report.delete', entityType: 'saved_report', entityId: id, before: r });
  }

  async duplicate(id: string) {
    const p = principal();
    const r = await this.row(id);
    const [copy] = await tx()
      .insert(savedReports)
      .values({ tenantId: p.tenantId, createdBy: p.userId, ownerUserId: p.userId, name: `${r.name} (copia)`, description: r.description, folder: r.folder, definition: r.definition, sharing: { roles: [], userIds: [] }, schedule: null })
      .returning();
    await this.audit.log({ action: 'report.duplicate', entityType: 'saved_report', entityId: copy!.id, after: { from: id } });
    return this.serialize(copy!);
  }

  /**
   * Esegue il report per l'utente corrente: perimetro e soglie sono i suoi; i filtri salvati possono essere
   * ristretti (mai allargati oltre il perimetro, che è applicato a monte) con `overrides` (ANA-051).
   */
  async run(id: string, q: RunReportQuery) {
    const p = principal();
    const r = await this.row(id);
    const def = r.definition as ReportDefinition;
    const scope = this.analytics.scope();
    const defs = this.analytics.resolveMetrics(def.metrics, scope, def.dimension ?? null);
    if (def.dimension === 'person' && defs.some((m) => m.sensitive)) throw forbidden('Le metriche sensibili non sono disponibili a livello persona');
    const filters = { orgUnitId: q.orgUnitId ?? def.filters?.orgUnitId ?? null, managerId: q.managerId ?? def.filters?.managerId ?? null, cycleId: q.cycleId ?? def.filters?.cycleId ?? null };
    const current = await runMetricQuery(tx(), { tenantId: p.tenantId, scope, metrics: defs, dimension: def.dimension ?? null, filters, upTo: q.date });
    let compared: ReturnType<typeof compareRows> | null = null;
    let previousSnapshot: string | null = null;
    if (def.compareDays && current.snapshotDate) {
      const upTo = new Date(new Date(current.snapshotDate).getTime() - def.compareDays * 86400000).toISOString().slice(0, 10);
      previousSnapshot = await latestSnapshot(tx(), p.tenantId, upTo);
      if (previousSnapshot && previousSnapshot !== current.snapshotDate) {
        const prev = await runMetricQuery(tx(), { tenantId: p.tenantId, scope, metrics: defs, dimension: def.dimension ?? null, filters, snapshotDate: previousSnapshot });
        const rowsWithTotal = [...current.rows, ...(current.total ? [current.total] : [])];
        const prevWithTotal = [...prev.rows, ...(prev.total ? [prev.total] : [])];
        compared = compareRows(defs, rowsWithTotal, prevWithTotal);
      } else previousSnapshot = null;
    }
    let trend: { metric: ReturnType<typeof strip>; from: string; to: string; points: Awaited<ReturnType<typeof runTrend>> } | null = null;
    if (def.visualization === 'trend') {
      const tm = getMetric(def.trendMetric ?? def.metrics[0]!)!;
      const to = current.snapshotDate ?? new Date().toISOString().slice(0, 10);
      const from = new Date(new Date(to).getTime() - ((def.trendDays ?? 30) - 1) * 86400000).toISOString().slice(0, 10);
      trend = { metric: strip(tm), from, to, points: await runTrend(tx(), { tenantId: p.tenantId, scope, metric: tm, from, to, filters }) };
    }
    return { report: this.serialize(r), scope: scope.kind, snapshotDate: current.snapshotDate, previousSnapshot, dimension: current.dimension, dimensionLabel: current.dimensionLabel, metrics: defs.map(strip), filters, rows: current.rows, total: current.total, compared, trend };
  }

  async runCsv(id: string, q: RunReportQuery) {
    const res = await this.run(id, q);
    const csv = reportCsv({ dimensionLabel: res.dimensionLabel, metrics: res.metrics.map((m) => getMetric(m.key)!), rows: res.rows, total: res.total, compared: res.compared });
    await this.audit.log({ action: 'analytics.export', entityType: 'report', entityId: id, after: { report: 'saved', name: res.report.name, filters: res.filters, snapshotDate: res.snapshotDate } });
    return { filename: `${res.report.name.replace(/[^\w\-]+/g, '_').slice(0, 60)}.csv`, csv };
  }

  /** Invio immediato del report all'utente corrente (stesso formato dell'invio programmato). */
  async sendNow(id: string) {
    const p = principal();
    const res = await this.run(id, { format: 'json' });
    const csv = reportCsv({ dimensionLabel: res.dimensionLabel, metrics: res.metrics.map((m) => getMetric(m.key)!), rows: res.rows, total: res.total, compared: res.compared });
    const n = await this.notifier.send({ userId: p.userId, type: 'report.delivered', data: { title: res.report.name, period: res.snapshotDate ? `dati al ${res.snapshotDate}` : 'nessun dato', rows: res.rows.length }, link: `/analytics/reports/${id}`, force: { email: true } });
    if (n.notificationId && n.emailQueued) {
      await tx().update(emailOutbox).set({ attachments: [{ filename: `${res.report.name.replace(/[^\w\-]+/g, '_').slice(0, 60)}.csv`, contentType: 'text/csv; charset=utf-8', content: csv }] }).where(eq(emailOutbox.notificationId, n.notificationId));
    }
    await this.audit.log({ action: 'report.send', entityType: 'saved_report', entityId: id, after: { to: p.userId } });
    return { queued: n.emailQueued };
  }

  /** Destinatari potenziali di un report condiviso (per l'anteprima nella UI): conteggio per ruolo. */
  async recipientsPreview(id: string) {
    const r = await this.row(id);
    const sh = r.sharing as ReportSharing;
    if (!sh.roles.length && !sh.userIds.length) return { users: 0 };
    const conds = [];
    if (sh.roles.length) conds.push(inArray(roleAssignments.role, sh.roles));
    if (sh.userIds.length) conds.push(inArray(roleAssignments.userId, sh.userIds));
    const [c] = await tx().select({ n: sql<number>`count(distinct ${roleAssignments.userId})::int` }).from(roleAssignments).where(and(eq(roleAssignments.tenantId, principal().tenantId), or(...conds)));
    return { users: c?.n ?? 0 };
  }

  dimensionLabel(d: ReportDefinition['dimension']) {
    return d ? DimensionLabels[d] : 'Totale';
  }
}
