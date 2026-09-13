/**
 * Seed di sviluppo: crea il tenant demo "Acme S.p.A." con persone, unità, utenti (login dev) e un ciclo di obiettivi
 * coerente con i mockup in docs/mockups. Idempotente: se il tenant esiste, non fa nulla (usa --reset per ricrearlo).
 */
import { eq } from 'drizzle-orm';
import { createDatabase } from '../client.js';
import { runMigrations } from '../migrate.js';
import { actionItems, checkIns, companyValues, cycles, feedback, keyResults, meetingNotes, meetings, objectives, oneOnOneRelations, orgUnits, persons, recognitionRecipients, recognitionValues, recognitions, roleAssignments, talkingPoints, tenants, users } from '../schema/index.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL non impostata');
const { db, close } = createDatabase({ url, max: 1 });
await runMigrations(db);

const SLUG = 'acme';
const existing = await db.select().from(tenants).where(eq(tenants.slug, SLUG));
if (existing.length && !process.argv.includes('--reset')) {
  console.log('Tenant demo già presente (usa --reset per ricrearlo).');
  await close();
  process.exit(0);
}
if (existing.length) {
  const tid = existing[0]!.id;
  for (const t of [recognitionValues, recognitionRecipients, recognitions, feedback, companyValues, talkingPoints, meetingNotes, actionItems, meetings, oneOnOneRelations, checkIns, keyResults, objectives, cycles, roleAssignments, users, persons, orgUnits]) await db.delete(t).where(eq(t.tenantId, tid));
  await db.delete(tenants).where(eq(tenants.id, tid));
}

const [tenant] = await db.insert(tenants).values({ name: 'Acme S.p.A.', slug: SLUG }).returning();
const T = tenant!.id;

const unit = async (name: string, parent?: { id: string; path: string }) => {
  const [u] = await db.insert(orgUnits).values({ tenantId: T, name, parentId: parent?.id ?? null }).returning();
  const path = `${parent?.path ?? '/'}${u!.id}/`;
  await db.update(orgUnits).set({ path }).where(eq(orgUnits.id, u!.id));
  return { id: u!.id, path };
};
const root = await unit('Acme S.p.A.');
const prodotto = await unit('Prodotto', root);
const vendite = await unit('Vendite', root);
const cs = await unit('Customer Care', root);
await unit('Amministrazione', root);

type P = { id: string };
const person = async (firstName: string, lastName: string, email: string, jobTitle: string, orgUnitId: string, managerId?: string, hireDate = '2022-03-01'): Promise<P> => {
  const [p] = await db.insert(persons).values({ tenantId: T, firstName, lastName, email, jobTitle, orgUnitId, managerId: managerId ?? null, hireDate }).returning();
  return { id: p!.id };
};
const user = async (email: string, personId: string, roles: string[]) => {
  const [u] = await db.insert(users).values({ tenantId: T, email, personId }).returning();
  for (const role of roles) await db.insert(roleAssignments).values({ tenantId: T, userId: u!.id, role });
};

const ceo = await person('Anna', 'Colombo', 'anna.colombo@acme.test', 'CEO', root.id);
const chiara = await person('Chiara', 'Moretti', 'chiara.moretti@acme.test', 'HR Business Partner', root.id, ceo.id);
const giulia = await person('Giulia', 'Ferri', 'giulia.ferri@acme.test', 'Engineering Manager', prodotto.id, ceo.id);
const paolo = await person('Paolo', 'Neri', 'paolo.neri@acme.test', 'Sales Manager', vendite.id, ceo.id);
const luca = await person('Luca', 'Bianchi', 'luca.bianchi@acme.test', 'Senior Developer', prodotto.id, giulia.id);
const sara = await person('Sara', 'Ricci', 'sara.ricci@acme.test', 'Product Designer', prodotto.id, giulia.id);
const marco = await person('Marco', 'Conti', 'marco.conti@acme.test', 'Developer', prodotto.id, giulia.id);
const elena = await person('Elena', 'Parisi', 'elena.parisi@acme.test', 'QA Engineer', prodotto.id, giulia.id, '2026-08-01');
const andrea = await person('Andrea', 'Russo', 'andrea.russo@acme.test', 'Developer', prodotto.id, giulia.id);
await person('Fabio', 'Galli', 'fabio.galli@acme.test', 'Account Executive', vendite.id, paolo.id);
await person('Chiara', 'Rinaldi', 'chiara.rinaldi@acme.test', 'Customer Success', cs.id, paolo.id);

await user('anna.colombo@acme.test', ceo.id, ['tenant_admin', 'manager']);
await user('chiara.moretti@acme.test', chiara.id, ['hr_admin']);
await user('giulia.ferri@acme.test', giulia.id, ['manager']);
await user('paolo.neri@acme.test', paolo.id, ['manager']);
for (const [e, p] of [['luca.bianchi', luca], ['sara.ricci', sara], ['marco.conti', marco], ['elena.parisi', elena], ['andrea.russo', andrea]] as const) await user(`${e}@acme.test`, p.id, ['employee']);

