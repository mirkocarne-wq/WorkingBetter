import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { auditLog, withTenant } from '@wb/db';
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
    // la review gira sul motore dei processi (ADR-0011): istanza silenziosa con self e manager in parallelo
    expect(r.body.appInstanceId).toBeTruthy();
    const inst = await api(env.app, 'GET', `/apps/instances/${r.body.appInstanceId}`, hr.token);
    expect(inst.status).toBe(200);
    expect(inst.body.appKey).toBe(`review_${cycleId.replace(/-/g, '')}`);
    expect(inst.body.currentStages.sort()).toEqual(['manager', 'self']);
    expect(inst.body.stages.map((s: any) => s.key)).toEqual(['self', 'manager', 'share', 'sign']);
    expect(inst.body.stages.find((s: any) => s.key === 'self').run.formResponseId).toBe(selfResponseId);
    expect(inst.body.stages.find((s: any) => s.key === 'manager').run.dueDate).toBe('2026-09-15');
    expect((await api(env.app, 'GET', '/notifications', luca.token)).body.items.map((n: any) => n.type)).not.toContain('app.stage_assigned');
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
    const inst = await api(env.app, 'GET', `/apps/instances/${shared.body.appInstanceId}`, hr.token);
    expect(inst.body.stages.find((s: any) => s.key === 'share').run.status).toBe('done');
    expect(inst.body.currentStages).toEqual(['sign']);
  });
  it('PDF export follows the visibility of the requester and is audited', async () => {
    const pdf = await api(env.app, 'GET', `/reviews/${reviewId}/pdf`, luca.token);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(pdf.headers['content-disposition']).toContain('review-luca-bianchi.pdf');
    expect(String(pdf.body).startsWith('%PDF')).toBe(true);
    expect((await api(env.app, 'GET', `/reviews/${reviewId}/pdf`, hr.token)).status).toBe(200);
    expect((await api(env.app, 'GET', `/reviews/${reviewId}/pdf`, sara.token)).status).toBe(404);
    const audit = await withTenant(env.db, tenant.id, (t) => t.select().from(auditLog).where(eq(auditLog.action, 'review.export_pdf')));
    expect(audit).toHaveLength(2);
  });
  it('subject signs (with disagreement); only the subject can sign', async () => {
    expect((await api(env.app, 'POST', `/reviews/${reviewId}/sign`, giulia.token, {})).status).toBe(403);
    const s = await api(env.app, 'POST', `/reviews/${reviewId}/sign`, luca.token, { comment: 'Non concordo sulla comunicazione', disagree: true });
    expect(s.body.status).toBe('signed');
    expect(s.body.disagreed).toBe(true);
    const gn = await api(env.app, 'GET', '/notifications', giulia.token);
    expect(gn.body.items[0].type).toBe('review.signed');
    expect(gn.body.items[0].body).toContain('dissenso');
    const inst = await api(env.app, 'GET', `/apps/instances/${s.body.appInstanceId}`, hr.token);
    expect(inst.body.status).toBe('completed');
    expect(inst.body.stages.find((x: any) => x.key === 'sign').run.comment).toContain('Dissenso');
  });
  it('HR reopens the manager stage: new attempt on the engine, previous answers kept as draft, later stages invalidated', async () => {
    expect((await api(env.app, 'POST', `/reviews/${reviewId}/reopen`, giulia.token, { stage: 'manager' })).status).toBe(403);
    const re = await api(env.app, 'POST', `/reviews/${reviewId}/reopen`, hr.token, { stage: 'manager' });
    expect(re.status).toBe(201);
    expect(re.body.status).toBe('pending_manager');
    expect(re.body.managerResponse.id).not.toBe(managerResponseId);
    expect(re.body.selfResponse.id).toBe(selfResponseId);
    expect(re.body).toMatchObject({ sharedAt: null, signedAt: null, finalRating: null, disagreed: false });
    managerResponseId = re.body.managerResponse.id;
    const draft = await api(env.app, 'GET', `/form-responses/${managerResponseId}`, giulia.token);
    expect(draft.body.status).toBe('draft');
    expect(draft.body.answers.ownership).toBe(5);
    const inst = await api(env.app, 'GET', `/apps/instances/${re.body.appInstanceId}`, hr.token);
    expect(inst.body.status).toBe('running');
    expect(inst.body.currentStages).toEqual(['manager']);
    expect(inst.body.stages.find((x: any) => x.key === 'manager').history.map((h: any) => h.status)).toContain('superseded');
    // il flusso riparte: consegna, condivisione, firma
    expect((await api(env.app, 'POST', `/form-responses/${managerResponseId}/submit`, giulia.token, { answers: { ownership: 5, comunicazione: 4, commento: 'Comunicazione migliorata nel trimestre' } })).status).toBe(201);
    expect((await api(env.app, 'GET', `/reviews/${reviewId}`, giulia.token)).body).toMatchObject({ status: 'pending_share', finalRating: 5 });
    expect((await api(env.app, 'POST', `/reviews/${reviewId}/share`, giulia.token)).body.status).toBe('shared');
    expect((await api(env.app, 'POST', `/reviews/${reviewId}/sign`, luca.token, { disagree: false })).body.status).toBe('signed');
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
    const pending = (await api(env.app, 'GET', '/reviews?box=all&status=pending_self', hr.token)).body[0];
    const closed = await api(env.app, 'POST', `/review-cycles/${cycleId}/close`, hr.token);
    expect(closed.body.status).toBe('closed');
    expect(closed.body.progress.counts).toMatchObject({ closed: 1, cancelled: 1 });
    expect((await api(env.app, 'GET', `/apps/instances/${pending.appInstanceId}`, hr.token)).body).toMatchObject({ status: 'completed', outcome: 'cancelled' });
    expect((await api(env.app, 'POST', `/reviews/${reviewId}/reopen`, hr.token, { stage: 'manager' })).status).toBe(409);
    const all = await api(env.app, 'GET', '/reviews?box=all', hr.token);
    expect(all.body).toHaveLength(2);
    expect((await api(env.app, 'GET', '/reviews?box=all', luca.token)).status).toBe(403);
    const cycles = await api(env.app, 'GET', '/review-cycles', outsider.token);
    expect(cycles.body).toEqual([]);
  });
});

