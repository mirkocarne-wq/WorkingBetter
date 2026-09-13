import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { notifications, reviewCycles, reviewTemplates, reviews } from '@wb/db';
import { api, createTestEnv, type TestEnv } from './helpers.js';

let env: TestEnv;
let tenant: { id: string; slug: string };
let hr: { userId: string; personId: string; token: string };
let giulia: { userId: string; personId: string; token: string };
let luca: { userId: string; personId: string; token: string };
let sara: { userId: string; personId: string; token: string };
let paolo: { userId: string; personId: string; token: string };
let devProfile: string;
let seniorProfile: string;
let planId: string;
let actionId: string;

beforeAll(async () => {
  env = await createTestEnv();
  tenant = await env.createTenant('Acme Dev');
  hr = await env.createUser(tenant.id, 'hr@dev.test', ['hr_admin'], { firstName: 'Chiara', lastName: 'Moretti' });
  giulia = await env.createUser(tenant.id, 'giulia@dev.test', ['manager'], { firstName: 'Giulia', lastName: 'Ferri' });
  paolo = await env.createUser(tenant.id, 'paolo@dev.test', ['manager'], { firstName: 'Paolo', lastName: 'Neri' });
  luca = await env.createUser(tenant.id, 'luca@dev.test', ['employee'], { firstName: 'Luca', lastName: 'Bianchi', managerId: giulia.personId });
  sara = await env.createUser(tenant.id, 'sara@dev.test', ['employee'], { firstName: 'Sara', lastName: 'Ricci', managerId: paolo.personId });
});
afterAll(() => env.close());

