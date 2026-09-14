import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { notifications } from '@wb/db';
import { api, createTestEnv, type TestEnv } from './helpers.js';

type U = { userId: string; personId: string; token: string };
let env: TestEnv;
let tenant: { id: string; slug: string };
let hr: U, anna: U, giulia: U, paolo: U, luca: U, sara: U;
let trainingAppId: string;
let projectAppId: string;
let instanceId: string;
const notesOf = async (u: U) => (await env.db.select().from(notifications).where(eq(notifications.userId, u.userId))).map((n) => n.type);
const stage = (inst: { stages: { key: string; run: { id: string; status: string; formResponseId: string | null; answers: unknown } | null }[] }, key: string) => inst.stages.find((s) => s.key === key)!;

beforeAll(async () => {
  env = await createTestEnv();
  tenant = await env.createTenant('Acme Apps');
  hr = await env.createUser(tenant.id, 'hr@apps.test', ['hr_admin'], { firstName: 'Chiara', lastName: 'Moretti' });
  anna = await env.createUser(tenant.id, 'anna@apps.test', ['manager'], { firstName: 'Anna', lastName: 'Colombo' });
  giulia = await env.createUser(tenant.id, 'giulia@apps.test', ['manager'], { firstName: 'Giulia', lastName: 'Ferri', managerId: anna.personId });
  paolo = await env.createUser(tenant.id, 'paolo@apps.test', ['manager'], { firstName: 'Paolo', lastName: 'Neri', managerId: anna.personId });
  luca = await env.createUser(tenant.id, 'luca@apps.test', ['employee'], { firstName: 'Luca', lastName: 'Bianchi', managerId: giulia.personId });
  sara = await env.createUser(tenant.id, 'sara@apps.test', ['employee'], { firstName: 'Sara', lastName: 'Ricci', managerId: giulia.personId });
});
afterAll(() => env.close());

