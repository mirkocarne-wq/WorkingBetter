import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { actionItems, appInstances, persons } from '@wb/db';
import { api, createTestEnv, type TestEnv } from './helpers.js';

/** Sprint 28: automazioni «quando → se → allora» (APP-037/038, ADR-0015). */
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

describe('rules CRUD and catalog', () => {
  it('exposes the catalog and validates rules', async () => {
    const cat = await api(env.app, 'GET', '/automations/catalog', hr.token);
    expect(cat.status).toBe(200);
    expect(cat.body.events.map((e: { key: string }) => e.key)).toContain('person.tenure');
    expect((await api(env.app, 'GET', '/automations', emp.token)).status).toBe(403);
    expect((await api(env.app, 'POST', '/automations', hr.token, { name: 'x', trigger: { event: 'person.tenure' }, actions: [{ type: 'notify', to: ['hr'], message: 'ciao' }] })).status).toBe(422);
    expect((await api(env.app, 'POST', '/automations', hr.token, { name: 'x', trigger: { event: 'nope' }, actions: [] })).status).toBe(400);
    expect((await api(env.app, 'POST', '/automations', hr.token, { name: 'x', trigger: { event: 'person.created' }, actions: [{ type: 'person_field', field: 'drop table', value: 'x' }] })).status).toBe(400);
  });
});

describe('event-driven rules', () => {
  let ruleId: string;
  it('person.created in Milano → action item for the manager, custom field set, notification to HR', async () => {
    const r = await api(env.app, 'POST', '/automations', hr.token, {
      name: 'Benvenuto Milano', trigger: { event: 'person.created' }, conditions: [{ field: 'person.location', op: 'eq', value: 'Milano' }, { field: 'source', op: 'in', value: ['manual', 'import'] }],
      actions: [{ type: 'action_item', title: 'Prepara la postazione', assignee: 'manager', dueDays: 3 }, { type: 'person_field', field: 'custom:onboarded_by', value: 'automation' }, { type: 'notify', to: ['hr'], message: 'Nuovo ingresso a Milano' }],
    });
    expect(r.status).toBe(201);
    ruleId = r.body.id;
    // fuori condizione: Torino
    const t = await api(env.app, 'POST', '/people', hr.token, { firstName: 'Tea', lastName: 'Torino', location: 'Torino' });
    expect(t.status).toBe(201);
    // in condizione: Milano, con manager
    const m = await api(env.app, 'POST', '/people', hr.token, { firstName: 'Mario', lastName: 'Milano', location: 'Milano', managerId: mgr.personId });
    expect(m.status).toBe(201);
    const runs = await api(env.app, 'GET', `/automations/${ruleId}/runs`, hr.token);
    expect(runs.status).toBe(200);
    expect(runs.body).toHaveLength(1);
    expect(runs.body[0].subjectPersonId).toBe(m.body.id);
    expect(runs.body[0].ok).toBe(true);
    expect(runs.body[0].results.map((x: { type: string; ok: boolean }) => [x.type, x.ok])).toEqual([['action_item', true], ['person_field', true], ['notify', true]]);
    const [person] = await env.db.select().from(persons).where(eq(persons.id, m.body.id));
    expect((person!.customFields as Record<string, unknown>).onboarded_by).toBe('automation');
    const items = await env.db.select().from(actionItems).where(eq(actionItems.ownerPersonId, mgr.personId));
    expect(items.some((i) => i.title === 'Prepara la postazione' && i.source === 'app')).toBe(true);
    const notif = await api(env.app, 'GET', '/notifications', hr.token);
    expect(JSON.stringify(notif.body)).toContain('Nuovo ingresso a Milano');
    const rule = await api(env.app, 'GET', `/automations/${ruleId}`, hr.token);
    expect(rule.body.runsCount).toBe(1);
    expect(rule.body.lastRunAt).toBeTruthy();
  });
  it('disabled or archived rules do not run; other tenants do not see them', async () => {
    await api(env.app, 'PATCH', `/automations/${ruleId}`, hr.token, { enabled: false });
    await api(env.app, 'POST', '/people', hr.token, { firstName: 'Nina', lastName: 'Milano', location: 'Milano' });
    expect((await api(env.app, 'GET', `/automations/${ruleId}/runs`, hr.token)).body).toHaveLength(1);
    expect((await api(env.app, 'GET', '/automations', hrB.token)).body).toEqual([]);
    expect((await api(env.app, 'GET', `/automations/${ruleId}`, hrB.token)).status).toBe(404);
    const arch = await api(env.app, 'PATCH', `/automations/${ruleId}`, hr.token, { archived: true });
    expect(arch.body.archivedAt).toBeTruthy();
    expect((await api(env.app, 'GET', '/automations', hr.token)).body.some((x: { id: string }) => x.id === ruleId)).toBe(false);
    expect((await api(env.app, 'GET', '/automations?includeArchived=true', hr.token)).body.some((x: { id: string }) => x.id === ruleId)).toBe(true);
  });
  it('app.completed → start another app (depth-limited chain), with dedupe per source', async () => {
    // due app di sole azioni: la prima avvia la seconda tramite regola; la seconda chiude subito e non deve rilanciare nulla
    const mk = async (key: string, name: string) => {
      const c = await api(env.app, 'POST', '/apps', hr.token, { key, name, naming: { instanceLabel: 'Pratica', launchVerb: 'Avvia', subjectLabel: 'Persona' }, permissions: { launch: ['hr'], viewInstances: ['hr'] }, stages: [{ key: 'do', name: 'Fai', type: 'action', actor: 'subject', dueDays: 1, actions: [{ type: 'person_field', field: 'custom:last_app', value: key }] }] });
      expect(c.status).toBe(201);
      const pub = await api(env.app, 'POST', `/apps/${c.body.id}/publish`, hr.token);
      expect(pub.status).toBe(201);
      return c.body.id as string;
    };
    await mk('auto_first', 'Prima');
    await mk('auto_second', 'Seconda');
    const rule = await api(env.app, 'POST', '/automations', hr.token, { name: 'Catena', trigger: { event: 'app.completed', appKey: 'auto_first' }, actions: [{ type: 'start_app', appKey: 'auto_second' }] });
    expect(rule.status).toBe(201);
    const loop = await api(env.app, 'POST', '/automations', hr.token, { name: 'Loop', trigger: { event: 'app.completed', appKey: 'auto_second' }, actions: [{ type: 'start_app', appKey: 'auto_first' }] });
    expect(loop.status).toBe(201);
    const launch = await api(env.app, 'POST', '/apps/instances', hr.token, { appKey: 'auto_first', subjectPersonId: emp.personId });
    expect(launch.status).toBe(201);
    const runs1 = await api(env.app, 'GET', `/automations/${rule.body.id}/runs`, hr.token);
    expect(runs1.body).toHaveLength(1);
    expect(runs1.body[0].results[0].ok).toBe(true);
    // la seconda app si è conclusa nella stessa transazione: la regola «Loop» scatta (profondità 1) ma non oltre
    const runs2 = await api(env.app, 'GET', `/automations/${loop.body.id}/runs`, hr.token);
    expect(runs2.body.length).toBeLessThanOrEqual(1);
    const [person] = await env.db.select().from(persons).where(eq(persons.id, emp.personId));
    expect(['auto_first', 'auto_second']).toContain((person!.customFields as Record<string, unknown>).last_app);
    const mine = (await env.db.select().from(appInstances).where(eq(appInstances.subjectPersonId, emp.personId))).filter((i) => i.appKey.startsWith('auto_'));
    expect(mine.length).toBeGreaterThanOrEqual(2);
    expect(mine.length).toBeLessThanOrEqual(3);
  });
  it('dry-run reports which rules would fire without acting', async () => {
    const r = await api(env.app, 'POST', '/automations/dry-run', hr.token, { type: 'app.completed', subjectPersonId: emp.personId, data: { appKey: 'auto_first', outcome: 'executed' } });
    expect(r.status).toBe(201);
    expect(r.body.find((x: { name: string }) => x.name === 'Catena').matches).toBe(true);
    expect(r.body.find((x: { name: string }) => x.name === 'Loop').matches).toBe(false);
  });
});

