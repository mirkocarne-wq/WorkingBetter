import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestEnv, type TestEnv } from './helpers.js';

let env: TestEnv;
let tenant: { id: string; slug: string };
let other: { id: string; slug: string };
let hr: { userId: string; personId: string; token: string };
let giulia: { userId: string; personId: string; token: string };
let luca: { userId: string; personId: string; token: string };
let sara: { userId: string; personId: string; token: string };
let outsider: { userId: string; personId: string; token: string };
let templateId: string;
let cycleId: string;

const selfSchema = { title: 'Self-review', scoring: { enabled: false }, sections: [{ key: 's', title: 'Il tuo trimestre', fields: [{ key: 'highlights', type: 'long_text', label: 'Risultati di cui vai fiero/a', required: true, min: 5 }] }] };
const managerSchema = {
  title: 'Manager review',
  scoring: { enabled: true },
  sections: [
    { key: 'competenze', title: 'Competenze', fields: [{ key: 'ownership', type: 'scale', label: 'Ownership', required: true, scale: { min: 1, max: 5 } }, { key: 'comunicazione', type: 'scale', label: 'Comunicazione', required: true, scale: { min: 1, max: 5 } }] },
    { key: 'chiusura', title: 'Chiusura', fields: [{ key: 'commento', type: 'long_text', label: 'Commento', required: true, min: 10 }] },
  ],
};

beforeAll(async () => {
  env = await createTestEnv();
  tenant = await env.createTenant('Acme');
  other = await env.createTenant('Globex');
  hr = await env.createUser(tenant.id, 'hr@acme.test', ['hr_admin'], { firstName: 'Chiara', lastName: 'Moretti' });
  giulia = await env.createUser(tenant.id, 'giulia@acme.test', ['manager'], { firstName: 'Giulia', lastName: 'Ferri' });
  luca = await env.createUser(tenant.id, 'luca@acme.test', ['employee'], { firstName: 'Luca', lastName: 'Bianchi', managerId: giulia.personId });
  sara = await env.createUser(tenant.id, 'sara@acme.test', ['employee'], { firstName: 'Sara', lastName: 'Ricci', managerId: giulia.personId });
  await env.createUser(tenant.id, 'solo@acme.test', ['employee'], { firstName: 'Solo', lastName: 'Senza' });
  outsider = await env.createUser(other.id, 'hr@globex.test', ['hr_admin']);
  for (const [key, schema] of [['review_self', selfSchema], ['review_manager', managerSchema]] as const) {
    const f = await api(env.app, 'POST', '/forms', hr.token, { key, name: key, kind: 'review', schema });
    await api(env.app, 'POST', `/forms/${f.body.id}/publish`, hr.token);
  }
});
afterAll(() => env.close());

describe('review templates and cycles', () => {
  it('HR creates a template referencing published forms; unpublished keys are rejected', async () => {
    expect((await api(env.app, 'POST', '/review-templates', hr.token, { name: 'x', managerFormKey: 'missing_form' })).status).toBe(422);
    const t = await api(env.app, 'POST', '/review-templates', hr.token, { name: 'Review Q3', selfFormKey: 'review_self', managerFormKey: 'review_manager', selfDueDays: 7, managerDueDays: 14, managerSeesSelf: 'after_submit' });
    expect(t.status).toBe(201);
    templateId = t.body.id;
    expect((await api(env.app, 'POST', '/review-templates', giulia.token, { name: 'x', managerFormKey: 'review_manager' })).status).toBe(403);
  });
  it('creates a cycle, previews the population (people without manager are skipped) and launches it', async () => {
    const c = await api(env.app, 'POST', '/review-cycles', hr.token, { templateId, name: 'Review Q3 2026', periodStart: '2026-07-01', periodEnd: '2026-09-30', population: { excludePersonIds: [hr.personId] } });
    expect(c.status).toBe(201);
    cycleId = c.body.id;
    const pop = await api(env.app, 'GET', `/review-cycles/${cycleId}/population`, hr.token);
    expect(pop.body.included.map((p: any) => p.firstName).sort()).toEqual(['Luca', 'Sara']);
    expect(pop.body.skipped.map((p: any) => p.firstName).sort()).toEqual(['Giulia', 'Solo']);
    const launched = await api(env.app, 'POST', `/review-cycles/${cycleId}/launch`, hr.token, { launchDate: '2026-09-01' });
    expect(launched.status).toBe(201);
    expect(launched.body.status).toBe('active');
    expect(launched.body.selfDueAt).toBe('2026-09-08');
    expect(launched.body.managerDueAt).toBe('2026-09-15');
    expect(launched.body.progress.counts).toMatchObject({ total: 2, pending_self: 2 });
    expect((await api(env.app, 'POST', `/review-cycles/${cycleId}/launch`, hr.token, {})).status).toBe(409);
    const n = await api(env.app, 'GET', '/notifications', luca.token);
    expect(n.body.items[0].type).toBe('review.launched');
    const gn = await api(env.app, 'GET', '/notifications', giulia.token);
    expect(gn.body.items.filter((x: any) => x.type === 'review.launched')).toHaveLength(1);
    expect(gn.body.items[0].body).toContain('2 persone');
  });
});

