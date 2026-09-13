import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestEnv, type TestEnv } from './helpers.js';

let env: TestEnv;
let tenant: { id: string; slug: string };
let hr: { userId: string; personId: string; token: string };
let giulia: { userId: string; personId: string; token: string };
let luca: { userId: string; personId: string; token: string };
let marco: { userId: string; personId: string; token: string };
let paolo: { userId: string; personId: string; token: string };
let valueId: string;

beforeAll(async () => {
  env = await createTestEnv();
  tenant = await env.createTenant('Acme');
  hr = await env.createUser(tenant.id, 'hr@acme.test', ['hr_admin']);
  giulia = await env.createUser(tenant.id, 'giulia@acme.test', ['manager'], { firstName: 'Giulia', lastName: 'Ferri' });
  luca = await env.createUser(tenant.id, 'luca@acme.test', ['employee'], { firstName: 'Luca', lastName: 'Bianchi', managerId: giulia.personId });
  marco = await env.createUser(tenant.id, 'marco@acme.test', ['employee'], { firstName: 'Marco', lastName: 'Conti', managerId: giulia.personId });
  paolo = await env.createUser(tenant.id, 'paolo@acme.test', ['manager'], { firstName: 'Paolo', lastName: 'Neri' });
});
afterAll(() => env.close());

describe('company values', () => {
  it('HR manages values; employees only read active ones', async () => {
    expect((await api(env.app, 'POST', '/company-values', luca.token, { name: 'X' })).status).toBe(403);
    const v = await api(env.app, 'POST', '/company-values', hr.token, { name: 'Affidabilità', icon: '🏅' });
    expect(v.status).toBe(201);
    valueId = v.body.id;
    const off = await api(env.app, 'POST', '/company-values', hr.token, { name: 'Vecchio valore' });
    await api(env.app, 'PATCH', `/company-values/${off.body.id}`, hr.token, { active: false });
    const list = await api(env.app, 'GET', '/company-values', luca.token);
    expect(list.body.map((x: any) => x.name)).toEqual(['Affidabilità']);
  });
});

