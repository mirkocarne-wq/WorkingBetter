import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestEnv, type TestEnv } from './helpers.js';

/** Sprint 26: campi custom della persona (CORE-011), glossario aziendale (CORE-003), moduli per tenant (CORE-004). */
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

describe('person custom fields (CORE-011)', () => {
  let contractId: string;
  it('HR defines fields; key must be unique and choice fields need options', async () => {
    const r = await api(env.app, 'POST', '/person-fields', hr.token, { key: 'contract_type', label: 'Tipo contratto', type: 'single_choice', options: [{ value: 'perm', label: 'Indeterminato' }, { value: 'fixed', label: 'Determinato' }], visibility: 'all', required: false });
    expect(r.status).toBe(201);
    contractId = r.body.id;
    expect((await api(env.app, 'POST', '/person-fields', hr.token, { key: 'contract_type', label: 'Doppio' })).status).toBe(409);
    expect((await api(env.app, 'POST', '/person-fields', hr.token, { key: 'Bad Key', label: 'x' })).status).toBe(400);
    expect((await api(env.app, 'POST', '/person-fields', hr.token, { key: 'nochoice', label: 'x', type: 'single_choice' })).status).toBe(422);
    expect((await api(env.app, 'POST', '/person-fields', hr.token, { key: 'cost_center', label: 'Centro di costo', type: 'text', visibility: 'manager' })).status).toBe(201);
    expect((await api(env.app, 'POST', '/person-fields', hr.token, { key: 'salary_band', label: 'Fascia', type: 'number', visibility: 'hr' })).status).toBe(201);
    expect((await api(env.app, 'POST', '/person-fields', hr.token, { key: 'remote', label: 'Smart working', type: 'boolean', visibility: 'all' })).status).toBe(201);
  });
  it('employee cannot manage the catalog but can read it; tenants are isolated', async () => {
    expect((await api(env.app, 'POST', '/person-fields', emp.token, { key: 'x', label: 'x' })).status).toBe(403);
    const list = await api(env.app, 'GET', '/person-fields', emp.token);
    expect(list.status).toBe(200);
    expect(list.body.map((d: { key: string }) => d.key)).toEqual(['contract_type', 'cost_center', 'salary_band', 'remote']);
    expect((await api(env.app, 'GET', '/person-fields', hrB.token)).body).toEqual([]);
  });
  it('values are validated against the catalog and merged on update', async () => {
    const bad = await api(env.app, 'PATCH', `/people/${emp.personId}`, hr.token, { customFields: { contract_type: 'nope', unknown_key: 1 } });
    expect(bad.status).toBe(422);
    expect(bad.body.detail).toContain('contract_type');
    expect(bad.body.detail).toContain('unknown_key');
    const ok = await api(env.app, 'PATCH', `/people/${emp.personId}`, hr.token, { customFields: { contract_type: 'perm', salary_band: '3,5', remote: 'sì' } });
    expect(ok.status).toBe(200);
    expect(ok.body.customFields).toEqual({ contract_type: 'perm', salary_band: 3.5, remote: true });
    const merged = await api(env.app, 'PATCH', `/people/${emp.personId}`, hr.token, { customFields: { cost_center: 'CC-42', salary_band: null } });
    expect(merged.body.customFields).toEqual({ contract_type: 'perm', remote: true, cost_center: 'CC-42' });
  });
  it('visibility: HR sees all, the manager also «manager» fields, the person only «all»', async () => {
    await api(env.app, 'PATCH', `/people/${emp.personId}`, hr.token, { customFields: { salary_band: 4 } });
    expect((await api(env.app, 'GET', `/people/${emp.personId}`, hr.token)).body.customFields).toEqual({ contract_type: 'perm', remote: true, cost_center: 'CC-42', salary_band: 4 });
    expect((await api(env.app, 'GET', `/people/${emp.personId}`, mgr.token)).body.customFields).toEqual({ contract_type: 'perm', remote: true, cost_center: 'CC-42' });
    expect((await api(env.app, 'GET', `/people/${emp.personId}`, emp.token)).body.customFields).toEqual({ contract_type: 'perm', remote: true });
    const list = await api(env.app, 'GET', '/people?limit=50', emp.token);
    const me = list.body.items.find((p: { id: string }) => p.id === emp.personId);
    expect(me.customFields).toEqual({ contract_type: 'perm', remote: true });
    expect((await api(env.app, 'GET', '/me', emp.token)).body.person.customFields).toEqual({ contract_type: 'perm', remote: true });
    expect((await api(env.app, 'GET', '/me', mgr.token)).body.person.customFields).toEqual({});
  });
  it('archiving a field hides it from the catalog and rejects new values', async () => {
    const r = await api(env.app, 'PATCH', `/person-fields/${contractId}`, hr.token, { archived: true, label: 'Tipo contratto (vecchio)' });
    expect(r.status).toBe(200);
    expect(r.body.archivedAt).toBeTruthy();
    expect((await api(env.app, 'GET', '/person-fields', hr.token)).body.map((d: { key: string }) => d.key)).not.toContain('contract_type');
    expect((await api(env.app, 'GET', '/person-fields?includeArchived=true', hr.token)).body.map((d: { key: string }) => d.key)).toContain('contract_type');
    expect((await api(env.app, 'PATCH', `/people/${emp.personId}`, hr.token, { customFields: { contract_type: 'fixed' } })).status).toBe(422);
    await api(env.app, 'PATCH', `/person-fields/${contractId}`, hr.token, { archived: false });
  });
  it('CSV import accepts custom:<key> columns and validates them', async () => {
    const csv = 'first_name,last_name,email,custom:cost_center,custom:remote,custom:nope\nMario,Rossi,mario@acme.test,CC-7,si,x\nPaola,Verdi,paola@acme.test,CC-8,forse,x\n';
    const dry = await api(env.app, 'POST', '/people/import', hr.token, { csv, dryRun: true });
    expect(dry.status).toBe(201);
    expect(dry.body.unknownColumns).toEqual(['custom:nope']);
    expect(dry.body.valid).toBe(1);
    expect(dry.body.errors).toEqual([{ row: 3, field: 'custom:remote', message: 'sì/no atteso' }]);
    const run = await api(env.app, 'POST', '/people/import', hr.token, { csv: csv.split('\n').slice(0, 2).join('\n'), dryRun: false });
    expect(run.body.created).toBe(1);
    const people = await api(env.app, 'GET', '/people?q=mario', hr.token);
    expect(people.body.items[0].customFields).toEqual({ cost_center: 'CC-7', remote: true });
  });
});