describe('app studio (APP)', () => {
  it('HR installs templates (forms published, app in draft), publishing validates; permissions are enforced', async () => {
    expect((await api(env.app, 'GET', '/apps/templates', luca.token)).status).toBe(403);
    const tpl = await api(env.app, 'GET', '/apps/templates', hr.token);
    expect(tpl.body.map((t: { key: string }) => t.key)).toContain('training_request');
    const inst = await api(env.app, 'POST', '/apps/templates/install', hr.token, { key: 'training_request' });
    expect(inst.status).toBe(201);
    expect(inst.body.status).toBe('draft');
    expect(inst.body.formsCreated).toBe(1);
    expect(inst.body.problems).toEqual([]);
    trainingAppId = inst.body.id;
    expect((await api(env.app, 'POST', '/apps/templates/install', hr.token, { key: 'training_request' })).status).toBe(409);
    const forms = await api(env.app, 'GET', '/forms?kind=app&status=published', hr.token);
    expect(forms.body.map((f: { key: string }) => f.key)).toContain('app_training_request');
    // una bozza con form non pubblicato non si pubblica
    const bad = await api(env.app, 'POST', '/apps', hr.token, { key: 'bad_app', name: 'Bad', naming: { instanceLabel: 'X', launchVerb: 'X', subjectLabel: 'X' }, permissions: { launch: ['hr'], viewInstances: ['hr'] }, stages: [{ key: 's1', name: 'S1', type: 'form', actor: 'subject', formKey: 'missing_form', dueDays: 3 }] });
    expect(bad.status).toBe(201);
    expect((await api(env.app, 'POST', `/apps/${bad.body.id}/publish`, hr.token)).status).toBe(422);
    expect((await api(env.app, 'POST', '/apps', hr.token, { key: 'bad2', name: 'Bad2', naming: { instanceLabel: 'X', launchVerb: 'X', subjectLabel: 'X' }, permissions: { launch: ['hr'], viewInstances: ['hr'] }, stages: [{ key: 's1', name: 'S1', type: 'approval', actor: 'manager', dueDays: 3, approval: { rejectTo: 's1' } }] })).status).toBe(422);
    const pub = await api(env.app, 'POST', `/apps/${trainingAppId}/publish`, hr.token);
    expect(pub.status).toBe(201);
    expect(pub.body.status).toBe('published');
    expect((await api(env.app, 'PATCH', `/apps/${trainingAppId}`, hr.token, { name: 'X' })).status).toBe(409); // immutabile
    // il dipendente vede l'app tra quelle avviabili (per sé), non la lista completa
    expect((await api(env.app, 'GET', '/apps?scope=all', luca.token)).status).toBe(403);
    const mine = await api(env.app, 'GET', '/apps', luca.token);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0]).toMatchObject({ key: 'training_request', canLaunchForSelf: true, canLaunchForOthers: false });
    const projectInstall = await api(env.app, 'POST', '/apps/templates/install', hr.token, { key: 'project_review' });
    projectAppId = projectInstall.body.id;
    expect((await api(env.app, 'POST', `/apps/${projectAppId}/publish`, hr.token)).body.status).toBe('published');
    expect((await api(env.app, 'GET', '/apps', luca.token)).body).toHaveLength(1); // fine progetto: solo manager e HR
    expect((await api(env.app, 'GET', '/apps', giulia.token)).body.map((a: { key: string }) => a.key).sort()).toEqual(['project_review', 'training_request']);
  });

  it('training request: employee launches for self, manager rejects (reopens the form), employee resubmits, manager and HR approve, notify closes', async () => {
    expect((await api(env.app, 'POST', '/apps/instances', luca.token, { appKey: 'training_request', subjectPersonId: sara.personId })).status).toBe(403); // solo per sé
    const l = await api(env.app, 'POST', '/apps/instances', luca.token, { appKey: 'training_request' });
    expect(l.status).toBe(201);
    instanceId = l.body.id;
    expect(l.body.status).toBe('running');
    expect(l.body.currentStages).toEqual(['request']);
    const req = stage(l.body, 'request').run!;
    expect(req.status).toBe('active');
    expect(req.formResponseId).toBeTruthy();
    expect(stage(l.body, 'manager_ok').run!.status).toBe('pending');
    // visibilità: Sara (estranea) non vede l'istanza; Giulia (manager e futura attrice) sì via permesso manager
    expect((await api(env.app, 'GET', `/apps/instances/${instanceId}`, sara.token)).status).toBe(404);
    expect((await api(env.app, 'GET', `/apps/instances/${instanceId}`, giulia.token)).body.viewer).toBe('manager');
    // il form si compila nel form engine e la consegna fa avanzare
    const answers = { course: 'Corso Kubernetes avanzato', provider: 'Linux Foundation', cost: 900, why: 'Gestisco il cluster di produzione e voglio ridurre gli incidenti di deploy.' };
    expect((await api(env.app, 'POST', `/form-responses/${req.formResponseId}/submit`, luca.token, { answers })).status).toBe(201);
    let inst = (await api(env.app, 'GET', `/apps/instances/${instanceId}`, giulia.token)).body;
    expect(inst.currentStages).toEqual(['manager_ok']);
    const mgrRun = stage(inst, 'manager_ok').run!;
    expect(mgrRun.status).toBe('active');
    expect(stage(inst, 'request').run!.answers).toMatchObject({ cost: 900 }); // seePrevious per l'attore attivo
    expect(await notesOf(giulia)).toContain('app.stage_assigned');
    const todo = await api(env.app, 'GET', '/apps/instances?box=todo', giulia.token);
    expect(todo.body.map((i: { id: string }) => i.id)).toEqual([instanceId]);
    // Paolo (altro manager) non può decidere; il rimando richiede commento
    expect((await api(env.app, 'POST', `/apps/runs/${mgrRun.id}/decide`, paolo.token, { decision: 'approve' })).status).toBe(403);
    expect((await api(env.app, 'POST', `/apps/runs/${mgrRun.id}/decide`, giulia.token, { decision: 'reject' })).status).toBe(422);
    const rej = await api(env.app, 'POST', `/apps/runs/${mgrRun.id}/decide`, giulia.token, { decision: 'reject', comment: 'Indica un corso più breve o un budget sotto 600 €.' });
    expect(rej.status).toBe(201);
    expect(rej.body.currentStages).toEqual(['request']);
    const reopened = stage(rej.body, 'request').run!;
    expect(reopened.status).toBe('active');
    expect(reopened.formResponseId).not.toBe(req.formResponseId);
    expect(stage(rej.body, 'manager_ok').run!.status).toBe('pending'); // nuovo tentativo in attesa
    expect(stage(rej.body, 'manager_ok').history[0]).toMatchObject({ status: 'rejected', outcome: 'rejected' });
    expect(await notesOf(luca)).toContain('app.decided');
    // Luca ricompila; manager e HR approvano; la notifica finale chiude
    expect((await api(env.app, 'POST', `/form-responses/${reopened.formResponseId}/submit`, luca.token, { answers: { ...answers, cost: 450, course: 'Corso Kubernetes base' } })).status).toBe(201);
    inst = (await api(env.app, 'GET', `/apps/instances/${instanceId}`, giulia.token)).body;
    expect(stage(inst, 'manager_ok').run!.attempt).toBe(2);
    expect((await api(env.app, 'POST', `/apps/runs/${stage(inst, 'manager_ok').run!.id}/decide`, giulia.token, { decision: 'approve', comment: 'Ok così.' })).body.currentStages).toEqual(['hr_ok']);
    inst = (await api(env.app, 'GET', `/apps/instances/${instanceId}`, hr.token)).body;
    expect(stage(inst, 'hr_ok').run!.canDecide).toBe(true);
    const done = await api(env.app, 'POST', `/apps/runs/${stage(inst, 'hr_ok').run!.id}/decide`, hr.token, { decision: 'approve' });
    expect(done.body.status).toBe('completed');
    expect(done.body.outcome).toBe('completed');
    expect(stage(done.body, 'done').run!.status).toBe('done');
    expect(done.body.progress.percent).toBe(100);
    expect(await notesOf(luca)).toContain('app.message');
    expect(await notesOf(luca)).toContain('app.completed');
    expect(done.body.events.map((e: { type: string }) => e.type)).toEqual(expect.arrayContaining(['launched', 'submitted', 'rejected', 'approved', 'notified', 'completed']));
    const mineList = await api(env.app, 'GET', '/apps/instances?box=mine', luca.token);
    expect(mineList.body[0]).toMatchObject({ id: instanceId, status: 'completed' });
  });

  it('project review: parallel self and lead forms, then share and acknowledgement; HR can reassign and extend', async () => {
    expect((await api(env.app, 'POST', '/apps/instances', giulia.token, { appKey: 'project_review', subjectPersonId: paolo.personId })).status).toBe(403); // non è un suo riporto
    const l = await api(env.app, 'POST', '/apps/instances', giulia.token, { appKey: 'project_review', subjectPersonId: luca.personId, title: 'Progetto Atlas' });
    expect(l.status).toBe(201);
    expect(l.body.currentStages.sort()).toEqual(['lead', 'self']);
    const self = stage(l.body, 'self').run!;
    const lead = stage(l.body, 'lead').run!;
    expect(await notesOf(luca)).toContain('app.stage_assigned');
    // HR proroga e riassegna la fase del responsabile a Paolo
    const ext = await api(env.app, 'POST', `/apps/runs/${lead.id}/extend`, hr.token, { dueDate: '2027-01-31' });
    expect(stage(ext.body, 'lead').run!.dueDate).toBe('2027-01-31');
    expect((await api(env.app, 'POST', `/apps/runs/${lead.id}/reassign`, giulia.token, { actorPersonId: paolo.personId })).status).toBe(403);
    const re = await api(env.app, 'POST', `/apps/runs/${lead.id}/reassign`, hr.token, { actorPersonId: paolo.personId });
    expect(stage(re.body, 'lead').run!.actor.firstName).toBe('Paolo');
    expect((await api(env.app, 'GET', `/form-responses/${lead.formResponseId}`, paolo.token)).body.canEdit).toBe(true);
    // il self chiude ma si aspetta il parallelo
    expect((await api(env.app, 'POST', `/form-responses/${self.formResponseId}/submit`, luca.token, { answers: { result: 4, collab: 5, learned: 'Coordinare tre team' } })).status).toBe(201);
    let inst = (await api(env.app, 'GET', `/apps/instances/${l.body.id}`, hr.token)).body;
    expect(inst.currentStages).toEqual(['lead']);
    expect(stage(inst, 'share').run!.status).toBe('pending');
    // il responsabile compila (rating basso richiede commento: il form engine lo impone)
    expect((await api(env.app, 'POST', `/form-responses/${lead.formResponseId}/submit`, paolo.token, { answers: { result: 2, collab: 4, strengths: 'Tenacia', growth: 'Pianificazione' } })).status).toBe(400);
    expect((await api(env.app, 'POST', `/form-responses/${lead.formResponseId}/submit`, paolo.token, { answers: { result: 2, result_comment: 'Consegna in ritardo di un mese', collab: 4, strengths: 'Tenacia', growth: 'Pianificazione' } })).status).toBe(201);
    inst = (await api(env.app, 'GET', `/apps/instances/${l.body.id}`, giulia.token)).body;
    expect(inst.currentStages).toEqual(['share']);
    expect(stage(inst, 'share').run!.isMine).toBe(true);
    // Giulia (share, seePrevious) vede entrambe le risposte; Luca vede solo le proprie finché non tocca a lui
    expect(stage(inst, 'lead').run!.answers).toMatchObject({ result: 2 });
    const lucaView = (await api(env.app, 'GET', `/apps/instances/${l.body.id}`, luca.token)).body;
    expect(stage(lucaView, 'self').run!.answers).toMatchObject({ result: 4 });
    expect(stage(lucaView, 'lead').run!.answers).toBeNull();
    expect((await api(env.app, 'POST', `/apps/runs/${stage(inst, 'share').run!.id}/decide`, giulia.token, { decision: 'approve' })).body.currentStages).toEqual(['ack']);
    const lucaAck = (await api(env.app, 'GET', `/apps/instances/${l.body.id}`, luca.token)).body;
    expect(stage(lucaAck, 'lead').run!.answers).toMatchObject({ result: 2 }); // ora è il suo turno con seePrevious
    const fin = await api(env.app, 'POST', `/apps/runs/${stage(lucaAck, 'ack').run!.id}/decide`, luca.token, { decision: 'approve', comment: 'Preso atto, concordo sulla pianificazione.' });
    expect(fin.body.status).toBe('completed');
    // dashboard e CSV
    const dash = await api(env.app, 'GET', '/apps/dashboard', hr.token);
    expect(dash.body.find((a: { key: string }) => a.key === 'project_review').counts.completed).toBe(1);
    const csv = await env.app.inject({ method: 'GET', url: '/api/v1/apps/instances?box=all&format=csv', headers: { authorization: `Bearer ${hr.token}` } });
    expect(csv.statusCode).toBe(200);
    expect(csv.body).toContain('Progetto Atlas');
  });

  it('rejecting an approval without a reject target ends the instance; cancel by launcher; versions, duplicate, export and import', async () => {
    const l = await api(env.app, 'POST', '/apps/instances', giulia.token, { appKey: 'project_review', subjectPersonId: sara.personId });
    const self = stage(l.body, 'self').run!; const lead = stage(l.body, 'lead').run!;
    await api(env.app, 'POST', `/form-responses/${self.formResponseId}/submit`, sara.token, { answers: { result: 3, collab: 3, learned: 'x' } });
    await api(env.app, 'POST', `/form-responses/${lead.formResponseId}/submit`, giulia.token, { answers: { result: 3, collab: 3, strengths: 'x', growth: 'y' } });
    let inst = (await api(env.app, 'GET', `/apps/instances/${l.body.id}`, giulia.token)).body;
    const ended = await api(env.app, 'POST', `/apps/runs/${stage(inst, 'share').run!.id}/decide`, giulia.token, { decision: 'reject', comment: 'Da rifare' });
    expect(ended.body).toMatchObject({ status: 'completed', outcome: 'rejected' });
    const l2 = await api(env.app, 'POST', '/apps/instances', giulia.token, { appKey: 'project_review', subjectPersonId: sara.personId });
    expect((await api(env.app, 'POST', `/apps/instances/${l2.body.id}/cancel`, sara.token, { reason: 'no' })).status).toBe(403);
    expect((await api(env.app, 'POST', `/apps/instances/${l2.body.id}/cancel`, giulia.token, { reason: 'Progetto rinviato' })).body.status).toBe('cancelled');
    // versioni: nuova bozza dalla pubblicata, modifica, pubblicazione archivia la precedente; le istanze restano sulla loro versione
    const v2 = await api(env.app, 'POST', `/apps/${trainingAppId}/versions`, hr.token);
    expect(v2.status).toBe(201);
    expect(v2.body.version).toBe(2);
    const upd = await api(env.app, 'PATCH', `/apps/${v2.body.id}`, hr.token, { name: 'Richiesta formazione (v2)', stages: v2.body.definition.stages.filter((s: { key: string }) => s.key !== 'hr_ok') });
    expect(upd.status).toBe(200);
    expect(upd.body.definition.stages).toHaveLength(3);
    expect((await api(env.app, 'POST', `/apps/${v2.body.id}/publish`, hr.token)).body.status).toBe('published');
    expect((await api(env.app, 'GET', `/apps/${trainingAppId}`, hr.token)).body.status).toBe('archived');
    expect((await api(env.app, 'GET', `/apps/instances/${instanceId}`, hr.token)).body.appVersion).toBe(1);
    inst = (await api(env.app, 'POST', '/apps/instances', luca.token, { appKey: 'training_request' })).body;
    expect(inst.appVersion).toBe(2);
    expect(inst.stages.map((s: { key: string }) => s.key)).toEqual(['request', 'manager_ok', 'done']);
    // duplica, esporta, importa (la chiave importata viene resa unica)
    const dup = await api(env.app, 'POST', `/apps/${v2.body.id}/duplicate`, hr.token, { key: 'training_request_sales', name: 'Richiesta formazione Vendite' });
    expect(dup.body).toMatchObject({ key: 'training_request_sales', status: 'draft', version: 1 });
    const exp = await api(env.app, 'GET', `/apps/${v2.body.id}/export`, hr.token);
    expect(exp.body.app.key).toBe('training_request');
    expect(exp.body.forms.map((f: { key: string }) => f.key)).toEqual(['app_training_request']);
    const imp = await api(env.app, 'POST', '/apps/import', hr.token, exp.body);
    expect(imp.status).toBe(201);
    expect(imp.body.key).toBe('training_request_2');
    expect(imp.body.formsCreated).toBe(0);
    expect(imp.body.problems).toEqual([]);
  });
});
