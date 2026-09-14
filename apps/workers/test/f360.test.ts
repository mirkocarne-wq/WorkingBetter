import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { emailOutbox, f360Campaigns, f360Requests, f360Subjects, notifications, persons, tenants, users } from '@wb/db';
import { createTestDatabase, type TestDatabase } from '@wb/db/testing';
import { runReminders } from '../src/jobs/reminders.js';

let t: TestDatabase;
let tenantId: string;
let saraUser: string;

beforeAll(async () => {
  t = await createTestDatabase();
  const [tn] = await t.db.insert(tenants).values({ name: 'Acme', slug: 'acme' }).returning();
  tenantId = tn!.id;
  const [luca] = await t.db.insert(persons).values({ tenantId, firstName: 'Luca', lastName: 'Bianchi' }).returning();
  const [sara] = await t.db.insert(persons).values({ tenantId, firstName: 'Sara', lastName: 'Ricci' }).returning();
  const [u] = await t.db.insert(users).values({ tenantId, email: 'sara@acme.test', personId: sara!.id }).returning();
  saraUser = u!.id;
  const [c] = await t.db.insert(f360Campaigns).values({ tenantId, name: '360° 2026', status: 'collection', competencyKeys: ['communication'], collectionDueAt: '2026-09-16', collectionStartedAt: new Date('2026-09-01T00:00:00Z') }).returning();
  const [s] = await t.db.insert(f360Subjects).values({ tenantId, campaignId: c!.id, personId: luca!.id, status: 'collecting' }).returning();
  await t.db.insert(f360Requests).values([
    { tenantId, campaignId: c!.id, subjectId: s!.id, category: 'peer', raterPersonId: sara!.id, status: 'pending', invitedAt: new Date('2026-09-01T00:00:00Z') },
    { tenantId, campaignId: c!.id, subjectId: s!.id, category: 'external', externalEmail: 'cliente@partner.test', externalName: 'Elena Cliente', tokenHash: 'old', status: 'pending', invitedAt: new Date('2026-09-01T00:00:00Z') },
    { tenantId, campaignId: c!.id, subjectId: s!.id, category: 'self', raterPersonId: luca!.id, status: 'submitted', invitedAt: new Date('2026-09-01T00:00:00Z'), submittedAt: new Date('2026-09-02T00:00:00Z') },
  ]);
});
afterAll(() => t.close());

describe('promemoria feedback 360° (F360 §7)', () => {
  it('a 3 giorni dalla chiusura avvisa i valutatori interni e rimanda l’email agli esterni con un nuovo link, una volta al giorno', async () => {
    expect((await runReminders(t.db, new Date('2026-09-10T07:00:00Z'), { appBaseUrl: 'https://app.test' })).f360Reminders).toBe(0); // 6 giorni: niente
    const s1 = await runReminders(t.db, new Date('2026-09-13T07:00:00Z'), { appBaseUrl: 'https://app.test' });
    expect(s1.f360Reminders).toBe(2);
    const notes = await t.db.select().from(notifications).where(eq(notifications.userId, saraUser));
    expect(notes.map((n) => n.type)).toEqual(['f360.reminder']);
    expect(notes[0]!.title).toContain('Luca Bianchi');
    const mails = await t.db.select().from(emailOutbox).where(eq(emailOutbox.toEmail, 'cliente@partner.test'));
    expect(mails).toHaveLength(1);
    expect(mails[0]!.text).toContain('https://app.test/f360/external/');
    const [ext] = await t.db.select().from(f360Requests).where(eq(f360Requests.externalEmail, 'cliente@partner.test'));
    expect(ext!.tokenHash).not.toBe('old');
    const s2 = await runReminders(t.db, new Date('2026-09-13T15:00:00Z'), { appBaseUrl: 'https://app.test' });
    expect(s2.f360Reminders).toBe(0);
  });
});
