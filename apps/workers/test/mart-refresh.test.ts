import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { cycles, feedback, martPersonFacts, objectives, persons, tenants } from '@wb/db';
import { createTestDatabase, type TestDatabase } from '@wb/db/testing';
import { runMartRefresh } from '../src/jobs/mart-refresh.js';

let t: TestDatabase;
let tenantId: string;
let luca: string;

beforeAll(async () => {
  t = await createTestDatabase();
  const [tn] = await t.db.insert(tenants).values({ name: 'Acme', slug: 'acme' }).returning();
  tenantId = tn!.id;
  await t.db.insert(tenants).values({ name: 'Sospeso', slug: 'off', status: 'suspended' });
  const [g] = await t.db.insert(persons).values({ tenantId, firstName: 'Giulia', lastName: 'Ferri' }).returning();
  const [l] = await t.db.insert(persons).values({ tenantId, firstName: 'Luca', lastName: 'Bianchi', managerId: g!.id, hireDate: '2026-08-20' }).returning();
  await t.db.insert(persons).values({ tenantId, firstName: 'Ex', lastName: 'Dipendente', status: 'terminated' });
  luca = l!.id;
  const [c] = await t.db.insert(cycles).values({ tenantId, name: 'Q3', startDate: '2026-07-01', endDate: '2026-09-30' }).returning();
  await t.db.insert(objectives).values({ tenantId, cycleId: c!.id, title: 'O', level: 'individual', ownerPersonId: luca, status: 'active', progress: '0.5', confidence: 'off_track' });
  await t.db.insert(feedback).values({ tenantId, fromPersonId: g!.id, toPersonId: luca, kind: 'praise', body: 'x', visibility: 'private', createdAt: new Date('2026-09-10T10:00:00Z') });
});
afterAll(() => t.close());

describe('mart refresh job', () => {
  it('writes person-grain facts for active tenants only and is idempotent per day', async () => {
    const now = new Date('2026-09-13T02:00:00Z');
    const s1 = await runMartRefresh(t.db, now);
    expect(s1.tenants).toBe(1);
    expect(s1.snapshotDate).toBe('2026-09-13');
    const lucaFacts = await t.db.select().from(martPersonFacts).where(and(eq(martPersonFacts.personId, luca), eq(martPersonFacts.snapshotDate, '2026-09-13')));
    const f = Object.fromEntries(lucaFacts.map((r) => [r.factKey, Number(r.value)]));
    expect(f).toMatchObject({ headcount: 1, has_manager: 1, new_hire_90d: 1, objectives_active: 1, objectives_progress_sum: 0.5, objectives_at_risk: 1, has_objectives: 1, no_one_on_one_30d: 1, feedback_received_30d: 1 });
    expect(f.no_objectives).toBeUndefined();
    const s2 = await runMartRefresh(t.db, now);
    expect(s2.rows).toBe(s1.rows);
    const all = await t.db.select().from(martPersonFacts);
    expect(all.length).toBe(s1.rows); // nessun duplicato
    expect(all.some((r) => r.factKey === 'headcount' && r.personId !== luca)).toBe(true); // Giulia
    expect(new Set(all.map((r) => r.personId)).size).toBe(2); // la persona cessata non entra
  });
  it('rolling windows follow the snapshot date', async () => {
    await runMartRefresh(t.db, new Date('2026-12-01T02:00:00Z'));
    const rows = await t.db.select().from(martPersonFacts).where(and(eq(martPersonFacts.personId, luca), eq(martPersonFacts.snapshotDate, '2026-12-01')));
    const keys = rows.map((r) => r.factKey);
    expect(keys).not.toContain('feedback_received_30d');
    expect(keys).not.toContain('new_hire_90d');
    expect(keys).not.toContain('objectives_active'); // il ciclo Q3 è finito
    expect(keys).toContain('no_objectives');
  });
});