describe('feedback', () => {
  let privateId: string;
  it('private feedback is visible to sender and recipient only; manager sees it once shared', async () => {
    const r = await api(env.app, 'POST', '/feedback', marco.token, { toPersonId: luca.personId, kind: 'praise', body: 'Grazie per il supporto nella migrazione', valueId });
    expect(r.status).toBe(201);
    privateId = r.body.id;
    expect(r.body.from.firstName).toBe('Marco');
    expect(r.body.value.name).toBe('Affidabilità');
    expect((await api(env.app, 'GET', `/feedback/${privateId}`, giulia.token)).status).toBe(404);
    const about = await api(env.app, 'GET', `/feedback?box=about&aboutPersonId=${luca.personId}`, giulia.token);
    expect(about.body.items).toHaveLength(0);
    await api(env.app, 'POST', `/feedback/${privateId}/share-with-manager`, luca.token);
    const about2 = await api(env.app, 'GET', `/feedback?box=about&aboutPersonId=${luca.personId}`, giulia.token);
    expect(about2.body.items).toHaveLength(1);
    expect((await api(env.app, 'GET', `/feedback?box=about&aboutPersonId=${luca.personId}`, paolo.token)).status).toBe(403);
  });
  it('HR sees only feedback the recipient put in their record', async () => {
    const hrView = await api(env.app, 'GET', `/feedback?box=about&aboutPersonId=${luca.personId}`, hr.token);
    expect(hrView.body.items).toHaveLength(0);
    await api(env.app, 'POST', `/feedback/${privateId}/add-to-record`, luca.token);
    const hrView2 = await api(env.app, 'GET', `/feedback?box=about&aboutPersonId=${luca.personId}`, hr.token);
    expect(hrView2.body.items).toHaveLength(1);
  });
  it('recipient acknowledges and rates usefulness; self-feedback is rejected', async () => {
    const ack = await api(env.app, 'POST', `/feedback/${privateId}/acknowledge`, luca.token, { helpful: true });
    expect(ack.body.helpful).toBe(true);
    expect(ack.body.acknowledgedAt).toBeTruthy();
    expect((await api(env.app, 'POST', `/feedback/${privateId}/acknowledge`, marco.token, {})).status).toBe(404);
    expect((await api(env.app, 'POST', '/feedback', luca.token, { toPersonId: luca.personId, body: 'bravo io' })).status).toBe(422);
  });
  it('feedback requests: inbox, answer links the feedback, manager-initiated requests are shared with the manager', async () => {
    const req = await api(env.app, 'POST', '/feedback-requests', luca.token, { recipientPersonIds: [marco.personId, giulia.personId], question: 'Come ho gestito il rilascio 3.2?' });
    expect(req.status).toBe(201);
    expect(req.body.recipients).toHaveLength(2);
    const inbox = await api(env.app, 'GET', '/feedback-requests?box=inbox&status=pending', marco.token);
    expect(inbox.body).toHaveLength(1);
    const recipientId = inbox.body[0].recipientId;
    const answer = await api(env.app, 'POST', '/feedback', marco.token, { toPersonId: luca.personId, body: 'Bene, comunicazione chiara', requestRecipientId: recipientId });
    expect(answer.status).toBe(201);
    expect(answer.body.visibility).toBe('private');
    expect((await api(env.app, 'GET', '/feedback-requests?box=inbox&status=pending', marco.token)).body).toHaveLength(0);
    // richiesta del manager su un riporto → risposta visibile al manager
    const mreq = await api(env.app, 'POST', '/feedback-requests', giulia.token, { aboutPersonId: luca.personId, recipientPersonIds: [marco.personId], question: 'Come lavora Luca con te?' });
    expect(mreq.status).toBe(201);
    const inbox2 = await api(env.app, 'GET', '/feedback-requests?box=inbox&status=pending', marco.token);
    const ans2 = await api(env.app, 'POST', '/feedback', marco.token, { toPersonId: luca.personId, body: 'Ottimo mentore', requestRecipientId: inbox2.body[0].recipientId });
    expect(ans2.body.visibility).toBe('manager');
    expect((await api(env.app, 'POST', '/feedback-requests', luca.token, { aboutPersonId: marco.personId, recipientPersonIds: [giulia.personId], question: 'Come lavora Marco?' })).status).toBe(403);
    const declined = await api(env.app, 'POST', `/feedback-request-recipients/${req.body.recipients.find((r: any) => r.personId === giulia.personId).id}/decline`, giulia.token, { reason: 'Non ho lavorato sul rilascio' });
    expect(declined.status).toBe(201);
  });
});

describe('recognitions', () => {
  let recId: string;
  it('public recognition with values appears in the feed with reactions', async () => {
    const r = await api(env.app, 'POST', '/recognitions', giulia.token, { recipientPersonIds: [luca.personId], message: 'Migrazione DB senza downtime!', valueIds: [valueId] });
    expect(r.status).toBe(201);
    recId = r.body.id;
    expect(r.body.values[0].name).toBe('Affidabilità');
    await api(env.app, 'POST', `/recognitions/${recId}/reactions`, marco.token, { emoji: '👏' });
    await api(env.app, 'POST', `/recognitions/${recId}/reactions`, paolo.token, { emoji: '👏' });
    const feed = await api(env.app, 'GET', '/recognitions?scope=company', paolo.token);
    expect(feed.body.items).toHaveLength(1);
    expect(feed.body.items[0].reactions).toEqual([{ emoji: '👏', count: 2 }]);
    const team = await api(env.app, 'GET', '/recognitions?scope=team', giulia.token);
    expect(team.body.items).toHaveLength(1);
    const mineP = await api(env.app, 'GET', '/recognitions?scope=mine', paolo.token);
    expect(mineP.body.items).toHaveLength(0);
  });
  it('value stats aggregate recognitions; HR can hide a post', async () => {
    const stats = await api(env.app, 'GET', '/company-values/stats', giulia.token);
    expect(stats.body.byValue[0]).toMatchObject({ name: 'Affidabilità', n: 1 });
    expect((await api(env.app, 'DELETE', `/recognitions/${recId}`, luca.token)).status).toBe(403);
    expect((await api(env.app, 'DELETE', `/recognitions/${recId}`, hr.token)).status).toBe(204);
    expect((await api(env.app, 'GET', '/recognitions', luca.token)).body.items).toHaveLength(0);
  });
});
