import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { persons, welfareMovements, withTenant } from '@wb/db';
import { eq } from 'drizzle-orm';
import { api, createTestEnv, type TestEnv } from './helpers.js';

let env: TestEnv;
let tenant: { id: string; slug: string };
let hr: { userId: string; personId: string; token: string };
let manager: { userId: string; personId: string; token: string };
let luca: { userId: string; personId: string; token: string };
let nuova: { userId: string; personId: string; token: string };
let planId: string;
let fringeItemId: string;
let reqId: string;

beforeAll(async () => {
  env = await createTestEnv();
  tenant = await env.createTenant('Acme');
  hr = await env.createUser(tenant.id, 'hr@acme.test', ['hr_admin'], { firstName: 'Chiara', lastName: 'Moretti' });
  manager = await env.createUser(tenant.id, 'giulia@acme.test', ['manager'], { firstName: 'Giulia', lastName: 'Ferri' });
  luca = await env.createUser(tenant.id, 'luca@acme.test', ['employee'], { firstName: 'Luca', lastName: 'Bianchi', managerId: manager.personId });
  nuova = await env.createUser(tenant.id, 'nuova@acme.test', ['employee'], { firstName: 'Nuova', lastName: 'Assunta', managerId: manager.personId });
  await env.db.update(persons).set({ hireDate: '2020-01-01', employeeNumber: 'E001' }).where(eq(persons.id, luca.personId));
  await env.db.update(persons).set({ hireDate: '2026-07-01' }).where(eq(persons.id, nuova.personId)); // ingresso a metà anno → pro-rata
});
afterAll(() => env.close());

describe('welfare: configurazione, piano, conto', () => {
  it('HR loads presets (categories + thresholds for the year) and the manager cannot administer', async () => {
    expect((await api(env.app, 'POST', '/welfare/presets?year=2026', manager.token)).status).toBe(403);
    const r = await api(env.app, 'POST', '/welfare/presets?year=2026', hr.token);
    expect(r.status).toBe(201);
    expect(r.body.categoriesCreated).toBeGreaterThanOrEqual(8);
    expect((await api(env.app, 'POST', '/welfare/presets?year=2026', hr.token)).body.categoriesCreated).toBe(0); // idempotente
    const th = await api(env.app, 'GET', '/welfare/thresholds?year=2026', hr.token);
    expect(th.body.find((t: any) => t.categoryKey === 'fringe' && !t.condition).amount).toBe('1000.00');
    expect(th.body.find((t: any) => t.categoryKey === 'fringe' && t.condition === 'children').amount).toBe('2000.00');
    expect((await api(env.app, 'GET', '/welfare/categories', luca.token)).body.length).toBeGreaterThanOrEqual(8);
  });
  it('creates a plan with an on-top source and activates it: credits with pro-rata and notifies', async () => {
    const pl = await api(env.app, 'POST', '/welfare/plans', hr.token, { name: 'Welfare 2026', year: 2026, periodStart: '2026-01-01', periodEnd: '2026-12-31', population: { excludePersonIds: [hr.personId] }, enabledCategories: ['fringe', 'istruzione', 'cultura_sport', 'trasporto'], rolloverRule: 'partial', rolloverPercent: 50, regulation: 'Regolamento del piano welfare 2026.', premium: { enabled: true, amount: 2000, windowFrom: '2026-01-01', windowTo: '2026-12-31', allowedPercents: [0, 50, 100], taxRate: 0.23, employeeContributionRate: 0.0919, employerContributionRate: 0.3 } });
    expect(pl.status).toBe(201);
    planId = pl.body.id;
    expect(pl.body.populationCount).toBe(3); // Giulia, Luca, Nuova
    const src = await api(env.app, 'POST', `/welfare/plans/${planId}/sources`, hr.token, { name: 'Budget on top', kind: 'on_top', amountPerPerson: 1000, creditAt: '2026-01-15', expiresAt: '2026-12-31' });
    expect(src.body.sources).toHaveLength(1);
    expect(src.body.sources[0].creditedAt).toBeNull(); // piano ancora in bozza
    const act = await api(env.app, 'POST', `/welfare/plans/${planId}/activate`, hr.token);
    expect(act.status).toBe(201);
    expect(act.body.credited).toBe(3);
    expect(act.body.stats.credited).toBeCloseTo(1000 + 1000 + 1000 * (new Date('2026-12-31').getTime() - new Date('2026-07-01').getTime()) / (new Date('2026-12-31').getTime() - new Date('2026-01-01').getTime()), 0);
    const me = await api(env.app, 'GET', '/welfare/me', luca.token);
    expect(me.body.balance).toMatchObject({ credited: 1000, available: 1000, reserved: 0 });
    expect(me.body.plans[0].name).toBe('Welfare 2026');
    expect(me.body.categories.map((c: any) => c.key).sort()).toEqual(['cultura_sport', 'fringe', 'istruzione', 'trasporto']);
    const n = await api(env.app, 'GET', '/notifications', luca.token);
    expect(n.body.items[0].type).toBe('welfare.credited');
    const prorata = await api(env.app, 'GET', '/welfare/me', nuova.token);
    expect(prorata.body.balance.credited).toBeLessThan(600);
    expect(prorata.body.balance.credited).toBeGreaterThan(450);
    expect((await api(env.app, 'GET', '/welfare/me', manager.token)).body.balance.credited).toBe(1000);
  });
  it('catalog items and a manual adjustment', async () => {
    const item = await api(env.app, 'POST', '/welfare/catalog', hr.token, { name: 'Buono spesa 100 €', categoryKey: 'fringe', kind: 'voucher', price: 100, description: 'Buono spendibile nei supermercati convenzionati' });
    expect(item.status).toBe(201);
    fringeItemId = item.body.id;
    await api(env.app, 'POST', '/welfare/catalog', hr.token, { name: 'Rimborso libri scolastici', categoryKey: 'istruzione', kind: 'reimbursement', maxAmount: 500 });
    const adj = await api(env.app, 'POST', '/welfare/adjustments', hr.token, { planId, personId: luca.personId, amount: 200, note: 'Bonus una tantum deliberato dal CdA' });
    expect(adj.status).toBe(201);
    expect((await api(env.app, 'GET', '/welfare/me', luca.token)).body.balance.available).toBe(1200);
    expect((await api(env.app, 'GET', '/welfare/catalog', luca.token)).body).toHaveLength(2);
  });
});

