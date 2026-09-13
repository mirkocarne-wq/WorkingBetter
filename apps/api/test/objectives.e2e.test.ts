import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestEnv, type TestEnv } from './helpers.js';

let env: TestEnv;
let tenant: { id: string; slug: string };
let other: { id: string; slug: string };
let hr: { userId: string; personId: string; token: string };
let manager: { userId: string; personId: string; token: string };
let luca: { userId: string; personId: string; token: string };
let outsider: { userId: string; personId: string; token: string };
let cycleId: string;

beforeAll(async () => {
  env = await createTestEnv();
  tenant = await env.createTenant('Acme');
  other = await env.createTenant('Globex');
  hr = await env.createUser(tenant.id, 'hr@acme.test', ['hr_admin']);
  manager = await env.createUser(tenant.id, 'giulia@acme.test', ['manager']);
  luca = await env.createUser(tenant.id, 'luca@acme.test', ['employee'], { firstName: 'Luca', lastName: 'Bianchi', managerId: manager.personId });
  outsider = await env.createUser(other.id, 'hr@globex.test', ['hr_admin']);
  const c = await api(env.app, 'POST', '/cycles', hr.token, { name: 'Q3 2026', startDate: '2026-07-01', endDate: '2026-09-30', checkInCadenceDays: 7 });
  expect(c.status).toBe(201);
  cycleId = c.body.id;
});
afterAll(() => env.close());

