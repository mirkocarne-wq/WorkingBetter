import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { emailOutbox, withTenant } from '@wb/db';
import { api, createTestEnv, type TestEnv } from './helpers.js';

let env: TestEnv;
let tenant: { id: string; slug: string };
let hr: { userId: string; personId: string; token: string };
let giulia: { userId: string; personId: string; token: string };
let luca: { userId: string; personId: string; token: string };

beforeAll(async () => {
  env = await createTestEnv();
  tenant = await env.createTenant('Acme');
  hr = await env.createUser(tenant.id, 'hr@acme.test', ['hr_admin'], { firstName: 'Chiara', lastName: 'Moretti' });
  giulia = await env.createUser(tenant.id, 'giulia@acme.test', ['manager'], { firstName: 'Giulia', lastName: 'Ferri' });
  luca = await env.createUser(tenant.id, 'luca@acme.test', ['employee'], { firstName: 'Luca', lastName: 'Bianchi', managerId: giulia.personId });
});
afterAll(() => env.close());

describe('notifications', () => {
  it('feedback creates an in-app notification and queues an email; preferences can turn email off', async () => {
    await api(env.app, 'POST', '/feedback', giulia.token, { toPersonId: luca.personId, body: 'Ottimo lavoro sulla migrazione' });
    const list = await api(env.app, 'GET', '/notifications', luca.token);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].type).toBe('feedback.received');
    expect(list.body.items[0].title).toContain('Giulia Ferri');
    expect((await api(env.app, 'GET', '/notifications/unread-count', luca.token)).body.count).toBe(1);
    const mails = await withTenant(env.db, tenant.id, (tx) => tx.select().from(emailOutbox));
    expect(mails).toHaveLength(1);
    expect(mails[0]!.toEmail).toBe('luca@acme.test');

    await api(env.app, 'PUT', '/notification-preferences', luca.token, { items: [{ type: 'feedback.received', inApp: true, email: false }] });
    await api(env.app, 'POST', '/feedback', giulia.token, { toPersonId: luca.personId, body: 'Secondo feedback' });
    const mails2 = await withTenant(env.db, tenant.id, (tx) => tx.select().from(emailOutbox));
    expect(mails2).toHaveLength(1);
    expect((await api(env.app, 'GET', '/notifications/unread-count', luca.token)).body.count).toBe(2);
    await api(env.app, 'POST', `/notifications/${list.body.items[0].id}/read`, luca.token);
    expect((await api(env.app, 'GET', '/notifications/unread-count', luca.token)).body.count).toBe(1);
    await api(env.app, 'POST', '/notifications/read-all', luca.token);
    expect((await api(env.app, 'GET', '/notifications/unread-count', luca.token)).body.count).toBe(0);
    expect((await api(env.app, 'GET', '/notifications', giulia.token)).body.items).toHaveLength(0);
  });
  it('off-track check-in notifies the manager once per day', async () => {
    const c = await api(env.app, 'POST', '/cycles', hr.token, { name: 'Q3', startDate: '2026-07-01', endDate: '2026-09-30' });
    const o = await api(env.app, 'POST', '/objectives', luca.token, { cycleId: c.body.id, title: 'P1 sotto 4h', level: 'individual', publish: true, keyResults: [{ title: 'Ore', startValue: 10, targetValue: 4 }] });
    const kr = o.body.keyResults[0].id;
    await api(env.app, 'POST', `/key-results/${kr}/check-ins`, luca.token, { value: 9, confidence: 'off_track', comment: 'Turno scoperto' });
    await api(env.app, 'POST', `/key-results/${kr}/check-ins`, luca.token, { value: 8.5, confidence: 'off_track' });
    const g = await api(env.app, 'GET', '/notifications', giulia.token);
    expect(g.body.items.filter((n: any) => n.type === 'objective.off_track')).toHaveLength(1);
    expect(g.body.items[0].body).toContain('Luca Bianchi');
  });
});

describe('people import', () => {
  const csv = `first_name;last_name;email;job_title;org_unit;manager_email;hire_date
Mario;Rossi;mario.rossi@acme.test;Account Executive;Vendite;paola.verdi@acme.test;2024-03-01
Paola;Verdi;PAOLA.VERDI@acme.test;Sales Manager;Vendite;;2020-01-15
Luca;Bianchi;luca@acme.test;Senior Developer;Prodotto;giulia@acme.test;2022-03-01
Errore;;nope;QA;;;2024-13-40`;
  it('dry run reports errors per row without writing', async () => {
    const r = await api(env.app, 'POST', '/people/import', hr.token, { csv, dryRun: true });
    expect(r.status).toBe(201);
    expect(r.body.totalRows).toBe(4);
    expect(r.body.invalid).toBe(4); // 1 riga rotta + 3 righe con unità sconosciuta
    expect(r.body.errors.filter((e: any) => e.row === 5).map((e: any) => e.field).sort()).toEqual(['email', 'hire_date', 'last_name']);
    expect(r.body.errors.filter((e: any) => e.field === 'org_unit')).toHaveLength(3); // tre righe con unità inesistenti e createOrgUnits=false
    const people = await api(env.app, 'GET', '/people?limit=100', hr.token);
    expect(people.body.items.map((p: any) => p.email)).not.toContain('mario.rossi@acme.test');
  });
  it('without createOrgUnits unknown units are errors; with it, rows are created/updated and managers resolved in two passes', async () => {
    const strict = await api(env.app, 'POST', '/people/import', hr.token, { csv, dryRun: false, createOrgUnits: false });
    expect(strict.body.errors.some((e: any) => e.field === 'org_unit')).toBe(true);
    const r = await api(env.app, 'POST', '/people/import', hr.token, { csv, dryRun: false, createOrgUnits: true });
    expect(r.body.created).toBe(2);
    expect(r.body.updated).toBe(1);
    expect(r.body.orgUnitsCreated).toBe(2);
    const people = await api(env.app, 'GET', '/people?limit=100', hr.token);
    const mario = people.body.items.find((p: any) => p.email === 'mario.rossi@acme.test');
    const paola = people.body.items.find((p: any) => p.email === 'paola.verdi@acme.test');
    expect(mario.managerId).toBe(paola.id);
    const lucaRow = people.body.items.find((p: any) => p.email === 'luca@acme.test');
    expect(lucaRow.jobTitle).toBe('Senior Developer');
    expect(lucaRow.managerId).toBe(giulia.personId);
    expect((await api(env.app, 'POST', '/people/import', luca.token, { csv })).status).toBe(403);
    const tpl = await api(env.app, 'GET', '/people/import/template', hr.token);
    expect(tpl.status).toBe(200);
  });
});

