import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditLog, emailOutbox, orgUnits, persons, surveyInvitations, surveyResponses, withTenant } from '@wb/db';
import { eq } from 'drizzle-orm';
import { api, createTestEnv, type TestEnv } from './helpers.js';

let env: TestEnv;
let tenant: { id: string; slug: string };
let hr: { userId: string; personId: string; token: string };
let giulia: { userId: string; personId: string; token: string };
const team: { userId: string; personId: string; token: string }[] = [];
const others: { userId: string; personId: string; token: string }[] = [];
let surveyId: string;

beforeAll(async () => {
  env = await createTestEnv();
  tenant = await env.createTenant('Acme');
  hr = await env.createUser(tenant.id, 'hr@acme.test', ['hr_admin'], { firstName: 'Chiara', lastName: 'Moretti' });
  giulia = await env.createUser(tenant.id, 'giulia@acme.test', ['manager'], { firstName: 'Giulia', lastName: 'Ferri' });
  const paolo = await env.createUser(tenant.id, 'paolo@acme.test', ['manager'], { firstName: 'Paolo', lastName: 'Neri' });
  for (let i = 0; i < 6; i++) team.push(await env.createUser(tenant.id, `t${i}@acme.test`, ['employee'], { firstName: `T${i}`, lastName: 'Prodotto', managerId: giulia.personId }));
  for (let i = 0; i < 3; i++) others.push(await env.createUser(tenant.id, `v${i}@acme.test`, ['employee'], { firstName: `V${i}`, lastName: 'Vendite', managerId: paolo.personId }));
  const [prod] = await env.db.insert(orgUnits).values({ tenantId: tenant.id, name: 'Prodotto' }).returning();
  const [vend] = await env.db.insert(orgUnits).values({ tenantId: tenant.id, name: 'Vendite' }).returning();
  await env.db.update(orgUnits).set({ path: `/${prod!.id}/` }).where(eq(orgUnits.id, prod!.id));
  await env.db.update(orgUnits).set({ path: `/${vend!.id}/` }).where(eq(orgUnits.id, vend!.id));
  for (const p of [giulia, ...team]) await env.db.update(persons).set({ orgUnitId: prod!.id, hireDate: '2022-01-10' }).where(eq(persons.id, p.personId));
  for (const p of [paolo, ...others]) await env.db.update(persons).set({ orgUnitId: vend!.id, hireDate: '2026-06-01' }).where(eq(persons.id, p.personId));
});
afterAll(() => env.close());

const closesIn = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

