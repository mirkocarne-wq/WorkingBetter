import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { competencyAssessments, emailOutbox, f360Responses, notifications, withTenant } from '@wb/db';
import { api, createTestEnv, type TestEnv } from './helpers.js';

type U = { userId: string; personId: string; token: string };
let env: TestEnv;
let tenant: { id: string; slug: string };
let hr: U, anna: U, giulia: U, paolo: U, luca: U, sara: U, marco: U, andrea: U;
let campaignId: string;
let lucaSubject: string;
let giuliaSubject: string;
let externalToken: string;
const KEYS = ['technical_excellence', 'communication', 'ownership', 'collaboration'];
const answers = (levels: number[], comment?: string, open?: Record<string, string>) => ({ ratings: Object.fromEntries(KEYS.map((k, i) => [k, levels[i] ?? null])), comments: comment ? { communication: comment } : {}, openAnswers: open ?? {} });
const notesOf = async (u: U) => (await env.db.select().from(notifications).where(eq(notifications.userId, u.userId))).map((n) => n.type);

beforeAll(async () => {
  env = await createTestEnv();
  tenant = await env.createTenant('Acme 360');
  hr = await env.createUser(tenant.id, 'hr@f360.test', ['hr_admin'], { firstName: 'Chiara', lastName: 'Moretti' });
  anna = await env.createUser(tenant.id, 'anna@f360.test', ['manager'], { firstName: 'Anna', lastName: 'Colombo' });
  giulia = await env.createUser(tenant.id, 'giulia@f360.test', ['manager'], { firstName: 'Giulia', lastName: 'Ferri', managerId: anna.personId });
  paolo = await env.createUser(tenant.id, 'paolo@f360.test', ['manager'], { firstName: 'Paolo', lastName: 'Neri', managerId: anna.personId });
  luca = await env.createUser(tenant.id, 'luca@f360.test', ['employee'], { firstName: 'Luca', lastName: 'Bianchi', managerId: giulia.personId });
  sara = await env.createUser(tenant.id, 'sara@f360.test', ['employee'], { firstName: 'Sara', lastName: 'Ricci', managerId: giulia.personId });
  marco = await env.createUser(tenant.id, 'marco@f360.test', ['employee'], { firstName: 'Marco', lastName: 'Conti', managerId: giulia.personId });
  andrea = await env.createUser(tenant.id, 'andrea@f360.test', ['employee'], { firstName: 'Andrea', lastName: 'Russo', managerId: giulia.personId });
  await api(env.app, 'POST', '/development/framework/presets', hr.token);
});
afterAll(() => env.close());

