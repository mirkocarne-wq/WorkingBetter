import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { emailOutbox, notifications, persons, objectives, cycles } from '@wb/db';
import { api, createTestEnv, type TestEnv } from './helpers.js';

type U = { userId: string; personId: string; token: string };
let env: TestEnv;
let tenant: { id: string; slug: string };
let hr: U, giulia: U, paolo: U, sara: U, elena: U, marco: U;
let journeyId: string;
let tasksByKey: Record<string, { id: string; status: string; kind: string; assignee: { id: string } | null; dueDate: string | null; link: string | null }>;
const notesOf = async (u: U) => (await env.db.select().from(notifications).where(eq(notifications.userId, u.userId))).map((n) => n.type);
const today = new Date().toISOString().slice(0, 10);
const shift = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

beforeAll(async () => {
  env = await createTestEnv();
  tenant = await env.createTenant('Acme Onb');
  hr = await env.createUser(tenant.id, 'hr@onb.test', ['hr_admin'], { firstName: 'Chiara', lastName: 'Moretti' });
  giulia = await env.createUser(tenant.id, 'giulia@onb.test', ['manager'], { firstName: 'Giulia', lastName: 'Ferri' });
  paolo = await env.createUser(tenant.id, 'paolo@onb.test', ['manager'], { firstName: 'Paolo', lastName: 'Neri' });
  sara = await env.createUser(tenant.id, 'sara@onb.test', ['employee'], { firstName: 'Sara', lastName: 'Ricci', managerId: giulia.personId });
  marco = await env.createUser(tenant.id, 'marco@onb.test', ['employee'], { firstName: 'Marco', lastName: 'Conti', managerId: giulia.personId });
  elena = await env.createUser(tenant.id, 'elena@onb.test', ['employee'], { firstName: 'Elena', lastName: 'Parisi', managerId: giulia.personId });
  await env.db.execute(`update persons set hire_date = '2020-01-01' where email in ('sara@onb.test','marco@onb.test')`);
  await env.db.execute(`update persons set hire_date = '${shift(-3)}', job_title = 'QA Engineer' where email = 'elena@onb.test'`);
});
afterAll(() => env.close());

