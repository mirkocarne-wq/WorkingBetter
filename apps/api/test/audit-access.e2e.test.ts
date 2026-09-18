import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestEnv, type TestEnv } from './helpers.js';

/** Sprint 29: audit consultabile (CORE-051) e vista «cosa vede X» (CORE-044). */
let env: TestEnv;
let tenantA: { id: string; slug: string };
let tenantB: { id: string; slug: string };
let hr: { userId: string; personId: string; token: string };
let mgr: { userId: string; personId: string; token: string };
let emp: { userId: string; personId: string; token: string };
let hrB: { userId: string; personId: string; token: string };

beforeAll(async () => {
  env = await createTestEnv();
  tenantA = await env.createTenant('Acme');
  tenantB = await env.createTenant('Globex');
  hr = await env.createUser(tenantA.id, 'hr@acme.test', ['hr_admin'], { firstName: 'Chiara', lastName: 'Moretti' });
  mgr = await env.createUser(tenantA.id, 'mgr@acme.test', ['manager'], { firstName: 'Giulia', lastName: 'Ferri' });
  emp = await env.createUser(tenantA.id, 'emp@acme.test', ['employee'], { firstName: 'Luca', lastName: 'Bianchi', managerId: mgr.personId });
  hrB = await env.createUser(tenantB.id, 'hr@globex.test', ['hr_admin'], { firstName: 'Hank', lastName: 'Scorpio' });
});
afterAll(() => env.close());

