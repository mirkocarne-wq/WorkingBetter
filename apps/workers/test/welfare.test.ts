import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { notifications, persons, tenants, users, welfareBudgetSources, welfareMovements, welfarePlans } from '@wb/db';
import { createTestDatabase, type TestDatabase } from '@wb/db/testing';
import { runReminders } from '../src/jobs/reminders.js';

let t: TestDatabase;
let tenantId: string;
let planId: string;
let luca: string;

beforeAll(async () => {
  t = await createTestDatabase();
  const [tn] = await t.db.insert(tenants).values({ name: 'Acme', slug: 'acme' }).returning();
  tenantId = tn!.id;
  const [l] = await t.db.insert(persons).values({ tenantId, firstName: 'Luca', lastName: 'B', hireDate: '2020-01-01' }).returning();
  luca = l!.id;
  await t.db.insert(users).values({ tenantId, email: 'luca@acme.test', personId: luca });
  const [pl] = await t.db.insert(welfarePlans).values({ tenantId, name: 'Welfare 2026', year: 2026, periodStart: '2026-01-01', periodEnd: '2026-12-31', status: 'active' }).returning();
  planId = pl!.id;
  await t.db.insert(welfareBudgetSources).values({ tenantId, planId, name: 'Seconda tranche', kind: 'on_top', amountPerPerson: '500.00', creditAt: '2026-09-15', expiresAt: '2026-11-12' });
});
afterAll(() => t.close());

describe('welfare worker steps', () => {
  it('credits a source when its date arrives, once', async () => {
    expect((await runReminders(t.db, new Date('2026-09-14T03:00:00Z'))).welfareCredits).toBe(0);
    const s = await runReminders(t.db, new Date('2026-09-15T03:00:00Z'));
    expect(s.welfareCredits).toBe(1);
    expect((await runReminders(t.db, new Date('2026-09-16T03:00:00Z'))).welfareCredits).toBe(0);
    const mv = await t.db.select().from(welfareMovements).where(eq(welfareMovements.personId, luca));
    expect(mv).toHaveLength(1);
    expect(mv[0]!.amount).toBe('500.00');
    expect(mv[0]!.expiresAt).toBe('2026-11-12');
    const n = await t.db.select().from(notifications).where(eq(notifications.type, 'welfare.credited'));
    expect(n).toHaveLength(1);
    expect(n[0]!.title).toContain('500,00');
  });
  it('warns 60, 30 and 7 days before the credit expires', async () => {
    expect((await runReminders(t.db, new Date('2026-09-13T03:00:00Z'))).welfareExpiring).toBe(1); // 60 giorni prima del 12/11
    expect((await runReminders(t.db, new Date('2026-09-13T15:00:00Z'))).welfareExpiring).toBe(0);
    expect((await runReminders(t.db, new Date('2026-10-13T03:00:00Z'))).welfareExpiring).toBe(1); // 30 giorni
    expect((await runReminders(t.db, new Date('2026-11-05T03:00:00Z'))).welfareExpiring).toBe(1); // 7 giorni
    const n = await t.db.select().from(notifications).where(eq(notifications.type, 'welfare.budget_expiring'));
    expect(n).toHaveLength(3);
  });
});