const [q3] = await db.insert(cycles).values({ tenantId: T, name: 'Q3 2026', startDate: '2026-07-01', endDate: '2026-09-30', checkInCadenceDays: 7, status: 'open' }).returning();
const C = q3!.id;

const objective = async (v: { title: string; level: 'company' | 'unit' | 'team' | 'individual'; owner?: P; unitId?: string; parentId?: string; visibility?: 'public' | 'team' | 'private' }) => {
  const [o] = await db
    .insert(objectives)
    .values({ tenantId: T, cycleId: C, title: v.title, level: v.level, ownerPersonId: v.owner?.id ?? null, ownerOrgUnitId: v.unitId ?? null, parentId: v.parentId ?? null, status: 'active', visibility: v.visibility ?? 'public' })
    .returning();
  return o!.id;
};
const kr = async (objectiveId: string, title: string, start: number, target: number, current: number, unit: string | undefined, confidence: 'on_track' | 'at_risk' | 'off_track', ownerId: string, daysAgo = 2) => {
  const span = target - start;
  const progress = Math.max(0, Math.min(1, span === 0 ? 1 : (current - start) / span));
  const last = new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
  const [k] = await db
    .insert(keyResults)
    .values({ tenantId: T, objectiveId, title, type: unit === '%' ? 'percent' : 'number', direction: target < start ? 'decrease' : 'increase', unit, startValue: String(start), targetValue: String(target), currentValue: String(current), progress: progress.toFixed(4), confidence, lastCheckInAt: last, ownerPersonId: ownerId })
    .returning();
  await db.insert(checkIns).values({ tenantId: T, keyResultId: k!.id, authorPersonId: ownerId, value: String(current), confidence, comment: 'Check-in iniziale (seed)' });
  await db.update(objectives).set({ progress: progress.toFixed(4), confidence }).where(eq(objectives.id, objectiveId));
};

const company = await objective({ title: 'Diventare il fornitore di riferimento per le PMI del Nord Italia', level: 'company' });
const churn = await objective({ title: 'Ridurre il churn dei clienti sotto il 3% mensile', level: 'unit', unitId: prodotto.id, parentId: company, owner: giulia });
await kr(churn, 'Churn mensile', 5, 3, 4.2, '%', 'at_risk', giulia.id);
const sales = await objective({ title: 'Chiudere 40 nuovi contratti PMI nel trimestre', level: 'unit', unitId: vendite.id, parentId: company, owner: paolo });
await kr(sales, 'Contratti firmati', 0, 40, 25, undefined, 'on_track', paolo.id);
const p1 = await objective({ title: 'Portare il tempo di risposta ai ticket P1 sotto le 4 ore', level: 'individual', owner: luca, parentId: churn });
await kr(p1, 'Tempo medio risposta P1', 10, 4, 7.5, 'h', 'off_track', luca.id, 3);
const onb = await objective({ title: 'Rilasciare il nuovo onboarding in-app entro il 30/09', level: 'individual', owner: sara, parentId: churn });
await kr(onb, 'Milestone completate', 0, 10, 7, undefined, 'on_track', sara.id);
const bugs = await objective({ title: 'Ridurre i bug critici in produzione da 12 a 4 al mese', level: 'individual', owner: marco, parentId: churn });
await kr(bugs, 'Bug critici / mese', 12, 4, 5, undefined, 'on_track', marco.id);
const stale = await objective({ title: 'Automatizzare la suite di regressione', level: 'individual', owner: andrea, parentId: churn });
await kr(stale, 'Copertura test E2E', 20, 80, 30, '%', 'at_risk', andrea.id, 16);
await objective({ title: 'Prepararsi al percorso Tech Lead', level: 'individual', owner: luca, visibility: 'private' });
// progresso aggregato del company objective = media dei figli
const kids = await db.select({ p: objectives.progress }).from(objectives).where(eq(objectives.parentId, company));
const avg = kids.reduce((s, k) => s + Number(k.p ?? 0), 0) / kids.length;
await db.update(objectives).set({ progress: avg.toFixed(4) }).where(eq(objectives.id, company));

// ---- valori aziendali, 1:1, feedback e riconoscimenti ----
const value = async (name: string, icon: string, position: number) => (await db.insert(companyValues).values({ tenantId: T, name, icon, position }).returning())[0]!.id;
const vAff = await value('Affidabilità', '🏅', 0);
const vCura = await value('Cura del cliente', '💙', 1);
await value('Coraggio', '🔥', 2);
await value('Crescita', '🌱', 3);

