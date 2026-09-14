import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { cycles, notifications, objectives, onboardingJourneys, onboardingTasks, onboardingTemplates, persons, tenants, users } from '@wb/db';
import { createTestDatabase, type TestDatabase } from '@wb/db/testing';
import { OnboardingPresets } from '@wb/shared';
import { runReminders } from '../src/jobs/reminders.js';

let t: TestDatabase;
let tenantId: string;
let elena: string;
let giulia: string;
let giuliaUser: string;

beforeAll(async () => {
  t = await createTestDatabase();
  const [tn] = await t.db.insert(tenants).values({ name: 'Acme', slug: 'acme' }).returning();
  tenantId = tn!.id;
  const [g] = await t.db.insert(persons).values({ tenantId, firstName: 'Giulia', lastName: 'Ferri', jobTitle: 'Engineering Manager', hireDate: '2020-01-01' }).returning();
  const [e] = await t.db.insert(persons).values({ tenantId, firstName: 'Elena', lastName: 'Parisi', jobTitle: 'QA Engineer', managerId: g!.id, hireDate: '2026-09-10' }).returning();
  giulia = g!.id;
  elena = e!.id;
  const [gu] = await t.db.insert(users).values({ tenantId, email: 'giulia@acme.test', personId: giulia }).returning();
  giuliaUser = gu!.id;
  await t.db.insert(users).values({ tenantId, email: 'elena@acme.test', personId: elena });
  const generic = OnboardingPresets[0]!;
  await t.db.insert(onboardingTemplates).values({ tenantId, name: generic.name, kind: 'onboarding', phases: generic.phases, tasks: generic.tasks, rules: {}, isDefault: true });
});
afterAll(() => t.close());

describe('onboarding nel worker (ONB-010/015, §7)', () => {
  it('avvia il percorso per il nuovo ingresso, poi ricorda i task in scadenza e chiude quelli "obiettivi" quando esiste un obiettivo', async () => {
    const s1 = await runReminders(t.db, new Date('2026-09-12T07:00:00Z'));
    expect(s1.onboardingStarted).toBe(1);
    const [j] = await t.db.select().from(onboardingJourneys).where(eq(onboardingJourneys.personId, elena));
    expect(j!.templateName).toBe('Onboarding generico');
    expect(j!.anchorDate).toBe('2026-09-10');
    const tasks = await t.db.select().from(onboardingTasks).where(eq(onboardingTasks.journeyId, j!.id));
    expect(tasks.length).toBeGreaterThan(10);
    expect(tasks.find((x) => x.key === 'first_one_on_one')!.dueDate).toBe('2026-09-11');
    expect(tasks.find((x) => x.key === 'buddy_meet')!.assigneePersonId).toBe(giulia); // senza buddy → manager
    // promemoria: task del manager scaduti (welcome_mail −7, it_setup −3, plan_week1 −2, first_one_on_one +1) e in scadenza entro 2 giorni
    expect(s1.onboardingTasksDue).toBeGreaterThanOrEqual(4);
    const notes = await t.db.select().from(notifications).where(eq(notifications.userId, giuliaUser));
    expect(notes.some((n) => n.type === 'onboarding.started')).toBe(true);
    expect(notes.filter((n) => n.type === 'onboarding.task_due').some((n) => n.title.includes('scaduto'))).toBe(true);
    const s2 = await runReminders(t.db, new Date('2026-09-12T15:00:00Z'));
    expect(s2).toMatchObject({ onboardingStarted: 0, onboardingTasksDue: 0 });
    // obiettivo attivo → il task "obiettivi" si chiude da solo
    const [c] = await t.db.insert(cycles).values({ tenantId, name: 'Q3', startDate: '2026-07-01', endDate: '2026-09-30' }).returning();
    await t.db.insert(objectives).values({ tenantId, cycleId: c!.id, title: 'Primo obiettivo', level: 'individual', ownerPersonId: elena, status: 'active' });
    const s3 = await runReminders(t.db, new Date('2026-09-13T07:00:00Z'));
    expect(s3.onboardingObjectiveTasksClosed).toBe(1);
    expect((await t.db.select().from(onboardingTasks).where(eq(onboardingTasks.journeyId, j!.id))).find((x) => x.key === 'objectives')!.status).toBe('done');
  });
});
