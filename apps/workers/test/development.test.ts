import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { developmentActions, developmentPlans, notifications, persons, tenants, users } from '@wb/db';
import { createTestDatabase, type TestDatabase } from '@wb/db/testing';
import { runReminders } from '../src/jobs/reminders.js';

let t: TestDatabase;
let tenantId: string;
let lucaUser: string;

beforeAll(async () => {
  t = await createTestDatabase();
  const [tn] = await t.db.insert(tenants).values({ name: 'Acme', slug: 'acme' }).returning();
  tenantId = tn!.id;
  const [luca] = await t.db.insert(persons).values({ tenantId, firstName: 'Luca', lastName: 'Bianchi' }).returning();
  const [u] = await t.db.insert(users).values({ tenantId, email: 'luca@acme.test', personId: luca!.id }).returning();
  lucaUser = u!.id;
  const [plan] = await t.db.insert(developmentPlans).values({ tenantId, personId: luca!.id, title: 'Crescita', status: 'active' }).returning();
  await t.db.insert(developmentActions).values([
    { tenantId, planId: plan!.id, personId: luca!.id, title: 'Scaduta', kind: 'other', dueDate: '2026-09-01' },
    { tenantId, planId: plan!.id, personId: luca!.id, title: 'Tra due giorni', kind: 'training', dueDate: '2026-09-15', competencyKey: 'communication' },
    { tenantId, planId: plan!.id, personId: luca!.id, title: 'Lontana', kind: 'reading', dueDate: '2026-12-01' },
    { tenantId, planId: plan!.id, personId: luca!.id, title: 'Fatta', kind: 'other', dueDate: '2026-09-10', status: 'done' },
  ]);
});
afterAll(() => t.close());

describe('promemoria azioni di sviluppo (DEV-023)', () => {
  it('notifica le azioni scadute e quelle entro 3 giorni, una volta al giorno', async () => {
    const now = new Date('2026-09-13T07:00:00Z');
    const s1 = await runReminders(t.db, now);
    expect(s1.devActionsDue).toBe(2);
    const notes = await t.db.select().from(notifications).where(eq(notifications.userId, lucaUser));
    const dev = notes.filter((n) => n.type === 'dev.action_due');
    expect(dev.map((n) => n.title).sort()).toEqual(['Azione di sviluppo in scadenza: Tra due giorni', 'Azione di sviluppo scaduta: Scaduta']);
    const s2 = await runReminders(t.db, new Date('2026-09-13T15:00:00Z'));
    expect(s2.devActionsDue).toBe(0);
  });
});
