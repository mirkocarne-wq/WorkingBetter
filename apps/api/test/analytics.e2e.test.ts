import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog, cycles, feedback, keyResults, meetings, objectives, oneOnOneRelations, orgUnits, persons, withTenant } from '@wb/db';
import { and, eq } from 'drizzle-orm';
import { api, createTestEnv, type TestEnv } from './helpers.js';

let env: TestEnv;
let tenant: { id: string; slug: string };
let hr: { userId: string; personId: string; token: string };
let giulia: { userId: string; personId: string; token: string };
let paolo: { userId: string; personId: string; token: string };
let luca: { userId: string; personId: string; token: string };
let prodottoId: string;
let venditeId: string;

beforeAll(async () => {
  env = await createTestEnv();
  tenant = await env.createTenant('Acme');
  const other = await env.createTenant('Globex');
  hr = await env.createUser(tenant.id, 'hr@acme.test', ['hr_admin'], { firstName: 'Chiara', lastName: 'Moretti' });
  giulia = await env.createUser(tenant.id, 'giulia@acme.test', ['manager'], { firstName: 'Giulia', lastName: 'Ferri' });
  paolo = await env.createUser(tenant.id, 'paolo@acme.test', ['manager'], { firstName: 'Paolo', lastName: 'Neri' });
  luca = await env.createUser(tenant.id, 'luca@acme.test', ['employee'], { firstName: 'Luca', lastName: 'Bianchi', managerId: giulia.personId });
  const sara = await env.createUser(tenant.id, 'sara@acme.test', ['employee'], { firstName: 'Sara', lastName: 'Ricci', managerId: giulia.personId });
  const marco = await env.createUser(tenant.id, 'marco@acme.test', ['employee'], { firstName: 'Marco', lastName: 'Conti', managerId: giulia.personId });
  const elena = await env.createUser(tenant.id, 'elena@acme.test', ['employee'], { firstName: 'Elena', lastName: 'Parisi', managerId: paolo.personId });
  const andrea = await env.createUser(tenant.id, 'andrea@acme.test', ['employee'], { firstName: 'Andrea', lastName: 'Russo', managerId: paolo.personId });
  await env.createUser(other.id, 'x@globex.test', ['employee'], { firstName: 'Altro', lastName: 'Tenant' });
  // unità: Prodotto (Giulia + team), Vendite (Paolo + team)
  const [prod] = await env.db.insert(orgUnits).values({ tenantId: tenant.id, name: 'Prodotto' }).returning();
  const [vend] = await env.db.insert(orgUnits).values({ tenantId: tenant.id, name: 'Vendite' }).returning();
  prodottoId = prod!.id;
  venditeId = vend!.id;
  await env.db.update(orgUnits).set({ path: `/${prodottoId}/` }).where(eq(orgUnits.id, prodottoId));
  await env.db.update(orgUnits).set({ path: `/${venditeId}/` }).where(eq(orgUnits.id, venditeId));
  for (const p of [giulia, luca, sara, marco]) await env.db.update(persons).set({ orgUnitId: prodottoId }).where(eq(persons.id, p.personId));
  for (const p of [paolo, elena, andrea]) await env.db.update(persons).set({ orgUnitId: venditeId }).where(eq(persons.id, p.personId));
  // obiettivi: Luca (a rischio, KR stale), Sara (on track), Elena (on track); Marco e Andrea senza obiettivi
  const [c] = await env.db.insert(cycles).values({ tenantId: tenant.id, name: 'Q3', startDate: '2026-07-01', endDate: '2026-09-30', checkInCadenceDays: 7 }).returning();
  const mk = async (owner: string, progress: string, confidence: 'on_track' | 'at_risk', last: string) => {
    const [o] = await env.db.insert(objectives).values({ tenantId: tenant.id, cycleId: c!.id, title: 'Obiettivo', level: 'individual', ownerPersonId: owner, status: 'active', progress, confidence }).returning();
    await env.db.insert(keyResults).values({ tenantId: tenant.id, objectiveId: o!.id, title: 'KR', ownerPersonId: owner, lastCheckInAt: last });
  };
  await mk(luca.personId, '0.4', 'at_risk', '2026-08-01');
  await mk(sara.personId, '0.8', 'on_track', '2026-09-12');
  await mk(elena.personId, '0.6', 'on_track', '2026-09-12');
  // 1:1: Giulia–Luca concluso ieri; nessun altro
  const [rel] = await env.db.insert(oneOnOneRelations).values({ tenantId: tenant.id, personAId: giulia.personId, personBId: luca.personId, cadenceDays: 7 }).returning();
  await env.db.insert(meetings).values({ tenantId: tenant.id, relationId: rel!.id, scheduledAt: new Date(Date.now() - 86400000), status: 'done', completedAt: new Date(Date.now() - 86400000) });
  // feedback: 2 a Luca, 1 a Elena
  await env.db.insert(feedback).values([
    { tenantId: tenant.id, fromPersonId: giulia.personId, toPersonId: luca.personId, kind: 'praise', body: 'Bravo', visibility: 'private' },
    { tenantId: tenant.id, fromPersonId: sara.personId, toPersonId: luca.personId, kind: 'praise', body: 'Grazie', visibility: 'private' },
    { tenantId: tenant.id, fromPersonId: paolo.personId, toPersonId: elena.personId, kind: 'suggestion', body: 'Idea', visibility: 'private' },
  ]);
});
afterAll(() => env.close());