describe('timed triggers via the internal tick', () => {
  it('rejects a missing token and runs person.tenure rules for the day', async () => {
    const hireDate = '2026-06-18'; // 90 giorni prima del 2026-09-16
    const p = await api(env.app, 'POST', '/people', hr.token, { firstName: 'Novanta', lastName: 'Giorni', hireDate, managerId: mgr.personId });
    expect(p.status).toBe(201);
    const rule = await api(env.app, 'POST', '/automations', hr.token, { name: 'Check 90 giorni', trigger: { event: 'person.tenure', days: 90 }, actions: [{ type: 'action_item', title: 'Colloquio di fine prova', assignee: 'manager', dueDays: 7 }, { type: 'notify', to: ['subject', 'manager'], message: 'Sono passati 90 giorni: prepariamo il colloquio' }] });
    expect(rule.status).toBe(201);
    expect((await api(env.app, 'POST', '/internal/automations/tick', undefined, { today: '2026-09-16' })).status).toBe(401);
    const res = await env.app.inject({ method: 'POST', url: '/api/v1/internal/automations/tick', headers: { 'content-type': 'application/json', 'x-internal-token': 'test-internal-job-token-1234' }, payload: JSON.stringify({ today: '2026-09-16' }) });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.tenants).toBeGreaterThanOrEqual(2);
    expect(body.events).toBe(1);
    const runs = await api(env.app, 'GET', `/automations/${rule.body.id}/runs`, hr.token);
    expect(runs.body).toHaveLength(1);
    expect(runs.body[0].subjectPersonId).toBe(p.body.id);
    expect(runs.body[0].results.every((x: { ok: boolean }) => x.ok)).toBe(true);
    // idempotente nello stesso giorno
    const again = await env.app.inject({ method: 'POST', url: '/api/v1/internal/automations/tick', headers: { 'content-type': 'application/json', 'x-internal-token': 'test-internal-job-token-1234' }, payload: JSON.stringify({ today: '2026-09-16' }) });
    expect(JSON.parse(again.body).events).toBe(1);
    expect((await api(env.app, 'GET', `/automations/${rule.body.id}/runs`, hr.token)).body).toHaveLength(1);
    const items = await env.db.select().from(actionItems).where(eq(actionItems.ownerPersonId, mgr.personId));
    expect(items.filter((i) => i.title === 'Colloquio di fine prova')).toHaveLength(1);
  });
});
