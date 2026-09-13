import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { sql } from 'drizzle-orm';
import * as schema from './schema/index.js';
import { runMigrations } from './migrate.js';
import type { AnyDb } from './tenant.js';

export interface TestDatabase {
  db: AnyDb;
  close: () => Promise<void>;
  /** ruolo non-superuser usato nei test per rendere efficace la RLS (i superuser la bypassano) */
  appRole: string;
}

/** Postgres in-process (PGlite) con migrazioni applicate: per unit/integration test senza server. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const client = new PGlite();
  const db = drizzle(client, { schema, casing: 'snake_case' }) as unknown as AnyDb;
  await runMigrations(db);
  await db.execute(sql`SET session_replication_role = origin`);
  return {
    db,
    appRole: 'wb_app',
    close: () => client.close(),
  };
}