describe('objectives & key results', () => {
  let companyId: string;
  let teamId: string;
  let lucaObjId: string;
  let krId: string;

  it('only HR admin can create company objectives', async () => {
    const denied = await api(env.app, 'POST', '/objectives', manager.token, { cycleId, title: 'Leader PMI', level: 'company', publish: true });
    expect(denied.status).toBe(403);
    const ok = await api(env.app, 'POST', '/objectives', hr.token, { cycleId, title: 'Diventare il fornitore di riferimento per le PMI', level: 'company', publish: true });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('active');
    expect(ok.body.progress).toBeNull();
    companyId = ok.body.id;
  });

  it('manager creates a team objective aligned to the company one', async () => {
    const unit = await api(env.app, 'POST', '/org-units', hr.token, { name: 'Prodotto' });
    const r = await api(env.app, 'POST', '/objectives', manager.token, {
      cycleId, title: 'Ridurre il churn sotto il 3%', level: 'team', ownerOrgUnitId: unit.body.id, parentId: companyId, publish: true,
      keyResults: [{ title: 'Churn mensile', type: 'percent', startValue: 5, targetValue: 3, unit: '%' }],
    });
    expect(r.status).toBe(201);
    teamId = r.body.id;
    expect(r.body.keyResults[0].progress).toBe(0);
    expect(r.body.progress).toBe(0);
  });

  it('employee creates own objective with KRs; progress follows the spec formulas', async () => {
    const r = await api(env.app, 'POST', '/objectives', luca.token, {
      cycleId, title: 'Tempo di risposta P1 sotto le 4 ore', level: 'individual', parentId: teamId, publish: true,
      keyResults: [
        { title: 'Tempo medio risposta P1', type: 'number', startValue: 10, targetValue: 4, unit: 'h', weight: 2 },
        { title: 'Runbook on-call pubblicato', type: 'boolean', startValue: 0, targetValue: 1, weight: 1 },
      ],
    });
    expect(r.status).toBe(201);
    lucaObjId = r.body.id;
    krId = r.body.keyResults[0].id;
    expect(r.body.ownerPersonId).toBe(luca.personId);

    const ci = await api(env.app, 'POST', `/key-results/${krId}/check-ins`, luca.token, { value: 7, confidence: 'at_risk', comment: 'Turno notturno scoperto' });
    expect(ci.status).toBe(201);
    const kr = ci.body.keyResults.find((k: any) => k.id === krId);
    expect(kr.progress).toBeCloseTo(0.5); // (10-7)/(10-4)
    expect(kr.currentValue).toBe(7);
    // media pesata: (0.5*2 + 0*1)/3
    expect(ci.body.progress).toBeCloseTo(0.3333, 3);
    expect(ci.body.confidence).toBe('at_risk');
    expect(ci.body.stale).toBe(false);
  });

  it('progress rolls up to parents without key results', async () => {
    const team = await api(env.app, 'GET', `/objectives/${teamId}`, hr.token);
    expect(team.body.progress).toBe(0); // il team ha un proprio KR → non usa i figli
    const company = await api(env.app, 'GET', `/objectives/${companyId}`, hr.token);
    expect(company.body.progress).toBe(0); // media dei figli (team = 0)
    await api(env.app, 'POST', `/key-results/${team.body.keyResults[0].id}/check-ins`, manager.token, { value: 4, confidence: 'on_track' });
    const company2 = await api(env.app, 'GET', `/objectives/${companyId}`, hr.token);
    expect(company2.body.progress).toBeCloseTo(0.5); // (5-4)/(5-3)
  });

  it('rejects alignment cycles', async () => {
    const r = await api(env.app, 'PATCH', `/objectives/${companyId}`, hr.token, { parentId: lucaObjId });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('objective_alignment_cycle');
  });

  it('enforces write scope: employee cannot edit a colleague, manager can edit a direct report', async () => {
    const sara = await env.createUser(tenant.id, 'sara@acme.test', ['employee']);
    const denied = await api(env.app, 'PATCH', `/objectives/${lucaObjId}`, sara.token, { title: 'Hijack' });
    expect(denied.status).toBe(403);
    const ok = await api(env.app, 'PATCH', `/objectives/${lucaObjId}`, manager.token, { title: 'Tempo di risposta P1 sotto le 4 ore (rivisto)' });
    expect(ok.status).toBe(200);
  });

  it('private objectives are visible to owner and manager only', async () => {
    const priv = await api(env.app, 'POST', '/objectives', luca.token, { cycleId, title: 'Obiettivo privato', level: 'individual', visibility: 'private', publish: true });
    const sara = await env.createUser(tenant.id, 'sara2@acme.test', ['employee']);
    expect((await api(env.app, 'GET', `/objectives/${priv.body.id}`, sara.token)).status).toBe(404);
    expect((await api(env.app, 'GET', `/objectives/${priv.body.id}`, manager.token)).status).toBe(200);
    expect((await api(env.app, 'GET', `/objectives/${priv.body.id}`, luca.token)).status).toBe(200);
    const list = await api(env.app, 'GET', `/objectives?cycleId=${cycleId}`, sara.token);
    expect(list.body.map((o: any) => o.id)).not.toContain(priv.body.id);
  });

  it('returns the alignment tree and team view', async () => {
    const tree = await api(env.app, 'GET', `/objectives?cycleId=${cycleId}&tree=true`, hr.token);
    const company = tree.body.find((o: any) => o.id === companyId);
    expect(company.children[0].id).toBe(teamId);
    expect(company.children[0].children[0].id).toBe(lucaObjId);
    const team = await api(env.app, 'GET', `/objectives?team=true`, manager.token);
    expect(team.body.every((o: any) => o.ownerPersonId === luca.personId)).toBe(true);
    expect(team.body.length).toBeGreaterThanOrEqual(2);
  });

  it('closes an objective and freezes it', async () => {
    const r = await api(env.app, 'POST', `/objectives/${lucaObjId}/close`, luca.token, { outcome: 'partially', note: 'Target ricalibrato in Q4' });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('closed');
    expect(r.body.finalScore).toBeCloseTo(0.3333, 3);
    const again = await api(env.app, 'PATCH', `/objectives/${lucaObjId}`, luca.token, { title: 'x' });
    expect(again.status).toBe(409);
  });

  it('is isolated across tenants', async () => {
    expect((await api(env.app, 'GET', `/objectives/${companyId}`, outsider.token)).status).toBe(404);
    expect((await api(env.app, 'POST', `/key-results/${krId}/check-ins`, outsider.token, { value: 1, confidence: 'on_track' })).status).toBe(404);
    const list = await api(env.app, 'GET', '/objectives', outsider.token);
    expect(list.body).toEqual([]);
  });
});