describe('feedback 360° (F360)', () => {
  it('HR creates a campaign on framework competencies; permissions are enforced', async () => {
    expect((await api(env.app, 'GET', '/f360/campaigns', luca.token)).status).toBe(403);
    expect((await api(env.app, 'POST', '/f360/campaigns', hr.token, { name: 'X', competencyKeys: ['nope'] })).status).toBe(422);
    const c = await api(env.app, 'POST', '/f360/campaigns', hr.token, {
      name: '360° Leadership 2026',
      competencyKeys: KEYS,
      categories: [
        { key: 'self', enabled: true, min: 1, max: 1, anonymous: false },
        { key: 'manager', enabled: true, min: 1, max: 1, anonymous: false },
        { key: 'peer', enabled: true, min: 3, max: 5, anonymous: true },
        { key: 'report', enabled: true, min: 0, max: 8, anonymous: true },
        { key: 'other', enabled: true, min: 0, max: 3, anonymous: true },
        { key: 'external', enabled: true, min: 0, max: 2, anonymous: true },
      ],
      population: { personIds: [luca.personId, giulia.personId] },
      nominationDueAt: '2026-09-30',
      collectionDueAt: '2026-10-31',
    });
    expect(c.status).toBe(201);
    campaignId = c.body.id;
    expect(c.body.status).toBe('draft');
    expect(c.body.releaseRule).toBe('after_debrief');
    expect(c.body.competencies).toHaveLength(4);
    const pop = await api(env.app, 'GET', `/f360/campaigns/${campaignId}/population`, hr.token);
    expect(pop.body.included).toHaveLength(2);
  });

  it('launch creates subjects with self and manager requests and asks the subjects to nominate', async () => {
    const l = await api(env.app, 'POST', `/f360/campaigns/${campaignId}/launch`, hr.token);
    expect(l.status).toBe(201);
    expect(l.body.status).toBe('nomination');
    expect((await api(env.app, 'POST', `/f360/campaigns/${campaignId}/launch`, hr.token)).status).toBe(409);
    expect((await api(env.app, 'PATCH', `/f360/campaigns/${campaignId}`, hr.token, { anonymityThreshold: 2 })).status).toBe(409); // strutturale dopo il lancio
    expect((await api(env.app, 'PATCH', `/f360/campaigns/${campaignId}`, hr.token, { collectionDueAt: '2026-11-15' })).status).toBe(200);
    const mine = await api(env.app, 'GET', '/f360/subjects?box=mine', luca.token);
    expect(mine.status).toBe(200);
    expect(mine.body).toHaveLength(1);
    lucaSubject = mine.body[0].id;
    expect(mine.body[0].viewer).toBe('self');
    expect(mine.body[0].can.nominate).toBe(true);
    giuliaSubject = (await api(env.app, 'GET', '/f360/subjects?box=mine', giulia.token)).body[0].id;
    expect(await notesOf(luca)).toContain('f360.nominate');
    const d = await api(env.app, 'GET', `/f360/subjects/${lucaSubject}`, luca.token);
    expect(d.body.nominations.map((n: { category: string }) => n.category).sort()).toEqual(['manager', 'self']);
    expect(d.body.nominations.find((n: { category: string }) => n.category === 'manager').person.firstName).toBe('Giulia');
    // il manager vede il soggetto del proprio riporto, un altro manager no
    expect((await api(env.app, 'GET', `/f360/subjects/${lucaSubject}`, giulia.token)).body.viewer).toBe('manager');
    expect((await api(env.app, 'GET', `/f360/subjects/${lucaSubject}`, paolo.token)).status).toBe(404);
    expect((await api(env.app, 'GET', `/f360/subjects/${lucaSubject}`, sara.token)).status).toBe(404);
    expect((await api(env.app, 'GET', '/f360/subjects?box=team', giulia.token)).body.map((s: { personId: string }) => s.personId)).toEqual([lucaSubject].map(() => luca.personId));
  });

  it('suggestions come from the org; nominations respect max, duplicates and minimums; approval goes to the manager', async () => {
    const sug = await api(env.app, 'GET', `/f360/subjects/${lucaSubject}/suggestions`, luca.token);
    expect(sug.status).toBe(200);
    const byId = Object.fromEntries(sug.body.map((s: { id: string; category: string; reason: string }) => [s.id, s]));
    expect(byId[sara.personId]).toMatchObject({ category: 'peer', reason: 'stesso team' });
    expect(byId[giulia.personId]).toBeUndefined(); // già manager
    expect(byId[luca.personId]).toBeUndefined();
    expect((await api(env.app, 'POST', `/f360/subjects/${lucaSubject}/nominations`, luca.token, { category: 'peer', personId: luca.personId })).status).toBe(422);
    expect((await api(env.app, 'POST', `/f360/subjects/${lucaSubject}/nominations`, luca.token, { category: 'manager', personId: paolo.personId })).status).toBe(422);
    expect((await api(env.app, 'POST', `/f360/subjects/${lucaSubject}/nominations`, sara.token, { category: 'peer', personId: marco.personId })).status).toBe(404);
    for (const p of [sara, marco]) expect((await api(env.app, 'POST', `/f360/subjects/${lucaSubject}/nominations`, luca.token, { category: 'peer', personId: p.personId })).status).toBe(201);
    expect((await api(env.app, 'POST', `/f360/subjects/${lucaSubject}/nominations`, luca.token, { category: 'peer', personId: sara.personId })).status).toBe(409);
    const ext = await api(env.app, 'POST', `/f360/subjects/${lucaSubject}/nominations`, luca.token, { category: 'external', externalEmail: 'cliente@partner.test', externalName: 'Elena Cliente' });
    expect(ext.status).toBe(201);
    expect((await api(env.app, 'POST', `/f360/subjects/${lucaSubject}/nominations`, luca.token, { category: 'external', externalEmail: 'x@y.test' })).status).toBe(400); // manca il nome
    // minimo pari = 3: con due l'invio è rifiutato
    const short = await api(env.app, 'POST', `/f360/subjects/${lucaSubject}/nominations/submit`, luca.token);
    expect(short.status).toBe(422);
    expect(short.body.detail).toContain('Pari: almeno 3');
    const third = await api(env.app, 'POST', `/f360/subjects/${lucaSubject}/nominations`, luca.token, { category: 'peer', personId: andrea.personId });
    expect(third.status).toBe(201);
    const removable = third.body.nominations.find((n: { person: { id: string } | null }) => n.person?.id === andrea.personId);
    expect(removable.canRemove).toBe(true);
    expect((await api(env.app, 'DELETE', `/f360/nominations/${removable.id}`, luca.token)).status).toBe(200);
    await api(env.app, 'POST', `/f360/subjects/${lucaSubject}/nominations`, luca.token, { category: 'peer', personId: andrea.personId });
    const sub = await api(env.app, 'POST', `/f360/subjects/${lucaSubject}/nominations/submit`, luca.token);
    expect(sub.status).toBe(201);
    expect(sub.body.status).toBe('pending_approval');
    expect(sub.body.can.nominate).toBe(false);
    expect(await notesOf(giulia)).toContain('f360.approve');
    expect((await api(env.app, 'POST', `/f360/subjects/${lucaSubject}/nominations/approve`, luca.token, {})).status).toBe(403);
    const appr = await api(env.app, 'POST', `/f360/subjects/${lucaSubject}/nominations/approve`, giulia.token, { rejectIds: [] });
    expect(appr.status).toBe(201);
    expect(appr.body.status).toBe('approved');
    // HR nomina per Giulia (riporti e un pari); le sue nomine restano non inviate: l'avvio della raccolta le approva d'ufficio
    for (const p of [luca, sara, marco, andrea]) expect((await api(env.app, 'POST', `/f360/subjects/${giuliaSubject}/nominations`, hr.token, { category: 'report', personId: p.personId })).status).toBe(201);
    expect((await api(env.app, 'POST', `/f360/subjects/${giuliaSubject}/nominations`, hr.token, { category: 'peer', personId: paolo.personId })).status).toBe(201);
  });

  it('starting the collection invites raters (email with magic link for externals); raters see their requests', async () => {
    const st = await api(env.app, 'POST', `/f360/campaigns/${campaignId}/start-collection`, hr.token);
    expect(st.status).toBe(201);
    expect(st.body.status).toBe('collection');
    expect(st.body.autoApproved).toBe(1);
    expect(st.body.invited).toBe(13); // Luca: self, manager, 3 pari, 1 esterno · Giulia: self, manager, 4 riporti, 1 pari
    const mine = await api(env.app, 'GET', '/f360/requests', luca.token);
    expect(mine.status).toBe(200);
    expect(mine.body.map((r: { category: string }) => r.category).sort()).toEqual(['report', 'self']);
    expect(mine.body.find((r: { category: string }) => r.category === 'report')).toMatchObject({ anonymous: true, subject: { firstName: 'Giulia' } });
    expect(await notesOf(sara)).toContain('f360.request');
    const mails = await withTenant(env.db, tenant.id, (t) => t.select().from(emailOutbox).where(eq(emailOutbox.toEmail, 'cliente@partner.test')));
    expect(mails).toHaveLength(1);
    expect(mails[0]!.text).toContain('Luca Bianchi');
    externalToken = /\/f360\/external\/([A-Za-z0-9_-]+)/.exec(mails[0]!.text)![1]!;
    // nelle categorie anonime lo stato individuale non rivela mai chi ha risposto
    const d = await api(env.app, 'GET', `/f360/subjects/${lucaSubject}`, luca.token);
    expect(d.body.nominations.filter((n: { anonymous: boolean }) => n.anonymous).every((n: { status: string }) => n.status === 'invited')).toBe(true);
    expect(d.body.nominations.find((n: { category: string }) => n.category === 'self').status).toBe('pending');
  });

  it('external rater answers through the public link: draft, submit once, anonymous', async () => {
    expect((await api(env.app, 'GET', '/f360/external/not-a-valid-token-at-all-xx')).status).toBe(404);
    const q = await api(env.app, 'GET', `/f360/external/${externalToken}`);
    expect(q.status).toBe(200);
    expect(q.body).toMatchObject({ category: 'external', anonymous: true, canAnswer: true, subject: { firstName: 'Luca' }, external: { name: 'Elena Cliente' } });
    expect(q.body.competencies).toHaveLength(4);
    expect(q.body.competencies[0].levels.length).toBeGreaterThan(1);
    expect((await api(env.app, 'PUT', `/f360/external/${externalToken}/draft`, undefined, answers([4]))).status).toBe(200);
    expect((await api(env.app, 'GET', `/f360/external/${externalToken}`)).body.draft.ratings.technical_excellence).toBe(4);
    expect((await api(env.app, 'POST', `/f360/external/${externalToken}/submit`, undefined, answers([9, 4, 4, 4]))).status).toBe(422); // fuori scala
    const ok = await api(env.app, 'POST', `/f360/external/${externalToken}/submit`, undefined, answers([4, 5, 4, 4], 'Molto chiaro con i clienti', { start: 'Anticipare le comunicazioni' }));
    expect(ok.status).toBe(200);
    expect(ok.body.anonymous).toBe(true);
    expect((await api(env.app, 'GET', `/f360/external/${externalToken}`)).status).toBe(404); // il link si consuma
    const rows = await withTenant(env.db, tenant.id, (t) => t.select().from(f360Responses).where(and(eq(f360Responses.subjectId, lucaSubject), eq(f360Responses.category, 'external'))));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.requestId).toBeNull(); // nessun legame con la richiesta
  });

  it('internal raters answer or decline; self and manager responses keep the link, anonymous ones do not', async () => {
    const reqOf = async (u: U, category: string, subjectFirst: string) => (await api(env.app, 'GET', '/f360/requests', u.token)).body.find((r: { category: string; subject: { firstName: string } }) => r.category === category && r.subject.firstName === subjectFirst).id as string;
    const lucaSelf = await reqOf(luca, 'self', 'Luca');
    expect((await api(env.app, 'GET', `/f360/requests/${lucaSelf}`, sara.token)).status).toBe(404);
    expect((await api(env.app, 'POST', `/f360/requests/${lucaSelf}/decline`, luca.token, {})).status).toBe(403);
    expect((await api(env.app, 'POST', `/f360/requests/${lucaSelf}/submit`, luca.token, answers([4, 4, 3, 5]))).status).toBe(201);
    expect((await api(env.app, 'POST', `/f360/requests/${lucaSelf}/submit`, luca.token, answers([4, 4, 3, 5]))).status).toBe(409);
    expect((await api(env.app, 'POST', `/f360/requests/${await reqOf(giulia, 'manager', 'Luca')}/submit`, giulia.token, answers([3, 3, 3, 4], 'Prepara bene le riunioni, può sintetizzare di più', { continue: 'Curare la documentazione' }))).status).toBe(201);
    expect((await api(env.app, 'POST', `/f360/requests/${await reqOf(sara, 'peer', 'Luca')}/submit`, sara.token, answers([4, 2, 3, 4], 'A volte interrompe'))).status).toBe(201);
    expect((await api(env.app, 'POST', `/f360/requests/${await reqOf(marco, 'peer', 'Luca')}/submit`, marco.token, answers([3, 3, 4, 3]))).status).toBe(201);
    const dec = await api(env.app, 'POST', `/f360/requests/${await reqOf(andrea, 'peer', 'Luca')}/decline`, andrea.token, { reason: 'Lavoro con Luca da troppo poco' });
    expect(dec.status).toBe(201);
    expect(await notesOf(luca)).toContain('f360.declined');
    // Giulia: self, manager e 3 riporti (il quarto non risponde)
    expect((await api(env.app, 'POST', `/f360/requests/${await reqOf(giulia, 'self', 'Giulia')}/submit`, giulia.token, answers([3, 4, 4, 4]))).status).toBe(201);
    expect((await api(env.app, 'POST', `/f360/requests/${await reqOf(anna, 'manager', 'Giulia')}/submit`, anna.token, answers([4, 4, 5, 4]))).status).toBe(201);
    for (const [u, lv] of [[luca, [4, 3, 5, 4]], [sara, [4, 4, 5, 5]], [marco, [3, 3, 4, 4]]] as const) expect((await api(env.app, 'POST', `/f360/requests/${await reqOf(u, 'report', 'Giulia')}/submit`, u.token, answers([...lv], 'Ci coinvolge nelle decisioni'))).status).toBe(201);
    const rows = await withTenant(env.db, tenant.id, (t) => t.select().from(f360Responses).where(eq(f360Responses.subjectId, lucaSubject)));
    expect(rows.filter((r) => r.requestId).map((r) => r.category).sort()).toEqual(['manager', 'self']);
    expect(rows.filter((r) => !r.requestId).map((r) => r.category).sort()).toEqual(['external', 'peer', 'peer']);
    const prog = await api(env.app, 'GET', `/f360/campaigns/${campaignId}/progress`, hr.token);
    const lucaRow = prog.body.subjects.find((s: { id: string }) => s.id === lucaSubject);
    expect(lucaRow.byCategory.peer).toEqual({ nominated: 3, invited: 3, submitted: 2, declined: 1 });
    expect(lucaRow.submitted).toBe(5);
    expect((await api(env.app, 'GET', `/f360/subjects/${lucaSubject}`, giulia.token)).body.report).toBeNull();
  });

  it('closing generates reports with the anonymity threshold; the subject sees it only after the debrief', async () => {
    expect((await api(env.app, 'POST', `/f360/campaigns/${campaignId}/close`, giulia.token)).status).toBe(403);
    const cl = await api(env.app, 'POST', `/f360/campaigns/${campaignId}/close`, hr.token);
    expect(cl.status).toBe(201);
    expect(cl.body.status).toBe('closed');
    expect(cl.body.progress.totals.byStatus).toEqual({ ready: 2 });
    expect(await notesOf(giulia)).toContain('f360.report_ready');
    // il soggetto non vede ancora nulla; il manager sì
    const mine = await api(env.app, 'GET', `/f360/subjects/${lucaSubject}`, luca.token);
    expect(mine.body.report).toBeNull();
    expect(mine.body.can.seeReport).toBe(false);
    expect((await api(env.app, 'GET', `/f360/subjects/${lucaSubject}/report.pdf`, luca.token)).status).toBe(409);
    const mgr = await api(env.app, 'GET', `/f360/subjects/${lucaSubject}`, giulia.token);
    expect(mgr.body.can.seeReport).toBe(true);
    const rep = mgr.body.report;
    const cats = Object.fromEntries(rep.categories.map((c: { key: string }) => [c.key, c]));
    expect(cats.self.shown && cats.manager.shown).toBe(true);
    expect(cats.peer).toBeUndefined(); // 2 risposte < 3 → accorpate
    expect(cats.others_merged).toMatchObject({ responded: 3, shown: true, merged: ['peer', 'external'] });
    const comm = rep.competencies.find((c: { competencyKey: string }) => c.competencyKey === 'communication');
    expect(comm.self).toBe(4);
    expect(comm.byCategory.manager.avg).toBe(3);
    expect(comm.byCategory.others_merged).toEqual({ n: 3, avg: 3.33 });
    expect(comm.others).toBe(3.25);
    expect(comm.comments[0]).toEqual({ category: 'Manager', text: 'Prepara bene le riunioni, può sintetizzare di più' });
    expect(comm.comments.slice(1).map((c: { category: string }) => c.category)).toEqual(['Altri', 'Altri']);
    expect(rep.openAnswers.start[0]).toEqual({ category: 'Altri', text: 'Anticipare le comunicazioni' });
    expect(rep.strengths.length).toBeGreaterThan(0);
    // la valutazione 360° alimenta il profilo competenze (fonte 360)
    const assess = await withTenant(env.db, tenant.id, (t) => t.select().from(competencyAssessments).where(and(eq(competencyAssessments.personId, luca.personId), eq(competencyAssessments.source, '360'))));
    expect(assess).toHaveLength(4);
    expect(assess.find((a) => a.competencyKey === 'communication')!.level).toBe(3);
    // rilascio: con la regola "dopo debrief" serve prima il colloquio
    expect((await api(env.app, 'POST', `/f360/subjects/${lucaSubject}/release`, giulia.token)).status).toBe(409);
    expect((await api(env.app, 'POST', `/f360/subjects/${lucaSubject}/debrief`, luca.token, { note: 'x' })).status).toBe(403);
    const deb = await api(env.app, 'POST', `/f360/subjects/${lucaSubject}/debrief`, giulia.token, { note: 'Discusso il gap sulla comunicazione; Luca concorda.' });
    expect(deb.status).toBe(201);
    expect(deb.body.status).toBe('released');
    expect(await notesOf(luca)).toContain('f360.report_released');
    const after = await api(env.app, 'GET', `/f360/subjects/${lucaSubject}`, luca.token);
    expect(after.body.report.competencies).toHaveLength(4);
    // export PDF (F360-024): stessa visibilità del report
    const pdf = await api(env.app, 'GET', `/f360/subjects/${lucaSubject}/report.pdf`, luca.token);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect(String(pdf.body).startsWith('%PDF')).toBe(true);
    expect((await api(env.app, 'GET', `/f360/subjects/${giuliaSubject}/report.pdf`, luca.token)).status).toBe(404);
    expect(after.body.debriefNote).toBeNull(); // la nota del debrief resta al manager/HR
    // Giulia: i 3 riporti superano la soglia e restano una categoria a sé
    const g = await api(env.app, 'GET', `/f360/subjects/${giuliaSubject}`, hr.token);
    expect(g.body.report.categories.find((c: { key: string }) => c.key === 'report')).toMatchObject({ invited: 4, responded: 3, shown: true });
    expect(g.body.report.categories.find((c: { key: string }) => c.key === 'others_merged')).toMatchObject({ responded: 0, invited: 1, shown: false, merged: ['peer'] });
  });

  it('from a development area to an action in the plan; aggregate heatmap suppresses groups under threshold', async () => {
    const act = await api(env.app, 'POST', `/f360/subjects/${lucaSubject}/dev-actions`, luca.token, { competencyKey: 'communication', title: 'Sintesi: presentazioni da 5 minuti', kind: 'experience', dueDate: '2026-12-31' });
    expect(act.status).toBe(201);
    expect(act.body.action.source).toBe('360');
    const me = await api(env.app, 'GET', '/development/me', luca.token);
    expect(me.body.plan.title).toContain('360°');
    expect(me.body.plan.actions.map((a: { title: string }) => a.title)).toContain('Sintesi: presentazioni da 5 minuti');
    expect(me.body.gaps.find((g: { competencyKey: string }) => g.competencyKey === 'communication').bySource['360']).toBe(3);
    expect((await api(env.app, 'POST', `/f360/subjects/${lucaSubject}/dev-actions`, sara.token, { competencyKey: 'communication', title: 'x' })).status).toBe(404);
    const agg = await api(env.app, 'GET', `/f360/campaigns/${campaignId}/aggregate?groupBy=manager`, hr.token);
    expect(agg.status).toBe(200);
    expect(agg.body.subjectsWithReport).toBe(2);
    expect(agg.body.rows.every((r: { suppressed: boolean; subjects: number }) => r.suppressed && r.subjects === 1)).toBe(true);
    expect(agg.body.total).toMatchObject({ subjects: 2, suppressed: true });
    const csv = await env.app.inject({ method: 'GET', url: `/api/v1/f360/campaigns/${campaignId}/aggregate?format=csv`, headers: { authorization: `Bearer ${hr.token}` } });
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('sotto soglia');
    expect(csv.body).not.toMatch(/\b3\.25\b/);
  });
});