describe('survey anonime: creazione, lancio, risposta, risultati', () => {
  it('HR creates an engagement survey from the library; the form is published automatically', async () => {
    expect((await api(env.app, 'POST', '/surveys', giulia.token, { title: 'x', template: 'enps' })).status).toBe(403);
    expect((await api(env.app, 'POST', '/surveys', hr.token, { title: 'x' })).status).toBe(400);
    const r = await api(env.app, 'POST', '/surveys', hr.token, { title: 'Engagement 2026', template: 'engagement', anonymous: true, anonymityThreshold: 5, population: { excludePersonIds: [hr.personId] }, closesAt: closesIn(10) });
    expect(r.status).toBe(201);
    surveyId = r.body.id;
    expect(r.body.status).toBe('draft');
    expect(r.body.schema.sections[0].fields).toHaveLength(14);
    expect(r.body.enpsField).toBe('enps');
    expect(r.body.populationPreview.count).toBe(11); // Giulia, Paolo, 6 team, 3 vendite
    const forms = await api(env.app, 'GET', '/forms?kind=survey&status=published', hr.token);
    expect(forms.body).toHaveLength(1);
  });
  it('launch refuses a population under the anonymity threshold, then invites everyone', async () => {
    const small = await api(env.app, 'POST', '/surveys', hr.token, { title: 'Troppo piccola', template: 'enps', population: { personIds: [giulia.personId, team[0]!.personId] } });
    expect((await api(env.app, 'POST', `/surveys/${small.body.id}/launch`, hr.token, { closesAt: closesIn(3) })).status).toBe(422);
    expect((await api(env.app, 'POST', `/surveys/${surveyId}/launch`, hr.token, { closesAt: '2020-01-01T00:00:00Z' })).status).toBe(422);
    const l = await api(env.app, 'POST', `/surveys/${surveyId}/launch`, hr.token, {});
    expect(l.status).toBe(201);
    expect(l.body.status).toBe('open');
    expect(l.body.counts).toMatchObject({ invited: 11, responded: 0 });
    expect((await api(env.app, 'POST', `/surveys/${surveyId}/launch`, hr.token, {})).status).toBe(409);
    const mine = await api(env.app, 'GET', '/surveys', team[0]!.token);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0]).toMatchObject({ canRespond: true, responded: false, anonymous: true });
    const n = await api(env.app, 'GET', '/notifications', team[0]!.token);
    expect(n.body.items[0].type).toBe('survey.opened');
    expect((await api(env.app, 'GET', '/surveys', hr.token)).body.find((x: any) => x.id === surveyId).counts.invited).toBe(11);
  });
  it('invited people answer once; answers are stored without identity', async () => {
    const f = await api(env.app, 'GET', `/surveys/${surveyId}/form`, team[0]!.token);
    expect(f.body.canRespond).toBe(true);
    expect((await api(env.app, 'GET', `/surveys/${surveyId}/form`, hr.token)).body.invited).toBe(false); // HR esclusa ma può vedere l'anteprima
    const answersFor = (lead: number, ben: number, enps: number, comment?: string) => ({ q_lead_fiducia: lead, q_lead_manager: lead, q_chiar_obiettivi: 4, q_chiar_priorita: 4, q_cresc_opportunita: 3, q_cresc_futuro: 3, q_ric_apprezzamento: 4, q_ric_feedback: 3, q_auto_decisioni: 4, q_auto_fiducia: 4, q_coll_team: 5, q_coll_altri: 3, q_ben_carico: ben, q_ben_equilibrio: ben, enps, ...(comment ? { commento: comment } : {}) });
    expect((await api(env.app, 'POST', `/surveys/${surveyId}/respond`, team[0]!.token, { answers: { enps: 9 } })).status).toBe(422); // incompleta
    for (const [i, m] of team.entries()) expect((await api(env.app, 'POST', `/surveys/${surveyId}/respond`, m.token, { answers: answersFor(4, 2, i < 4 ? 9 : 7, i === 0 ? 'Più tempo per la formazione, per favore.' : undefined) })).status).toBe(201);
    expect((await api(env.app, 'POST', `/surveys/${surveyId}/respond`, team[0]!.token, { answers: answersFor(1, 1, 0) })).status).toBe(409); // già risposto
    expect((await api(env.app, 'POST', `/surveys/${surveyId}/respond`, hr.token, { answers: answersFor(1, 1, 0) })).status).toBe(403); // non invitata
    const rows = await withTenant(env.db, tenant.id, (t) => t.select().from(surveyResponses).where(eq(surveyResponses.surveyId, surveyId)));
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.personId === null)).toBe(true);
    expect(rows.every((r) => r.managerId === giulia.personId)).toBe(true);
    expect(rows[0]!.tenureBand).toBe('3–5 anni');
    const audits = await withTenant(env.db, tenant.id, (t) => t.select().from(auditLog).where(eq(auditLog.action, 'survey.respond')));
    expect(audits).toHaveLength(0); // nessuna traccia di chi ha risposto
    const detail = await api(env.app, 'GET', `/surveys/${surveyId}`, hr.token);
    expect(detail.body.counts).toMatchObject({ invited: 11, responded: 6 });
    const prodotto = detail.body.bySegment.find((s: any) => s.name === 'Prodotto');
    const vendite = detail.body.bySegment.find((s: any) => s.name === 'Vendite');
    expect(prodotto).toMatchObject({ invited: 7, responded: 6 });
    expect(vendite).toMatchObject({ invited: 4, responded: null }); // sotto soglia: niente tasso per segmento
  });
  it('results respect the threshold: HR sees aggregates, heatmap suppresses small segments, manager sees only own team', async () => {
    const r = await api(env.app, 'GET', `/surveys/${surveyId}/results?segment=org_unit`, hr.token);
    expect(r.status).toBe(200);
    expect(r.body.suppressed).toBe(false);
    expect(r.body.responses).toBe(6);
    expect(r.body.enps).toMatchObject({ n: 6, promoters: 4, passives: 2, detractors: 0, score: 67 });
    const lead = r.body.drivers.find((d: any) => d.key === 'leadership');
    expect(lead.avg).toBeCloseTo(4);
    expect(lead.score).toBeCloseTo(0.75);
    expect(r.body.questions.find((q: any) => q.key === 'q_ben_carico').distribution['2']).toBe(6);
    expect(r.body.comments).toEqual([{ question: expect.stringContaining('qualcosa'), text: 'Più tempo per la formazione, per favore.' }]);
    expect(r.body.heatmap).toEqual([expect.objectContaining({ label: 'Prodotto', n: 6, suppressed: false })]);
    // manager: solo il team, senza commenti e senza heatmap
    const m = await api(env.app, 'GET', `/surveys/${surveyId}/results`, giulia.token);
    expect(m.status).toBe(200);
    expect(m.body.scope).toBe('team');
    expect(m.body.responses).toBe(6);
    expect(m.body.comments).toEqual([]);
    expect(m.body.heatmap).toEqual([]);
    expect(m.body.counts).toBeNull();
    // un altro manager con team sotto soglia non vede nulla
    const paoloToken = (await api(env.app, 'POST', '/auth/dev-login', undefined, { tenantSlug: tenant.slug, email: 'paolo@acme.test' })).body.accessToken;
    const p = await api(env.app, 'GET', `/surveys/${surveyId}/results`, paoloToken);
    expect(p.body).toMatchObject({ suppressed: true, responses: 0, drivers: [] });
    expect((await api(env.app, 'GET', `/surveys/${surveyId}/results`, team[0]!.token)).status).toBe(403);
  });
  it('reminders go only to non-responders (counts only), extend/close/share work and the summary is public to invitees', async () => {
    const rem = await api(env.app, 'POST', `/surveys/${surveyId}/remind`, hr.token);
    expect(rem.body).toEqual({ sent: 5, pending: 5 }); // Giulia, Paolo, 3 vendite
    expect((await api(env.app, 'POST', `/surveys/${surveyId}/remind`, hr.token)).body.sent).toBe(0); // una volta al giorno
    const mails = await withTenant(env.db, tenant.id, (t) => t.select().from(emailOutbox).where(eq(emailOutbox.toEmail, 't0@acme.test')));
    expect(mails.some((m) => m.subject.startsWith('Promemoria'))).toBe(false);
    const ext = await api(env.app, 'POST', `/surveys/${surveyId}/extend`, hr.token, { closesAt: closesIn(20) });
    expect(new Date(ext.body.closesAt).getTime()).toBeGreaterThan(Date.now() + 15 * 86400000);
    expect((await api(env.app, 'GET', `/surveys/${surveyId}/summary`, team[0]!.token)).status).toBe(409);
    expect((await api(env.app, 'POST', `/surveys/${surveyId}/share`, hr.token, { summary: 'Grazie!' })).status).toBe(409); // prima chiudere
    expect((await api(env.app, 'POST', `/surveys/${surveyId}/close`, hr.token)).body.status).toBe('closed');
    expect((await api(env.app, 'POST', `/surveys/${surveyId}/respond`, others[0]!.token, { answers: { enps: 5 } })).status).toBe(409);
    const sh = await api(env.app, 'POST', `/surveys/${surveyId}/share`, hr.token, { summary: 'Leadership solida, carico di lavoro da alleggerire: partiamo da lì.' });
    expect(sh.body.status).toBe('shared');
    const sum = await api(env.app, 'GET', `/surveys/${surveyId}/summary`, others[0]!.token);
    expect(sum.status).toBe(200);
    expect(sum.body.summary).toContain('Leadership solida');
    expect(sum.body.enps.score).toBe(67);
    expect(sum.body.drivers.find((d: any) => d.key === 'benessere').score).toBeCloseTo(0.25);
    const n = await api(env.app, 'GET', '/notifications', others[0]!.token);
    expect(n.body.items[0].type).toBe('survey.shared');
    const inv = await withTenant(env.db, tenant.id, (t) => t.select().from(surveyInvitations).where(eq(surveyInvitations.surveyId, surveyId)));
    expect(inv.filter((i) => i.respondedAt).length).toBe(6);
  });
  it('a second survey of the same kind compares against the previous one; pulse rotates questions', async () => {
    const s2 = await api(env.app, 'POST', '/surveys', hr.token, { title: 'Engagement 2027', template: 'engagement', population: { excludePersonIds: [hr.personId] } });
    await api(env.app, 'POST', `/surveys/${s2.body.id}/launch`, hr.token, { closesAt: closesIn(5) });
    const base = { q_lead_fiducia: 5, q_lead_manager: 5, q_chiar_obiettivi: 4, q_chiar_priorita: 4, q_cresc_opportunita: 3, q_cresc_futuro: 3, q_ric_apprezzamento: 4, q_ric_feedback: 3, q_auto_decisioni: 4, q_auto_fiducia: 4, q_coll_team: 5, q_coll_altri: 3, q_ben_carico: 4, q_ben_equilibrio: 4, enps: 10 };
    for (const m of [...team, ...others]) await api(env.app, 'POST', `/surveys/${s2.body.id}/respond`, m.token, { answers: base });
    const r = await api(env.app, 'GET', `/surveys/${s2.body.id}/results?segment=tenure`, hr.token);
    expect(r.body.previous).toMatchObject({ title: 'Engagement 2026', responses: 6, enps: 67 });
    expect(r.body.previous.drivers.benessere).toBeCloseTo(0.25);
    expect(r.body.drivers.find((d: any) => d.key === 'benessere').score).toBeCloseTo(0.75);
    expect(r.body.heatmap.map((h: any) => [h.label, h.n, h.suppressed])).toEqual([['<1 anno', 3, true], ['3–5 anni', 6, true]]); // 3 < 5 → soppresso; con due soli segmenti e il totale visibile anche l'altro (protezione per differenza)
    const p1 = await api(env.app, 'POST', '/surveys', hr.token, { title: 'Pulse settimana 1', template: 'pulse', rotation: 0 });
    const p2 = await api(env.app, 'POST', '/surveys', hr.token, { title: 'Pulse settimana 2', template: 'pulse', rotation: 1 });
    const keys = (b: any) => b.schema.sections[0].fields.map((f: any) => f.key);
    expect(keys(p1.body)).toHaveLength(5);
    expect(keys(p1.body)).not.toEqual(keys(p2.body));
  });
});