describe('onboarding (ONB)', () => {
  it('HR loads the presets; templates are validated; permissions are enforced', async () => {
    expect((await api(env.app, 'POST', '/onboarding/templates/presets', sara.token)).status).toBe(403);
    const pre = await api(env.app, 'POST', '/onboarding/templates/presets', hr.token);
    expect(pre.status).toBe(201);
    expect(pre.body.added).toBe(5);
    expect((await api(env.app, 'POST', '/onboarding/templates/presets', hr.token)).body.added).toBe(0);
    const list = await api(env.app, 'GET', '/onboarding/templates', giulia.token);
    expect(list.status).toBe(200);
    expect(list.body.find((t: { name: string }) => t.name === 'Onboarding generico').isDefault).toBe(true);
    const bad = await api(env.app, 'POST', '/onboarding/templates', hr.token, { name: 'X', phases: [{ key: 'a', label: 'A', fromDay: 0, toDay: 5 }], tasks: [{ key: 't1', phase: 'nope', title: 'x', dueDay: 1 }] });
    expect(bad.status).toBe(400);
    const custom = await api(env.app, 'POST', '/onboarding/templates', hr.token, {
      name: 'Onboarding QA', kind: 'onboarding', phases: [{ key: 'w1', label: 'Settimana 1', fromDay: 0, toDay: 7 }, { key: 'm1', label: 'Mese 1', fromDay: 8, toDay: 30 }],
      tasks: [
        { key: 'laptop', phase: 'w1', title: 'Consegnare il laptop', role: 'it', kind: 'todo', dueDay: -1 },
        { key: 'welcome', phase: 'w1', title: 'Primo 1:1', role: 'manager', kind: 'meeting', dueDay: 1, link: '/one-on-ones' },
        { key: 'coffee', phase: 'w1', title: 'Caffè con il buddy', role: 'buddy', kind: 'meeting', dueDay: 2 },
        { key: 'policies', phase: 'w1', title: 'Presa visione policy', role: 'newcomer', kind: 'sign', dueDay: 3 },
        { key: 'survey_d7', phase: 'w1', title: 'Prima settimana', role: 'newcomer', kind: 'survey', dueDay: 7, surveyKey: 'd7' },
        { key: 'profile', phase: 'w1', title: 'Scheda di ingresso', role: 'newcomer', kind: 'form', dueDay: 5, formKey: 'onb_profile' },
        { key: 'objectives', phase: 'm1', title: 'Primi obiettivi', role: 'newcomer', kind: 'objective', dueDay: 20, link: '/objectives' },
        { key: 'optional_reading', phase: 'm1', title: 'Lettura consigliata', role: 'newcomer', kind: 'read', dueDay: 25, required: false },
      ],
      rules: { jobTitleKeywords: ['qa'] },
    });
    expect(custom.status).toBe(201);
    expect(custom.body.tasks).toHaveLength(8);
    // form per il task "form"
    const f = await api(env.app, 'POST', '/forms', hr.token, { key: 'onb_profile', name: 'Scheda di ingresso', kind: 'request', schema: { title: 'Scheda di ingresso', sections: [{ key: 's', title: 'Dati', fields: [{ key: 'bio', type: 'short_text', label: 'Due righe su di te', required: true }] }], scoring: { enabled: false } } });
    expect(f.status).toBe(201);
    expect((await api(env.app, 'POST', `/forms/${f.body.id}/publish`, hr.token)).status).toBe(201);
  });

  it('starting a journey picks the template from the rules, resolves assignees and due dates, notifies the actors', async () => {
    expect((await api(env.app, 'POST', '/onboarding/journeys', paolo.token, { personId: elena.personId })).status).toBe(403); // non è il suo manager
    const j = await api(env.app, 'POST', '/onboarding/journeys', giulia.token, { personId: elena.personId, buddyPersonId: sara.personId });
    expect(j.status).toBe(201);
    journeyId = j.body.id;
    expect(j.body.templateName).toBe('Onboarding QA'); // regola: job title contiene "qa"
    expect(j.body.anchorDate).toBe(shift(-3));
    expect(j.body.day).toBe(3);
    expect(j.body.buddy.firstName).toBe('Sara');
    tasksByKey = Object.fromEntries(j.body.tasks.map((t: { key: string }) => [t.key, t]));
    expect(tasksByKey.welcome!.assignee!.id).toBe(giulia.personId);
    expect(tasksByKey.coffee!.assignee!.id).toBe(sara.personId);
    expect(tasksByKey.laptop!.assignee!.id).toBe(giulia.personId); // IT non definito → manager (HR non ha avviato)
    expect(tasksByKey.policies!.dueDate).toBe(shift(0));
    expect(tasksByKey.laptop!.dueDate).toBe(shift(-4));
    expect(tasksByKey.profile!.link).toMatch(/^\/forms\/responses\//);
    expect(j.body.progress).toMatchObject({ total: 8, done: 0, percent: 0 });
    // il percorso gira sul motore dei processi (ADR-0011): istanza silenziosa, una fase per task, tutte attive
    expect(j.body.appInstanceId).toBeTruthy();
    const inst = await api(env.app, 'GET', `/apps/instances/${j.body.appInstanceId}`, hr.token);
    expect(inst.status).toBe(200);
    expect(inst.body).toMatchObject({ appKey: `onboarding_${journeyId.replace(/-/g, '')}`, managedByModule: true, moduleLink: `/onboarding/journeys/${journeyId}` });
    expect(inst.body.currentStages).toHaveLength(8);
    expect(inst.body.stages.every((s: { run: { status: string } }) => s.run.status === 'active')).toBe(true);
    const profileStage = inst.body.stages.find((s: { name: string }) => s.name === 'Scheda di ingresso');
    expect(profileStage.type).toBe('form');
    expect(tasksByKey.profile!.link).toBe(`/forms/responses/${profileStage.run.formResponseId}`);
    expect(inst.body.stages.find((s: { name: string }) => s.name === 'Consegnare il laptop').run.dueDate).toBe(shift(-4));
    expect(inst.body.stages.find((s: { name: string }) => s.name === 'Consegnare il laptop').run.canDecide).toBe(false);
    expect((await api(env.app, 'POST', `/apps/runs/${profileStage.run.id}/decide`, hr.token, { decision: 'approve' })).status).toBe(409); // si chiude dal modulo
    expect(await notesOf(elena)).not.toContain('app.stage_assigned');
    expect((await api(env.app, 'POST', '/onboarding/journeys', giulia.token, { personId: elena.personId })).status).toBe(409);
    expect(await notesOf(sara)).toContain('onboarding.started');
    expect(await notesOf(elena)).toContain('onboarding.started');
    // visibilità: la persona vede tutto, il buddy solo i propri task, un estraneo niente
    const mine = await api(env.app, 'GET', '/onboarding/me', elena.token);
    expect(mine.body.journey.viewer).toBe('self');
    expect(mine.body.journey.tasks).toHaveLength(8);
    expect(mine.body.tasks.map((t: { key: string }) => t.key).sort()).toEqual(['objectives', 'optional_reading', 'policies', 'profile', 'survey_d7']);
    const buddy = await api(env.app, 'GET', `/onboarding/journeys/${journeyId}`, sara.token);
    expect(buddy.body.viewer).toBe('participant');
    expect(buddy.body.tasks.map((t: { key: string }) => t.key)).toEqual(['coffee']);
    expect((await api(env.app, 'GET', `/onboarding/journeys/${journeyId}`, marco.token)).status).toBe(404);
    expect((await api(env.app, 'GET', `/onboarding/journeys/${journeyId}`, paolo.token)).status).toBe(404);
    expect((await api(env.app, 'GET', '/onboarding/journeys?box=team', giulia.token)).body).toHaveLength(1);
    const sug = await api(env.app, 'GET', `/onboarding/journeys/${journeyId}/buddy-suggestions`, giulia.token);
    expect(sug.body.map((s: { id: string }) => s.id)).toContain(marco.personId);
  });

  it('tasks: only the assignee, manager or HR complete them; sign requires acknowledgement; surveys close via submission', async () => {
    expect((await api(env.app, 'PATCH', `/onboarding/tasks/${tasksByKey.coffee!.id}`, marco.token, { status: 'done' })).status).toBe(403);
    expect((await api(env.app, 'PATCH', `/onboarding/tasks/${tasksByKey.coffee!.id}`, sara.token, { status: 'done', note: 'Fatto martedì' })).body.status).toBe('done');
    expect((await api(env.app, 'PATCH', `/onboarding/tasks/${tasksByKey.welcome!.id}`, giulia.token, { status: 'done' })).body.status).toBe('done');
    expect((await api(env.app, 'PATCH', `/onboarding/tasks/${tasksByKey.laptop!.id}`, hr.token, { status: 'done' })).body.status).toBe('done'); // l'HR può chiudere per conto di altri
    const sign = await api(env.app, 'PATCH', `/onboarding/tasks/${tasksByKey.policies!.id}`, elena.token, { status: 'done' });
    expect(sign.status).toBe(422); // manca la conferma esplicita
    expect((await api(env.app, 'PATCH', `/onboarding/tasks/${tasksByKey.policies!.id}`, giulia.token, { status: 'done', acknowledged: true })).status).toBe(403); // la presa visione è personale
    const signed = await api(env.app, 'PATCH', `/onboarding/tasks/${tasksByKey.policies!.id}`, elena.token, { status: 'done', acknowledged: true });
    expect(signed.body.status).toBe('done');
    expect(signed.body.note).toContain('Presa visione confermata');
    expect((await api(env.app, 'PATCH', `/onboarding/tasks/${tasksByKey.survey_d7!.id}`, elena.token, { status: 'done' })).status).toBe(422);
    // survey: punteggio basso → alert a manager e HR non presente (HR non ha avviato), manager sì
    expect((await api(env.app, 'POST', `/onboarding/journeys/${journeyId}/surveys/d7`, giulia.token, { answers: { welcome: 5 } })).status).toBe(403);
    const low = await api(env.app, 'POST', `/onboarding/journeys/${journeyId}/surveys/d7`, elena.token, { answers: { welcome: 4, tools: 2, clarity: 4, support: 4 }, comment: 'Il laptop è arrivato tardi.' });
    expect(low.status).toBe(201);
    expect(low.body).toMatchObject({ score: 3.5, low: true });
    expect(await notesOf(giulia)).toContain('onboarding.survey_low');
    expect((await api(env.app, 'POST', `/onboarding/journeys/${journeyId}/surveys/d7`, elena.token, { answers: { welcome: 5 } })).status).toBe(409);
    // il task "form" si chiude con l'invio della compilazione
    const respId = tasksByKey.profile!.link!.split('/').pop()!;
    expect((await api(env.app, 'POST', `/form-responses/${respId}/submit`, elena.token, { answers: { bio: 'QA con la passione per i test esplorativi.' } })).status).toBe(201);
    const j = await api(env.app, 'GET', `/onboarding/journeys/${journeyId}`, giulia.token);
    const byKey = Object.fromEntries(j.body.tasks.map((t: { key: string; status: string }) => [t.key, t.status]));
    expect(byKey).toMatchObject({ coffee: 'done', welcome: 'done', laptop: 'done', policies: 'done', survey_d7: 'done', profile: 'done', objectives: 'open', optional_reading: 'open' });
    expect(j.body.progress.percent).toBe(75);
    expect(j.body.surveys[0]).toMatchObject({ key: 'd7', score: 3.5, low: true });
    const inst = await api(env.app, 'GET', `/apps/instances/${j.body.appInstanceId}`, hr.token);
    const runStatus = Object.fromEntries(inst.body.stages.map((s: { name: string; run: { status: string; outcome: string | null } }) => [s.name, `${s.run.status}:${s.run.outcome ?? ''}`]));
    expect(runStatus).toMatchObject({ 'Caffè con il buddy': 'done:approved', 'Presa visione policy': 'done:approved', 'Prima settimana': 'done:approved', 'Scheda di ingresso': 'done:submitted', 'Consegnare il laptop': 'done:approved' });
    expect(inst.body.progress.done).toBe(6);
    // riapertura: nuovo tentativo sul motore, il task torna aperto e si richiude
    const reopened = await api(env.app, 'PATCH', `/onboarding/tasks/${tasksByKey.laptop!.id}`, hr.token, { status: 'open' });
    expect(reopened.body.status).toBe('open');
    const inst2 = await api(env.app, 'GET', `/apps/instances/${j.body.appInstanceId}`, hr.token);
    const laptop = inst2.body.stages.find((s: { name: string }) => s.name === 'Consegnare il laptop');
    expect(laptop.run).toMatchObject({ attempt: 2, status: 'active' });
    expect(laptop.history.map((h: { status: string }) => h.status)).toEqual(['superseded']);
    expect((await api(env.app, 'PATCH', `/onboarding/tasks/${tasksByKey.laptop!.id}`, hr.token, { status: 'skipped', note: 'Porta il suo' })).body.status).toBe('skipped');
    expect((await api(env.app, 'GET', `/apps/instances/${j.body.appInstanceId}`, hr.token)).body.stages.find((s: { name: string }) => s.name === 'Consegnare il laptop').run.status).toBe('skipped');
    expect(await notesOf(elena)).toContain('onboarding.milestone');
    expect((await api(env.app, 'GET', `/onboarding/journeys/${journeyId}`, sara.token)).body.surveys).toEqual([]); // il buddy non vede le survey
  });

  it('moving the anchor date shifts open tasks; changing buddy reassigns; completing the last required task completes the journey', async () => {
    const moved = await api(env.app, 'PATCH', `/onboarding/journeys/${journeyId}`, giulia.token, { anchorDate: shift(-1) });
    expect(moved.status).toBe(200);
    const obj = moved.body.tasks.find((t: { key: string }) => t.key === 'objectives');
    expect(obj.dueDate).toBe(shift(19));
    expect(moved.body.tasks.find((t: { key: string }) => t.key === 'policies').dueDate).toBe(shift(0)); // già chiuso: invariato
    const added = await api(env.app, 'POST', `/onboarding/journeys/${journeyId}/tasks`, giulia.token, { phase: 'm1', title: 'Shadowing con Marco', role: 'buddy', kind: 'meeting', dueDate: shift(10) });
    expect(added.status).toBe(201);
    const shadow = added.body.tasks.find((t: { title: string }) => t.title === 'Shadowing con Marco');
    expect(shadow.assignee.id).toBe(sara.personId);
    const rebuddy = await api(env.app, 'PATCH', `/onboarding/journeys/${journeyId}`, hr.token, { buddyPersonId: marco.personId });
    expect(rebuddy.body.tasks.find((t: { title: string }) => t.title === 'Shadowing con Marco').assignee.id).toBe(marco.personId);
    // sul motore: scadenze spostate e attori riassegnati (il task ad hoc non è rispecchiato)
    const inst = await api(env.app, 'GET', `/apps/instances/${moved.body.appInstanceId}`, hr.token);
    expect(inst.body.stages.find((s: { name: string }) => s.name === 'Obiettivi dei primi 30 giorni' || s.name.toLowerCase().includes('obiettiv')).run.dueDate).toBe(shift(19));
    expect(inst.body.stages.map((s: { name: string }) => s.name)).not.toContain('Shadowing con Marco');
    expect(await notesOf(marco)).toContain('onboarding.started');
    // dashboard
    const dash = await api(env.app, 'GET', '/onboarding/dashboard', hr.token);
    expect(dash.status).toBe(200);
    expect(dash.body.totals.active).toBe(1);
    expect(dash.body.totals.lowSurveys).toBe(1);
    expect(dash.body.surveys.find((s: { key: string }) => s.key === 'd7')).toMatchObject({ n: 1, avg: 3.5, low: 1 });
    expect((await api(env.app, 'GET', '/onboarding/dashboard', paolo.token)).body.journeys).toHaveLength(0);
    // completamento: chiudo obiettivi e shadowing (obbligatori); la lettura facoltativa resta aperta
    expect((await api(env.app, 'PATCH', `/onboarding/tasks/${obj.id}`, elena.token, { status: 'done' })).body.status).toBe('done');
    const done = await api(env.app, 'PATCH', `/onboarding/tasks/${shadow.id}`, marco.token, { status: 'done' });
    expect(done.body.status).toBe('done');
    const final = await api(env.app, 'GET', `/onboarding/journeys/${journeyId}`, elena.token);
    expect(final.body.status).toBe('completed');
    expect((await api(env.app, 'GET', `/apps/instances/${final.body.appInstanceId}`, hr.token)).body).toMatchObject({ status: 'completed', outcome: 'completed' });
    expect(await notesOf(elena)).toContain('onboarding.completed');
    expect((await api(env.app, 'PATCH', `/onboarding/tasks/${tasksByKey.optional_reading!.id}`, elena.token, { status: 'done' })).status).toBe(409); // percorso chiuso
  });

  it('auto start: recent hires without a journey get the default template; leaving people get the offboarding', async () => {
    await env.db.execute(`update persons set hire_date = '${shift(-10)}', job_title = 'Developer' where email = 'marco@onb.test'`);
    await env.db.execute(`update persons set status = 'leaving', termination_date = '${shift(20)}' where email = 'sara@onb.test'`);
    const auto = await api(env.app, 'POST', '/onboarding/journeys/auto', hr.token, {});
    expect(auto.status).toBe(201);
    expect(auto.body.started).toBe(2);
    const all = await api(env.app, 'GET', '/onboarding/journeys?box=all', hr.token);
    const marcoJ = all.body.find((j: { person: { id: string } }) => j.person.id === marco.personId);
    expect(marcoJ.templateName).toBe('Onboarding generico');
    const saraJ = all.body.find((j: { person: { id: string }; kind: string }) => j.person.id === sara.personId && j.kind === 'offboarding');
    expect(saraJ.anchorDate).toBe(shift(20));
    expect((await api(env.app, 'POST', '/onboarding/journeys/auto', hr.token, {})).body.started).toBe(0);
    // il task "obiettivi" del percorso di Marco resta aperto finché non ha un obiettivo (chiusura dal worker)
    const [c] = await env.db.insert(cycles).values({ tenantId: tenant.id, name: 'Q4', startDate: today, endDate: shift(90) }).returning();
    await env.db.insert(objectives).values({ tenantId: tenant.id, cycleId: c!.id, title: 'Primo obiettivo', level: 'individual', ownerPersonId: marco.personId, status: 'active' });
    const mj = await api(env.app, 'GET', `/onboarding/journeys/${marcoJ.id}`, marco.token);
    expect(mj.body.tasks.find((t: { key: string }) => t.key === 'objectives').status).toBe('open');
  });

  it('pre-boarding with an external identity: the newcomer without an account completes tasks and forms through the magic link', async () => {
    const tpl = await api(env.app, 'POST', '/onboarding/templates', hr.token, {
      name: 'Onboarding Vendite', kind: 'onboarding', rules: { jobTitleKeywords: ['sales'] },
      phases: [{ key: 'pre', label: 'Pre-boarding', fromDay: -14, toDay: -1 }, { key: 'w1', label: 'Settimana 1', fromDay: 0, toDay: 7 }],
      tasks: [
        { key: 'contract', phase: 'pre', title: 'Firma il contratto', role: 'newcomer', kind: 'sign', dueDay: -7 },
        { key: 'welcome_pack', phase: 'pre', title: 'Leggi il welcome pack', role: 'newcomer', kind: 'read', dueDay: -3, required: false },
        { key: 'personal_data', phase: 'pre', title: 'Scheda anagrafica', role: 'newcomer', kind: 'form', dueDay: -2, formKey: 'onb_profile' },
        { key: 'badge', phase: 'pre', title: 'Prepara il badge', role: 'hr', kind: 'todo', dueDay: -1 },
        { key: 'first_day', phase: 'w1', title: 'Giro degli uffici', role: 'newcomer', kind: 'todo', dueDay: 0 },
      ],
    });
    expect(tpl.status).toBe(201);
    const [nuovo] = await env.db.insert(persons).values({ tenantId: tenant.id, firstName: 'Nadia', lastName: 'Esposito', email: 'nadia@example.test', jobTitle: 'Sales Executive', managerId: paolo.personId, hireDate: shift(10), status: 'invited' }).returning();
    const j = await api(env.app, 'POST', '/onboarding/journeys', hr.token, { personId: nuovo!.id });
    expect(j.status).toBe(201);
    expect(j.body.templateName).toBe('Onboarding Vendite');
    expect(j.body.external).toMatchObject({ email: 'nadia@example.test', active: true });
    const mails = await env.db.select().from(emailOutbox).where(eq(emailOutbox.toEmail, 'nadia@example.test'));
    expect(mails).toHaveLength(1);
    expect(mails[0]!.subject).toContain('pre-boarding');
    expect(mails[0]!.text).toContain('3 attività');
    const token = mails[0]!.text.match(/\/onboarding\/external\/([A-Za-z0-9_-]+)/)![1]!;
    // il link mostra solo i task della persona prima dell'ingresso
    const ext = await api(env.app, 'GET', `/onboarding/external/${token}`);
    expect(ext.status).toBe(200);
    expect(ext.body.person.firstName).toBe('Nadia');
    expect(ext.body.tasks.map((t: { key: string }) => t.key)).toEqual(['contract', 'welcome_pack', 'personal_data']);
    expect(ext.body.tasks.find((t: { key: string }) => t.key === 'personal_data').form.schema.sections).toBeDefined();
    expect((await api(env.app, 'GET', '/onboarding/external/not-a-valid-token-at-all-xx')).status).toBe(404);
    const contract = ext.body.tasks.find((t: { key: string }) => t.key === 'contract');
    expect((await api(env.app, 'POST', `/onboarding/external/${token}/tasks/${contract.id}`, undefined, {})).status).toBe(422); // presa visione senza conferma
    expect((await api(env.app, 'POST', `/onboarding/external/${token}/tasks/${contract.id}`, undefined, { acknowledged: true })).body.status).toBe('done');
    const pd = ext.body.tasks.find((t: { key: string }) => t.key === 'personal_data');
    expect((await api(env.app, 'POST', `/onboarding/external/${token}/tasks/${pd.id}/form`, undefined, { answers: {} })).status).toBe(400); // campo obbligatorio mancante (validazione del form engine)
    expect((await api(env.app, 'POST', `/onboarding/external/${token}/tasks/${pd.id}/form`, undefined, { answers: { bio: 'Vengo dalle vendite B2B, 6 anni di esperienza.' } })).body.status).toBe('done');
    // i task di un'altra fase o di altri ruoli non sono raggiungibili dal link
    const full = await api(env.app, 'GET', `/onboarding/journeys/${j.body.id}`, hr.token);
    const firstDay = full.body.tasks.find((t: { key: string }) => t.key === 'first_day');
    const badge = full.body.tasks.find((t: { key: string }) => t.key === 'badge');
    expect((await api(env.app, 'POST', `/onboarding/external/${token}/tasks/${firstDay.id}`, undefined, {})).status).toBe(403);
    expect((await api(env.app, 'POST', `/onboarding/external/${token}/tasks/${badge.id}`, undefined, {})).status).toBe(404);
    expect(Object.fromEntries(full.body.tasks.map((t: { key: string; status: string }) => [t.key, t.status]))).toMatchObject({ contract: 'done', personal_data: 'done', welcome_pack: 'open', badge: 'open' });
    expect(full.body.progress.done).toBe(2);
    const inst = await api(env.app, 'GET', `/apps/instances/${full.body.appInstanceId}`, hr.token);
    expect(inst.body.stages.find((s: { name: string }) => s.name === 'Scheda anagrafica').run).toMatchObject({ status: 'done', outcome: 'submitted' });
    const ext2 = await api(env.app, 'GET', `/onboarding/external/${token}`);
    expect(ext2.body.progress).toEqual({ total: 3, done: 2 });
    // l'HR reinvia il link: nuovo token, il vecchio non vale più
    const resend = await api(env.app, 'POST', `/onboarding/journeys/${j.body.id}/external-link`, hr.token);
    expect(resend.status).toBe(201);
    expect(resend.body).toMatchObject({ sent: true, email: 'nadia@example.test', tasks: 1 });
    expect((await api(env.app, 'GET', `/onboarding/external/${token}`)).status).toBe(404);
    expect((await env.db.select().from(emailOutbox).where(eq(emailOutbox.toEmail, 'nadia@example.test'))).length).toBe(2);
    // chi ha già un account non riceve il link all'avvio
    expect((await api(env.app, 'GET', `/onboarding/journeys/${journeyId}`, hr.token)).body.external).toMatchObject({ email: null, active: false });
  });
});