describe('review flow', () => {
  let reviewId: string;
  let selfResponseId: string;
  let managerResponseId: string;
  it('subject sees own review and fills the self-review; manager cannot read it before submitting (after_submit rule)', async () => {
    const mine = await api(env.app, 'GET', '/reviews?box=mine', luca.token);
    expect(mine.body).toHaveLength(1);
    reviewId = mine.body[0].id;
    const r = await api(env.app, 'GET', `/reviews/${reviewId}`, luca.token);
    expect(r.body.canFillSelf).toBe(true);
    expect(r.body.managerResponse.answers).toBeNull();
    selfResponseId = r.body.selfResponse.id;
    managerResponseId = r.body.managerResponse.id;
    const sub = await api(env.app, 'POST', `/form-responses/${selfResponseId}/submit`, luca.token, { answers: { highlights: 'Migrazione DB senza downtime' } });
    expect(sub.status).toBe(201);
    const after = await api(env.app, 'GET', `/reviews/${reviewId}`, luca.token);
    expect(after.body.status).toBe('pending_manager');
    expect(after.body.selfSubmittedAt).toBeTruthy();
    const asManager = await api(env.app, 'GET', `/reviews/${reviewId}`, giulia.token);
    expect(asManager.body.canFillManager).toBe(true);
    expect(asManager.body.canSeeSelf).toBe(false);
    expect(asManager.body.selfResponse.answers).toBeNull();
    expect((await api(env.app, 'GET', `/reviews/${reviewId}`, sara.token)).status).toBe(404);
    expect((await api(env.app, 'GET', `/reviews/${reviewId}`, outsider.token)).status).toBe(404);
  });
  it('context panel shows objectives, shared feedback and recognitions of the subject', async () => {
    const c = await api(env.app, 'POST', '/cycles', hr.token, { name: 'Q3', startDate: '2026-07-01', endDate: '2026-09-30' });
    await api(env.app, 'POST', '/objectives', luca.token, { cycleId: c.body.id, title: 'P1 sotto 4h', level: 'individual', publish: true, keyResults: [{ title: 'Ore', startValue: 10, targetValue: 4 }] });
    await api(env.app, 'POST', '/feedback', sara.token, { toPersonId: luca.personId, body: 'Ottimo supporto', visibility: 'manager' });
    await api(env.app, 'POST', '/feedback', sara.token, { toPersonId: luca.personId, body: 'Privato', visibility: 'private' });
    await api(env.app, 'POST', '/recognitions', giulia.token, { recipientPersonIds: [luca.personId], message: 'Grande migrazione' });
    const ctx = await api(env.app, 'GET', `/reviews/${reviewId}/context`, giulia.token);
    expect(ctx.status).toBe(200);
    expect(ctx.body.objectives).toHaveLength(1);
    expect(ctx.body.feedback.map((f: any) => f.body)).toEqual(['Ottimo supporto']);
    expect(ctx.body.recognitions).toHaveLength(1);
    const ctxSelf = await api(env.app, 'GET', `/reviews/${reviewId}/context`, luca.token);
    expect(ctxSelf.body.feedback).toHaveLength(2);
  });
  it('manager submits: rating is derived from the score; self-review becomes visible; share notifies the subject', async () => {
    expect((await api(env.app, 'POST', `/reviews/${reviewId}/share`, giulia.token)).status).toBe(409);
    const sub = await api(env.app, 'POST', `/form-responses/${managerResponseId}/submit`, giulia.token, { answers: { ownership: 5, comunicazione: 3, commento: 'Trimestre solido, on-call da sistemare' } });
    expect(sub.status).toBe(201);
    const r = await api(env.app, 'GET', `/reviews/${reviewId}`, giulia.token);
    expect(r.body.status).toBe('pending_share');
    expect(r.body.finalScore).toBeCloseTo(0.75);
    expect(r.body.finalRating).toBe(4);
    expect(r.body.finalRatingLabel).toBe('Supera');
    expect(r.body.canSeeSelf).toBe(true);
    expect(r.body.selfResponse.answers.highlights).toContain('Migrazione');
    expect(r.body.canShare).toBe(true);
    const asLuca = await api(env.app, 'GET', `/reviews/${reviewId}`, luca.token);
    expect(asLuca.body.managerResponse.answers).toBeNull();
    const shared = await api(env.app, 'POST', `/reviews/${reviewId}/share`, giulia.token);
    expect(shared.body.status).toBe('shared');
    expect(shared.body.objectivesSnapshot).toHaveLength(1);
    const asLuca2 = await api(env.app, 'GET', `/reviews/${reviewId}`, luca.token);
    expect(asLuca2.body.managerResponse.answers.ownership).toBe(5);
    expect(asLuca2.body.canSign).toBe(true);
    const n = await api(env.app, 'GET', '/notifications', luca.token);
    expect(n.body.items[0].type).toBe('review.shared');
  });
  it('subject signs (with disagreement); only the subject can sign', async () => {
    expect((await api(env.app, 'POST', `/reviews/${reviewId}/sign`, giulia.token, {})).status).toBe(403);
    const s = await api(env.app, 'POST', `/reviews/${reviewId}/sign`, luca.token, { comment: 'Non concordo sulla comunicazione', disagree: true });
    expect(s.body.status).toBe('signed');
    expect(s.body.disagreed).toBe(true);
    const gn = await api(env.app, 'GET', '/notifications', giulia.token);
    expect(gn.body.items[0].type).toBe('review.signed');
    expect(gn.body.items[0].body).toContain('dissenso');
  });
  it('HR monitors progress, sends reminders (once per day), overrides a rating with a note and closes the cycle', async () => {
    const p = await api(env.app, 'GET', `/review-cycles/${cycleId}/progress`, hr.token);
    expect(p.body.counts).toMatchObject({ total: 2, signed: 1, pending_self: 1 });
    expect(p.body.byManager[0]).toMatchObject({ managerName: 'Giulia Ferri', total: 2 });
    const rem = await api(env.app, 'POST', `/review-cycles/${cycleId}/remind`, hr.token);
    expect(rem.body).toEqual({ sent: 1, pending: 1 });
    expect((await api(env.app, 'POST', `/review-cycles/${cycleId}/remind`, hr.token)).body.sent).toBe(0);
    const sn = await api(env.app, 'GET', '/notifications', sara.token);
    expect(sn.body.items[0].type).toBe('review.stage_due');
    expect((await api(env.app, 'POST', `/reviews/${reviewId}/rating-override`, hr.token, { rating: 9, note: 'nota valida' })).status).toBe(422);
    const ov = await api(env.app, 'POST', `/reviews/${reviewId}/rating-override`, hr.token, { rating: 5, note: 'Calibrazione: impatto della migrazione sottostimato' });
    expect(ov.body.finalRating).toBe(5);
    expect(ov.body.finalRatingLabel).toBe('Eccezionale');
    expect((await api(env.app, 'POST', `/reviews/${reviewId}/rating-override`, giulia.token, { rating: 4, note: 'nope' })).status).toBe(403);
    const closed = await api(env.app, 'POST', `/review-cycles/${cycleId}/close`, hr.token);
    expect(closed.body.status).toBe('closed');
    expect(closed.body.progress.counts).toMatchObject({ closed: 1, cancelled: 1 });
    const all = await api(env.app, 'GET', '/reviews?box=all', hr.token);
    expect(all.body).toHaveLength(2);
    expect((await api(env.app, 'GET', '/reviews?box=all', luca.token)).status).toBe(403);
    const cycles = await api(env.app, 'GET', '/review-cycles', outsider.token);
    expect(cycles.body).toEqual([]);
  });
});
