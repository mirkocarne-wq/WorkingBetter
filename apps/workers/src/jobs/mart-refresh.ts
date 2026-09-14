import { eq } from 'drizzle-orm';
import { refreshMartForTenant, tenants, withPlatform, withTenant, type AnyDb } from '@wb/db';

export interface MartRefreshSummary {
  tenants: number;
  rows: number;
  snapshotDate: string;
}

/**
 * Snapshot giornaliero del data mart (ADR-0006, ANA-070 v1): un giro per ogni tenant attivo.
 * Idempotente: rilanciarlo nello stesso giorno riscrive lo snapshot del giorno.
 */
export async function runMartRefresh(db: AnyDb, now = new Date()): Promise<MartRefreshSummary> {
  const summary: MartRefreshSummary = { tenants: 0, rows: 0, snapshotDate: now.toISOString().slice(0, 10) };
  const allTenants = await withPlatform(db, (tx) => tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.status, 'active')));
  for (const t of allTenants) {
    const r = await withTenant(db, t.id, (tx) => refreshMartForTenant(tx, t.id, now));
    summary.tenants++;
    summary.rows += r.rows;
  }
  return summary;
}
