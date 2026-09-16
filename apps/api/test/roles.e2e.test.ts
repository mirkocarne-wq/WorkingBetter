import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestEnv, type TestEnv } from './helpers.js';

/** Sprint 27: ruoli custom e permessi per modulo (CORE-041/043). */
let env: TestEnv;
let tenantA: { id: string; slug: string };
let tenantB: { id: string; slug: string };
let admin: { userId: string; personId: string; token: string };
let hr: { userId: string; personId: string; token: string };
let mgr: { userId: string; personId: string; token: string };
let emp: { userId: string; personId: string; token: string };
let hrB: { userId: string; personId: string; token: string };

beforeAll(async () => {
  env = await createTestEnv();
  tenantA = await env.createTenant('Acme');
  tenantB = await env.createTenant('Globex');
  admin = await env.createUser(tenantA.id, 'admin@acme.test', ['tenant_admin'], { firstName: 'Anna', lastName: 'Colombo' });
  hr = await env.createUser(tenantA.id, 'hr@acme.test', ['hr_admin'], { firstName: 'Chiara', lastName: 'Moretti' });
  mgr = await env.createUser(tenantA.id, 'mgr@acme.test', ['manager'], { firstName: 'Giulia', lastName: 'Ferri' });
  emp = await env.createUser(tenantA.id, 'emp@acme.test', ['employee'], { firstName: 'Luca', lastName: 'Bianchi', managerId: mgr.personId });
  hrB = await env.createUser(tenantB.id, 'hr@globex.test', ['hr_admin'], { firstName: 'Hank', lastName: 'Scorpio' });
});
afterAll(() => env.close());

describe('roles catalog', () => {
  it('lists built-in roles with default permissions; employees cannot read it', async () => {
    const r = await api(env.app, 'GET', '/roles', hr.token);
    expect(r.status).toBe(200);
    const keys = r.body.map((x: { key: string }) => x.key);
    expect(keys).toEqual(['tenant_admin', 'hr_admin', 'hrbp', 'manager', 'employee', 'observer', 'analyst']);
    const manager = r.body.find((x: { key: string }) => x.key === 'manager');
    expect(manager.builtIn).toBe(true);
    expect(manager.customized).toBe(false);
    expect(manager.permissions).toContain('surveys:results:team');
    expect(manager.assignedUsers).toBe(1);
    expect((await api(env.app, 'GET', '/roles', emp.token)).status).toBe(403);
  });
});

describe('per-module permissions on built-in roles (CORE-043)', () => {
  it('removing a permission from manager takes effect on the next request and can be reset', async () => {
    const before = await api(env.app, 'GET', '/me', mgr.token);
    expect(before.body.permissions).toContain('surveys:results:team');
    const r = await api(env.app, 'PATCH', '/roles/manager', hr.token, { permissions: before.body.permissions.filter((p: string) => p !== 'surveys:results:team') });
    expect(r.status).toBe(200);
    expect(r.body.customized).toBe(true);
    expect(r.body.permissions).not.toContain('surveys:results:team');
    const after = await api(env.app, 'GET', '/me', mgr.token);
    expect(after.body.permissions).not.toContain('surveys:results:team');
    expect(after.body.permissions).toContain('objectives:write:team');
    // il ruolo di un altro tenant non cambia
    expect((await api(env.app, 'GET', '/roles', hrB.token)).body.find((x: { key: string }) => x.key === 'manager').customized).toBe(false);
    const reset = await api(env.app, 'POST', '/roles/manager/reset', hr.token);
    expect(reset.status).toBe(201);
    expect(reset.body.customized).toBe(false);
    expect((await api(env.app, 'GET', '/me', mgr.token)).body.permissions).toContain('surveys:results:team');
  });
  it('tenant admin cannot lose the protected permissions; unknown permissions and super_admin are rejected', async () => {
    const r = await api(env.app, 'PATCH', '/roles/tenant_admin', admin.token, { permissions: ['people:read'] });
    expect(r.status).toBe(200);
    expect(r.body.permissions).toEqual(expect.arrayContaining(['people:read', 'tenant:settings', 'roles:manage']));
    expect((await api(env.app, 'GET', '/me', admin.token)).body.permissions).not.toContain('welfare:manage');
    await api(env.app, 'POST', '/roles/tenant_admin/reset', admin.token);
    expect((await api(env.app, 'PATCH', '/roles/manager', hr.token, { permissions: ['people:read', 'nope:x'] })).status).toBe(422);
    expect((await api(env.app, 'PATCH', '/roles/super_admin', admin.token, { permissions: [] })).status).toBe(422);
    expect((await api(env.app, 'PATCH', '/roles/manager', hr.token, { archived: true })).status).toBe(422);
  });
});