describe('audit search and export (CORE-051)', () => {
  it('lists actions with actor, changed fields and never the values; filters and pagination work; tenants are isolated', async () => {
    // qualche scrittura tracciata
    const p = await api(env.app, 'PATCH', `/people/${emp.personId}`, hr.token, { jobTitle: 'Senior Developer', location: 'Milano' });
    expect(p.status).toBe(200);
    await api(env.app, 'POST', '/org-units', hr.token, { name: 'Segretissima' });
    expect((await api(env.app, 'GET', '/audit', emp.token)).status).toBe(403);
    const all = await api(env.app, 'GET', '/audit?limit=50', hr.token);
    expect(all.status).toBe(200);
    const upd = all.body.items.find((r: { action: string }) => r.action === 'person.update');
    expect(upd).toBeTruthy();
    expect(upd.actorEmail).toBe('hr@acme.test');
    expect(upd.actorName).toBe('Chiara Moretti');
    expect(upd.entityId).toBe(emp.personId);
    expect(upd.changedFields.sort()).toEqual(['jobTitle', 'location']);
    expect(JSON.stringify(all.body)).not.toContain('Senior Developer');
    expect(JSON.stringify(all.body)).not.toContain('Segretissima');
    const byAction = await api(env.app, 'GET', '/audit?action=org_unit.', hr.token);
    expect(byAction.body.items.every((r: { action: string }) => r.action.startsWith('org_unit.'))).toBe(true);
    expect(byAction.body.items.length).toBeGreaterThanOrEqual(1);
    const byEntity = await api(env.app, 'GET', `/audit?entityType=person&entityId=${emp.personId}`, hr.token);
    expect(byEntity.body.items.length).toBeGreaterThanOrEqual(1);
    expect(byEntity.body.items.every((r: { entityId: string }) => r.entityId === emp.personId)).toBe(true);
    const byActor = await api(env.app, 'GET', `/audit?actorUserId=${mgr.userId}`, hr.token);
    expect(byActor.body.items).toEqual([]);
    const today = new Date().toISOString().slice(0, 10);
    expect((await api(env.app, 'GET', `/audit?from=${today}&to=${today}`, hr.token)).body.items.length).toBeGreaterThanOrEqual(2);
    expect((await api(env.app, 'GET', '/audit?from=2000-01-01&to=2000-01-02', hr.token)).body.items).toEqual([]);
    const page1 = await api(env.app, 'GET', '/audit?limit=1', hr.token);
    expect(page1.body.items).toHaveLength(1);
    expect(page1.body.nextBeforeAt).toBeTruthy();
    const page2 = await api(env.app, 'GET', `/audit?limit=1&beforeAt=${encodeURIComponent(page1.body.nextBeforeAt)}`, hr.token);
    expect(page2.body.items[0].id).not.toBe(page1.body.items[0].id);
    const actions = await api(env.app, 'GET', '/audit/actions', hr.token);
    expect(actions.body).toContain('person.update');
    // l'altro tenant non vede nulla di Acme
    const other = await api(env.app, 'GET', '/audit?limit=50', hrB.token);
    expect(other.body.items.some((r: { entityId: string }) => r.entityId === emp.personId)).toBe(false);
  });
  it('exports CSV with the same filters and records the export itself', async () => {
    const res = await env.app.inject({ method: 'GET', url: '/api/v1/audit/export?action=person.', headers: { authorization: `Bearer ${hr.token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const lines = res.body.trim().split('\n');
    expect(lines[0]).toBe('at;action;entity_type;entity_id;actor_email;actor_name;ip;changed_fields;request_id');
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.slice(1).every((l) => l.split(';')[1]!.startsWith('person.'))).toBe(true);
    expect(res.body).not.toContain('Senior Developer');
    const after = await api(env.app, 'GET', '/audit?action=audit.export', hr.token);
    expect(after.body.items).toHaveLength(1);
    expect(after.body.items[0].changedFields).toEqual(expect.arrayContaining(['rows', 'filters']));
  });
});

describe('«cosa vede X» (CORE-044)', () => {
  it('shows roles, effective permissions per module, perimeter and guide profile', async () => {
    expect((await api(env.app, 'GET', `/users/${mgr.userId}/access`, emp.token)).status).toBe(403);
    const r = await api(env.app, 'GET', `/users/${mgr.userId}/access`, hr.token);
    expect(r.status).toBe(200);
    expect(r.body.user.email).toBe('mgr@acme.test');
    expect(r.body.roles.map((x: { key: string }) => x.key)).toEqual(['manager']);
    expect(r.body.roles[0].name).toBe('Manager');
    expect(r.body.guideProfile).toBe('manager');
    expect(r.body.permissions).toContain('objectives:write:team');
    expect(r.body.permissions).not.toContain('people:write');
    const okr = r.body.catalog.find((g: { module: string }) => g.module === 'okr');
    expect(okr.moduleEnabled).toBe(true);
    expect(okr.items.find((i: { key: string }) => i.key === 'objectives:write:team').granted).toBe(true);
    expect(okr.items.find((i: { key: string }) => i.key === 'objectives:write:any').granted).toBe(false);
    expect(r.body.perimeter.directReports.map((d: { id: string }) => d.id)).toEqual([emp.personId]);
    expect(r.body.perimeter.indirectReportsCount).toBe(0);
    expect(r.body.perimeter.customFieldsVisibility).toBe('manager');
    expect(r.body.perimeter.seesEveryone).toBe(false);
    expect(r.body.perimeter.orgUnitScopeApplied).toBe(false);
  });
  it('reflects customized built-in roles, custom roles with base role and disabled modules', async () => {
    await api(env.app, 'PATCH', '/roles/manager', hr.token, { permissions: ['people:read', 'org:read', 'notifications:read', 'objectives:read', 'objectives:write:team'] });
    await api(env.app, 'POST', '/roles', hr.token, { key: 'people_ops', name: 'People Ops', baseRole: 'hrbp', permissions: ['people:read', 'people:write', 'notifications:read'] });
    await api(env.app, 'POST', '/role-assignments', hr.token, { userId: mgr.userId, role: 'people_ops' });
    const admin = await env.createUser(tenantA.id, 'admin@acme.test', ['tenant_admin']);
    await api(env.app, 'PUT', '/tenant/modules', admin.token, { modules: { surveys: false } });
    const r = await api(env.app, 'GET', `/users/${mgr.userId}/access`, hr.token);
    expect(r.body.roles.map((x: { key: string; customized?: boolean; baseRole?: string | null }) => [x.key, x.customized, x.baseRole])).toEqual([['manager', true, null], ['people_ops', false, 'hrbp']]);
    expect(r.body.implicitRoles).toEqual(['hrbp']);
    expect(r.body.guideProfile).toBe('hr');
    expect(r.body.permissions).not.toContain('surveys:results:team');
    expect(r.body.permissions).toContain('people:write');
    expect(r.body.catalog.find((g: { module: string }) => g.module === 'surveys').moduleEnabled).toBe(false);
    expect(r.body.perimeter.customFieldsVisibility).toBe('hr');
    expect(r.body.perimeter.seesEveryone).toBe(true);
    expect((await api(env.app, 'GET', `/users/${mgr.userId}/access`, hrB.token)).status).toBe(404);
  });
});