describe('company glossary (CORE-003)', () => {
  it('defaults come from the platform per locale and everyone can read them', async () => {
    const r = await api(env.app, 'GET', '/naming', emp.token);
    expect(r.status).toBe(200);
    expect(r.body.locale).toBe('it');
    expect(r.body.naming.objective).toEqual({ singular: 'Obiettivo', plural: 'Obiettivi' });
    expect(r.body.overrides).toEqual({});
    expect((await api(env.app, 'GET', '/naming?locale=en', emp.token)).body.naming.objective.plural).toBe('Objectives');
  });
  it('only the tenant admin renames; empty entries fall back to defaults; tenants are isolated', async () => {
    expect((await api(env.app, 'PUT', '/naming', hr.token, { overrides: { objective: { singular: 'Priorità', plural: 'Priorità' } } })).status).toBe(403);
    const r = await api(env.app, 'PUT', '/naming', admin.token, { overrides: { objective: { singular: 'Priorità', plural: 'Priorità' }, one_on_one: { singular: 'Punto' }, review: { singular: '', plural: '' } } });
    expect(r.status).toBe(200);
    expect(r.body.naming.objective).toEqual({ singular: 'Priorità', plural: 'Priorità' });
    expect(r.body.naming.one_on_one).toEqual({ singular: 'Punto', plural: 'Punto' });
    expect(r.body.naming.review).toEqual({ singular: 'Review', plural: 'Review' });
    expect((await api(env.app, 'GET', '/naming', emp.token)).body.naming.objective.plural).toBe('Priorità');
    expect((await api(env.app, 'GET', '/naming', hrB.token)).body.naming.objective.plural).toBe('Obiettivi');
    const reset = await api(env.app, 'PUT', '/naming', admin.token, { overrides: { objective: {} } });
    expect(reset.body.naming.objective.plural).toBe('Obiettivi');
    expect(reset.body.naming.one_on_one.singular).toBe('1:1');
  });
});

describe('tenant modules (CORE-004)', () => {
  it('missing keys mean enabled; admin toggles; guide and Home follow', async () => {
    expect((await api(env.app, 'GET', '/tenant', emp.token)).body.settings.modules).toBeUndefined();
    const before = await api(env.app, 'GET', '/guides/me', hr.token);
    expect(before.body.steps.some((s: { key: string }) => s.key === 'hr_welfare')).toBe(true);
    expect((await api(env.app, 'PUT', '/tenant/modules', hr.token, { modules: { welfare: false } })).status).toBe(403);
    const r = await api(env.app, 'PUT', '/tenant/modules', admin.token, { modules: { welfare: false, surveys: false } });
    expect(r.status).toBe(200);
    expect(r.body.modules).toEqual({ welfare: false, surveys: false });
    expect((await api(env.app, 'PUT', '/tenant/modules', admin.token, { modules: { surveys: true } })).body.modules).toEqual({ welfare: false, surveys: true });
    expect((await api(env.app, 'PUT', '/tenant/modules', admin.token, { modules: { nope: true } })).status).toBe(400);
    const t = await api(env.app, 'GET', '/tenant', emp.token);
    expect(t.body.settings.modules).toEqual({ welfare: false, surveys: true });
    const after = await api(env.app, 'GET', '/guides/me', hr.token);
    expect(after.body.steps.some((s: { key: string }) => s.key === 'hr_welfare')).toBe(false);
    expect(after.body.steps.length).toBe(before.body.steps.length - 1);
    expect((await api(env.app, 'GET', '/me/todo', emp.token)).status).toBe(200);
  });
});
