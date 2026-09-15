import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { objectives } from '@wb/db';
import { api, createTestEnv, type TestEnv } from './helpers.js';

let env: TestEnv;
let tenant: { id: string; slug: string };
let hr: { userId: string; personId: string; token: string };
let giulia: { userId: string; personId: string; token: string };
let luca: { userId: string; personId: string; token: string };
let relationId: string;
let meetingId: string;

const isoIn = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
const dayIn = (days: number) => isoIn(days).slice(0, 10);

beforeAll(async () => {
  env = await createTestEnv();
  tenant = await env.createTenant('Acme');
  hr = await env.createUser(tenant.id, 'hr@acme.test', ['hr_admin'], { firstName: 'Chiara', lastName: 'Moretti' });
  giulia = await env.createUser(tenant.id, 'giulia@acme.test', ['manager'], { firstName: 'Giulia', lastName: 'Ferri' });
  luca = await env.createUser(tenant.id, 'luca@acme.test', ['employee'], { firstName: 'Luca', lastName: 'Bianchi', managerId: giulia.personId });
});
afterAll(() => env.close());

describe('Home «Da fare» (CORE-063) — GET /me/todo', () => {
  it('senza nulla in sospeso restituisce una lista vuota e nessun 1:1', async () => {
    const r = await api(env.app, 'GET', '/me/todo', luca.token);
    expect(r.status).toBe(200);
    expect(r.body.items).toEqual([]);
    expect(r.body.nextOneOnOne).toBeNull();
  });

  it('aggrega azione scaduta, check-in oltre la cadenza, survey aperta e passi del motore, in ordine di urgenza', async () => {
    // 1:1 con un incontro futuro, un punto in agenda e un'azione scaduta assegnata a Luca
    const rel = await api(env.app, 'POST', '/one-on-ones', giulia.token, { otherPersonId: luca.personId, cadenceDays: 7, firstMeetingAt: isoIn(2) });
    expect(rel.status).toBe(201);
    relationId = rel.body.id;
    meetingId = rel.body.nextMeeting?.id ?? rel.body.meetings?.[0]?.id;
    expect(meetingId).toBeTruthy();
    expect((await api(env.app, 'POST', `/meetings/${meetingId}/talking-points`, luca.token, { text: 'Retrospettiva rilascio 3.2' })).status).toBe(201);
    const act = await api(env.app, 'POST', `/meetings/${meetingId}/action-items`, giulia.token, { title: 'Documentare runbook on-call', ownerPersonId: luca.personId, dueDate: dayIn(-5) });
    expect(act.status).toBe(201);

    // obiettivo con KR creato 10 giorni fa e mai aggiornato → check-in oltre la cadenza di 7 giorni
    const c = await api(env.app, 'POST', '/cycles', hr.token, { name: 'Q3 2026', startDate: dayIn(-30), endDate: dayIn(60), checkInCadenceDays: 7 });
    expect(c.status).toBe(201);
    const o = await api(env.app, 'POST', '/objectives', luca.token, { cycleId: c.body.id, title: 'Tempo di risposta P1 sotto le 4 ore', level: 'individual', publish: true, keyResults: [{ title: 'Tempo medio risposta P1', type: 'number', startValue: 10, targetValue: 4, unit: 'h' }] });
    expect(o.status).toBe(201);
    await env.db.update(objectives).set({ createdAt: new Date(Date.now() - 10 * 86400000) }).where(eq(objectives.id, o.body.id));

    // survey nominale aperta a cui Luca è invitato
    const s = await api(env.app, 'POST', '/surveys', hr.token, { title: 'Pulse di settembre', template: 'enps', anonymous: false, population: { personIds: [luca.personId, giulia.personId] }, closesAt: isoIn(5) });
    expect(s.status).toBe(201);
    const launched = await api(env.app, 'POST', `/surveys/${s.body.id}/launch`, hr.token, { closesAt: isoIn(5) });
    expect(launched.status).toBe(201);

    const r = await api(env.app, 'GET', '/me/todo', luca.token);
    expect(r.status).toBe(200);
    const kinds = r.body.items.map((i: any) => i.kind);
    expect(kinds).toContain('action');
    expect(kinds).toContain('check_in');
    expect(kinds).toContain('survey');
    // le voci scadute vengono prima; l'azione scaduta da 5 giorni precede il check-in in ritardo di 3
    expect(r.body.items[0]).toMatchObject({ kind: 'action', title: 'Documentare runbook on-call', overdue: true, daysDelta: 5, action: 'Segna fatto' });
    expect(r.body.items[0].href).toBe(`/one-on-ones/${relationId}`);
    const ci = r.body.items.find((i: any) => i.kind === 'check_in');
    expect(ci).toMatchObject({ overdue: true, title: 'Tempo di risposta P1 sotto le 4 ore' });
    const sv = r.body.items.find((i: any) => i.kind === 'survey');
    expect(sv).toMatchObject({ overdue: false, title: 'Pulse di settembre', action: 'Rispondi' });
    expect(sv.href).toBe(`/surveys/${s.body.id}`);
    // prossimo 1:1 con Giulia e l'agenda
    expect(r.body.nextOneOnOne).toMatchObject({ relationId, other: { firstName: 'Giulia' }, agenda: ['Retrospettiva rilascio 3.2'], agendaCount: 1 });
    // la lista è personale: Giulia non vede le voci di Luca (ma vede il 1:1)
    const g = await api(env.app, 'GET', '/me/todo', giulia.token);
    expect(g.body.items.find((i: any) => i.kind === 'action')).toBeUndefined();
    expect(g.body.nextOneOnOne?.other.firstName).toBe('Luca');
  });

  it('le voci scompaiono quando l’azione è compiuta', async () => {
    const before = await api(env.app, 'GET', '/me/todo', luca.token);
    const action = before.body.items.find((i: any) => i.kind === 'action');
    const items = await api(env.app, 'GET', `/action-items?mine=true&status=open`, luca.token);
    const id = items.body.find((a: any) => a.title === action.title).id;
    expect((await api(env.app, 'PATCH', `/action-items/${id}`, luca.token, { status: 'done' })).status).toBe(200);
    const after = await api(env.app, 'GET', '/me/todo', luca.token);
    expect(after.body.items.find((i: any) => i.kind === 'action')).toBeUndefined();
  });

  it('richiede una persona collegata: un utente senza persona ottiene una lista vuota', async () => {
    const t = await env.tokenFor({ userId: hr.userId, tenantId: tenant.id, personId: null, roles: ['hr_admin'] });
    const r = await api(env.app, 'GET', '/me/todo', t);
    expect(r.status).toBe(200);
    expect(r.body.items).toEqual([]);
  });
});
