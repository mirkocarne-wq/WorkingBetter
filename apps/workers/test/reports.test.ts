import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { emailOutbox, martPersonFacts, orgUnits, persons, roleAssignments, savedReports, tenants, users } from '@wb/db';
import { createTestDatabase, type TestDatabase } from '@wb/db/testing';
import { runScheduledReports } from '../src/jobs/reports.js';

let t: TestDatabase;
let tenantId: string;
let hrUser: string;
let mgrUser: string;
let empUser: string;
let reportId: string;

beforeAll(async () => {
  t = await createTestDatabase();
  const [tn] = await t.db.insert(tenants).values({ name: 'Acme', slug: 'acme', timezone: 'Europe/Rome' }).returning();
  tenantId = tn!.id;
  const [unit] = await t.db.insert(orgUnits).values({ tenantId, name: 'Prodotto', path: '/x/' }).returning();
  const [g] = await t.db.insert(persons).values({ tenantId, firstName: 'Giulia', lastName: 'Ferri', orgUnitId: unit!.id }).returning();
  const team = [];
  for (let i = 0; i < 5; i++) team.push((await t.db.insert(persons).values({ tenantId, firstName: `P${i}`, lastName: 'T', managerId: g!.id, orgUnitId: unit!.id }).returning())[0]!);
  const mk = async (email: string, personId: string | null, role: string) => {
    const [u] = await t.db.insert(users).values({ tenantId, email, personId }).returning();
    await t.db.insert(roleAssignments).values({ tenantId, userId: u!.id, role });
    return u!.id;
  };
  hrUser = await mk('hr@acme.test', null, 'hr_admin');
  mgrUser = await mk('giulia@acme.test', g!.id, 'manager');
  empUser = await mk('emp@acme.test', team[0]!.id, 'employee');
  // due snapshot: oggi e 30 giorni fa
  for (const [date, share] of [['2026-09-13', 1], ['2026-08-14', 0]] as const) {
    for (const p of [g!, ...team]) {
      const orgPath = `/${unit!.id}/`;
      await t.db.insert(martPersonFacts).values([
        { tenantId, snapshotDate: date, personId: p.id, managerId: p.managerId ?? null, orgUnitId: unit!.id, orgPath, factKey: 'headcount', value: '1' },
        { tenantId, snapshotDate: date, personId: p.id, managerId: p.managerId ?? null, orgUnitId: unit!.id, orgPath, factKey: 'has_objectives', value: String(share) },
      ]);
    }
  }
  const [r] = await t.db.insert(savedReports).values({
    tenantId, ownerUserId: hrUser, name: 'Copertura obiettivi',
    definition: { metrics: ['headcount', 'people_with_objectives_share'], dimension: 'org_unit', filters: {}, compareDays: 30, visualization: 'table' },
    sharing: { roles: ['manager', 'employee'], userIds: [] },
    schedule: { frequency: 'weekly', weekday: 1, hour: 7, recipients: 'shared' },
    nextRunAt: new Date('2026-09-14T05:00:00Z'),
  }).returning();
  reportId = r!.id;
});
afterAll(() => t.close());

describe('report programmati', () => {
  it('non fa nulla prima della scadenza', async () => {
    const s = await runScheduledReports(t.db, new Date('2026-09-13T12:00:00Z'));
    expect(s).toEqual({ tenants: 1, reportsDue: 0, deliveries: 0, skipped: 0 });
  });

  it('alla scadenza invia il CSV a chi ha un perimetro (HR e manager), salta chi non ne ha, e riprogramma', async () => {
    const now = new Date('2026-09-14T05:10:00Z');
    const s = await runScheduledReports(t.db, now);
    expect(s.reportsDue).toBe(1);
    expect(s.deliveries).toBe(2); // hr + manager
    expect(s.skipped).toBe(1); // employee: nessun perimetro di analisi
    const mails = await t.db.select().from(emailOutbox).where(eq(emailOutbox.tenantId, tenantId));
    expect(mails.map((m) => m.toEmail).sort()).toEqual(['giulia@acme.test', 'hr@acme.test']);
    const hr = mails.find((m) => m.toEmail === 'hr@acme.test')!;
    const att = (hr.attachments as { filename: string; content: string }[])[0]!;
    expect(att.filename).toBe('Copertura_obiettivi.csv');
    expect(att.content).toContain('Unità organizzativa;Persone;Persone attive;Persone attive · variazione;% persone con obiettivi;% persone con obiettivi · variazione');
    expect(att.content).toContain('Prodotto;6;6;±0;100%;+100 pt');
    expect(hr.subject).toContain('Copertura obiettivi');
    const [r] = await t.db.select().from(savedReports).where(eq(savedReports.id, reportId));
    expect(r!.lastRunAt?.toISOString()).toBe(now.toISOString());
    expect(r!.nextRunAt?.toISOString()).toBe('2026-09-21T05:00:00.000Z'); // lunedì successivo, 7:00 Europe/Rome
    // idempotente nello stesso giorno: il dedupeKey evita doppioni anche se nextRunAt fosse ancora scaduto
    await t.db.update(savedReports).set({ nextRunAt: now }).where(eq(savedReports.id, reportId));
    const again = await runScheduledReports(t.db, new Date('2026-09-14T06:00:00Z'));
    expect(again.deliveries).toBe(0);
    expect(mgrUser && empUser).toBeTruthy();
  });
});
