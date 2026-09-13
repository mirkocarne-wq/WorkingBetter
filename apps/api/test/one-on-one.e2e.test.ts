import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { meetingNotes } from '@wb/db';
import { api, createTestEnv, type TestEnv } from './helpers.js';

let env: TestEnv;
let tenant: { id: string; slug: string };
let hr: { userId: string; personId: string; token: string };
let giulia: { userId: string; personId: string; token: string };
let luca: { userId: string; personId: string; token: string };
let sara: { userId: string; personId: string; token: string };
let relationId: string;
let meetingId: string;

beforeAll(async () => {
  env = await createTestEnv();
  tenant = await env.createTenant('Acme');
  hr = await env.createUser(tenant.id, 'hr@acme.test', ['hr_admin']);
  giulia = await env.createUser(tenant.id, 'giulia@acme.test', ['manager'], { firstName: 'Giulia', lastName: 'Ferri' });
  luca = await env.createUser(tenant.id, 'luca@acme.test', ['employee'], { firstName: 'Luca', lastName: 'Bianchi', managerId: giulia.personId });
  sara = await env.createUser(tenant.id, 'sara@acme.test', ['employee'], { firstName: 'Sara', lastName: 'Ricci', managerId: giulia.personId });
});
afterAll(() => env.close());

