import { sql } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT, PgTransaction } from 'drizzle-orm/pg-core';
import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { Schema } from './client.js';

export type AnyDb = PgDatabase<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;
export type TenantTx = PgTransaction<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

export interface TenantContextOptions {
  /** Ruolo applicativo soggetto a RLS: eseguito `SET LOCAL ROLE` a inizio transazione (ADR-0003). */
  appRole?: string | null;
}

const IDENT = /^[a-z_][a-z0-9_]*$/;

/**
 * Esegue `fn` in una transazione con `app.tenant_id` impostato: tutte le tabelle multi-tenant hanno
 * policy RLS che filtrano su `current_setting('app.tenant_id')`. Seconda barriera oltre al filtro applicativo.
 */
export async function withTenant<T>(
  db: AnyDb,
  tenantId: string,
  fn: (tx: TenantTx) => Promise<T>,
  opts: TenantContextOptions = {},
): Promise<T> {
  if (!/^[0-9a-f-]{36}$/i.test(tenantId)) throw new Error('invalid tenant id');
  return db.transaction(async (tx) => {
    if (opts.appRole) {
      if (!IDENT.test(opts.appRole)) throw new Error('invalid app role');
      await tx.execute(sql.raw(`SET LOCAL ROLE ${opts.appRole}`));
    }
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}

/** Contesto senza tenant (super admin / job di piattaforma): bypassa RLS solo se il ruolo lo consente. */
export async function withPlatform<T>(db: AnyDb, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.tenant_id', '', true)`);
    return fn(tx);
  });
}
