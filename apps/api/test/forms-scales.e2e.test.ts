import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestEnv, type TestEnv } from './helpers.js';

let env: TestEnv;
let tenant: { id: string; slug: string };
let hr: { userId: string; personId: string; token: string };
let luca: { userId: string; personId: string; token: string };

beforeAll(async () => {
  env = await createTestEnv();
  tenant = await env.createTenant('Acme');
  hr = await env.createUser(tenant.id, 'hr@acme.test', ['hr_admin'], { firstName: 'Chiara', lastName: 'Moretti' });
  luca = await env.createUser(tenant.id, 'luca@acme.test', ['employee'], { firstName: 'Luca', lastName: 'Bianchi' });
});
afterAll(() => env.close());

describe('scale riutilizzabili (APP-005) e campi calcolati (APP-004)', () => {
  let scaleId: string;
  it('HR crea una scala; chiavi duplicate e intervalli errati sono rifiutati; i dipendenti la leggono ma non la gestiscono', async () => {
    const r = await api(env.app, 'POST', '/form-scales', hr.token, { key: 'likert_4', name: 'Accordo a 4 livelli', min: 1, max: 4, labels: { '1': 'Per niente', '4': 'Pienamente' }, allowNa: true });
    expect(r.status).toBe(201);
    scaleId = r.body.id;
    expect((await api(env.app, 'POST', '/form-scales', hr.token, { key: 'likert_4', name: 'dup' })).status).toBe(409);
    expect((await api(env.app, 'POST', '/form-scales', hr.token, { key: 'bad', name: 'x', min: 5, max: 5 })).status).toBe(422);
    expect((await api(env.app, 'POST', '/form-scales', luca.token, { key: 'nope', name: 'x' })).status).toBe(403);
    const list = await api(env.app, 'GET', '/form-scales', luca.token);
    expect(list.status).toBe(200);
    expect(list.body.map((s: any) => s.key)).toEqual(['likert_4']);
  });
  it('alla pubblicazione la scala viene incorporata nel form; la scala archiviata blocca la pubblicazione', async () => {
    const schema = { title: 'Clima', scoring: { enabled: false }, sections: [{ key: 's', title: 'S', fields: [
      { key: 'q1', type: 'scale', label: 'Mi sento ascoltato', scaleKey: 'likert_4' },
      { key: 'q2', type: 'scale', label: 'Ho gli strumenti', scaleKey: 'likert_4' },
      { key: 'media', type: 'computed', label: 'Media', compute: { op: 'avg', fields: ['q1', 'q2'], decimals: 2 } },
    ] }] };
    const f = await api(env.app, 'POST', '/forms', hr.token, { key: 'clima', name: 'Clima', kind: 'generic', schema });
    expect(f.status).toBe(201);
    const pub = await api(env.app, 'POST', `/forms/${f.body.id}/publish`, hr.token);
    expect(pub.status).toBe(201);
    const q1 = pub.body.schema.sections[0].fields[0];
    expect(q1.scale).toMatchObject({ min: 1, max: 4, allowNa: true, labels: { '1': 'Per niente' } });
    expect(q1.scaleKey).toBe('likert_4');
    // una compilazione accetta i valori della scala risolta e rifiuta quelli fuori intervallo
    const cr = await api(env.app, 'POST', '/form-responses', luca.token, { formKey: 'clima' });
    expect(cr.status).toBe(201);
    const bad = await api(env.app, 'POST', `/form-responses/${cr.body.id}/submit`, luca.token, { answers: { q1: 5, q2: 2 } });
    expect(bad.status).toBe(400);
    const ok = await api(env.app, 'POST', `/form-responses/${cr.body.id}/submit`, luca.token, { answers: { q1: 4, q2: 2 } });
    expect(ok.status).toBe(201);
    // il campo calcolato non è richiesto tra le risposte
    expect(ok.body.answers.media).toBeUndefined();
    // archivio la scala: una nuova versione del form non si può pubblicare finché la usa
    expect((await api(env.app, 'PATCH', `/form-scales/${scaleId}`, hr.token, { archived: true })).body.archivedAt).toBeTruthy();
    const v2 = await api(env.app, 'POST', `/forms/${f.body.id}/versions`, hr.token);
    expect(v2.status).toBe(201);
    const pub2 = await api(env.app, 'POST', `/forms/${v2.body.id}/publish`, hr.token);
    expect(pub2.status).toBe(422);
    expect(pub2.body.detail).toContain('likert_4');
    // il form già pubblicato resta autocontenuto
    const list = await api(env.app, 'GET', '/form-scales?includeArchived=true', hr.token);
    expect(list.body).toHaveLength(1);
  });
  it('lo schema rifiuta campi calcolati che puntano a campi di testo', async () => {
    const schema = { title: 'x', sections: [{ key: 's', title: 'S', fields: [{ key: 't', type: 'short_text', label: 'T' }, { key: 'c', type: 'computed', label: 'C', compute: { op: 'sum', fields: ['t'] } }] }] };
    const r = await api(env.app, 'POST', '/forms', hr.token, { key: 'calc_bad', name: 'x', schema });
    expect(r.status).toBe(422);
  });
});