describe('welfare: richieste, soglie, approvazione, payroll', () => {
  it('validates requests: balance, category enablement, beneficiary, attachment, declaration', async () => {
    expect((await api(env.app, 'POST', '/welfare/requests', luca.token, { planId, categoryKey: 'istruzione', kind: 'reimbursement', amount: 5000, beneficiary: 'family', beneficiaryName: 'Figlia', attachmentName: 'retta.pdf', declarationAccepted: true })).status).toBe(422); // oltre disponibile
    expect((await api(env.app, 'POST', '/welfare/requests', luca.token, { planId, categoryKey: 'previdenza', kind: 'reimbursement', amount: 100, attachmentName: 'x.pdf', declarationAccepted: true })).status).toBe(422); // categoria non abilitata
    expect((await api(env.app, 'POST', '/welfare/requests', luca.token, { planId, categoryKey: 'istruzione', kind: 'reimbursement', amount: 100, beneficiary: 'self', attachmentName: 'x.pdf', declarationAccepted: true })).status).toBe(422); // beneficiario non ammesso
    expect((await api(env.app, 'POST', '/welfare/requests', luca.token, { planId, categoryKey: 'istruzione', kind: 'reimbursement', amount: 100, beneficiary: 'family', declarationAccepted: true })).status).toBe(422); // manca il giustificativo
    expect((await api(env.app, 'POST', '/welfare/requests', luca.token, { planId, itemId: fringeItemId, amount: 80, declarationAccepted: true })).status).toBe(422); // prezzo fisso
    expect((await api(env.app, 'POST', '/welfare/requests', hr.token, { planId, itemId: fringeItemId, amount: 100, declarationAccepted: true })).status).toBe(403); // HR fuori popolazione
  });
  it('a reimbursement reserves the budget; the fringe threshold splits the taxable part; children declaration raises the threshold', async () => {
    const r1 = await api(env.app, 'POST', '/welfare/requests', luca.token, { planId, categoryKey: 'istruzione', kind: 'reimbursement', amount: 300, beneficiary: 'family', beneficiaryName: 'Figlia', expenseDate: '2026-09-01', attachmentName: 'retta-settembre.pdf', declarationAccepted: true });
    expect(r1.status).toBe(201);
    reqId = r1.body.id;
    expect(r1.body.thresholdCheck).toMatchObject({ exemptPortion: 300, taxablePortion: 0 });
    let me = await api(env.app, 'GET', '/welfare/me', luca.token);
    expect(me.body.balance).toMatchObject({ available: 900, reserved: 300 });
    // fringe: 9 buoni da 100 → cumulo 900 (avviso soglia), il decimo porta a 1000, l'undicesimo eccede
    for (let i = 0; i < 9; i++) expect((await api(env.app, 'POST', '/welfare/requests', luca.token, { planId, itemId: fringeItemId, amount: 100, declarationAccepted: true })).status).toBe(201);
    const near = await api(env.app, 'GET', '/notifications', luca.token);
    expect(near.body.items.some((n: any) => n.type === 'welfare.threshold_near')).toBe(true);
    me = await api(env.app, 'GET', '/welfare/me', luca.token);
    expect(me.body.categories.find((c: any) => c.key === 'fringe')).toMatchObject({ used: 900, threshold: 1000 });
    expect(me.body.balance.available).toBe(0); // 1200 − 300 − 900
    // con figli a carico la soglia fringe sale a 2000
    expect((await api(env.app, 'PUT', '/welfare/declarations', luca.token, { year: 2026, key: 'children', value: true })).status).toBe(200);
    me = await api(env.app, 'GET', '/welfare/me', luca.token);
    expect(me.body.categories.find((c: any) => c.key === 'fringe').threshold).toBe(2000);
    expect(me.body.declarations).toEqual([{ key: 'children', value: true, year: 2026 }]);
  });
  it('HR reviews the queue: needs_docs, reject (releases), approve (spends); employee can cancel an open one', async () => {
    const queue = await api(env.app, 'GET', '/welfare/requests?status=open', hr.token);
    expect(queue.body).toHaveLength(10);
    expect(queue.body[0].person.firstName).toBe('Luca');
    expect((await api(env.app, 'GET', '/welfare/requests?status=open', manager.token)).status).toBe(403);
    const voucherIds = queue.body.filter((r: any) => r.kind === 'voucher').map((r: any) => r.id);
    expect((await api(env.app, 'POST', `/welfare/requests/${reqId}/decide`, hr.token, { decision: 'needs_docs', note: 'Serve la ricevuta intestata' })).body.status).toBe('needs_docs');
    const rej = await api(env.app, 'POST', `/welfare/requests/${voucherIds[0]}/decide`, hr.token, { decision: 'reject', note: 'Duplicato' });
    expect(rej.body.status).toBe('rejected');
    expect((await api(env.app, 'GET', '/welfare/me', luca.token)).body.balance.available).toBe(100);
    const canc = await api(env.app, 'POST', `/welfare/requests/${voucherIds[1]}/cancel`, luca.token);
    expect(canc.body.status).toBe('cancelled');
    expect((await api(env.app, 'POST', `/welfare/requests/${voucherIds[1]}/cancel`, luca.token)).status).toBe(409);
    const appr = await api(env.app, 'POST', `/welfare/requests/${voucherIds[2]}/decide`, hr.token, { decision: 'approve' });
    expect(appr.body.status).toBe('fulfilled'); // voucher senza eccedenza: evaso subito
    expect(appr.body.voucherCode).toMatch(/^WB-/);
    const approvedReimb = await api(env.app, 'POST', `/welfare/requests/${reqId}/decide`, hr.token, { decision: 'approve', note: 'Ricevuta ok' });
    expect(approvedReimb.body.status).toBe('approved'); // rimborso → passa da payroll
    const me = await api(env.app, 'GET', '/welfare/me', luca.token);
    expect(me.body.balance).toMatchObject({ spent: 400, reserved: 600, available: 200 });
    expect(me.body.requests.find((r: any) => r.id === reqId).reviewNote).toBe('Ricevuta ok');
    const n = await api(env.app, 'GET', '/notifications', luca.token);
    expect(n.body.items.filter((x: any) => x.type === 'welfare.request_decided').length).toBeGreaterThanOrEqual(3);
    const hrN = await api(env.app, 'GET', '/notifications', hr.token);
    expect(hrN.body.items.some((x: any) => x.type === 'welfare.request_submitted')).toBe(true);
    const ledger = await withTenant(env.db, tenant.id, (t) => t.select().from(welfareMovements).where(eq(welfareMovements.personId, luca.personId)));
    expect(ledger.filter((m) => m.kind === 'spend')).toHaveLength(2);
  });
  it('payroll batch: export CSV of approved reimbursements, confirm → paid', async () => {
    const prev = await api(env.app, 'GET', '/welfare/payroll/preview', hr.token);
    expect(prev.body).toMatchObject({ count: 1, total: 300, taxable: 0 });
    expect((await api(env.app, 'GET', '/welfare/payroll/preview', manager.token)).status).toBe(403);
    const b = await api(env.app, 'POST', '/welfare/payroll/batches', hr.token, { period: '2026-09' });
    expect(b.status).toBe(201);
    expect(b.body.itemsCount).toBe(1);
    const csv = await env.app.inject({ method: 'GET', url: `/api/v1/welfare/payroll/batches/${b.body.id}/csv`, headers: { authorization: `Bearer ${hr.token}` } });
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('E001;Bianchi Luca;2026-09;istruzione;RIMBORSO_WELFARE;300');
    expect((await api(env.app, 'GET', '/welfare/me', luca.token)).body.requests.find((r: any) => r.id === reqId).status).toBe('in_payroll');
    expect((await api(env.app, 'POST', '/welfare/payroll/batches', hr.token, { period: '2026-09' })).status).toBe(422); // nulla di nuovo
    const c = await api(env.app, 'POST', `/welfare/payroll/batches/${b.body.id}/confirm`, hr.token);
    expect(c.body.status).toBe('confirmed');
    expect((await api(env.app, 'GET', '/welfare/me', luca.token)).body.requests.find((r: any) => r.id === reqId).status).toBe('paid');
    expect((await api(env.app, 'POST', `/welfare/payroll/batches/${b.body.id}/confirm`, hr.token)).status).toBe(409);
  });
  it('premium conversion: simulator, one irrevocable choice inside the window, credit created', async () => {
    const sim = await api(env.app, 'GET', `/welfare/premium/simulate?planId=${planId}&percent=50`, luca.token);
    expect(sim.body).toMatchObject({ welfareCredit: 1000, cashGross: 1000, employerSaving: 300 });
    expect(sim.body.employeeGain).toBeGreaterThan(0);
    expect((await api(env.app, 'POST', '/welfare/premium/choice', luca.token, { planId, percent: 30, acceptRegulation: true })).status).toBe(422);
    expect((await api(env.app, 'POST', '/welfare/premium/choice', luca.token, { planId, percent: 50 })).status).toBe(400); // presa visione obbligatoria
    const ch = await api(env.app, 'POST', '/welfare/premium/choice', luca.token, { planId, percent: 50, acceptRegulation: true });
    expect(ch.status).toBe(201);
    expect(ch.body.amount).toBe(1000);
    expect((await api(env.app, 'POST', '/welfare/premium/choice', luca.token, { planId, percent: 100, acceptRegulation: true })).status).toBe(409);
    const me = await api(env.app, 'GET', '/welfare/me', luca.token);
    expect(me.body.balance.available).toBe(1200);
    expect(me.body.premium[0]).toMatchObject({ amount: 2000, windowOpen: true, chosen: { amount: 1000 } });
  });
  it('initiatives with capacity; plan close applies partial rollover', async () => {
    const ini = await api(env.app, 'POST', '/welfare/initiatives', hr.token, { name: 'Sportello psicologico', kind: 'program', capacity: 1, howTo: 'Prenota via app' });
    expect((await api(env.app, 'POST', `/welfare/initiatives/${ini.body.id}/join`, luca.token)).body.joined).toBe(true);
    expect((await api(env.app, 'POST', `/welfare/initiatives/${ini.body.id}/join`, nuova.token)).status).toBe(409);
    expect((await api(env.app, 'GET', '/welfare/me', luca.token)).body.initiatives[0]).toMatchObject({ joined: true, members: 1 });
    const plans = await api(env.app, 'GET', '/welfare/plans', hr.token);
    expect(plans.body[0].stats).toMatchObject({ people: 3, requesters: 1 });
    const closed = await api(env.app, 'POST', `/welfare/plans/${planId}/close`, hr.token);
    expect(closed.body.status).toBe('closed');
    const ledger = await withTenant(env.db, tenant.id, (t) => t.select().from(welfareMovements).where(eq(welfareMovements.personId, luca.personId)));
    const expired = ledger.filter((m) => m.kind === 'expire');
    expect(expired).toHaveLength(1);
    // saldo Luca prima della chiusura: 1000 + 200 + 1000 − 400 = 1800; roll-over 50% → scadono 900
    expect(Number(expired[0]!.amount)).toBe(900);
  });
});
