import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { randomBytes } from 'node:crypto';
import * as schema from './schema/index.js';
import { runMigrations } from './migrate.js';
import type { AnyDb } from './tenant.js';

export interface TestDatabase {
  db: AnyDb;
  close: () => Promise<void>;
  /** ruolo non-superuser usato nei test per rendere efficace la RLS (i superuser la bypassano) */
  appRole: string;
  /** `pglite` (in-process) oppure `postgres` (server vero, con TEST_DATABASE_URL) */
  kind: 'pglite' | 'postgres';
}

/**
 * Database di test con migrazioni applicate.
 * - Default: Postgres in-process (PGlite), senza server: veloce, per lo sviluppo.
 * - Con `TEST_DATABASE_URL` (es. in CI): un **database dedicato e usa-e-getta** su un PostgreSQL vero, creato per ogni
 *   chiamata e cancellato alla chiusura. Serve a intercettare le differenze tra PGlite e PostgreSQL (tipi dei parametri
 *   nei frammenti SQL grezzi, funzioni, collation) prima del deploy.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const url = process.env.TEST_DATABASE_URL;
  if (url) return createPostgresTestDatabase(url);
  const client = new PGlite();
  const db = drizzlePglite(client, { schema, casing: 'snake_case' }) as unknown as AnyDb;
  await runMigrations(db);
  await db.execute(sql`SET session_replication_role = origin`);
  return { db, appRole: 'wb_app', kind: 'pglite', close: () => client.close() };
}

async function createPostgresTestDatabase(adminUrl: string): Promise<TestDatabase> {
  const name = `wb_test_${randomBytes(6).toString('hex')}`;
  const admin = postgres(adminUrl, { max: 1, prepare: false, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE ${name}`);
  const u = new URL(adminUrl);
  u.pathname = `/${name}`;
  const client = postgres(u.toString(), { max: 4, prepare: false, onnotice: () => {} });
  const db = drizzlePg(client, { schema, casing: 'snake_case' }) as unknown as AnyDb;
  try {
    await runMigrations(db);
  } catch (e) {
    await client.end({ timeout: 5 });
    await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await admin.end({ timeout: 5 });
    throw e;
  }
  return {
    db,
    appRole: 'wb_app',
    kind: 'postgres',
    close: async () => {
      await client.end({ timeout: 5 });
      await admin.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.end({ timeout: 5 });
    },
  };
}