const daysAgo = (n: number, h = 14, m = 30) => { const d = new Date(Date.now() - n * 86400000); d.setHours(h, m, 0, 0); return d; };
const rel = async (a: P, b: P, cadence = 7) => (await db.insert(oneOnOneRelations).values({ tenantId: T, personAId: a.id, personBId: b.id, kind: 'manager_report', cadenceDays: cadence }).returning())[0]!;
const relLuca = await rel(giulia, luca);
for (const p of [sara, marco, andrea]) {
  const r = await rel(giulia, p);
  await db.insert(meetings).values({ tenantId: T, relationId: r.id, scheduledAt: daysAgo(p === sara ? 21 : 5), status: 'done', completedAt: daysAgo(p === sara ? 21 : 5) });
  await db.insert(meetings).values({ tenantId: T, relationId: r.id, scheduledAt: daysAgo(-2, 10, 0) });
}
const [past] = await db.insert(meetings).values({ tenantId: T, relationId: relLuca.id, scheduledAt: daysAgo(7), status: 'done', completedAt: daysAgo(7) }).returning();
const [next] = await db.insert(meetings).values({ tenantId: T, relationId: relLuca.id, scheduledAt: daysAgo(-2) }).returning();
await db.insert(meetingNotes).values({ tenantId: T, meetingId: past!.id, relationId: relLuca.id, authorPersonId: giulia.id, visibility: 'shared', body: 'Rilascio 3.2 andato bene; il rollback plan ha funzionato. Concordato di anticipare la design review del ciclo 3.3.' });
await db.insert(talkingPoints).values([
  { tenantId: T, meetingId: next!.id, relationId: relLuca.id, authorPersonId: luca.id, text: 'Retrospettiva rilascio 3.2', position: 0 },
  { tenantId: T, meetingId: next!.id, relationId: relLuca.id, authorPersonId: giulia.id, text: 'Percorso verso Tech Lead', source: 'carry_over', carriedFromMeetingId: past!.id, position: 1 },
  { tenantId: T, meetingId: next!.id, relationId: relLuca.id, authorPersonId: luca.id, text: 'Ferie di ottobre', position: 2 },
]);
await db.insert(actionItems).values([
  { tenantId: T, relationId: relLuca.id, meetingId: past!.id, ownerPersonId: luca.id, title: 'Documentare runbook on-call', dueDate: daysAgo(5).toISOString().slice(0, 10) },
  { tenantId: T, relationId: relLuca.id, meetingId: past!.id, ownerPersonId: giulia.id, title: 'Proporre Andrea per il turno on-call', dueDate: daysAgo(-6).toISOString().slice(0, 10) },
  { tenantId: T, relationId: relLuca.id, meetingId: past!.id, ownerPersonId: luca.id, title: 'Inviare piano ferie Q4', status: 'done', doneAt: daysAgo(6) },
]);
await db.insert(feedback).values([
  { tenantId: T, fromPersonId: marco.id, toPersonId: luca.id, kind: 'praise', body: 'Grazie per il supporto nella migrazione: la checklist ci ha salvato.', visibility: 'manager', sharedWithManagerAt: daysAgo(3), valueId: vAff, createdAt: daysAgo(3) },
  { tenantId: T, fromPersonId: sara.id, toPersonId: luca.id, kind: 'suggestion', body: 'Nelle review di codice potresti essere più sintetico: i commenti lunghi si perdono.', visibility: 'private', createdAt: daysAgo(16) },
  { tenantId: T, fromPersonId: giulia.id, toPersonId: sara.id, kind: 'praise', body: 'La demo dell\'onboarding in-app ha convinto il cliente in cinque minuti.', visibility: 'private', valueId: vCura, createdAt: daysAgo(4) },
]);
const recog = async (from: P, to: P[], message: string, values: string[], d: number) => {
  const [r] = await db.insert(recognitions).values({ tenantId: T, fromPersonId: from.id, message, createdAt: daysAgo(d) }).returning();
  for (const p of to) await db.insert(recognitionRecipients).values({ tenantId: T, recognitionId: r!.id, personId: p.id });
  for (const v of values) await db.insert(recognitionValues).values({ tenantId: T, recognitionId: r!.id, valueId: v });
};
await recog(giulia, [luca], 'Migrazione del database senza un minuto di downtime. Preparazione impeccabile.', [vAff], 22);
await recog(paolo, [sara, marco], 'Il nuovo onboarding in-app ha ridotto i ticket dei nuovi clienti del 30%.', [vCura, vAff], 6);
await recog(marco, [elena], 'Prima settimana e ha già trovato due bug che ci saremmo portati in produzione.', [vAff], 1);

console.log(`Seed completato. Tenant "${SLUG}". Login dev: POST /api/v1/auth/dev-login { tenantSlug: "acme", email: "giulia.ferri@acme.test" }`);
console.log('Utenti: anna.colombo (tenant_admin), chiara.moretti (hr_admin), giulia.ferri / paolo.neri (manager), luca.bianchi, sara.ricci, marco.conti, elena.parisi, andrea.russo (employee)');
await close();