describe('1:1', () => {
  it('manager creates a weekly relation with a direct report and a first meeting', async () => {
    const r = await api(env.app, 'POST', '/one-on-ones', giulia.token, { otherPersonId: luca.personId, cadenceDays: 7, firstMeetingAt: '2026-09-15T14:30:00.000Z' });
    expect(r.status).toBe(201);
    relationId = r.body.id;
    expect(r.body.role).toBe('lead');
    expect(r.body.other.firstName).toBe('Luca');
    expect(r.body.nextMeeting).toBeTruthy();
    meetingId = r.body.nextMeeting.id;
    const mine = await api(env.app, 'GET', '/one-on-ones', luca.token);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].role).toBe('member');
  });

  it('rejects manager_report relations without a reporting line and duplicates', async () => {
    const bad = await api(env.app, 'POST', '/one-on-ones', luca.token, { otherPersonId: sara.personId });
    expect(bad.status).toBe(422);
    const peer = await api(env.app, 'POST', '/one-on-ones', luca.token, { otherPersonId: sara.personId, kind: 'peer' });
    expect(peer.status).toBe(201);
    const dup = await api(env.app, 'POST', '/one-on-ones', giulia.token, { otherPersonId: luca.personId });
    expect(dup.status).toBe(409);
  });

  it('both participants add talking points; outsiders get 404', async () => {
    const p1 = await api(env.app, 'POST', `/meetings/${meetingId}/talking-points`, luca.token, { text: 'Retrospettiva rilascio 3.2' });
    const p2 = await api(env.app, 'POST', `/meetings/${meetingId}/talking-points`, giulia.token, { text: 'Percorso verso Tech Lead' });
    expect(p1.status).toBe(201);
    expect(p2.body.position).toBe(1);
    expect((await api(env.app, 'POST', `/meetings/${meetingId}/talking-points`, sara.token, { text: 'intruso' })).status).toBe(404);
    expect((await api(env.app, 'GET', `/meetings/${meetingId}`, hr.token)).status).toBe(404); // HR non vede i contenuti
    await api(env.app, 'PATCH', `/talking-points/${p1.body.id}`, giulia.token, { discussed: true });
  });

  it('private notes are only visible to their author and encrypted at rest; shared notes to both', async () => {
    await api(env.app, 'PUT', `/meetings/${meetingId}/notes/shared`, giulia.token, { body: 'Rollback plan ok; anticipare design review.' });
    await api(env.app, 'PUT', `/meetings/${meetingId}/notes/private`, giulia.token, { body: 'Luca sembra affaticato dai P1.' });
    const asGiulia = await api(env.app, 'GET', `/meetings/${meetingId}`, giulia.token);
    const asLuca = await api(env.app, 'GET', `/meetings/${meetingId}`, luca.token);
    expect(asGiulia.body.sharedNote).toContain('Rollback');
    expect(asGiulia.body.privateNote).toBe('Luca sembra affaticato dai P1.');
    expect(asLuca.body.sharedNote).toContain('Rollback');
    expect(asLuca.body.privateNote).toBe('');
    const raw = await env.db.select().from(meetingNotes).where(eq(meetingNotes.visibility, 'private'));
    expect(raw[0]!.encrypted).toBe(true);
    expect(raw[0]!.body).not.toContain('affaticato');
  });

  it('action items belong to a participant and show up in "my actions"', async () => {
    const a = await api(env.app, 'POST', `/meetings/${meetingId}/action-items`, giulia.token, { title: 'Documentare runbook on-call', ownerPersonId: luca.personId, dueDate: '2026-09-08' });
    expect(a.status).toBe(201);
    expect((await api(env.app, 'POST', `/meetings/${meetingId}/action-items`, giulia.token, { title: 'x', ownerPersonId: sara.personId })).status).toBe(422);
    const mine = await api(env.app, 'GET', '/action-items?mine=true', luca.token);
    expect(mine.body.map((x: any) => x.title)).toContain('Documentare runbook on-call');
    const done = await api(env.app, 'PATCH', `/action-items/${a.body.id}`, luca.token, { status: 'done' });
    expect(done.body.doneAt).toBeTruthy();
  });

  it('suggestions surface at-risk objectives and overdue actions of the report', async () => {
    const c = await api(env.app, 'POST', '/cycles', hr.token, { name: 'Q3', startDate: '2026-07-01', endDate: '2026-09-30' });
    const o = await api(env.app, 'POST', '/objectives', luca.token, { cycleId: c.body.id, title: 'Tempo di risposta P1', level: 'individual', publish: true, keyResults: [{ title: 'Ore', startValue: 10, targetValue: 4 }] });
    await api(env.app, 'POST', `/key-results/${o.body.keyResults[0].id}/check-ins`, luca.token, { value: 8, confidence: 'off_track' });
    await api(env.app, 'POST', `/meetings/${meetingId}/action-items`, giulia.token, { title: 'Azione vecchia', ownerPersonId: luca.personId, dueDate: '2026-01-01' });
    const s = await api(env.app, 'GET', `/one-on-ones/${relationId}/suggestions`, giulia.token);
    expect(s.status).toBe(200);
    expect(s.body.map((x: any) => x.type)).toEqual(expect.arrayContaining(['objective_off_track', 'action_overdue']));
  });

  it('completing a meeting carries undiscussed points to the next one, scheduled by cadence', async () => {
    const r = await api(env.app, 'POST', `/meetings/${meetingId}/complete`, giulia.token, {});
    expect(r.status).toBe(201);
    expect(r.body.meeting.status).toBe('done');
    expect(r.body.nextMeeting).toBeTruthy();
    expect(r.body.nextMeeting.scheduledAt).toBe('2026-09-22T14:30:00.000Z');
    const carried = r.body.nextMeeting.talkingPoints;
    expect(carried).toHaveLength(1);
    expect(carried[0].text).toBe('Percorso verso Tech Lead');
    expect(carried[0].source).toBe('carry_over');
    expect((await api(env.app, 'POST', `/meetings/${meetingId}/talking-points`, luca.token, { text: 'troppo tardi' })).status).toBe(409);
  });

  it('HR sees adoption metrics only (aggregates), employees are refused', async () => {
    const m = await api(env.app, 'GET', '/one-on-ones/metrics?days=365', hr.token);
    expect(m.status).toBe(200);
    expect(m.body.relations).toBe(1);
    expect(m.body.withMeetingInWindow).toBe(1);
    expect(JSON.stringify(m.body)).not.toContain('Rollback');
    expect((await api(env.app, 'GET', '/one-on-ones/metrics', luca.token)).status).toBe(403);
    const asManager = await api(env.app, 'GET', '/one-on-ones/metrics', giulia.token);
    expect(asManager.body.byPerson.every((x: any) => x.managerId === giulia.personId)).toBe(true);
  });
});