describe('custom roles (CORE-041)', () => {
  it('creates a custom role, assigns it and the user gets only its permissions plus the base-role perimeter', async () => {
    const r = await api(env.app, 'POST', '/roles', hr.token, { key: 'people_ops', name: 'People Ops', baseRole: 'hrbp', permissions: ['people:read', 'people:write', 'people:import', 'org:read', 'notifications:read'] });
    expect(r.status).toBe(201);
    expect(r.body.builtIn).toBe(false);
    expect(r.body.baseRole).toBe('hrbp');
    expect((await api(env.app, 'POST', '/roles', hr.token, { key: 'people_ops', name: 'Dup', baseRole: 'employee', permissions: [] })).status).toBe(409);
    expect((await api(env.app, 'POST', '/roles', hr.token, { key: 'manager', name: 'x', baseRole: 'employee', permissions: [] })).status).toBe(409);
    expect((await api(env.app, 'POST', '/roles', hr.token, { key: 'Bad Key', name: 'x', baseRole: 'employee', permissions: [] })).status).toBe(400);
    expect((await api(env.app, 'POST', '/role-assignments', hr.token, { userId: emp.userId, role: 'ghost_role' })).status).toBe(422);
    const assign = await api(env.app, 'POST', '/role-assignments', hr.token, { userId: emp.userId, role: 'people_ops' });
    expect(assign.status).toBe(201);
    // il token porta le chiavi dei ruoli: ne emettiamo uno con il ruolo custom
    const tok = await env.tokenFor({ userId: emp.userId, tenantId: tenantA.id, personId: emp.personId, roles: ['people_ops'] });
    const me = await api(env.app, 'GET', '/me', tok);
    expect(me.status).toBe(200);
    expect(me.body.permissions.sort()).toEqual(['notifications:read', 'org:read', 'people:import', 'people:read', 'people:write']);
    expect(me.body.user.roles).toEqual(['people_ops', 'hrbp']);
    expect((await api(env.app, 'POST', '/people', tok, { firstName: 'Nuova', lastName: 'Persona' })).status).toBe(201);
    expect((await api(env.app, 'GET', '/objectives', tok)).status).toBe(403);
    expect((await api(env.app, 'GET', '/guides/me', tok)).body.profile).toBe('hr');
    // un altro tenant non vede il ruolo
    expect((await api(env.app, 'GET', '/roles', hrB.token)).body.some((x: { key: string }) => x.key === 'people_ops')).toBe(false);
    expect((await api(env.app, 'GET', '/me', await env.tokenFor({ userId: hrB.userId, tenantId: tenantB.id, personId: hrB.personId, roles: ['people_ops'] }))).body.permissions).toEqual([]);
  });
  it('an assigned custom role cannot be archived; after revoking it can, and stops being assignable', async () => {
    expect((await api(env.app, 'PATCH', '/roles/people_ops', hr.token, { archived: true })).status).toBe(409);
    const roles = await api(env.app, 'GET', `/users/${emp.userId}/roles`, hr.token);
    const a = roles.body.find((x: { role: string }) => x.role === 'people_ops');
    expect((await api(env.app, 'DELETE', `/role-assignments/${a.id}`, hr.token)).status).toBe(204);
    const upd = await api(env.app, 'PATCH', '/roles/people_ops', hr.token, { archived: true, name: 'People Ops (vecchio)' });
    expect(upd.status).toBe(200);
    expect(upd.body.archivedAt).toBeTruthy();
    expect((await api(env.app, 'GET', '/roles', hr.token)).body.some((x: { key: string }) => x.key === 'people_ops')).toBe(false);
    expect((await api(env.app, 'GET', '/roles?includeArchived=true', hr.token)).body.some((x: { key: string }) => x.key === 'people_ops')).toBe(true);
    expect((await api(env.app, 'POST', '/role-assignments', hr.token, { userId: emp.userId, role: 'people_ops' })).status).toBe(422);
    expect((await api(env.app, 'POST', '/users/invite', hr.token, { email: 'x@acme.test', firstName: 'X', lastName: 'Y', roles: ['people_ops'] })).status).toBe(422);
    const tok = await env.tokenFor({ userId: emp.userId, tenantId: tenantA.id, personId: emp.personId, roles: ['people_ops'] });
    expect((await api(env.app, 'GET', '/me', tok)).body.permissions).toEqual([]);
  });
});
