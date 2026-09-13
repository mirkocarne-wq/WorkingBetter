import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { actionItems, cycles, emailOutbox, keyResults, meetings, notifications, objectives, oneOnOneRelations, persons, tenants, users } from '@wb/db';
import { createTestDatabase, type TestDatabase } from '@wb/db/testing';
import { runReminders } from '../src/jobs/reminders.js';
import { dispatchEmails, type EmailSender } from '../src/jobs/email-dispatch.js';

let t: TestDatabase;
let tenantId: string;
let giulia: string;
let luca: string;

beforeAll(async () => {
  t = await createTestDatabase();
  const [tn] = await t.db.insert(tenants).values({ name: 'Acme', slug: 'acme' }).returning();
  tenantId = tn!.id;
  const [g] = await t.db.insert(persons).values({ tenantId, firstName: 'Giulia', lastName: 'Ferri', email: 'giulia@acme.test' }).returning();
  const [l] = await t.db.insert(persons).values({ tenantId, firstName: 'Luca', lastName: 'Bianchi', email: 'luca@acme.test', managerId: g!.id }).returning();
  giulia = g!.id;
  luca = l!.id;
  await t.db.insert(users).values([{ tenantId, email: 'giulia@acme.test', personId: giulia }, { tenantId, email: 'luca@acme.test', personId: luca }]);
  const [c] = await t.db.insert(cycles).values({ tenantId, name: 'Q3', startDate: '2026-07-01', endDate: '2026-09-30', checkInCadenceDays: 7 }).returning();
  const [o] = await t.db.insert(objectives).values({ tenantId, cycleId: c!.id, title: 'Tempo P1', level: 'individual', ownerPersonId: luca, status: 'active' }).returning();
  await t.db.insert(keyResults).values({ tenantId, objectiveId: o!.id, title: 'Ore', ownerPersonId: luca, lastCheckInAt: '2026-08-20' });
  const [r] = await t.db.insert(oneOnOneRelations).values({ tenantId, personAId: giulia, personBId: luca, cadenceDays: 7 }).returning();
  await t.db.insert(meetings).values({ tenantId, relationId: r!.id, scheduledAt: new Date('2026-09-14T10:00:00Z') });
  await t.db.insert(actionItems).values({ tenantId, relationId: r!.id, ownerPersonId: luca, title: 'Runbook', dueDate: '2026-09-01' });
});
afterAll(() => t.close());

describe('reminders job', () => {
  const now = new Date('2026-09-13T12:00:00Z');
  it('creates check-in due, meeting and overdue-action notifications, once per day', async () => {
    const s1 = await runReminders(t.db, now);
    expect(s1).toMatchObject({ tenants: 1, checkInsDue: 1, meetingsSoon: 2, actionsOverdue: 1 });
    const s2 = await runReminders(t.db, now);
    expect(s2).toMatchObject({ checkInsDue: 0, meetingsSoon: 0, actionsOverdue: 0 });
    const lucaUser = (await t.db.select().from(users).where(eq(users.email, 'luca@acme.test')))[0]!;
    const mine = await t.db.select().from(notifications).where(eq(notifications.userId, lucaUser.id));
    expect(mine.map((n) => n.type).sort()).toEqual(['action_item.overdue', 'objective.check_in_due', 'one_on_one.reminder']);
    expect(mine.find((n) => n.type === 'objective.check_in_due')!.title).toContain('Tempo P1');
  });
  it('the next day the check-in reminder fires again while the meeting reminder does not', async () => {
    const s = await runReminders(t.db, new Date('2026-09-14T12:00:00Z'));
    expect(s.checkInsDue).toBe(1);
    expect(s.meetingsSoon).toBe(0); // l'incontro è alle 10: già passato alle 12
    expect(s.actionsOverdue).toBe(1);
  });
});

describe('email dispatch', () => {
  it('sends pending emails and retries failures with backoff, failing after 5 attempts', async () => {
    await t.db.insert(emailOutbox).values([
      { tenantId, toEmail: 'luca@acme.test', subject: 'Benvenuto', text: 'ciao' },
      { tenantId, toEmail: 'giulia@acme.test', subject: 'Promemoria che fallisce', text: 'x', attempts: 4 },
    ]);
    const sent: string[] = [];
    const flaky: EmailSender = { async send(m) { if (m.subject.includes('fallisce')) throw new Error('smtp down'); sent.push(m.to); } };
    const r = await dispatchEmails(t.db, flaky, 50, new Date('2026-09-14T12:00:00Z'));
    expect(r).toEqual({ sent: 1, failed: 1 });
    expect(sent).toEqual(['luca@acme.test']);
    const rows = await t.db.select().from(emailOutbox);
    expect(rows.find((x) => x.subject === 'Benvenuto')!.status).toBe('sent');
    const failed = rows.find((x) => x.subject.includes('fallisce'))!;
    expect(failed.status).toBe('failed');
    expect(failed.attempts).toBe(5);
    expect(failed.lastError).toContain('smtp down');
    // una seconda passata non ritenta né rinvia
    expect(await dispatchEmails(t.db, flaky, 50, new Date('2026-09-14T12:05:00Z'))).toEqual({ sent: 0, failed: 0 });
  });
});