describe('approval chain (REV-050) and calibration (REV-040…045)', () => {
  let marco: { userId: string; personId: string; token: string };
  let paola: { userId: string; personId: string; token: string };
  let chainTemplateId: string;
  let chainCycleId: string;
  let reviewId: string;
  let managerResponseId: string;
  let sessionId: string;
  const managerAnswers = { ownership: 4, comunicazione: 4, commento: 'Trimestre regolare, buona autonomia' };

  beforeAll(async () => {
    marco = await env.createUser(tenant.id, 'marco@acme.test', ['manager'], { firstName: 'Marco', lastName: 'Conti' });
    paola = await env.createUser(tenant.id, 'paola@acme.test', ['hrbp'], { firstName: 'Paola', lastName: 'Neri' });
    await withTenant(env.db, tenant.id, async (db) => {
      await db.execute(sql`update persons set manager_id = ${marco.personId} where id = ${giulia.personId}`);
    });
  });

  it('template with approval chain: stages manager_of_manager → hrbp are added between manager review and share', async () => {
    const t = await api(env.app, 'POST', '/review-templates', hr.token, { name: 'Review Q4 con approvazioni', selfFormKey: 'review_self', managerFormKey: 'review_manager', approvalChain: ['manager_of_manager', 'hrbp'] });
    expect(t.status).toBe(201);
    expect(t.body.approvalChain).toEqual(['manager_of_manager', 'hrbp']);
    chainTemplateId = t.body.id;
    expect((await api(env.app, 'POST', '/review-templates', hr.token, { name: 'x', managerFormKey: 'review_manager', approvalChain: ['ceo'] })).status).toBe(400);
    const c = await api(env.app, 'POST', '/review-cycles', hr.token, { templateId: chainTemplateId, name: 'Review Q4 2026', periodStart: '2026-10-01', periodEnd: '2026-12-31', population: { personIds: [luca.personId, sara.personId] } });
    chainCycleId = c.body.id;
    expect((await api(env.app, 'POST', `/review-cycles/${chainCycleId}/launch`, hr.token, { launchDate: '2026-12-01' })).status).toBe(201);
    const mine = (await api(env.app, 'GET', `/reviews?box=mine&cycleId=${chainCycleId}`, luca.token)).body;
    expect(mine).toHaveLength(1);
    reviewId = mine[0].id;
    const r = await api(env.app, 'GET', `/reviews/${reviewId}`, luca.token);
    managerResponseId = r.body.managerResponse.id;
    const inst = await api(env.app, 'GET', `/apps/instances/${r.body.appInstanceId}`, hr.token);
    expect(inst.body.stages.map((s: any) => s.key)).toEqual(['self', 'manager', 'approve_1', 'approve_2', 'share', 'sign']);
    expect(inst.body.stages.find((s: any) => s.key === 'approve_1').run.status).toBe('pending');
    await api(env.app, 'POST', `/form-responses/${r.body.selfResponse.id}/submit`, luca.token, { answers: { highlights: 'Nuovo onboarding clienti' } });
  });

  it('manager submits → pending_approval; the first approver sees it in the approvals box and can return it with a comment', async () => {
    expect((await api(env.app, 'POST', `/form-responses/${managerResponseId}/submit`, giulia.token, { answers: managerAnswers })).status).toBe(201);
    const r = await api(env.app, 'GET', `/reviews/${reviewId}`, giulia.token);
    expect(r.body.status).toBe('pending_approval');
    expect(r.body.proposedRating).toBe(4);
    expect(r.body.canShare).toBe(false);
    expect(r.body.approvals.map((a: any) => [a.label, a.status])).toEqual([['Manager del manager', 'active'], ['HR Business Partner', 'pending']]);
    const inst = await api(env.app, 'GET', `/apps/instances/${r.body.appInstanceId}`, hr.token);
    expect(inst.body.currentStages).toEqual(['approve_1']);
    expect(inst.body.stages.find((s: any) => s.key === 'approve_1').run.actor.id).toBe(marco.personId);
    expect((await api(env.app, 'POST', `/reviews/${reviewId}/share`, giulia.token)).status).toBe(409);
    // il soggetto non vede la catena di approvazione
    expect((await api(env.app, 'GET', `/reviews/${reviewId}`, luca.token)).body.approvals).toEqual([]);
    expect((await api(env.app, 'GET', '/reviews?box=approvals', marco.token)).body.map((x: any) => x.id)).toEqual([reviewId]);
    expect((await api(env.app, 'GET', '/reviews?box=approvals', paola.token)).body).toEqual([]);
    expect((await api(env.app, 'GET', '/notifications', marco.token)).body.items[0].type).toBe('review.approval_requested');
    // solo l'approvatore del passo attivo (o l'HR) decide; il rimando richiede un commento
    expect((await api(env.app, 'POST', `/reviews/${reviewId}/approve`, giulia.token, { decision: 'approve' })).status).toBe(403);
    expect((await api(env.app, 'POST', `/reviews/${reviewId}/approve`, luca.token, { decision: 'approve' })).status).toBe(403);
    expect((await api(env.app, 'POST', `/reviews/${reviewId}/approve`, marco.token, { decision: 'return' })).status).toBe(400);
    const asMarco = await api(env.app, 'GET', `/reviews/${reviewId}`, marco.token);
    expect(asMarco.body.canApprove).toBe(true);
    const ret = await api(env.app, 'POST', `/reviews/${reviewId}/approve`, marco.token, { decision: 'return', comment: 'Motiva meglio la comunicazione con il team' });
    expect(ret.status).toBe(201);
    expect(ret.body.status).toBe('pending_manager');
    expect(ret.body.proposedRating).toBeNull();
    expect(ret.body.finalRating).toBeNull();
    expect(ret.body.approvals[0]).toMatchObject({ status: 'rejected', comment: 'Motiva meglio la comunicazione con il team' });
    // la manager review si riapre con le risposte precedenti come bozza
    const asGiulia = await api(env.app, 'GET', `/reviews/${reviewId}`, giulia.token);
    expect(asGiulia.body.canFillManager).toBe(true);
    expect(asGiulia.body.managerResponse.status).toBe('draft');
    expect(asGiulia.body.managerResponse.answers.ownership).toBe(4);
    managerResponseId = asGiulia.body.managerResponse.id;
    expect((await api(env.app, 'GET', '/notifications', giulia.token)).body.items[0].type).toBe('review.returned');
    expect((await api(env.app, 'GET', `/apps/instances/${asGiulia.body.appInstanceId}`, hr.token)).body.currentStages).toEqual(['manager']);
    expect((await api(env.app, 'GET', '/reviews?box=approvals', marco.token)).body).toEqual([]);
  });

  it('after resubmission both approvers approve in order; the review becomes pending_share and the manager is notified', async () => {
    expect((await api(env.app, 'POST', `/form-responses/${managerResponseId}/submit`, giulia.token, { answers: { ...managerAnswers, commento: 'Trimestre regolare; comunicazione con il team molto migliorata' } })).status).toBe(201);
    expect((await api(env.app, 'GET', `/reviews/${reviewId}`, giulia.token)).body.status).toBe('pending_approval');
    const a1 = await api(env.app, 'POST', `/reviews/${reviewId}/approve`, marco.token, { decision: 'approve', comment: 'Ok' });
    expect(a1.body.status).toBe('pending_approval');
    expect(a1.body.approvals.map((a: any) => a.status)).toEqual(['done', 'active']);
    expect((await api(env.app, 'GET', '/reviews?box=approvals', paola.token)).body.map((x: any) => x.id)).toEqual([reviewId]);
    const a2 = await api(env.app, 'POST', `/reviews/${reviewId}/approve`, paola.token, { decision: 'approve' });
    expect(a2.body.status).toBe('pending_share');
    expect(a2.body.finalRating).toBe(4);
    expect(a2.body.approvals.map((a: any) => [a.status, a.decidedBy])).toEqual([['done', 'Marco Conti'], ['done', 'Paola Neri']]);
    expect(a2.body.canShare).toBe(true);
    expect((await api(env.app, 'GET', '/notifications', giulia.token)).body.items[0].type).toBe('review.approved');
    expect((await api(env.app, 'POST', `/reviews/${reviewId}/approve`, paola.token, { decision: 'approve' })).status).toBe(409);
  });

  it('HR opens a calibration session on the cycle: only rated reviews enter, sharing is blocked while the session is open', async () => {
    expect((await api(env.app, 'POST', `/review-cycles/${chainCycleId}/calibration-sessions`, giulia.token, { name: 'x' })).status).toBe(403);
    const s = await api(env.app, 'POST', `/review-cycles/${chainCycleId}/calibration-sessions`, hr.token, { name: 'Calibrazione Q4 · Tech', participantPersonIds: [giulia.personId, marco.personId], expectedDistribution: { '3': 50, '4': 40, '5': 10 } });
    expect(s.status).toBe(201);
    sessionId = s.body.id;
    expect(s.body.status).toBe('open');
    expect(s.body.items.map((i: any) => i.subject.name)).toEqual(['Luca Bianchi']); // Sara non ha ancora la manager review
    expect(s.body.items[0]).toMatchObject({ proposedRating: 4, rating: 4, ratingLabel: 'Supera', potential: null, performance: 3, changes: 0 });
    expect(s.body.distribution.find((d: any) => d.rating === 4)).toMatchObject({ count: 1, pct: 100, expectedPct: 40, delta: 60 });
    expect(s.body.managers).toEqual([{ managerId: giulia.personId, manager: 'Giulia Ferri', count: 1, avg: 4, delta: 0, outlier: false }]);
    expect(s.body.canLock).toBe(true);
    // finché la sessione è aperta la review non si condivide
    const r = await api(env.app, 'GET', `/reviews/${reviewId}`, giulia.token);
    expect(r.body.inCalibration).toBe(true);
    expect(r.body.canShare).toBe(false);
    expect((await api(env.app, 'POST', `/reviews/${reviewId}/share`, giulia.token)).status).toBe(409);
    // visibilità: partecipanti e facilitatore sì, altri no
    expect((await api(env.app, 'GET', `/calibration-sessions/${sessionId}`, giulia.token)).status).toBe(200);
    expect((await api(env.app, 'GET', `/calibration-sessions/${sessionId}`, luca.token)).status).toBe(403);
    expect((await api(env.app, 'GET', `/calibration-sessions/${sessionId}`, paola.token)).status).toBe(200); // hrbp = HR
    expect((await api(env.app, 'GET', `/calibration-sessions?cycleId=${chainCycleId}`, marco.token)).body.map((x: any) => x.id)).toEqual([sessionId]);
    expect((await api(env.app, 'GET', '/calibration-sessions', luca.token)).body).toEqual([]);
    expect((await api(env.app, 'GET', `/calibration-sessions/${sessionId}`, outsider.token)).status).toBe(404);
  });

  it('participants change rating and potential with history; the potential feeds the talent grid; lock closes the session and unblocks sharing', async () => {
    expect((await api(env.app, 'POST', `/calibration-sessions/${sessionId}/ratings`, hr.token, { reviewId, rating: 7 })).status).toBe(422);
    expect((await api(env.app, 'POST', `/calibration-sessions/${sessionId}/ratings`, luca.token, { reviewId, rating: 5 })).status).toBe(403);
    const up = await api(env.app, 'POST', `/calibration-sessions/${sessionId}/ratings`, marco.token, { reviewId, rating: 5, potential: 3, note: 'Impatto oltre il ruolo: allineiamo verso l’alto' });
    expect(up.status).toBe(201);
    expect(up.body.items[0]).toMatchObject({ rating: 5, ratingLabel: 'Eccezionale', potential: 3, performance: 3, nineBox: 'Stella', changes: 1 });
    expect(up.body.nineBox.cells).toEqual({ '3-3': 1 });
    const r = await api(env.app, 'GET', `/reviews/${reviewId}`, giulia.token);
    expect(r.body.finalRating).toBe(5);
    expect(r.body.ratingHistory).toHaveLength(1);
    expect(r.body.ratingHistory[0]).toMatchObject({ fromRating: 4, toRating: 5, fromPotential: null, toPotential: 3, by: 'Marco Conti', inSession: true });
    // il soggetto non vede lo storico né il potenziale in chiaro prima della condivisione
    expect((await api(env.app, 'GET', `/reviews/${reviewId}`, luca.token)).body.ratingHistory).toEqual([]);
    const talent = await api(env.app, 'GET', `/development/people/${luca.personId}`, hr.token);
    expect(talent.status).toBe(200);
    expect(talent.body.talent).toMatchObject({ potential: 3, session: 'Calibrazione Q4 · Tech' });
    // blocco: solo HR o facilitatore; dopo il blocco niente modifiche, la review si condivide
    expect((await api(env.app, 'POST', `/calibration-sessions/${sessionId}/lock`, giulia.token)).status).toBe(403);
    const locked = await api(env.app, 'POST', `/calibration-sessions/${sessionId}/lock`, hr.token);
    expect(locked.body.status).toBe('locked');
    expect(locked.body.lockedBy.name).toBe('Chiara Moretti');
    expect((await api(env.app, 'POST', `/calibration-sessions/${sessionId}/ratings`, marco.token, { reviewId, rating: 4 })).status).toBe(409);
    expect((await api(env.app, 'PATCH', `/calibration-sessions/${sessionId}`, hr.token, { notes: 'x' })).status).toBe(409);
    const r2 = await api(env.app, 'GET', `/reviews/${reviewId}`, giulia.token);
    expect(r2.body.inCalibration).toBe(false);
    expect(r2.body.canShare).toBe(true);
    const shared = await api(env.app, 'POST', `/reviews/${reviewId}/share`, giulia.token);
    expect(shared.body.status).toBe('shared');
    expect(shared.body.finalRatingLabel).toBe('Eccezionale');
    expect((await api(env.app, 'POST', `/calibration-sessions/${sessionId}/unlock`, giulia.token)).status).toBe(403);
    expect((await api(env.app, 'POST', `/calibration-sessions/${sessionId}/unlock`, hr.token)).body.status).toBe('open');
    const audit = await withTenant(env.db, tenant.id, (db) => db.select().from(auditLog).where(eq(auditLog.action, 'review.calibrate')));
    expect(audit).toHaveLength(1);
  });
});
