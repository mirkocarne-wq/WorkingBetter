import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { appInstances, appStageRuns, notifications, persons, tenants, users } from '@wb/db';
import { createTestDatabase, type TestDatabase } from '@wb/db/testing';
import { AppTemplates } from '@wb/shared';
import { runReminders } from '../src/jobs/reminders.js';

let t: TestDatabase;
let tenantId: string;
let giuliaUser: string;

beforeAll(async () => {
  t = await createTestDatabase();
  const [tn] = await t.db.insert(tenants).values({ name: 'Acme', slug: 'acme' }).returning();
  tenantId = tn!.id;
  const [g] = await t.db.insert(persons).values({ tenantId, firstName: 'Giulia', lastName: 'Ferri' }).returning();
  const [l] = await t.db.insert(persons).values({ tenantId, firstName: 'Luca', lastName: 'Bianchi', managerId: g!.id }).returning();
  const [gu] = await t.db.insert(users).values({ tenantId, email: 'giulia@acme.test', personId: g!.id }).returning();
  giuliaUser = gu!.id;
  const def = AppTemplates.find((x) => x.key === 'training_request')!.app;
  const [inst] = await t.db.insert(appInstances).values({ tenantId, appId: crypto.randomUUID(), appKey: def.key, appVersion: 1, definition: def, subjectPersonId: l!.id, launcherPersonId: l!.id, actors: { subject: l!.id, manager: g!.id }, currentStages: ['manager_ok'] }).returning();
  await t.db.insert(appStageRuns).values([
    { tenantId, instanceId: inst!.id, stageKey: 'request', attempt: 1, type: 'form', status: 'done', actorPersonId: l!.id, dueDate: '2026-09-01' },
    { tenantId, instanceId: inst!.id, stageKey: 'manager_ok', attempt: 1, type: 'approval', status: 'active', actorPersonId: g!.id, dueDate: '2026-09-12' },
    { tenantId, instanceId: inst!.id, stageKey: 'hr_ok', attempt: 1, type: 'approval', status: 'pending' },
  ]);
});
afterAll(() => t.close());

describe('promemoria fasi App Studio (APP §7)', () => {
  it('avvisa l’assegnatario di una fase scaduta una volta al giorno, con il nome dell’app e del soggetto', async () => {
    const s1 = await runReminders(t.db, new Date('2026-09-13T07:00:00Z'));
    expect(s1.appStagesDue).toBe(1);
    const notes = await t.db.select().from(notifications).where(eq(notifications.userId, giuliaUser));
    expect(notes.map((n) => n.type)).toEqual(['app.stage_due']);
    expect(notes[0]!.title).toContain('Richiesta formazione');
    expect(notes[0]!.title).toContain('scaduta');
    expect(notes[0]!.body).toContain('Luca Bianchi');
    expect((await runReminders(t.db, new Date('2026-09-13T15:00:00Z'))).appStagesDue).toBe(0);
  });
});