describe('sviluppo e carriera (DEV)', () => {
  it('HR loads the competency library and builds job profiles with a next role', async () => {
    const pre = await api(env.app, 'POST', '/development/framework/presets', hr.token);
    expect(pre.status).toBe(201);
    expect(pre.body.added).toBeGreaterThanOrEqual(10);
    expect((await api(env.app, 'POST', '/development/framework/presets', hr.token)).body.added).toBe(0);
    expect((await api(env.app, 'POST', '/development/framework/presets', luca.token)).status).toBe(403);
    const senior = await api(env.app, 'POST', '/development/job-profiles', hr.token, { title: 'Senior Developer', family: 'Engineering', level: 'Senior', expected: [{ competencyKey: 'technical_excellence', level: 3 }, { competencyKey: 'communication', level: 3 }, { competencyKey: 'ownership', level: 3 }, { competencyKey: 'people_development', level: 2 }] });
    expect(senior.status).toBe(201);
    seniorProfile = senior.body.id;
    const dev = await api(env.app, 'POST', '/development/job-profiles', hr.token, { title: 'Developer', family: 'Engineering', level: 'Mid', expected: [{ competencyKey: 'technical_excellence', level: 2 }, { competencyKey: 'communication', level: 2 }, { competencyKey: 'ownership', level: 2 }], nextProfileId: seniorProfile });
    devProfile = dev.body.id;
    expect((await api(env.app, 'POST', '/development/job-profiles', hr.token, { title: 'X', expected: [{ competencyKey: 'nope', level: 1 }] })).status).toBe(422);
    expect((await api(env.app, 'PUT', `/development/people/${luca.personId}/job-profile`, hr.token, { profileId: devProfile })).status).toBe(200);
    const fw = await api(env.app, 'GET', '/development/framework', luca.token);
    expect(fw.body.profiles.find((p: { id: string }) => p.id === devProfile).people).toBe(1);
  });

  it('self and manager assessments feed the gap; the gap uses the manager level by default and suggests actions', async () => {
    const self = await api(env.app, 'POST', `/development/people/${luca.personId}/assessments`, luca.token, { source: 'self', items: [{ competencyKey: 'technical_excellence', level: 3 }, { competencyKey: 'communication', level: 2 }, { competencyKey: 'ownership', level: 1 }] });
    expect(self.status).toBe(201);
    expect((await api(env.app, 'POST', `/development/people/${luca.personId}/assessments`, luca.token, { source: 'manager', items: [{ competencyKey: 'ownership', level: 3 }] })).status).toBe(403);
    expect((await api(env.app, 'POST', `/development/people/${luca.personId}/assessments`, paolo.token, { source: 'manager', items: [{ competencyKey: 'ownership', level: 3 }] })).status).toBe(404); // non è il suo manager
    const mgr = await api(env.app, 'POST', `/development/people/${luca.personId}/assessments`, giulia.token, { source: 'manager', items: [{ competencyKey: 'technical_excellence', level: 2 }, { competencyKey: 'communication', level: 1 }, { competencyKey: 'ownership', level: 2 }] });
    expect(mgr.status).toBe(201);
    const me = await api(env.app, 'GET', '/development/me', luca.token);
    expect(me.status).toBe(200);
    expect(me.body.profile.title).toBe('Developer');
    expect(me.body.nextProfile.title).toBe('Senior Developer');
    const comm = me.body.gaps.find((g: { competencyKey: string }) => g.competencyKey === 'communication');
    expect(comm.bySource).toEqual({ self: 2, manager: 1 });
    expect(comm.assessed).toBe(1);
    expect(comm.gap).toBe(1);
    expect(me.body.gaps[0].competencyKey).toBe('communication');
    expect(me.body.nextGaps.find((g: { competencyKey: string }) => g.competencyKey === 'people_development').assessed).toBeNull();
    expect(me.body.suggestions.length).toBeGreaterThan(0);
    expect(me.body.suggestions[0].competencyKey).toBe('communication');
    expect(me.body.talent).toBeNull(); // mai al collaboratore
    expect(me.body.can.assessSelf).toBe(true);
    const avg = await api(env.app, 'GET', '/development/me?policy=average', luca.token);
    expect(avg.body.gaps.find((g: { competencyKey: string }) => g.competencyKey === 'communication').assessed).toBe(1.5);
    // il manager vede il profilo del riporto, un altro manager no, l'HR sì
    expect((await api(env.app, 'GET', `/development/people/${luca.personId}`, giulia.token)).body.viewer).toBe('manager');
    expect((await api(env.app, 'GET', `/development/people/${luca.personId}`, paolo.token)).status).toBe(404);
    expect((await api(env.app, 'GET', `/development/people/${luca.personId}`, hr.token)).body.viewer).toBe('hr');
    expect((await api(env.app, 'GET', `/development/people/${luca.personId}`, sara.token)).status).toBe(404);
  });

  it('development plan: actions from gap, submit → manager notified → approve → complete', async () => {
    const plan = await api(env.app, 'POST', '/development/plans', luca.token, { title: 'Crescita 2026', periodEnd: '2026-12-31' });
    expect(plan.status).toBe(201);
    planId = plan.body.id;
    expect((await api(env.app, 'POST', '/development/plans', luca.token, { title: 'Doppione' })).status).toBe(409);
    const a1 = await api(env.app, 'POST', `/development/plans/${planId}/actions`, luca.token, { title: 'Corso di comunicazione efficace', kind: 'training', competencyKey: 'communication', dueDate: '2026-10-31', source: 'gap' });
    expect(a1.status).toBe(201);
    actionId = a1.body.id;
    await api(env.app, 'POST', `/development/plans/${planId}/actions`, giulia.token, { title: 'Facilitare una retrospettiva', kind: 'experience', competencyKey: 'communication', dueDate: '2026-11-30' });
    const me = await api(env.app, 'GET', '/development/me', luca.token);
    expect(me.body.plan.actions).toHaveLength(2);
    expect(me.body.plan.progress).toEqual({ total: 2, done: 0, overdue: 0, percent: 0 });
    expect(me.body.suggestions.find((s: { title: string }) => s.title === 'Corso di comunicazione efficace').alreadyInPlan).toBe(true);
    const submit = await api(env.app, 'PATCH', `/development/plans/${planId}`, luca.token, { status: 'pending_approval' });
    expect(submit.body.status).toBe('pending_approval');
    const notes = await env.db.select().from(notifications).where(eq(notifications.userId, giulia.userId));
    expect(notes.some((n) => n.type === 'dev.plan_submitted')).toBe(true);
    expect((await api(env.app, 'PATCH', `/development/plans/${planId}`, luca.token, { status: 'active' })).status).toBe(403);
    const approve = await api(env.app, 'PATCH', `/development/plans/${planId}`, giulia.token, { status: 'active', managerNote: 'Ottimo, partiamo dalla retro.' });
    expect(approve.body.status).toBe('active');
    expect(approve.body.approvedByPersonId).toBe(giulia.personId);
    const done = await api(env.app, 'PATCH', `/development/actions/${actionId}`, luca.token, { status: 'done', evidence: 'Corso completato il 20/10 con attestato.' });
    expect(done.body.status).toBe('done');
    expect((await api(env.app, 'GET', '/development/me', luca.token)).body.plan.progress.percent).toBe(50);
    expect((await api(env.app, 'PATCH', `/development/plans/${planId}`, luca.token, { status: 'draft' })).status).toBe(409);
  });

  it('1:1 suggestions include due development actions of the report', async () => {
    const rel = await api(env.app, 'POST', '/one-on-ones', giulia.token, { otherPersonId: luca.personId, cadenceDays: 7 });
    expect(rel.status).toBe(201);
    await api(env.app, 'POST', `/development/plans/${planId}/actions`, luca.token, { title: 'Azione in ritardo', kind: 'other', dueDate: '2026-01-01' });
    const s = await api(env.app, 'GET', `/one-on-ones/${rel.body.id}/suggestions`, giulia.token);
    expect(s.body.some((x: { type: string; text: string }) => x.type === 'dev_action_overdue' && x.text.includes('Azione in ritardo'))).toBe(true);
  });

  it('9-box: performance from the last shared review, potential set by the manager with a note, never shown to the person', async () => {
    const [tpl] = await env.db.insert(reviewTemplates).values({ tenantId: tenant.id, name: 'T', managerFormKey: 'mgr' }).returning();
    const [cycle] = await env.db.insert(reviewCycles).values({ tenantId: tenant.id, templateId: tpl!.id, name: 'Review 2026', status: 'closed', periodStart: '2026-01-01', periodEnd: '2026-06-30' }).returning();
    await env.db.insert(reviews).values({ tenantId: tenant.id, cycleId: cycle!.id, subjectPersonId: luca.personId, managerPersonId: giulia.personId, status: 'signed', finalRating: 4, finalRatingLabel: 'Supera', sharedAt: new Date('2026-07-01') });
    expect((await api(env.app, 'PUT', `/development/talent/${luca.personId}`, luca.token, { potential: 3, note: 'x' })).status).toBe(403);
    expect((await api(env.app, 'PUT', `/development/talent/${luca.personId}`, giulia.token, { potential: 3, note: 'x' })).status).toBe(400); // nota troppo corta (validazione)
    const t = await api(env.app, 'PUT', `/development/talent/${luca.personId}`, giulia.token, { potential: 3, note: 'Guida già i più giovani; pronto per responsabilità più ampie.', session: '2026-H2' });
    expect(t.status).toBe(200);
    expect(t.body.performance).toBe(3);
    expect(t.body.label).toBe('Stella');
    const grid = await api(env.app, 'GET', '/development/talent', giulia.token);
    expect(grid.body.scope).toBe('team');
    expect(grid.body.items).toHaveLength(1);
    expect(grid.body.cells['3-3']).toBe(1);
    const all = await api(env.app, 'GET', '/development/talent', hr.token);
    expect(all.body.scope).toBe('all');
    expect(all.body.items.length).toBeGreaterThanOrEqual(5);
    expect((await api(env.app, 'GET', '/development/talent', luca.token)).status).toBe(403);
    const viewByManager = await api(env.app, 'GET', `/development/people/${luca.personId}`, giulia.token);
    expect(viewByManager.body.talent.potential).toBe(3);
    expect((await api(env.app, 'GET', '/development/me', luca.token)).body.talent).toBeNull();
    const people = await api(env.app, 'GET', '/development/people', giulia.token);
    expect(people.body.find((p: { person: { id: string } }) => p.person.id === luca.personId).plan).toBe('active');
  });
});
