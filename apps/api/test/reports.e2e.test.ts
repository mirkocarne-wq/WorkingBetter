import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { emailOutbox, orgUnits, persons, refreshMartForTenant, withTenant } from '@wb/db';
import { api, createTestEnv, type TestEnv } from './helpers.js';

let env: TestEnv;
let tenant: { id: string; slug: string };
let hr: { userId: string; personId: string; token: string };
let giulia: { userId: string; personId: string; token: string };
let luca: { userId: string; personId: string; token: string };
let reportId: string;

beforeAll(async () => {
  env = await createTestEnv();
  tenant = await env.createTenant('Acme Reports');
  hr = await env.createUser(tenant.id, 'hr@rep.test', ['hr_admin'], { firstName: 'Chiara', lastName: 'Moretti' });
  giulia = await env.createUser(tenant.id, 'giulia@rep.test', ['manager'], { firstName: 'Giulia', lastName: 'Ferri' });
  luca = await env.createUser(tenant.id, 'luca@rep.test', ['employee'], { firstName: 'Luca', lastName: 'Bianchi', managerId: giulia.personId });
  for (const n of ['Sara', 'Marco', 'Elena', 'Andrea']) await env.createUser(tenant.id, `${n.toLowerCase()}@rep.test`, ['employee'], { firstName: n, lastName: 'T', managerId: giulia.personId });
  const [unit] = await env.db.insert(orgUnits).values({ tenantId: tenant.id, name: 'Prodotto' }).returning();
  await env.db.update(persons).set({ orgUnitId: unit!.id }).where(eq(persons.tenantId, tenant.id));
  await withTenant(env.db, tenant.id, async (tx) => {
    await refreshMartForTenant(tx, tenant.id, new Date('2026-08-14T02:00:00Z'));
    await refreshMartForTenant(tx, tenant.id, new Date('2026-09-13T02:00:00Z'));
  });
});
afterAll(() => env.close());

describe('report salvati (ANA-050…060)', () => {
  it('HR saves a multi-module report with comparison, sharing and a weekly schedule', async () => {
    const r = await api(env.app, 'POST', '/analytics/reports', hr.token, {
      name: 'Copertura obiettivi', folder: 'Mensili',
      definition: { metrics: ['headcount', 'people_with_objectives_share', 'one_on_one_coverage_30d'], dimension: 'org_unit', filters: {}, compareDays: 30, visualization: 'bars' },
      sharing: { roles: ['manager'], userIds: [] },
      schedule: { frequency: 'weekly', weekday: 1, hour: 7, recipients: 'shared' },
    });
    expect(r.status).toBe(201);
    reportId = r.body.id;
    expect(r.body.isOwner).toBe(true);
    expect(r.body.nextRunAt).toBeTruthy();
    expect(new Date(r.body.nextRunAt).getUTCDay()).toBe(1);
  });

  it('rejects unknown metrics, wrong dimensions and sharing by managers', async () => {
    const bad = await api(env.app, 'POST', '/analytics/reports', hr.token, { name: 'x', definition: { metrics: ['nope'] } });
    expect(bad.status).toBe(422);
    const badDim = await api(env.app, 'POST', '/analytics/reports', hr.token, { name: 'x', definition: { metrics: ['review_completion'], dimension: 'person' } });
    expect([403, 422]).toContain(badDim.status);
    const mgrShare = await api(env.app, 'POST', '/analytics/reports', giulia.token, { name: 'Team', definition: { metrics: ['headcount'] }, sharing: { roles: ['employee'], userIds: [] } });
    expect(mgrShare.status).toBe(403);
    const mgrOwn = await api(env.app, 'POST', '/analytics/reports', giulia.token, { name: 'Il mio team', definition: { metrics: ['objectives_active', 'one_on_ones_done_30d'], dimension: 'person' } });
    expect(mgrOwn.status).toBe(201);
  });

  it('runs with the perimeter of who opens it: HR sees the company, the manager only the team, the employee nothing', async () => {
    const hrRun = await api(env.app, 'GET', `/analytics/reports/${reportId}/run`, hr.token);
    expect(hrRun.status).toBe(200);
    expect(hrRun.body.scope).toBe('all');
    expect(hrRun.body.snapshotDate).toBe('2026-09-13');
    expect(hrRun.body.previousSnapshot).toBe('2026-08-14');
    expect(hrRun.body.total.persons).toBe(7);
    expect(hrRun.body.compared).toBeTruthy();
    const mgrRun = await api(env.app, 'GET', `/analytics/reports/${reportId}/run`, giulia.token);
    expect(mgrRun.status).toBe(200);
    expect(mgrRun.body.scope).toBe('team');
    expect(mgrRun.body.total.persons).toBe(5);
    expect((await api(env.app, 'GET', `/analytics/reports/${reportId}/run`, luca.token)).status).toBe(403);
    // filtri dinamici (ANA-051) e CSV con audit
    const filtered = await api(env.app, 'GET', `/analytics/reports/${reportId}/run?date=2026-08-20`, hr.token);
    expect(filtered.body.snapshotDate).toBe('2026-08-14');
    const csv = await env.app.inject({ method: 'GET', url: `/api/v1/analytics/reports/${reportId}/run?format=csv`, headers: { authorization: `Bearer ${hr.token}` } });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('Unità organizzativa;Persone;Persone attive;Persone attive · variazione');
  });

  it('list shows own and shared reports; only the owner edits or deletes; duplicate makes a private copy', async () => {
    const mine = await api(env.app, 'GET', '/analytics/reports', giulia.token);
    expect(mine.body.map((r: { name: string }) => r.name).sort()).toEqual(['Copertura obiettivi', 'Il mio team']);
    expect((await api(env.app, 'GET', '/analytics/reports', luca.token)).status).toBe(403);
    expect((await api(env.app, 'PATCH', `/analytics/reports/${reportId}`, giulia.token, { name: 'Hack' })).status).toBe(403);
    const dup = await api(env.app, 'POST', `/analytics/reports/${reportId}/duplicate`, giulia.token);
    expect(dup.status).toBe(201);
    expect(dup.body.name).toBe('Copertura obiettivi (copia)');
    expect(dup.body.sharing.roles).toEqual([]);
    const upd = await api(env.app, 'PATCH', `/analytics/reports/${reportId}`, hr.token, { schedule: null });
    expect(upd.body.schedule).toBeNull();
    expect(upd.body.nextRunAt).toBeNull();
    expect((await api(env.app, 'GET', `/analytics/reports/${reportId}/recipients`, hr.token)).body.users).toBe(1);
  });

  it('send now queues an email with the CSV attached', async () => {
    const s = await api(env.app, 'POST', `/analytics/reports/${reportId}/send`, giulia.token);
    expect(s.status).toBe(201);
    expect(s.body.queued).toBe(true);
    const mails = await env.db.select().from(emailOutbox).where(eq(emailOutbox.toEmail, 'giulia@rep.test'));
    const m = mails[mails.length - 1]!;
    expect(m.subject).toContain('Copertura obiettivi');
    const att = (m.attachments as { filename: string; content: string }[])[0]!;
    expect(att.filename).toBe('Copertura_obiettivi.csv');
    expect(att.content).toContain('Totale;5;');
  });
});
