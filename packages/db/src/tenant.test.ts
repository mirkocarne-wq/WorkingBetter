import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDatabase, type TestDatabase } from './testing.js';
import { persons, tenants } from './schema/index.js';
import { withTenant } from './tenant.js';

let t: TestDatabase;
let tenantA: string;
let tenantB: string;

beforeAll(async () => {
  t = await createTestDatabase();
  const [a] = await t.db.insert(tenants).values({ name: 'Acme', slug: 'acme' }).returning();
  const [b] = await t.db.insert(tenants).values({ name: 'Globex', slug: 'globex' }).returning();
  tenantA = a!.id;
  tenantB = b!.id;
});
afterAll(async () => t.close());

describe('RLS tenant isolation', () => {
  it('rows written in tenant A are invisible in tenant B', async () => {
    await withTenant(t.db, tenantA, (tx) => tx.insert(persons).values({ tenantId: tenantA, firstName: 'Luca', lastName: 'Bianchi', email: 'luca@acme.test' }), { appRole: t.appRole });
    const seenByA = await withTenant(t.db, tenantA, (tx) => tx.select().from(persons), { appRole: t.appRole });
    const seenByB = await withTenant(t.db, tenantB, (tx) => tx.select().from(persons), { appRole: t.appRole });
    expect(seenByA).toHaveLength(1);
    expect(seenByB).toHaveLength(0);
  });

  it('a filter by id from another tenant returns nothing even if the id is known', async () => {
    const [row] = await withTenant(t.db, tenantA, (tx) => tx.select().from(persons), { appRole: t.appRole });
    const leaked = await withTenant(t.db, tenantB, (tx) => tx.select().from(persons).where(eq(persons.id, row!.id)), { appRole: t.appRole });
    expect(leaked).toHaveLength(0);
  });

  it('writing a row with a foreign tenant_id is rejected by the policy', async () => {
    await expect(
      withTenant(t.db, tenantB, (tx) => tx.insert(persons).values({ tenantId: tenantA, firstName: 'Mallory', lastName: 'X' }), { appRole: t.appRole }),
    ).rejects.toThrow();
    const rows = await t.db.select().from(persons).where(eq(persons.firstName, 'Mallory'));
    expect(rows).toHaveLength(0);
  });

  it('the tenants table only exposes the current tenant to the app role', async () => {
    const rows = await withTenant(t.db, tenantB, (tx) => tx.select().from(tenants), { appRole: t.appRole });
    expect(rows.map((r) => r.slug)).toEqual(['globex']);
  });

  it('the owner (platform context) still sees everything', async () => {
    const all = await t.db.select().from(tenants);
    expect(all).toHaveLength(2);
  });
});
