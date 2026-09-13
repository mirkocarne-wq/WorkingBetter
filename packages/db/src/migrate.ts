import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import type { AnyDb } from './tenant.js';

/**
 * Applica le migrazioni SQL in `drizzle/` (generate da drizzle-kit + file manuali `*_rls.sql`)
 * in ordine lessicografico, registrandole in `_migrations`. Funziona su Postgres e PGlite.
 */
export async function runMigrations(db: AnyDb, migrationsDir = defaultMigrationsDir()): Promise<string[]> {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS _migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const applied = new Set(rowsOf<{ name: string }>(await db.execute(sql`SELECT name FROM _migrations`)).map((r) => r.name));
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const done: string[] = [];
  for (const f of files) {
    if (applied.has(f)) continue;
    const content = readFileSync(join(migrationsDir, f), 'utf8');
    const statements = content
      .split(/-->\s*statement-breakpoint/g)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const st of statements) await db.execute(sql.raw(st));
    await db.execute(sql`INSERT INTO _migrations (name) VALUES (${f})`);
    done.push(f);
  }
  return done;
}

/** Normalizza il risultato di `execute` tra driver (postgres-js restituisce un array, PGlite `{ rows }`). */
export function rowsOf<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const r = res as { rows?: T[] };
  return r.rows ?? [];
}

export function defaultMigrationsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // in dist/ le migrazioni sono copiate in dist/drizzle; in src/ sono in ../drizzle
  return here.endsWith('dist') ? join(here, 'drizzle') : join(here, '..', 'drizzle');
}
