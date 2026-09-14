import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestEnv, type TestEnv } from './helpers.js';

let env: TestEnv;
let tenant: { id: string; slug: string };
let admin: { userId: string; personId: string; token: string };
let hr: { userId: string; personId: string; token: string };
let giulia: { userId: string; personId: string; token: string };
let luca: { userId: string; personId: string; token: string };

const step = (g: any, key: string) => g.steps.find((s: any) => s.key === key);

beforeAll(async () => {
  env = await createTestEnv();
  tenant = await env.createTenant('Acme');
  admin = await env.createUser(tenant.id, 'admin@acme.test', ['tenant_admin'], { firstName: 'Anna', lastName: 'Colombo' });
  hr = await env.createUser(tenant.id, 'hr@acme.test', ['hr_admin'], { firstName: 'Chiara', lastName: 'Moretti' });
  giulia = await env.createUser(tenant.id, 'giulia@acme.test', ['manager'], { firstName: 'Giulia', lastName: 'Ferri' });
  luca = await env.createUser(tenant.id, 'luca@acme.test', ['employee'], { firstName: 'Luca', lastName: 'Bianchi', managerId: giulia.personId });
});
afterAll(() => env.close());

describe('avviamento guidato (AVV)', () => {
  it('admin: profilo predefinito, tutti i profili consultabili, controlli automatici sui dati del tenant', async () => {
    const g = await api(env.app, 'GET', '/guides/me', admin.token);
    expect(g.status).toBe(200);
    expect(g.body.profile).toBe('admin');
    expect(g.body.availableProfiles).toEqual(['admin', 'hr', 'manager', 'employee']);
    expect(step(g.body, 'admin_org')).toMatchObject({ auto: true, status: 'todo' });
    expect(step(g.body, 'admin_people')).toMatchObject({ auto: true, status: 'done' }); // 4 persone
    expect(step(g.body, 'admin_hr_roles')).toMatchObject({ auto: true, status: 'done' });
    expect(step(g.body, 'admin_managers')).toMatchObject({ auto: true, status: 'todo' }); // solo Luca ha un manager
    expect(step(g.body, 'admin_backup')).toMatchObject({ auto: false, status: 'todo' });
    expect(g.body.total).toBe(g.body.steps.filter((s: any) => !s.optional).length);
    expect(g.body.complete).toBe(false);
  });
  it('i controlli si aggiornano con i dati: due unità organizzative completano il passo «struttura»', async () => {
    const a = await api(env.app, 'POST', '/org-units', hr.token, { name: 'Prodotto' });
    expect(a.status).toBe(201);
    await api(env.app, 'POST', '/org-units', hr.token, { name: 'Vendite' });
    const g = await api(env.app, 'GET', '/guides/me', admin.token);
    expect(step(g.body, 'admin_org')).toMatchObject({ status: 'done', detail: '2 unità organizzative' });
  });
  it('passi manuali: si segnano e si annullano; quelli automatici e le chiavi sconosciute sono rifiutati', async () => {
    const d = await api(env.app, 'POST', '/guides/me/steps/admin_backup', admin.token, { done: true });
    expect(d.status).toBe(201);
    expect(step(d.body, 'admin_backup').status).toBe('done');
    expect(step((await api(env.app, 'GET', '/guides/me', admin.token)).body, 'admin_backup').status).toBe('done');
    expect((await api(env.app, 'POST', '/guides/me/steps/admin_org', admin.token, { done: true })).status).toBe(422);
    expect((await api(env.app, 'POST', '/guides/me/steps/nope', admin.token, { done: true })).status).toBe(422);
    const u = await api(env.app, 'POST', '/guides/me/steps/admin_backup', admin.token, { done: false });
    expect(step(u.body, 'admin_backup').status).toBe('todo');
  });
  it('collaboratore: solo il proprio profilo; controlli personali; promemoria nascosto e riattivato', async () => {
    const g = await api(env.app, 'GET', '/guides/me', luca.token);
    expect(g.body.profile).toBe('employee');
    expect(g.body.availableProfiles).toEqual(['employee']);
    expect((await api(env.app, 'GET', '/guides/me?profile=admin', luca.token)).status).toBe(403);
    expect(step(g.body, 'emp_one_on_one').status).toBe('todo');
    const s1 = await api(env.app, 'GET', '/guides/me/summary', luca.token);
    expect(s1.body).toMatchObject({ profile: 'employee', complete: false, dismissedAt: null });
    expect(s1.body.next).toBeTruthy();
    const dis = await api(env.app, 'POST', '/guides/me/dismiss', luca.token, { dismissed: true });
    expect(dis.body.dismissedAt).toBeTruthy();
    expect((await api(env.app, 'GET', '/guides/me/summary', luca.token)).body.dismissedAt).toBeTruthy();
    expect((await api(env.app, 'POST', '/guides/me/dismiss', luca.token, { dismissed: false })).body.dismissedAt).toBeNull();
  });
  it('manager: il team è rilevato; la relazione 1:1 completa il passo per entrambi', async () => {
    let g = await api(env.app, 'GET', '/guides/me', giulia.token);
    expect(g.body.profile).toBe('manager');
    expect(step(g.body, 'mgr_team')).toMatchObject({ status: 'done', detail: '1 riporti diretti' });
    expect(step(g.body, 'mgr_one_on_one').status).toBe('todo');
    expect((await api(env.app, 'POST', '/one-on-ones', giulia.token, { otherPersonId: luca.personId, kind: 'manager_report', cadenceDays: 14 })).status).toBe(201);
    g = await api(env.app, 'GET', '/guides/me', giulia.token);
    expect(step(g.body, 'mgr_one_on_one').status).toBe('done');
    expect(step((await api(env.app, 'GET', '/guides/me', luca.token)).body, 'emp_one_on_one').status).toBe('done');
    // il manager può consultare la guida del collaboratore, ma i controlli personali non sono valutati per conto d'altri
    const emp = await api(env.app, 'GET', '/guides/me?profile=employee', giulia.token);
    expect(emp.body.isOwnProfile).toBe(false);
    expect(step(emp.body, 'emp_objective')).toMatchObject({ status: 'todo', personal: true });
    expect(step(emp.body, 'emp_objective').detail).toContain('Da verificare');
    expect((await api(env.app, 'POST', '/guides/me/steps/emp_profile', giulia.token, { done: true, profile: 'employee' })).status).toBe(403);
  });
  it('HR: i controlli di configurazione riflettono cicli, valori e template', async () => {
    let g = await api(env.app, 'GET', '/guides/me', hr.token);
    expect(g.body.profile).toBe('hr');
    expect(step(g.body, 'hr_values').status).toBe('todo');
    expect((await api(env.app, 'POST', '/company-values', hr.token, { name: 'Cura', description: 'Ci prendiamo cura di clienti e colleghi' })).status).toBe(201);
    const today = new Date();
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    expect((await api(env.app, 'POST', '/cycles', hr.token, { name: 'Q4', startDate: iso(new Date(today.getTime() - 86400000)), endDate: iso(new Date(today.getTime() + 30 * 86400000)) })).status).toBe(201);
    g = await api(env.app, 'GET', '/guides/me', hr.token);
    expect(step(g.body, 'hr_values').status).toBe('done');
    expect(step(g.body, 'hr_okr_cycle').status).toBe('done');
    expect(step(g.body, 'hr_review_forms').status).toBe('todo');
  });
});