describe('analytics: catalog, refresh and query engine', () => {
  it('exposes the data dictionary filtered by perimeter', async () => {
    const all = await api(env.app, 'GET', '/analytics/metrics', hr.token);
    expect(all.status).toBe(200);
    expect(all.body.length).toBeGreaterThanOrEqual(24);
    expect(all.body.find((m: any) => m.key === 'review_rating_avg')).toMatchObject({ sensitive: true, minGroupSize: 5 });
    const team = await api(env.app, 'GET', '/analytics/metrics', giulia.token);
    expect(team.body.some((m: any) => m.key === 'review_rating_avg')).toBe(false);
    expect((await api(env.app, 'GET', '/analytics/metrics', luca.token)).status).toBe(403);
  });
  it('returns an empty result before the first snapshot, then HR refreshes the mart', async () => {
    const empty = await api(env.app, 'GET', '/analytics/query?metrics=headcount', hr.token);
    expect(empty.body).toMatchObject({ snapshotDate: null, rows: [], total: null });
    expect((await api(env.app, 'POST', '/analytics/refresh', giulia.token)).status).toBe(403);
    const r = await api(env.app, 'POST', '/analytics/refresh', hr.token);
    expect(r.status).toBe(201);
    expect(r.body.persons).toBe(8);
    const audit = await withTenant(env.db, tenant.id, (t) => t.select().from(auditLog).where(eq(auditLog.action, 'analytics.refresh')));
    expect(audit).toHaveLength(1);
  });
  it('aggregates by org unit with the total row and applies thresholds', async () => {
    const q = await api(env.app, 'GET', '/analytics/query?metrics=headcount,people_with_objectives_share,objective_progress_avg,one_on_one_coverage_30d,feedback_received_30d&dimension=org_unit', hr.token);
    expect(q.status).toBe(200);
    const prod = q.body.rows.find((r: any) => r.label === 'Prodotto');
    const vend = q.body.rows.find((r: any) => r.label === 'Vendite');
    const none = q.body.rows.find((r: any) => r.label === 'Non assegnato'); // Chiara, senza unità
    expect(prod.persons).toBe(4);
    expect(prod.cells.headcount.value).toBe(4);
    expect(prod.cells.people_with_objectives_share.value).toBeCloseTo(0.5); // Luca e Sara su 4
    expect(prod.cells.objective_progress_avg.value).toBeCloseTo(0.6); // (0.4 + 0.8) / 2
    expect(prod.cells.one_on_one_coverage_30d.value).toBeCloseTo(1 / 3); // Luca su 3 con manager
    expect(vend.cells.people_with_objectives_share.value).toBeCloseTo(1 / 3);
    expect(none.persons).toBe(1);
    expect(none.cells.people_with_objectives_share).toMatchObject({ value: null, suppressed: true }); // gruppo di 1 < soglia 3
    expect(q.body.total.cells.headcount.value).toBe(8);
    expect(q.body.total.cells.feedback_received_30d.value).toBe(3);
  });
  it('the manager only sees direct reports and cannot use non-team metrics or unknown ones', async () => {
    const q = await api(env.app, 'GET', '/analytics/query?metrics=objectives_at_risk,feedback_given_30d,one_on_ones_done_30d&dimension=person', giulia.token);
    expect(q.status).toBe(200);
    expect(q.body.rows.map((r: any) => r.label).sort()).toEqual(['Luca Bianchi', 'Marco Conti', 'Sara Ricci']);
    expect(q.body.rows.find((r: any) => r.label === 'Luca Bianchi').cells.objectives_at_risk.value).toBe(1);
    expect((await api(env.app, 'GET', '/analytics/query?metrics=review_rating_avg', giulia.token)).status).toBe(403);
    expect((await api(env.app, 'GET', '/analytics/query?metrics=nope', hr.token)).status).toBe(422);
    expect((await api(env.app, 'GET', '/analytics/query?metrics=headcount&dimension=cycle', hr.token)).status).toBe(422);
    expect((await api(env.app, 'GET', '/analytics/query?metrics=review_rating_avg&dimension=person', hr.token)).status).toBe(422); // le metriche sensibili non ammettono la dimensione persona
    // filtro per unità (sottoalbero) e per manager
    const byUnit = await api(env.app, 'GET', `/analytics/query?metrics=headcount&orgUnitId=${venditeId}`, hr.token);
    expect(byUnit.body.total.cells.headcount.value).toBe(3);
    const byMgr = await api(env.app, 'GET', `/analytics/query?metrics=headcount&managerId=${paolo.personId}`, hr.token);
    expect(byMgr.body.total.cells.headcount.value).toBe(2);
  });
  it('lists alerts within the perimeter', async () => {
    const hrAlerts = await api(env.app, 'GET', '/analytics/alerts', hr.token);
    const noObj = hrAlerts.body.alerts.find((a: any) => a.key === 'no_objectives');
    expect(noObj.count).toBe(5); // Chiara, Giulia, Paolo, Marco, Andrea
    expect(hrAlerts.body.alerts.find((a: any) => a.key === 'no_manager').count).toBe(3);
    expect(hrAlerts.body.alerts.find((a: any) => a.key === 'krs_stale').people[0].name).toBe('Luca Bianchi');
    const teamAlerts = await api(env.app, 'GET', '/analytics/alerts', giulia.token);
    expect(teamAlerts.body.alerts.find((a: any) => a.key === 'no_objectives').people.map((p: any) => p.name)).toEqual(['Marco Conti']);
    expect(teamAlerts.body.alerts.find((a: any) => a.key === 'no_one_on_one_30d').people.map((p: any) => p.name).sort()).toEqual(['Marco Conti', 'Sara Ricci']);
    expect(teamAlerts.body.alerts.some((a: any) => a.key === 'no_manager')).toBe(false);
  });
  it('returns a daily trend and exports CSV with an audit entry', async () => {
    const t = await api(env.app, 'GET', '/analytics/trend?metric=feedback_given_30d&days=7', hr.token);
    expect(t.status).toBe(200);
    expect(t.body.points).toHaveLength(1);
    expect(t.body.points[0].value).toBe(3);
    const csv = await env.app.inject({ method: 'GET', url: '/api/v1/analytics/query?metrics=headcount,people_with_objectives_share&dimension=org_unit&format=csv', headers: { authorization: `Bearer ${hr.token}` } });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('Unità organizzativa;Persone;Persone attive;% persone con obiettivi');
    expect(csv.body).toContain('Prodotto;4;4;50%');
    expect(csv.body).toContain('Vendite;3;3;33%');
    expect(csv.body).toContain('Non assegnato;1;1;n<3');
    expect(csv.body).toContain('Totale;8;8;38%');
    const audit = await withTenant(env.db, tenant.id, (t) => t.select().from(auditLog).where(and(eq(auditLog.action, 'analytics.export'), eq(auditLog.actorUserId, hr.userId))));
    expect(audit).toHaveLength(1);
    expect((audit[0]!.after as any).report).toBe('query');
  });
  it('process report for a review cycle: stages, groups, late list', async () => {
    for (const [key, schema] of [['rs', { title: 's', scoring: { enabled: false }, sections: [{ key: 's', title: 's', fields: [{ key: 'a', type: 'short_text', label: 'a' }] }] }], ['rm', { title: 'm', scoring: { enabled: true }, sections: [{ key: 's', title: 's', fields: [{ key: 'r', type: 'scale', label: 'r', required: true, scale: { min: 1, max: 5 } }] }] }]] as const) {
      const f = await api(env.app, 'POST', '/forms', hr.token, { key, name: key, kind: 'review', schema });
      await api(env.app, 'POST', `/forms/${f.body.id}/publish`, hr.token);
    }
    const tpl = await api(env.app, 'POST', '/review-templates', hr.token, { name: 'T', selfFormKey: 'rs', managerFormKey: 'rm', selfDueDays: 3, managerDueDays: 6 });
    const cyc = await api(env.app, 'POST', '/review-cycles', hr.token, { templateId: tpl.body.id, name: 'Review test', periodStart: '2026-07-01', periodEnd: '2026-09-30', population: { excludePersonIds: [hr.personId] } });
    await api(env.app, 'POST', `/review-cycles/${cyc.body.id}/launch`, hr.token, { launchDate: '2026-08-01' }); // scadenze già passate → tutto in ritardo
    const mine = await api(env.app, 'GET', '/reviews?box=mine', luca.token);
    const rv = await api(env.app, 'GET', `/reviews/${mine.body[0].id}`, luca.token);
    await api(env.app, 'POST', `/form-responses/${rv.body.selfResponse.id}/submit`, luca.token, { answers: { a: 'ok' } });
    const rep = await api(env.app, 'GET', `/analytics/process/${cyc.body.id}`, hr.token);
    expect(rep.status).toBe(200);
    expect(rep.body.stages.self).toMatchObject({ total: 5, done: 1, overdue: 4 });
    expect(rep.body.stages.manager).toMatchObject({ total: 5, done: 0 });
    expect(rep.body.byManager.find((m: any) => m.name === 'Giulia Ferri')).toMatchObject({ total: 3, selfDone: 1 });
    expect(rep.body.byOrgUnit.map((u: any) => u.name).sort()).toEqual(['Prodotto', 'Vendite']);
    expect(rep.body.late.length).toBe(5);
    expect(rep.body.late.find((l: any) => l.personName === 'Luca Bianchi').stage).toBe('manager');
    expect(rep.body.ratingDistribution).toBeNull();
    const teamRep = await api(env.app, 'GET', `/analytics/process/${cyc.body.id}`, giulia.token);
    expect(teamRep.body.stages.self.total).toBe(3);
    expect((await api(env.app, 'GET', '/analytics/process', giulia.token)).body).toHaveLength(1);
    // dopo il refresh le metriche di review sono interrogabili per ciclo
    await api(env.app, 'POST', '/analytics/refresh', hr.token);
    const q = await api(env.app, 'GET', `/analytics/query?metrics=review_self_completion,reviews_overdue&dimension=cycle`, hr.token);
    expect(q.body.rows[0]).toMatchObject({ label: 'Review test', persons: 5 });
    expect(q.body.rows[0].cells.review_self_completion.value).toBeCloseTo(0.2);
    expect(q.body.rows[0].cells.reviews_overdue.value).toBe(5);
  });
});
