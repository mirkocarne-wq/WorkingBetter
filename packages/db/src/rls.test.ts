import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { createTestDatabase, type TestDatabase } from './testing.js';

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(() => t.close());

/**
 * Invariante di sicurezza (docs/06): ogni tabella con `tenant_id` ha la Row-Level Security attiva e almeno una policy.
 * Una nuova tabella senza migrazione RLS fa fallire la suite invece di finire in produzione.
 */
describe('RLS su tutte le tabelle multi-tenant', () => {
  it('ogni tabella con tenant_id ha rowsecurity e una policy tenant_isolation', async () => {
    const rows = (await t.db.execute(sql`
      select c.relname as table_name, c.relrowsecurity as rls,
             (select count(*) from pg_policy p where p.polrelid = c.oid)::int as policies
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped)
      order by c.relname
    `)) as unknown as { rows: { table_name: string; rls: boolean; policies: number }[] };
    const tables = rows.rows ?? (rows as unknown as { table_name: string; rls: boolean; policies: number }[]);
    expect(tables.length).toBeGreaterThan(30);
    const missing = tables.filter((r) => !r.rls || r.policies < 1).map((r) => r.table_name);
    expect(missing, `Tabelle senza RLS o senza policy: ${missing.join(', ')}`).toEqual([]);
  });
});
