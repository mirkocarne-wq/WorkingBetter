import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestEnv, type TestEnv } from './helpers.js';

let env: TestEnv;
let tenantA: { id: string; slug: string };
let tenantB: { id: string; slug: string };
let hrA: { userId: string; personId: string; token: string };
let empA: { userId: string; personId: string; token: string };
let hrB: { userId: string; personId: string; token: string };

beforeAll(async () => {
  env = await createTestEnv();
  tenantA = await env.createTenant('Acme');
  tenantB = await env.createTenant('Globex');
  hrA = await env.createUser(tenantA.id, 'hr@acme.test', ['hr_admin'], { firstName: 'Chiara', lastName: 'Moretti' });
  empA = await env.createUser(tenantA.id, 'luca@acme.test', ['employee'], { firstName: 'Luca', lastName: 'Bianchi' });
  hrB = await env.createUser(tenantB.id, 'hr@globex.test', ['hr_admin'], { firstName: 'Hank', lastName: 'Scorpio' });
});
afterAll(() => env.close());

describe('health & auth', () => {
  it('GET /health is public', async () => {
    const r = await api(env.app, 'GET', '/health');
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('ok');
    // liveness e readiness fuori dal prefisso /api/v1, come documentato per i bilanciatori (docs/13)
    expect((await api(env.app, 'GET', '/health/live')).status).toBe(200);
    expect((await api(env.app, 'GET', '/health/ready')).status).toBe(200);
  });
  it('rejects missing or invalid tokens with problem+json', async () => {
    expect((await api(env.app, 'GET', '/me')).status).toBe(401);
    const r = await api(env.app, 'GET', '/me', 'not-a-token');
    expect(r.status).toBe(401);
    expect(r.body.code).toBe('unauthenticated');
  });
  it('dev-login issues a token for an existing user', async () => {
    const r = await api(env.app, 'POST', '/auth/dev-login', undefined, { tenantSlug: tenantA.slug, email: 'hr@acme.test' });
    expect(r.status).toBe(201);
    expect(r.body.roles).toEqual(['hr_admin']);
    const me = await api(env.app, 'GET', '/me', r.body.accessToken);
    expect(me.body.person.firstName).toBe('Chiara');
    expect(me.body.permissions).toContain('people:write');
  });
});

describe('people & org units', () => {
  let unitId: string;
  it('HR creates org units and people; employee cannot write', async () => {
    const root = await api(env.app, 'POST', '/org-units', hrA.token, { name: 'Acme S.p.A.' });
    expect(root.status).toBe(201);
    const prod = await api(env.app, 'POST', '/org-units', hrA.token, { name: 'Prodotto', parentId: root.body.id });
    unitId = prod.body.id;
    expect(prod.body.path).toBe(`/${root.body.id}/${prod.body.id}/`);
    const tree = await api(env.app, 'GET', '/org-units?tree=true', empA.token);
    expect(tree.body[0].children[0].name).toBe('Prodotto');

    const denied = await api(env.app, 'POST', '/people', empA.token, { firstName: 'X', lastName: 'Y' });
    expect(denied.status).toBe(403);

    const created = await api(env.app, 'POST', '/people', hrA.token, { firstName: 'Sara', lastName: 'Ricci', email: 'Sara@Acme.test', orgUnitId: unitId, managerId: hrA.personId });
    expect(created.status).toBe(201);
    expect(created.body.email).toBe('sara@acme.test');
    const hist = await api(env.app, 'GET', `/people/${created.body.id}/history`, hrA.token);
    expect(hist.body.map((h: any) => h.field).sort()).toEqual(['manager_id', 'org_unit_id']);
  });
  it('validation errors are problem+json with field paths', async () => {
    const r = await api(env.app, 'POST', '/people', hrA.token, { firstName: '', lastName: 'Y', email: 'nope' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('validation_error');
    expect(r.body.errors.map((e: any) => e.path)).toEqual(expect.arrayContaining(['firstName', 'email']));
  });
  it('a person cannot be their own manager', async () => {
    const r = await api(env.app, 'PATCH', `/people/${empA.personId}`, hrA.token, { managerId: empA.personId });
    expect(r.status).toBe(422);
  });
  it('people are isolated per tenant (RLS + API)', async () => {
    const listB = await api(env.app, 'GET', '/people', hrB.token);
    expect(listB.body.items.map((p: any) => p.email)).toEqual(['hr@globex.test']);
    const leak = await api(env.app, 'GET', `/people/${empA.personId}`, hrB.token);
    expect(leak.status).toBe(404);
  });
  it('paginates with cursors', async () => {
    const p1 = await api(env.app, 'GET', '/people?limit=2', hrA.token);
    expect(p1.body.items).toHaveLength(2);
    expect(p1.body.nextCursor).toBeTruthy();
    const p2 = await api(env.app, 'GET', `/people?limit=2&cursor=${p1.body.nextCursor}`, hrA.token);
    expect(p2.body.items.length).toBeGreaterThanOrEqual(1);
    expect(p2.body.items.map((p: any) => p.id)).not.toContain(p1.body.items[0].id);
  });
  it('writes an audit trail inside the same transaction (rejected writes leave no trace)', async () => {
    const { auditLog, withTenant } = await import('@wb/db');
    const ok = await api(env.app, 'PATCH', `/people/${empA.personId}`, hrA.token, { jobTitle: 'Senior Developer' });
    expect(ok.status).toBe(200);
    const rows = await withTenant(env.db, tenantA.id, (tx) => tx.select().from(auditLog));
    const actions = rows.map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(['org_unit.create', 'person.create', 'person.update']));
    // il PATCH "manager di sé stesso" (422) è stato annullato: un solo person.update
    expect(actions.filter((a) => a === 'person.update')).toHaveLength(1);
    expect(rows.every((r) => r.tenantId === tenantA.id)).toBe(true);
    expect(rows.find((r) => r.action === 'person.update')?.actorUserId).toBe(hrA.userId);
  });
});
