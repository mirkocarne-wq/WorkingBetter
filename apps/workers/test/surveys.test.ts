import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { formDefinitions, notifications, persons, surveyInvitations, surveys, tenants, users } from '@wb/db';
import { createTestDatabase, type TestDatabase } from '@wb/db/testing';
import { runReminders } from '../src/jobs/reminders.js';

let t: TestDatabase;
let tenantId: string;
let surveyId: string;
let hrUserId: string;

beforeAll(async () => {
  t = await createTestDatabase();
  const [tn] = await t.db.insert(tenants).values({ name: 'Acme', slug: 'acme' }).returning();
  tenantId = tn!.id;
  const people = await t.db.insert(persons).values([{ tenantId, firstName: 'Chiara', lastName: 'HR' }, { tenantId, firstName: 'Luca', lastName: 'B' }, { tenantId, firstName: 'Sara', lastName: 'R' }]).returning();
  const us = await t.db.insert(users).values(people.map((p, i) => ({ tenantId, email: `u${i}@acme.test`, personId: p.id }))).returning();
  hrUserId = us[0]!.id;
  const [form] = await t.db.insert(formDefinitions).values({ tenantId, key: 'pulse', name: 'Pulse', kind: 'survey', status: 'published', schema: { title: 'Pulse', sections: [{ key: 's', title: 's', fields: [{ key: 'enps', type: 'scale', label: 'eNPS', scale: { min: 0, max: 10 } }] }] } }).returning();
  const [s] = await t.db.insert(surveys).values({ tenantId, createdBy: hrUserId, title: 'Pulse', formDefinitionId: form!.id, status: 'open', launchedAt: new Date('2026-09-10T08:00:00Z'), closesAt: new Date('2026-09-16T12:00:00Z'), anonymous: true }).returning();
  surveyId = s!.id;
  await t.db.insert(surveyInvitations).values([
    { tenantId, surveyId, personId: people[1]!.id },
    { tenantId, surveyId, personId: people[2]!.id, respondedAt: new Date('2026-09-11T10:00:00Z') },
  ]);
});
afterAll(() => t.close());

describe('survey reminders and auto-close', () => {
  it('reminds only non-responders three days before closing, once per day', async () => {
    const s1 = await runReminders(t.db, new Date('2026-09-13T12:00:00Z')); // 3 giorni alla chiusura
    expect(s1.surveyReminders).toBe(1);
    expect((await runReminders(t.db, new Date('2026-09-13T18:00:00Z'))).surveyReminders).toBe(0);
    expect((await runReminders(t.db, new Date('2026-09-14T12:00:00Z'))).surveyReminders).toBe(0); // a 2 giorni niente
    const all = await t.db.select().from(notifications).where(eq(notifications.type, 'survey.reminder'));
    expect(all).toHaveLength(1);
    expect(all[0]!.body).toContain('anonime');
  });
  it('closes the survey when the deadline passes and notifies the creator', async () => {
    const s = await runReminders(t.db, new Date('2026-09-16T13:00:00Z'));
    expect(s.surveysClosed).toBe(1);
    const [row] = await t.db.select().from(surveys).where(eq(surveys.id, surveyId));
    expect(row!.status).toBe('closed');
    const closed = await t.db.select().from(notifications).where(eq(notifications.type, 'survey.closed'));
    expect(closed).toHaveLength(1);
    expect(closed[0]!.userId).toBe(hrUserId);
    expect(closed[0]!.body).toContain('1 risposte su 2');
    expect((await runReminders(t.db, new Date('2026-09-17T13:00:00Z'))).surveysClosed).toBe(0);
  });
});