describe('forms', () => {
  const schema = {
    title: 'Review leggera',
    scoring: { enabled: true },
    sections: [
      { key: 'competenze', title: 'Competenze', fields: [
        { key: 'ownership', type: 'scale', label: 'Ownership', required: true, scale: { min: 1, max: 5 }, commentRequiredBelow: 2, commentKey: 'ownership_note' },
        { key: 'ownership_note', type: 'long_text', label: 'Commento' },
      ] },
      { key: 'chiusura', title: 'Chiusura', fields: [{ key: 'commento', type: 'long_text', label: 'Commento finale', required: true, min: 10 }] },
    ],
  };
  let formId: string;
  let responseId: string;
  it('HR creates, validates and publishes a form; employees cannot manage', async () => {
    const bad = await api(env.app, 'POST', '/forms', hr.token, { key: 'review_light', name: 'x', schema: { title: 'x', sections: [] } });
    expect(bad.status).toBe(422);
    const r = await api(env.app, 'POST', '/forms', hr.token, { key: 'review_light', name: 'Review leggera', kind: 'review', schema });
    expect(r.status).toBe(201);
    formId = r.body.id;
    expect((await api(env.app, 'POST', '/forms', luca.token, { key: 'x', name: 'x', schema })).status).toBe(403);
    expect((await api(env.app, 'POST', '/form-responses', luca.token, { formKey: 'review_light' })).status).toBe(404); // non pubblicato
    const pub = await api(env.app, 'POST', `/forms/${formId}/publish`, hr.token);
    expect(pub.body.status).toBe('published');
    expect((await api(env.app, 'PATCH', `/forms/${formId}`, hr.token, { name: 'nuovo' })).status).toBe(409);
  });
  it('respondent saves drafts, gets validation errors, submits with scores and normalized answers', async () => {
    const cr = await api(env.app, 'POST', '/form-responses', luca.token, { formKey: 'review_light' });
    expect(cr.status).toBe(201);
    responseId = cr.body.id;
    expect(cr.body.form.schema.sections).toHaveLength(2);
    const draft = await api(env.app, 'PUT', `/form-responses/${responseId}/draft`, luca.token, { answers: { ownership: 2 } });
    expect(draft.status).toBe(200);
    const bad = await api(env.app, 'POST', `/form-responses/${responseId}/submit`, luca.token, {});
    expect(bad.status).toBe(400);
    expect(bad.body.errors.map((e: any) => e.field).sort()).toEqual(['commento', 'ownership_note']);
    const ok = await api(env.app, 'POST', `/form-responses/${responseId}/submit`, luca.token, { answers: { ownership: 4, commento: 'Trimestre solido, on-call da sistemare' } });
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('submitted');
    expect(ok.body.score).toBeCloseTo(0.75);
    expect(ok.body.canEdit).toBe(false);
    expect((await api(env.app, 'PUT', `/form-responses/${responseId}/draft`, luca.token, { answers: { ownership: 1 } })).status).toBe(409);
    expect((await api(env.app, 'GET', `/form-responses/${responseId}`, giulia.token)).status).toBe(404);
    expect((await api(env.app, 'GET', `/form-responses/${responseId}`, hr.token)).status).toBe(200);
  });
  it('HR assigns a form to someone else and they get notified; new versions keep old responses on the old version', async () => {
    const assigned = await api(env.app, 'POST', '/form-responses', hr.token, { formKey: 'review_light', respondentPersonId: giulia.personId, subjectPersonId: luca.personId, dueDate: '2026-09-30T00:00:00.000Z' });
    expect(assigned.status).toBe(201);
    const n = await api(env.app, 'GET', '/notifications', giulia.token);
    expect(n.body.items.some((x: any) => x.type === 'form.assigned')).toBe(true);
    const v2 = await api(env.app, 'POST', `/forms/${formId}/versions`, hr.token);
    expect(v2.body.version).toBe(2);
    expect(v2.body.status).toBe('draft');
    await api(env.app, 'POST', `/forms/${v2.body.id}/publish`, hr.token);
    const old = await api(env.app, 'GET', `/form-responses/${responseId}`, luca.token);
    expect(old.body.formVersion).toBe(1);
    const latest = await api(env.app, 'GET', '/forms?latest=true', hr.token);
    expect(latest.body.find((f: any) => f.key === 'review_light').version).toBe(2);
    const mine = await api(env.app, 'GET', '/form-responses?mine=true', giulia.token);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].form.name).toBe('Review leggera');
  });
});
