import { and, eq, inArray, isNotNull, lte } from 'drizzle-orm';
import { emailOutbox, notify, roleAssignments, runMetricQuery, savedReports, tenants, users, withPlatform, withTenant, type AnalyticsScope, type AnyDb } from '@wb/db';
import { Permissions, compareRows, getMetric, hasPermission, nextRunAt, reportCsv, tzOffsetMinutes, type MetricDef, type ReportDefinition, type ReportSchedule, type ReportSharing } from '@wb/shared';

export interface ReportsSummary {
  tenants: number;
  reportsDue: number;
  deliveries: number;
  skipped: number;
}

/**
 * Invio programmato dei report salvati (ANA-060): per ogni report con `nextRunAt` scaduto, un'email con CSV
 * a ciascun destinatario, calcolata con il PERIMETRO DEL DESTINATARIO (ANA-052): l'HR riceve tutta l'azienda,
 * un manager solo il suo team, chi non ha alcun perimetro non riceve nulla.
 */
export async function runScheduledReports(db: AnyDb, now = new Date()): Promise<ReportsSummary> {
  const summary: ReportsSummary = { tenants: 0, reportsDue: 0, deliveries: 0, skipped: 0 };
  const active = await withPlatform(db, (tx) => tx.select({ id: tenants.id, tz: tenants.timezone }).from(tenants).where(eq(tenants.status, 'active')));
  for (const t of active) {
    summary.tenants++;
    await withTenant(db, t.id, async (tx) => {
      const due = await tx.select().from(savedReports).where(and(eq(savedReports.tenantId, t.id), isNotNull(savedReports.schedule), lte(savedReports.nextRunAt, now)));
      for (const r of due) {
        summary.reportsDue++;
        const schedule = r.schedule as ReportSchedule;
        const def = r.definition as ReportDefinition;
        const sharing = r.sharing as ReportSharing;
        const defs = def.metrics.map((k) => getMetric(k)).filter((m): m is MetricDef => !!m);
        const recipients = new Set<string>([r.ownerUserId]);
        if (schedule.recipients === 'shared') {
          if (sharing.userIds.length) for (const u of sharing.userIds) recipients.add(u);
          if (sharing.roles.length) for (const ra of await tx.select({ userId: roleAssignments.userId }).from(roleAssignments).where(and(eq(roleAssignments.tenantId, t.id), inArray(roleAssignments.role, sharing.roles)))) recipients.add(ra.userId);
        }
        const runDate = now.toISOString().slice(0, 10);
        for (const userId of recipients) {
          const [u] = await tx.select({ id: users.id, personId: users.personId, disabledAt: users.disabledAt }).from(users).where(eq(users.id, userId));
          if (!u || u.disabledAt) { summary.skipped++; continue; }
          const roles = (await tx.select({ role: roleAssignments.role }).from(roleAssignments).where(eq(roleAssignments.userId, userId))).map((x) => x.role);
          const scope: AnalyticsScope | null = hasPermission(roles, Permissions.ANALYTICS_QUERY) ? { kind: 'all' } : hasPermission(roles, Permissions.ANALYTICS_QUERY_TEAM) && u.personId ? { kind: 'team', managerId: u.personId } : null;
          if (!scope) { summary.skipped++; continue; }
          const visible = scope.kind === 'all' ? defs : defs.filter((m) => m.teamVisible);
          if (!visible.length || (def.dimension === 'person' && visible.some((m) => m.sensitive))) { summary.skipped++; continue; }
          const current = await runMetricQuery(tx, { tenantId: t.id, scope, metrics: visible, dimension: def.dimension ?? null, filters: def.filters ?? {} });
          let compared = null;
          if (def.compareDays && current.snapshotDate) {
            const upTo = new Date(new Date(current.snapshotDate).getTime() - def.compareDays * 86400000).toISOString().slice(0, 10);
            const prev = await runMetricQuery(tx, { tenantId: t.id, scope, metrics: visible, dimension: def.dimension ?? null, filters: def.filters ?? {}, upTo });
            if (prev.snapshotDate && prev.snapshotDate !== current.snapshotDate) compared = compareRows(visible, [...current.rows, ...(current.total ? [current.total] : [])], [...prev.rows, ...(prev.total ? [prev.total] : [])]);
          }
          const csv = reportCsv({ dimensionLabel: current.dimensionLabel, metrics: visible, rows: current.rows, total: current.total, compared });
          const res = await notify(tx, { tenantId: t.id, userId, type: 'report.delivered', data: { title: r.name, period: current.snapshotDate ? `dati al ${current.snapshotDate}` : 'nessun dato', rows: current.rows.length }, link: `/analytics/reports/${r.id}`, dedupeKey: `report:${r.id}:${runDate}:${userId}`, force: { email: true } });
          if (res.notificationId && res.emailQueued) {
            await tx.update(emailOutbox).set({ attachments: [{ filename: `${r.name.replace(/[^\w\-]+/g, '_').slice(0, 60)}.csv`, contentType: 'text/csv; charset=utf-8', content: csv }] }).where(eq(emailOutbox.notificationId, res.notificationId));
            summary.deliveries++;
          }
        }
        await tx.update(savedReports).set({ lastRunAt: now, nextRunAt: nextRunAt(schedule, now, tzOffsetMinutes(t.tz, now)), updatedAt: now }).where(eq(savedReports.id, r.id));
      }
    });
  }
  return summary;
}
