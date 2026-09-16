/**
 * Seed di sviluppo: crea il tenant demo "Acme S.p.A." con persone, unità, utenti (login dev) e un ciclo di obiettivi
 * coerente con i mockup in docs/mockups. Idempotente: se il tenant esiste, non fa nulla (usa --reset per ricrearlo).
 */
import { and, eq } from 'drizzle-orm';
import { createDatabase } from '../client.js';
import { runMigrations } from '../migrate.js';
import { refreshMartForTenant } from '../analytics/refresh.js';
import { withTenant } from '../tenant.js';
import { hashPassword } from '../auth/password.js';
import { AppTemplates, CompetencyPresets, reviewTemplateToApp, DefaultF360Categories, OnboardingPresets, dueDateFrom, onboardingSurveyScore, resolveAssignee, DefaultF360OpenQuestions, DefaultF360Scale, WelfareCategoryPresets, buildF360Report, buildSurveyForm, tenureBand, thresholdPresetsFor, type F360ResponseInput, type ReviewApprover } from '@wb/shared';
import { actionItems, checkIns, companyValues, cycles, emailOutbox, feedback, formAnswers, formDefinitions, formResponses, martPersonFacts, surveyInvitations, surveyResponses, surveys, welfareBudgetSources, welfareCatalogItems, welfareCategories, welfareInitiatives, welfareMovements, welfarePlans, welfareRequests, welfareThresholds, savedReports, competencies, competencyAssessments, developmentActions, developmentPlans, jobProfiles, talentAssessments, f360Campaigns, f360Requests, f360Responses, f360Subjects, onboardingJourneys, onboardingSurveyResponses, onboardingTasks, onboardingTemplates, appInstanceEvents, appInstances, appStageRuns, apps, reviewCycles, reviewTemplates, reviews, keyResults, meetingNotes, meetings, notificationPreferences, notifications, objectives, oneOnOneRelations, orgUnits, personFieldDefs, persons, platformUsers, recognitionRecipients, recognitionValues, recognitions, roleAssignments, talkingPoints, tenants, users } from '../schema/index.js';

/** Password di tutti gli utenti demo (solo ambiente di prova). */
const DEMO_PASSWORD_HASH = hashPassword('Password!2026');

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
  for (const t of [appInstanceEvents, appStageRuns, appInstances, apps, onboardingSurveyResponses, onboardingTasks, onboardingJourneys, onboardingTemplates, f360Responses, f360Requests, f360Subjects, f360Campaigns, talentAssessments, developmentActions, developmentPlans, competencyAssessments, jobProfiles, competencies, savedReports, welfareRequests, welfareMovements, welfareBudgetSources, welfareCatalogItems, welfareInitiatives, welfareThresholds, welfareCategories, welfarePlans, surveyResponses, surveyInvitations, surveys, martPersonFacts, reviews, reviewCycles, reviewTemplates, formAnswers, formResponses, formDefinitions, emailOutbox, notifications, notificationPreferences, recognitionValues, recognitionRecipients, recognitions, feedback, companyValues, talkingPoints, meetingNotes, actionItems, meetings, oneOnOneRelations, checkIns, keyResults, objectives, cycles, roleAssignments, users, persons, orgUnits]) await db.delete(t).where(eq(t.tenantId, tid));
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
  const [u] = await db.insert(users).values({ tenantId: T, email, personId, passwordHash: DEMO_PASSWORD_HASH, passwordUpdatedAt: new Date(), authProvider: 'password' }).returning();
  for (const role of roles) await db.insert(roleAssignments).values({ tenantId: T, userId: u!.id, role });
  return u!;
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

// Catalogo dei campi custom della persona (CORE-011) con qualche valore dimostrativo
const fieldDef = async (key: string, label: string, type: string, extra: Partial<typeof personFieldDefs.$inferInsert> = {}) => { await db.insert(personFieldDefs).values({ tenantId: T, key, label, type, ...extra }); };
await fieldDef('contract_type', 'Tipo di contratto', 'single_choice', { section: 'Contratto', options: [{ value: 'perm', label: 'Indeterminato' }, { value: 'fixed', label: 'Determinato' }, { value: 'apprentice', label: 'Apprendistato' }], visibility: 'all', required: true, position: 0 });
await fieldDef('cost_center', 'Centro di costo', 'text', { section: 'Contratto', visibility: 'manager', position: 1, help: 'Codice del centro di costo (es. CC-100)' });
await fieldDef('remote_days', 'Giorni di lavoro da remoto a settimana', 'number', { section: 'Organizzazione del lavoro', visibility: 'all', position: 2 });
await fieldDef('badge', 'Badge aziendale consegnato', 'boolean', { section: 'Organizzazione del lavoro', visibility: 'hr', position: 3 });
await fieldDef('probation_end', 'Fine periodo di prova', 'date', { section: 'Contratto', visibility: 'manager', position: 4 });
const cf = async (id: string, values: Record<string, unknown>) => { await db.update(persons).set({ customFields: values }).where(eq(persons.id, id)); };
await cf(luca.id, { contract_type: 'perm', cost_center: 'CC-210', remote_days: 2, badge: true });
await cf(sara.id, { contract_type: 'perm', cost_center: 'CC-210', remote_days: 3, badge: true });
await cf(marco.id, { contract_type: 'fixed', cost_center: 'CC-210', remote_days: 2, badge: true, probation_end: '2026-06-30' });
await cf(elena.id, { contract_type: 'apprentice', cost_center: 'CC-220', remote_days: 1, badge: false, probation_end: '2026-11-30' });
await cf(andrea.id, { contract_type: 'perm', cost_center: 'CC-210', remote_days: 2, badge: true });
await cf(giulia.id, { contract_type: 'perm', cost_center: 'CC-200', remote_days: 1, badge: true });
await person('Chiara', 'Rinaldi', 'chiara.rinaldi@acme.test', 'Customer Success', cs.id, paolo.id);

await user('anna.colombo@acme.test', ceo.id, ['tenant_admin', 'manager']);
const chiaraUser = await user('chiara.moretti@acme.test', chiara.id, ['hr_admin']);
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
const rel = async (a: P, b: P, cadence = 7) => (await db.insert(oneOnOneRelations).values({ tenantId: T, personAId: a.id, personBId: b.id, kind: 'manager_report', cadenceDays: cadence, meetingUrl: 'https://meet.example.com/acme-1to1' }).returning())[0]!;
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

// ---- form engine: una review leggera pubblicata e una compilazione assegnata a Giulia su Luca ----
const reviewSchema = {
  title: 'Review leggera Q3',
  description: 'Cinque minuti: obiettivi, due competenze e un commento. Le risposte restano tra te, il collaboratore e HR.',
  scoring: { enabled: true },
  sections: [
    { key: 'competenze', title: 'Competenze', weight: 2, fields: [
      { key: 'ownership', type: 'scale', label: 'Ownership', help: 'Si assume la responsabilità dei risultati oltre il proprio perimetro', required: true, scale: { min: 1, max: 5, labels: { '1': 'Non soddisfa', '2': 'Parzialmente', '3': 'Soddisfa', '4': 'Supera', '5': 'Eccezionale' } }, commentRequiredBelow: 2, commentKey: 'ownership_note' },
      { key: 'ownership_note', type: 'long_text', label: 'Commento su Ownership', showIf: { field: 'ownership', notEmpty: true } },
      { key: 'comunicazione', type: 'scale', label: 'Comunicazione', required: true, scale: { min: 1, max: 5, labels: { '1': 'Non soddisfa', '3': 'Soddisfa', '5': 'Eccezionale' }, allowNa: true } },
    ] },
    { key: 'sviluppo', title: 'Sviluppo', fields: [
      { key: 'ha_piano', type: 'boolean', label: 'Ha un piano di sviluppo attivo?' },
      { key: 'aree', type: 'multi_choice', label: 'Aree su cui investire', showIf: { field: 'ha_piano', equals: false }, options: [{ value: 'tech', label: 'Competenze tecniche' }, { value: 'lead', label: 'Leadership' }, { value: 'com', label: 'Comunicazione' }] },
    ] },
    { key: 'chiusura', title: 'Chiusura', fields: [
      { key: 'rating', type: 'single_choice', label: 'Valutazione complessiva', required: true, options: [{ value: 'below', label: 'Sotto le attese', score: 1 }, { value: 'meets', label: 'In linea', score: 2 }, { value: 'exceeds', label: 'Oltre le attese', score: 3 }] },
      { key: 'commento', type: 'long_text', label: 'Commento finale', required: true, min: 20, placeholder: 'Cita esempi concreti' },
    ] },
  ],
};
const [formDef] = await db.insert(formDefinitions).values({ tenantId: T, key: 'review_light_q3', name: 'Review leggera Q3', kind: 'review', status: 'published', publishedAt: new Date(), schema: reviewSchema }).returning();
await db.insert(formResponses).values({ tenantId: T, formDefinitionId: formDef!.id, formKey: 'review_light_q3', formVersion: 1, respondentPersonId: giulia.id, subjectPersonId: luca.id, contextType: 'demo', dueDate: daysAgo(-10), answers: { ownership: 4 } });
await db.insert(formDefinitions).values({ tenantId: T, key: 'training_request', name: 'Richiesta formazione', kind: 'request', status: 'published', publishedAt: new Date(), schema: { title: 'Richiesta formazione', scoring: { enabled: false }, sections: [{ key: 'r', title: 'Richiesta', fields: [{ key: 'corso', type: 'short_text', label: 'Corso o certificazione', required: true }, { key: 'costo', type: 'number', label: 'Costo stimato (€)', min: 0 }, { key: 'quando', type: 'date', label: 'Data prevista' }, { key: 'motivo', type: 'long_text', label: 'Perché è utile al team', required: true, min: 20 }] }] } });

// ---- performance review: template + ciclo attivo per Prodotto ----
const selfSchema = { title: 'Self-review Q3', scoring: { enabled: false }, sections: [
  { key: 'risultati', title: 'Il tuo trimestre', fields: [
    { key: 'highlights', type: 'long_text', label: 'Risultati di cui vai fiero/a', required: true, min: 10, placeholder: 'Cita esempi concreti e impatto' },
    { key: 'ostacoli', type: 'long_text', label: 'Cosa ti ha rallentato' },
    { key: 'supporto', type: 'multi_choice', label: 'Di cosa avresti bisogno', options: [{ value: 'tempo', label: 'Più tempo per il lavoro profondo' }, { value: 'formazione', label: 'Formazione' }, { value: 'chiarezza', label: 'Priorità più chiare' }, { value: 'mentoring', label: 'Mentoring' }] },
    { key: 'autovalutazione', type: 'scale', label: 'Come valuti il tuo trimestre?', required: true, scale: { min: 1, max: 5, labels: { '1': 'Sotto le attese', '3': 'In linea', '5': 'Oltre le attese' } } },
  ] } ] };
const managerSchema = { title: 'Manager review Q3', scoring: { enabled: true }, sections: [
  { key: 'competenze', title: 'Competenze', weight: 2, fields: [
    { key: 'ownership', type: 'scale', label: 'Ownership', help: 'Si assume la responsabilità dei risultati oltre il proprio perimetro', required: true, scale: { min: 1, max: 5, labels: { '1': 'Non soddisfa', '2': 'Parzialmente', '3': 'Soddisfa', '4': 'Supera', '5': 'Eccezionale' } }, commentRequiredBelow: 2, commentKey: 'ownership_note' },
    { key: 'ownership_note', type: 'long_text', label: 'Commento su Ownership' },
    { key: 'comunicazione', type: 'scale', label: 'Comunicazione', required: true, scale: { min: 1, max: 5, labels: { '1': 'Non soddisfa', '3': 'Soddisfa', '5': 'Eccezionale' } } },
    { key: 'qualita', type: 'scale', label: 'Qualità tecnica', required: true, scale: { min: 1, max: 5, labels: { '1': 'Non soddisfa', '3': 'Soddisfa', '5': 'Eccezionale' }, allowNa: true } },
  ] },
  { key: 'obiettivi', title: 'Obiettivi', fields: [{ key: 'obiettivi_nota', type: 'long_text', label: 'Valutazione dei risultati sugli obiettivi', help: 'I dati sono nel pannello di contesto a destra', required: true, min: 20 }] },
  { key: 'chiusura', title: 'Chiusura', fields: [
    { key: 'punti_forza', type: 'long_text', label: 'Punti di forza', required: true, min: 10 },
    { key: 'sviluppo', type: 'long_text', label: 'Aree di sviluppo e prossimi passi', required: true, min: 10 },
  ] } ] };
const [selfDef] = await db.insert(formDefinitions).values({ tenantId: T, key: 'review_self_q3', name: 'Self-review Q3', kind: 'review', status: 'published', publishedAt: new Date(), schema: selfSchema }).returning();
const [mgrDef] = await db.insert(formDefinitions).values({ tenantId: T, key: 'review_manager_q3', name: 'Manager review Q3', kind: 'review', status: 'published', publishedAt: new Date(), schema: managerSchema }).returning();
const [tpl] = await db.insert(reviewTemplates).values({ tenantId: T, name: 'Review trimestrale', description: 'Self-review + manager review, condivisione e firma. Il manager vede la self-review dopo aver inviato la propria.', selfFormKey: 'review_self_q3', managerFormKey: 'review_manager_q3', selfDueDays: 14, managerDueDays: 21, managerSeesSelf: 'after_submit', approvalChain: ['manager_of_manager'] }).returning();
const [rc] = await db.insert(reviewCycles).values({ tenantId: T, templateId: tpl!.id, name: 'Review Q3 2026', periodStart: '2026-07-01', periodEnd: '2026-09-30', okrCycleId: C, status: 'active', population: { orgUnitIds: [prodotto.id] }, launchedAt: daysAgo(5), selfDueAt: daysAgo(-9).toISOString().slice(0, 10), managerDueAt: daysAgo(-16).toISOString().slice(0, 10), templateSnapshot: tpl }).returning();
const team = [luca, sara, marco, andrea, elena];
// ogni review gira sul motore dei processi (ADR-0011): app silenziosa per ciclo, un'istanza per persona, self e manager in parallelo
const reviewApp = reviewTemplateToApp({ ...tpl!, managerSeesSelf: tpl!.managerSeesSelf as 'after_submit', approvalChain: tpl!.approvalChain as ReviewApprover[] }, { id: rc!.id, name: rc!.name });
for (const person of team) {
  const selfDone = person === luca || person === marco;
  const [pr] = await db.select({ firstName: persons.firstName, lastName: persons.lastName }).from(persons).where(eq(persons.id, person.id));
  const fullName = `${pr!.firstName} ${pr!.lastName}`;
  const [rv] = await db.insert(reviews).values({ tenantId: T, cycleId: rc!.id, subjectPersonId: person.id, managerPersonId: giulia.id, status: 'pending_self' }).returning();
  const [inst] = await db.insert(appInstances).values({ tenantId: T, createdBy: chiaraUser.id, appId: null, appKey: reviewApp.key, appVersion: 1, definition: reviewApp, subjectPersonId: person.id, launcherPersonId: chiara.id, actors: { subject: person.id, manager: giulia.id, manager_of_manager: ceo.id, launcher: chiara.id, hr: chiara.id }, currentStages: selfDone ? ['manager'] : ['self', 'manager'], title: null, startedAt: daysAgo(5) }).returning();
  const [selfRun] = await db.insert(appStageRuns).values({ tenantId: T, instanceId: inst!.id, stageKey: 'self', attempt: 1, type: 'form', status: 'active', actorPersonId: person.id, dueDate: daysAgo(-9).toISOString().slice(0, 10), activatedAt: daysAgo(5) }).returning();
  const [mgrRun] = await db.insert(appStageRuns).values({ tenantId: T, instanceId: inst!.id, stageKey: 'manager', attempt: 1, type: 'form', status: 'active', actorPersonId: giulia.id, dueDate: daysAgo(-16).toISOString().slice(0, 10), activatedAt: daysAgo(5) }).returning();
  await db.insert(appStageRuns).values([
    { tenantId: T, instanceId: inst!.id, stageKey: 'approve_1', attempt: 1, type: 'approval', status: 'pending' }, // catena di approvazione (REV-050): il manager del manager
    { tenantId: T, instanceId: inst!.id, stageKey: 'share', attempt: 1, type: 'approval', status: 'pending' },
    { tenantId: T, instanceId: inst!.id, stageKey: 'sign', attempt: 1, type: 'approval', status: 'pending' },
  ]);
  const [sr] = await db.insert(formResponses).values({ tenantId: T, formDefinitionId: selfDef!.id, formKey: 'review_self_q3', formVersion: 1, respondentPersonId: person.id, subjectPersonId: person.id, contextType: 'app_stage', contextId: selfRun!.id, dueDate: daysAgo(-9) }).returning();
  const [mr] = await db.insert(formResponses).values({ tenantId: T, formDefinitionId: mgrDef!.id, formKey: 'review_manager_q3', formVersion: 1, respondentPersonId: giulia.id, subjectPersonId: person.id, contextType: 'app_stage', contextId: mgrRun!.id, dueDate: daysAgo(-16) }).returning();
  await db.update(appStageRuns).set({ formResponseId: sr!.id }).where(eq(appStageRuns.id, selfRun!.id));
  await db.update(appStageRuns).set({ formResponseId: mr!.id }).where(eq(appStageRuns.id, mgrRun!.id));
  await db.insert(appInstanceEvents).values([
    { tenantId: T, instanceId: inst!.id, type: 'launched', actorPersonId: chiara.id, data: { subject: fullName, app: reviewApp.name }, at: daysAgo(5) },
    { tenantId: T, instanceId: inst!.id, type: 'stage_activated', stageKey: 'self', actorPersonId: chiara.id, data: { actorPersonId: person.id }, at: daysAgo(5) },
    { tenantId: T, instanceId: inst!.id, type: 'stage_activated', stageKey: 'manager', actorPersonId: chiara.id, data: { actorPersonId: giulia.id }, at: daysAgo(5) },
  ]);
  const patch: Record<string, unknown> = { appInstanceId: inst!.id, selfResponseId: sr!.id, managerResponseId: mr!.id };
  if (selfDone) {
    // self-review già inviata (anche nel motore: run concluso)
    const answers = { highlights: person === luca ? 'Migrazione del database senza downtime e runbook riusato dal team.' : 'Ridotti i bug critici da 12 a 5 al mese con la nuova suite di test.', ostacoli: 'Turno on-call scoperto per due settimane.', supporto: ['tempo'], autovalutazione: 4 };
    await db.update(formResponses).set({ status: 'submitted', submittedAt: daysAgo(2), answers }).where(eq(formResponses.id, sr!.id));
    await db.update(appStageRuns).set({ status: 'done', outcome: 'submitted', answers, completedAt: daysAgo(2), completedByPersonId: person.id }).where(eq(appStageRuns.id, selfRun!.id));
    await db.insert(appInstanceEvents).values({ tenantId: T, instanceId: inst!.id, type: 'submitted', stageKey: 'self', actorPersonId: person.id, data: { formKey: 'review_self_q3' }, at: daysAgo(2) });
    patch.status = 'pending_manager';
    patch.selfSubmittedAt = daysAgo(2);
  }
  await db.update(reviews).set(patch).where(eq(reviews.id, rv!.id));
}

// ---- survey: una engagement chiusa (con risposte anonime) e una pulse aperta ----
const everyone = [ceo, chiara, giulia, paolo, luca, sara, marco, andrea, elena];
const personRows = new Map((await db.select().from(persons).where(eq(persons.tenantId, T))).map((r) => [r.id, r]));
const unitRows = new Map((await db.select().from(orgUnits).where(eq(orgUnits.tenantId, T))).map((u) => [u.id, u.path]));
const engBuilt = buildSurveyForm('engagement', 'Engagement primavera 2026');
const [engForm] = await db.insert(formDefinitions).values({ tenantId: T, key: 'survey_engagement_seed', name: 'Engagement primavera 2026', kind: 'survey', status: 'published', publishedAt: daysAgo(120), schema: engBuilt.schema }).returning();
const [eng] = await db.insert(surveys).values({ tenantId: T, createdBy: chiaraUser.id, title: 'Engagement primavera 2026', description: 'Ogni sei mesi ascoltiamo tutta l’azienda. Anonima, 5 minuti.', kind: 'engagement', formDefinitionId: engForm!.id, anonymous: true, anonymityThreshold: 5, status: 'shared', launchedAt: daysAgo(110), closesAt: daysAgo(96), closedAt: daysAgo(96), sharedAt: daysAgo(90), drivers: engBuilt.drivers, enpsField: engBuilt.enpsField, summary: 'Grazie alle 8 persone su 9 che hanno risposto. Leadership e collaborazione sono i punti forti; carico di lavoro e crescita quelli da migliorare. Da qui a fine anno: piano di formazione per team e revisione dei turni on-call.' }).returning();
await db.insert(surveyInvitations).values(everyone.map((p) => ({ tenantId: T, surveyId: eng!.id, personId: p.id, respondedAt: p === andrea ? null : daysAgo(100) })));
const engAnswers = (lead: number, cresc: number, ben: number, enps: number, commento?: string) => ({ q_lead_fiducia: lead, q_lead_manager: lead, q_chiar_obiettivi: 4, q_chiar_priorita: 3, q_cresc_opportunita: cresc, q_cresc_futuro: cresc, q_ric_apprezzamento: 4, q_ric_feedback: 3, q_auto_decisioni: 4, q_auto_fiducia: 4, q_coll_team: 5, q_coll_altri: 4, q_ben_carico: ben, q_ben_equilibrio: ben, enps, ...(commento ? { commento } : {}) });
const seg = (p: P) => { const r = personRows.get(p.id)!; return { orgUnitId: r.orgUnitId, orgPath: (r.orgUnitId && unitRows.get(r.orgUnitId)) || '', managerId: r.managerId, tenureBand: tenureBand(r.hireDate, daysAgo(100)) }; };
const engResponders = everyone.filter((p) => p !== andrea);
const engValues = [[5, 3, 3, 9], [4, 2, 2, 8], [4, 3, 2, 9, 'Vorrei più tempo per la formazione tecnica.'], [4, 2, 3, 7], [5, 4, 3, 10, 'Il team è fantastico, il carico on-call meno.'], [3, 2, 2, 6], [4, 3, 3, 8], [4, 3, 4, 9]] as const;
await db.insert(surveyResponses).values(engResponders.map((p, i) => { const v = engValues[i]!; return { tenantId: T, surveyId: eng!.id, submittedAt: daysAgo(100), answers: engAnswers(v[0], v[1], v[2], v[3], v[4]), ...seg(p) }; }));
const pulseBuilt = buildSurveyForm('pulse', 'Pulse di settembre', { rotation: 0 });
const [pulseForm] = await db.insert(formDefinitions).values({ tenantId: T, key: 'survey_pulse_seed', name: 'Pulse di settembre', kind: 'survey', status: 'published', publishedAt: daysAgo(3), schema: pulseBuilt.schema }).returning();
const [pulse] = await db.insert(surveys).values({ tenantId: T, createdBy: chiaraUser.id, title: 'Pulse di settembre', description: 'Cinque domande, un minuto. Anonima.', kind: 'pulse', formDefinitionId: pulseForm!.id, anonymous: true, anonymityThreshold: 5, status: 'open', launchedAt: daysAgo(2), closesAt: daysAgo(-5), drivers: pulseBuilt.drivers, enpsField: pulseBuilt.enpsField }).returning();
await db.insert(surveyInvitations).values(everyone.map((p) => ({ tenantId: T, surveyId: pulse!.id, personId: p.id, respondedAt: [sara, marco, elena].includes(p) ? daysAgo(1) : null })));
await db.insert(surveyResponses).values([sara, marco, elena].map((p) => ({ tenantId: T, surveyId: pulse!.id, submittedAt: daysAgo(1), answers: Object.fromEntries([...pulseBuilt.questionKeys.map((k) => [k, 4]), ['enps', 8]]), ...seg(p) })));

// ---- welfare: categorie e soglie 2026, piano attivo con budget accreditato, catalogo, richieste, iniziative ----
for (const c of WelfareCategoryPresets) await db.insert(welfareCategories).values({ tenantId: T, key: c.key, name: c.name, description: c.description, regime: c.regime, beneficiaries: c.beneficiaries, requiredDocs: c.requiredDocs, note: c.note ?? null });
for (const t of thresholdPresetsFor(2026)) await db.insert(welfareThresholds).values({ tenantId: T, year: 2026, categoryKey: t.categoryKey, condition: t.condition, amount: t.amount.toFixed(2) });
const [wplan] = await db.insert(welfarePlans).values({ tenantId: T, createdBy: chiaraUser.id, name: 'Welfare 2026', year: 2026, periodStart: '2026-01-01', periodEnd: '2026-12-31', population: {}, regulation: 'Il piano welfare 2026 mette a disposizione un credito da spendere in beni e servizi delle categorie abilitate. Il credito non speso al 31/12 è riportato al 50% nell’anno successivo. La scelta di conversione del premio di risultato è irrevocabile.', rolloverRule: 'partial', rolloverPercent: 50, enabledCategories: ['istruzione', 'assistenza_familiari', 'trasporto', 'cultura_sport', 'fringe', 'previdenza'], premium: { enabled: true, amount: 1500, windowFrom: '2026-09-01', windowTo: '2026-10-31', allowedPercents: [0, 25, 50, 75, 100], taxRate: 0.23, employeeContributionRate: 0.0919, employerContributionRate: 0.3 }, status: 'active', activatedAt: daysAgo(200) }).returning();
const [wsrc] = await db.insert(welfareBudgetSources).values({ tenantId: T, planId: wplan!.id, name: 'Budget welfare 2026', kind: 'on_top', amountPerPerson: '800.00', creditAt: '2026-02-01', expiresAt: '2026-12-31', creditedAt: daysAgo(200) }).returning();
const allPeople = [...personRows.values()];
for (const pr of allPeople) await db.insert(welfareMovements).values({ tenantId: T, planId: wplan!.id, personId: pr.id, kind: 'credit', amount: '800.00', year: 2026, sourceId: wsrc!.id, expiresAt: '2026-12-31', note: 'Budget welfare 2026', createdAt: daysAgo(200) });
const [buono] = await db.insert(welfareCatalogItems).values({ tenantId: T, name: 'Buono spesa 100 €', description: 'Buono spendibile nei supermercati convenzionati', categoryKey: 'fringe', kind: 'voucher', price: '100.00', instructions: 'Il codice arriva via email dopo l’approvazione' }).returning();
await db.insert(welfareCatalogItems).values([
  { tenantId: T, name: 'Abbonamento trasporto pubblico', description: 'Rimborso dell’abbonamento annuale o mensile nominativo', categoryKey: 'trasporto', kind: 'reimbursement', maxAmount: '800.00' },
  { tenantId: T, name: 'Rette e libri scolastici', description: 'Rimborso spese di istruzione per i figli', categoryKey: 'istruzione', kind: 'reimbursement' },
  { tenantId: T, name: 'Palestra convenzionata', description: 'Abbonamento annuale con sconto del 20%', categoryKey: 'cultura_sport', kind: 'service', price: '360.00', instructions: 'Presenta il codice in reception' },
  { tenantId: T, name: 'Versamento fondo pensione', description: 'Contributo aggiuntivo al fondo di categoria', categoryKey: 'previdenza', kind: 'service', minAmount: '50.00' },
]);
// richieste: Luca (rimborso approvato e liquidato + buono evaso), Sara (rimborso in verifica), Marco (buono in verifica)
const mkReq = async (personId: string, v: { itemId?: string; kind: string; categoryKey: string; amount: number; beneficiary?: string; beneficiaryName?: string; attachmentName?: string; expenseDate?: string; status: string; note?: string; reviewNote?: string; voucherCode?: string; ago: number }) => {
  const [r] = await db.insert(welfareRequests).values({ tenantId: T, planId: wplan!.id, personId, itemId: v.itemId ?? null, kind: v.kind, categoryKey: v.categoryKey, amount: v.amount.toFixed(2), beneficiary: v.beneficiary ?? 'self', beneficiaryName: v.beneficiaryName ?? null, expenseDate: v.expenseDate ?? null, attachmentName: v.attachmentName ?? null, declarationAccepted: true, note: v.note ?? null, status: v.status as 'submitted', reviewNote: v.reviewNote ?? null, voucherCode: v.voucherCode ?? null, decidedAt: ['approved', 'paid', 'fulfilled', 'rejected'].includes(v.status) ? daysAgo(v.ago - 2) : null, fulfilledAt: ['paid', 'fulfilled'].includes(v.status) ? daysAgo(v.ago - 5) : null, createdAt: daysAgo(v.ago) }).returning();
  const base = { tenantId: T, planId: wplan!.id, personId, year: 2026, categoryKey: v.categoryKey, requestId: r!.id };
  await db.insert(welfareMovements).values({ ...base, kind: 'reserve', amount: v.amount.toFixed(2), note: `Richiesta ${v.kind}`, createdAt: daysAgo(v.ago) });
  if (['approved', 'paid', 'fulfilled'].includes(v.status)) await db.insert(welfareMovements).values([{ ...base, kind: 'release', amount: v.amount.toFixed(2), note: 'Approvata', createdAt: daysAgo(v.ago - 2) }, { ...base, kind: 'spend', amount: v.amount.toFixed(2), note: `${v.kind} · ${v.categoryKey}`, createdAt: daysAgo(v.ago - 2) }]);
};
await mkReq(luca.id, { kind: 'reimbursement', categoryKey: 'trasporto', amount: 300, attachmentName: 'abbonamento-atm.pdf', expenseDate: '2026-03-02', status: 'paid', reviewNote: 'Ricevuta ok', ago: 150 });
await mkReq(luca.id, { itemId: buono!.id, kind: 'voucher', categoryKey: 'fringe', amount: 100, status: 'fulfilled', voucherCode: 'WB-DEMO-0001', ago: 40 });
await mkReq(sara.id, { kind: 'reimbursement', categoryKey: 'istruzione', amount: 420, beneficiary: 'family', beneficiaryName: 'Giulio (figlio)', attachmentName: 'retta-asilo-settembre.pdf', expenseDate: '2026-09-05', status: 'submitted', note: 'Retta di settembre', ago: 3 });
await mkReq(marco.id, { itemId: buono!.id, kind: 'voucher', categoryKey: 'fringe', amount: 100, status: 'submitted', ago: 1 });
await db.insert(welfareInitiatives).values([
  { tenantId: T, name: 'Sportello di ascolto psicologico', description: 'Colloqui gratuiti e riservati con una psicologa del lavoro, in sede o online.', kind: 'program', capacity: 12, howTo: 'Prenota dal calendario condiviso: la partecipazione non è visibile ai colleghi.' },
  { tenantId: T, name: 'Convenzione asilo nido “Il Girasole”', description: 'Sconto del 15% sulla retta per i figli dei dipendenti.', kind: 'convention', howTo: 'Presenta il badge aziendale in segreteria.' },
  { tenantId: T, name: 'Giornata di volontariato', description: 'Un giorno retribuito all’anno per attività con le associazioni partner.', kind: 'event', capacity: 20, howTo: 'Aderisci qui e scegli la data nel gruppo Teams.' },
]);

// ---- data mart: snapshot degli ultimi 14 giorni (le finestre mobili seguono la data) ----
for (let d = 13; d >= 0; d--) await withTenant(db, T, (tx) => refreshMartForTenant(tx, T, daysAgo(d)));

// sviluppo e carriera (DEV): libreria competenze, job profile Engineering con ruolo successivo, valutazioni, un piano attivo, potenziale
await db.insert(competencies).values(CompetencyPresets.map((c) => ({ tenantId: T, key: c.key, name: c.name, kind: c.kind, description: c.description, levels: c.levels })));
const [seniorDev] = await db.insert(jobProfiles).values({ tenantId: T, title: 'Senior Developer', family: 'Engineering', level: 'Senior', description: 'Guida tecnicamente un’area e fa crescere i colleghi.', expected: [{ competencyKey: 'technical_excellence', level: 3 }, { competencyKey: 'communication', level: 3 }, { competencyKey: 'ownership', level: 3 }, { competencyKey: 'problem_solving', level: 3 }, { competencyKey: 'people_development', level: 2 }] }).returning();
const [devProfile] = await db.insert(jobProfiles).values({ tenantId: T, title: 'Developer', family: 'Engineering', level: 'Mid', description: 'Sviluppa in autonomia con qualità.', expected: [{ competencyKey: 'technical_excellence', level: 2 }, { competencyKey: 'communication', level: 2 }, { competencyKey: 'ownership', level: 2 }, { competencyKey: 'problem_solving', level: 2 }, { competencyKey: 'collaboration', level: 2 }], nextProfileId: seniorDev!.id }).returning();
const [emProfile] = await db.insert(jobProfiles).values({ tenantId: T, title: 'Engineering Manager', family: 'Engineering', level: 'Lead', expected: [{ competencyKey: 'people_development', level: 3 }, { competencyKey: 'communication', level: 3 }, { competencyKey: 'decision_making', level: 3 }, { competencyKey: 'strategic_thinking', level: 2 }, { competencyKey: 'planning', level: 3 }] }).returning();
await db.update(persons).set({ jobProfileId: devProfile!.id }).where(eq(persons.id, luca.id));
await db.update(persons).set({ jobProfileId: seniorDev!.id }).where(eq(persons.id, marco.id));
await db.update(persons).set({ jobProfileId: devProfile!.id }).where(eq(persons.id, sara.id));
await db.update(persons).set({ jobProfileId: emProfile!.id }).where(eq(persons.id, giulia.id));
const assess = (personId: string, source: 'self' | 'manager', by: string, days: number, levels: Record<string, number>) => Object.entries(levels).map(([competencyKey, level]) => ({ tenantId: T, personId, competencyKey, source, level, assessedByPersonId: by, assessedAt: daysAgo(days) }));
await db.insert(competencyAssessments).values([
  ...assess(luca.id, 'self', luca.id, 12, { technical_excellence: 3, communication: 2, ownership: 2, problem_solving: 2, collaboration: 3 }),
  ...assess(luca.id, 'manager', giulia.id, 9, { technical_excellence: 2, communication: 1, ownership: 2, problem_solving: 2, collaboration: 3, people_development: 1 }),
  ...assess(sara.id, 'manager', giulia.id, 20, { technical_excellence: 2, communication: 3, ownership: 2, problem_solving: 1, collaboration: 2 }),
  ...assess(marco.id, 'manager', giulia.id, 20, { technical_excellence: 3, communication: 2, ownership: 3, problem_solving: 3, people_development: 2 }),
]);
const [lucaPlan] = await db.insert(developmentPlans).values({ tenantId: T, personId: luca.id, title: 'Piano di sviluppo 2026 · verso Senior', status: 'active', periodEnd: '2026-12-31', submittedAt: daysAgo(8), approvedAt: daysAgo(7), approvedByPersonId: giulia.id, managerNote: 'Partiamo dalla comunicazione: retro e presentazione al team.' }).returning();
await db.insert(developmentActions).values([
  { tenantId: T, planId: lucaPlan!.id, personId: luca.id, title: 'Presentare al team un progetto concluso', kind: 'experience', competencyKey: 'communication', source: 'gap', dueDate: daysAgo(-20).toISOString().slice(0, 10), createdByPersonId: luca.id },
  { tenantId: T, planId: lucaPlan!.id, personId: luca.id, title: 'Corso di comunicazione efficace', kind: 'training', competencyKey: 'communication', source: 'gap', dueDate: daysAgo(-45).toISOString().slice(0, 10), createdByPersonId: giulia.id },
  { tenantId: T, planId: lucaPlan!.id, personId: luca.id, title: 'Revisioni incrociate con Marco', kind: 'mentoring', competencyKey: 'technical_excellence', source: 'one_on_one', dueDate: daysAgo(3).toISOString().slice(0, 10), createdByPersonId: giulia.id },
  { tenantId: T, planId: lucaPlan!.id, personId: luca.id, title: 'Leggere Extreme Ownership', kind: 'reading', competencyKey: 'ownership', source: 'manual', status: 'done', completedAt: daysAgo(2), evidence: 'Discussi tre principi con Giulia nel 1:1 del 5/9.', createdByPersonId: luca.id },
]);
await db.insert(talentAssessments).values([
  { tenantId: T, personId: luca.id, potential: 3, performance: 3, note: 'Cresce velocemente, prende in carico problemi fuori perimetro.', session: '2026-H2', assessedByPersonId: giulia.id },
  { tenantId: T, personId: marco.id, potential: 2, performance: 3, note: 'Solidissimo tecnicamente; da capire l’interesse verso la guida di persone.', session: '2026-H2', assessedByPersonId: giulia.id },
  { tenantId: T, personId: sara.id, potential: 2, performance: 2, note: 'Ottima collaborazione; lavorare su analisi dei problemi.', session: '2026-H2', assessedByPersonId: giulia.id },
]);

// ---- feedback 360° (F360): una campagna pilota chiusa con report rilasciato a Luca e una in raccolta ----
const F360_KEYS = ['communication', 'ownership', 'collaboration', 'problem_solving', 'people_development'];
const f360Cats = DefaultF360Categories.map((c) => (c.key === 'external' ? { ...c, enabled: true } : c));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const ans = (category: F360ResponseInput['category'], levels: number[], comments: Record<string, string> = {}, openAnswers: Record<string, string> = {}): F360ResponseInput => ({ category, ratings: Object.fromEntries(F360_KEYS.map((k, i) => [k, levels[i] ?? null])), comments, openAnswers });
{
  // pilota chiuso (Q1): Luca soggetto, report generato e rilasciato dopo il debrief
  const [pilot] = await db.insert(f360Campaigns).values({ tenantId: T, createdBy: chiaraUser.id, name: '360° Pilota Q1 2026', description: 'Prima campagna pilota sul team Prodotto.', status: 'closed', competencyKeys: F360_KEYS, scale: DefaultF360Scale, openQuestions: [...DefaultF360OpenQuestions], categories: f360Cats, nominationBy: 'subject', requireApproval: true, releaseRule: 'after_debrief', anonymityThreshold: 3, population: { personIds: [luca.id] }, nominationDueAt: '2026-02-15', collectionDueAt: '2026-03-15', launchedAt: daysAgo(210), collectionStartedAt: daysAgo(195), closedAt: daysAgo(180) }).returning();
  const pilotResponses: F360ResponseInput[] = [
    ans('self', [4, 4, 4, 4, 2], {}, { continue: 'Documentare le scelte tecniche', start: 'Delegare di più' }),
    ans('manager', [3, 4, 4, 4, 2], { communication: 'Chiaro per iscritto, in riunione tende a entrare troppo nel dettaglio.' }, { continue: 'La cura della qualità', stop: 'Prendersi carico di tutto da solo', start: 'Far crescere Marco e Andrea con le revisioni' }),
    ans('peer', [3, 4, 5, 4, 2], { collaboration: 'Sempre disponibile a fare pair.' }, { continue: 'Aiutare sugli incidenti', start: 'Condividere prima le decisioni di design' }),
    ans('peer', [2, 4, 4, 5, 3], { communication: 'Le sue spiegazioni sono dense: servono più esempi.' }, { stop: 'Rispondere in chat a tarda sera' }),
    ans('peer', [3, 3, 4, 4, 2], {}, { start: 'Proporsi come mentor' }),
  ];
  const pilotReport = buildF360Report({ competencyKeys: F360_KEYS, categories: f360Cats, threshold: 3, invited: { self: 1, manager: 1, peer: 3 }, responses: pilotResponses, now: daysAgo(180) });
  const [ps] = await db.insert(f360Subjects).values({ tenantId: T, campaignId: pilot!.id, personId: luca.id, managerPersonId: giulia.id, orgUnitId: prodotto.id, status: 'released', nominationSubmittedAt: daysAgo(205), approvedAt: daysAgo(204), approvedByPersonId: giulia.id, report: pilotReport, reportGeneratedAt: daysAgo(180), debriefAt: daysAgo(175), debriefNote: 'Concordato di lavorare su sintesi e delega; azione nel piano.', releasedAt: daysAgo(175), releasedByPersonId: giulia.id }).returning();
  const pilotReqs = [
    { category: 'self' as const, raterPersonId: luca.id }, { category: 'manager' as const, raterPersonId: giulia.id },
    { category: 'peer' as const, raterPersonId: sara.id }, { category: 'peer' as const, raterPersonId: marco.id }, { category: 'peer' as const, raterPersonId: andrea.id },
  ];
  const inserted = await db.insert(f360Requests).values(pilotReqs.map((r) => ({ tenantId: T, campaignId: pilot!.id, subjectId: ps!.id, category: r.category, raterPersonId: r.raterPersonId, status: 'submitted' as const, nominatedByPersonId: luca.id, invitedAt: daysAgo(195), submittedAt: daysAgo(185) }))).returning();
  await db.insert(f360Responses).values(pilotResponses.map((r, i) => ({ tenantId: T, campaignId: pilot!.id, subjectId: ps!.id, category: r.category, requestId: r.category === 'self' || r.category === 'manager' ? inserted[i]!.id : null, ratings: r.ratings, comments: r.comments, openAnswers: r.openAnswers, submittedAt: daysAgo(185) })));
  await db.insert(competencyAssessments).values(pilotReport.competencies.filter((c) => c.others != null).map((c) => ({ tenantId: T, personId: luca.id, competencyKey: c.competencyKey, source: '360' as const, level: Math.round(c.others!), note: `Media 360° «360° Pilota Q1 2026» su ${c.othersN} risposte`, assessedAt: daysAgo(180) })));

  // campagna in raccolta: Giulia e Luca soggetti
  const [camp] = await db.insert(f360Campaigns).values({ tenantId: T, createdBy: chiaraUser.id, name: '360° Leadership 2026', description: 'Feedback a più fonti per manager e senior del team Prodotto, in preparazione ai piani di sviluppo 2027.', status: 'collection', competencyKeys: F360_KEYS, scale: DefaultF360Scale, openQuestions: [...DefaultF360OpenQuestions], categories: f360Cats, nominationBy: 'subject', requireApproval: true, releaseRule: 'after_debrief', anonymityThreshold: 3, population: { personIds: [giulia.id, luca.id] }, nominationDueAt: iso(daysAgo(8)), collectionDueAt: iso(daysAgo(-12)), launchedAt: daysAgo(15), collectionStartedAt: daysAgo(5) }).returning();
  const subj = async (personId: string, managerId: string) => (await db.insert(f360Subjects).values({ tenantId: T, campaignId: camp!.id, personId, managerPersonId: managerId, orgUnitId: prodotto.id, status: 'collecting', nominationSubmittedAt: daysAgo(9), approvedAt: daysAgo(7), approvedByPersonId: managerId }).returning())[0]!;
  const gS = await subj(giulia.id, ceo.id);
  const lS = await subj(luca.id, giulia.id);
  const req = async (subjectId: string, category: 'self' | 'manager' | 'peer' | 'report' | 'other' | 'external', rater: P | null, nominatedBy: string, submitted: boolean, external?: { email: string; name: string }) =>
    (await db.insert(f360Requests).values({ tenantId: T, campaignId: camp!.id, subjectId, category, raterPersonId: rater?.id ?? null, externalEmail: external?.email ?? null, externalName: external?.name ?? null, status: submitted ? 'submitted' : 'pending', nominatedByPersonId: nominatedBy, invitedAt: daysAgo(5), submittedAt: submitted ? daysAgo(2) : null, expiresAt: daysAgo(-12) }).returning())[0]!;
  const resp = async (subjectId: string, r: F360ResponseInput, requestId: string | null) => db.insert(f360Responses).values({ tenantId: T, campaignId: camp!.id, subjectId, category: r.category, requestId, ratings: r.ratings, comments: r.comments, openAnswers: r.openAnswers, submittedAt: daysAgo(2) });
  // Giulia: self e manager inviati, 3 riporti su 4 hanno risposto, 1 pari in attesa
  const gSelf = await req(gS.id, 'self', giulia, giulia.id, true);
  const gMgr = await req(gS.id, 'manager', ceo, giulia.id, true);
  await resp(gS.id, ans('self', [4, 4, 4, 3, 4], {}, { continue: 'Proteggere il team dalle urgenze' }), gSelf.id);
  await resp(gS.id, ans('manager', [4, 5, 4, 4, 4], { people_development: 'Ha fatto crescere Luca e Marco in modo evidente.' }, { start: 'Delegare la relazione con Vendite' }), gMgr.id);
  for (const [p, done] of [[luca, true], [sara, true], [marco, true], [andrea, false]] as const) await req(gS.id, 'report', p, giulia.id, done);
  await req(gS.id, 'peer', paolo, giulia.id, false);
  await resp(gS.id, ans('report', [4, 4, 5, 4, 5], { people_development: 'Trova sempre il tempo per un confronto.' }, { continue: 'I 1:1 regolari', start: 'Dire di no più spesso alle richieste esterne' }), null);
  await resp(gS.id, ans('report', [3, 4, 4, 4, 4], { communication: 'Le priorità cambiano e non sempre arrivano a tutti.' }, { stop: 'Cambiare priorità a metà sprint' }), null);
  await resp(gS.id, ans('report', [4, 5, 4, 3, 4], {}, { continue: 'Fidarsi del team' }), null);
  // Luca: self in attesa (da compilare), manager inviato, 2 pari su 3 hanno risposto, 1 esterno in attesa
  await req(lS.id, 'self', luca, luca.id, false);
  const lMgr = await req(lS.id, 'manager', giulia, luca.id, true);
  await resp(lS.id, ans('manager', [3, 4, 4, 4, 3], { communication: 'Molto migliorato nella sintesi rispetto al pilota.' }, { continue: 'Le revisioni incrociate con Marco' }), lMgr.id);
  for (const [p, done] of [[sara, true], [marco, true], [andrea, false]] as const) await req(lS.id, 'peer', p, luca.id, done);
  await req(lS.id, 'external', null, luca.id, false, { email: 'elena.cliente@partner.test', name: 'Elena Cliente' });
  await resp(lS.id, ans('peer', [4, 4, 5, 4, 3], {}, { start: 'Fare da mentor ai nuovi' }), null);
  await resp(lS.id, ans('peer', [3, 4, 4, 5, 3], { collaboration: 'Primo ad aiutare sugli incidenti.' }, {}), null);
}

// ---- onboarding (ONB): template predefiniti e percorso di Elena (ingresso 2026-08-01) ----
{
  const tpls = await db.insert(onboardingTemplates).values(OnboardingPresets.map((t) => ({ tenantId: T, createdBy: chiaraUser.id, name: t.name, kind: t.kind, description: t.description ?? null, phases: t.phases, tasks: t.tasks, rules: t.rules ?? {}, isDefault: !!t.isDefault }))).returning();
  // template con fase di pre-boarding (ONB-011) e una persona in arrivo senza account: l'HR avvia il percorso da «Onboarding → Persone»
  // e la persona riceve il magic link (email in Mailpit) per contratto, welcome pack e scheda anagrafica prima del primo giorno.
  const [preForm] = await db.insert(formDefinitions).values({ tenantId: T, key: 'onb_scheda_anagrafica', name: 'Scheda anagrafica', kind: 'app', status: 'published', publishedAt: new Date(), schema: { title: 'Scheda anagrafica', scoring: { enabled: false }, sections: [{ key: 'dati', title: 'I tuoi dati', fields: [{ key: 'phone', type: 'short_text', label: 'Telefono personale', required: true }, { key: 'address', type: 'long_text', label: 'Indirizzo di residenza', required: true }, { key: 'shirt', type: 'single_choice', label: 'Taglia felpa', options: [{ value: 's', label: 'S' }, { value: 'm', label: 'M' }, { value: 'l', label: 'L' }] }, { key: 'bio', type: 'long_text', label: 'Due righe su di te per il team' }] }] } }).returning();
  void preForm;
  await db.insert(onboardingTemplates).values({ tenantId: T, createdBy: chiaraUser.id, name: 'Onboarding Vendite (con pre-boarding)', kind: 'onboarding', description: 'Contratto, welcome pack e scheda anagrafica prima dell’ingresso; prima settimana con manager e buddy.', rules: { jobTitleKeywords: ['sales', 'account'] }, isDefault: false,
    phases: [{ key: 'pre', label: 'Pre-boarding', fromDay: -14, toDay: -1 }, { key: 'w1', label: 'Settimana 1', fromDay: 0, toDay: 7 }, { key: 'm1', label: 'Primo mese', fromDay: 8, toDay: 30 }],
    tasks: [
      { key: 'contract', phase: 'pre', title: 'Firma il contratto', description: 'Leggi il contratto ricevuto via email e conferma la presa visione.', role: 'newcomer', kind: 'sign', dueDay: -7, required: true },
      { key: 'welcome_pack', phase: 'pre', title: 'Leggi il welcome pack', role: 'newcomer', kind: 'read', dueDay: -3, link: 'https://example.com/welcome', required: false },
      { key: 'personal_data', phase: 'pre', title: 'Scheda anagrafica', role: 'newcomer', kind: 'form', dueDay: -2, formKey: 'onb_scheda_anagrafica', required: true },
      { key: 'badge', phase: 'pre', title: 'Prepara badge e postazione', role: 'hr', kind: 'todo', dueDay: -1, required: true },
      { key: 'laptop', phase: 'pre', title: 'Consegna il laptop', role: 'it', kind: 'todo', dueDay: -1, required: true },
      { key: 'welcome', phase: 'w1', title: 'Primo 1:1 con il manager', role: 'manager', kind: 'meeting', dueDay: 1, link: '/one-on-ones', required: true },
      { key: 'coffee', phase: 'w1', title: 'Caffè con il buddy', role: 'buddy', kind: 'meeting', dueDay: 2, required: false },
      { key: 'crm', phase: 'w1', title: 'Formazione CRM', role: 'newcomer', kind: 'todo', dueDay: 5, required: true },
      { key: 'survey_d7', phase: 'w1', title: 'Come è andata la prima settimana', role: 'newcomer', kind: 'survey', dueDay: 7, surveyKey: 'd7', required: true },
      { key: 'objectives', phase: 'm1', title: 'Obiettivi dei primi 90 giorni', role: 'newcomer', kind: 'objective', dueDay: 20, required: true },
      { key: 'survey_d30', phase: 'm1', title: 'Primo mese', role: 'newcomer', kind: 'survey', dueDay: 30, surveyKey: 'd30', required: true },
    ] });
  await person('Nadia', 'Esposito', 'nadia.esposito@example.com', 'Account Executive', vendite.id, paolo.id, daysAgo(-12).toISOString().slice(0, 10));
  const generic = tpls.find((t) => t.name === 'Onboarding generico')!;
  const anchor = '2026-08-01';
  const [j] = await db.insert(onboardingJourneys).values({ tenantId: T, createdBy: chiaraUser.id, templateId: generic.id, personId: elena.id, kind: 'onboarding', managerPersonId: giulia.id, buddyPersonId: sara.id, hrPersonId: chiara.id, anchorDate: anchor, templateName: generic.name, phases: generic.phases, startedAt: daysAgo(50), milestones: [25, 50] }).returning();
  const ctx = { personId: elena.id, managerId: giulia.id, buddyId: sara.id, hrId: chiara.id, itId: null };
  const doneKeys = new Set(['welcome_mail', 'it_setup', 'buddy_assign', 'plan_week1', 'read_handbook', 'sign_policies', 'first_one_on_one', 'buddy_meet', 'team_intro', 'survey_d7', 'objectives', 'checkin_30', 'survey_d30']);
  const defs = generic.tasks as typeof OnboardingPresets[number]['tasks'];
  await db.insert(onboardingTasks).values(defs.map((x) => {
    const due = dueDateFrom(anchor, x.dueDay);
    const done = doneKeys.has(x.key);
    return { tenantId: T, journeyId: j!.id, personId: elena.id, key: x.key, phase: x.phase, title: x.title, description: x.description ?? null, role: x.role, kind: x.kind, assigneePersonId: resolveAssignee(x, ctx), dueDate: due, link: x.link ?? null, formKey: x.formKey ?? null, surveyKey: x.surveyKey ?? null, required: x.required, status: done ? ('done' as const) : ('open' as const), completedAt: done ? new Date(`${due}T10:00:00Z`) : null, completedByPersonId: done ? resolveAssignee(x, ctx) : null, note: x.kind === 'sign' && done ? 'Presa visione confermata il 2026-08-05' : null };
  }));
  const d7 = { welcome: 5, tools: 3, clarity: 4, support: 5 };
  const d30 = { role: 4, manager: 5, objectives: 2, belonging: 4 };
  await db.insert(onboardingSurveyResponses).values([
    { tenantId: T, createdBy: chiaraUser.id, journeyId: j!.id, personId: elena.id, surveyKey: 'd7', answers: d7, comment: 'Accoglienza ottima; il laptop è arrivato il secondo giorno.', score: onboardingSurveyScore('d7', d7).score!.toFixed(2), low: onboardingSurveyScore('d7', d7).low, submittedAt: new Date('2026-08-08T09:00:00Z') },
    { tenantId: T, createdBy: chiaraUser.id, journeyId: j!.id, personId: elena.id, surveyKey: 'd30', answers: d30, comment: 'Gli obiettivi del trimestre non sono ancora chiarissimi.', score: onboardingSurveyScore('d30', d30).score!.toFixed(2), low: onboardingSurveyScore('d30', d30).low, submittedAt: new Date('2026-09-01T09:00:00Z') },
  ]);
}

// ---- app studio (APP): template installati e pubblicati; una richiesta di formazione di Luca in approvazione ----
{
  for (const t of AppTemplates) {
    for (const f of t.forms) {
      const [exists] = await db.select({ id: formDefinitions.id }).from(formDefinitions).where(and(eq(formDefinitions.tenantId, T), eq(formDefinitions.key, f.key)));
      if (!exists) await db.insert(formDefinitions).values({ tenantId: T, createdBy: chiaraUser.id, key: f.key, name: f.name, kind: 'app', version: 1, status: 'published', schema: f.schema, publishedAt: daysAgo(30) });
    }
    await db.insert(apps).values({ tenantId: T, createdBy: chiaraUser.id, key: t.app.key, name: t.app.name, version: 1, status: 'published', definition: t.app, templateKey: t.key, publishedAt: daysAgo(30) });
  }
  const training = AppTemplates.find((t) => t.key === 'training_request')!;
  const [trainingApp] = await db.select().from(apps).where(and(eq(apps.tenantId, T), eq(apps.key, 'training_request')));
  const [form] = await db.select().from(formDefinitions).where(and(eq(formDefinitions.tenantId, T), eq(formDefinitions.key, 'app_training_request')));
  const answers = { course: 'Certified Kubernetes Administrator', provider: 'Linux Foundation', cost: 595, why: 'Gestisco il cluster di produzione e voglio ridurre gli incidenti di deploy; la certificazione copre networking e troubleshooting.', competency: 'technical' };
  const [inst] = await db.insert(appInstances).values({ tenantId: T, createdBy: chiaraUser.id, appId: trainingApp!.id, appKey: 'training_request', appVersion: 1, definition: training.app, subjectPersonId: luca.id, launcherPersonId: luca.id, actors: { subject: luca.id, manager: giulia.id, manager_of_manager: ceo.id, launcher: luca.id, hr: chiara.id }, currentStages: ['manager_ok'], title: 'CKA 2026', startedAt: daysAgo(4) }).returning();
  const [resp] = await db.insert(formResponses).values({ tenantId: T, createdBy: chiaraUser.id, formDefinitionId: form!.id, formKey: form!.key, formVersion: 1, respondentPersonId: luca.id, subjectPersonId: luca.id, contextType: 'app_stage', contextId: null, status: 'submitted', answers, submittedAt: daysAgo(3) }).returning();
  const [reqRun] = await db.insert(appStageRuns).values({ tenantId: T, instanceId: inst!.id, stageKey: 'request', attempt: 1, type: 'form', status: 'done', actorPersonId: luca.id, formResponseId: resp!.id, outcome: 'submitted', answers, dueDate: daysAgo(-3).toISOString().slice(0, 10), activatedAt: daysAgo(4), completedAt: daysAgo(3), completedByPersonId: luca.id }).returning();
  await db.update(formResponses).set({ contextId: reqRun!.id }).where(eq(formResponses.id, resp!.id));
  await db.insert(appStageRuns).values([
    { tenantId: T, instanceId: inst!.id, stageKey: 'manager_ok', attempt: 1, type: 'approval', status: 'active', actorPersonId: giulia.id, dueDate: daysAgo(-2).toISOString().slice(0, 10), activatedAt: daysAgo(3) },
    { tenantId: T, instanceId: inst!.id, stageKey: 'hr_ok', attempt: 1, type: 'approval', status: 'pending' },
    { tenantId: T, instanceId: inst!.id, stageKey: 'done', attempt: 1, type: 'notify', status: 'pending' },
  ]);
  await db.insert(appInstanceEvents).values([
    { tenantId: T, instanceId: inst!.id, at: daysAgo(4), actorPersonId: luca.id, type: 'launched', data: { subject: 'Luca Bianchi', app: 'Richiesta formazione' } },
    { tenantId: T, instanceId: inst!.id, at: daysAgo(4), actorPersonId: luca.id, type: 'stage_activated', stageKey: 'request', data: {} },
    { tenantId: T, instanceId: inst!.id, at: daysAgo(3), actorPersonId: luca.id, type: 'submitted', stageKey: 'request', data: { formKey: 'app_training_request' } },
    { tenantId: T, instanceId: inst!.id, at: daysAgo(3), actorPersonId: luca.id, type: 'stage_activated', stageKey: 'manager_ok', data: { actorPersonId: giulia.id } },
  ]);
}

// report salvati (ANA-050): uno condiviso con i manager e inviato ogni lunedì, uno personale dell'HR
await db.insert(savedReports).values([
  { tenantId: T, ownerUserId: chiaraUser.id, name: 'Copertura obiettivi e 1:1 per unità', folder: 'Settimanali', description: 'Quante persone hanno obiettivi e un 1:1 recente, con la variazione rispetto a 30 giorni fa', definition: { metrics: ['headcount', 'people_with_objectives_share', 'objective_progress_avg', 'one_on_one_coverage_30d', 'feedback_per_person_30d'], dimension: 'org_unit', filters: {}, compareDays: 30, visualization: 'bars' }, sharing: { roles: ['manager'], userIds: [] }, schedule: { frequency: 'weekly', weekday: 1, hour: 7, recipients: 'shared' }, nextRunAt: new Date(Date.now() + 3 * 86400000) },
  { tenantId: T, ownerUserId: chiaraUser.id, name: 'Andamento copertura 1:1', folder: 'Settimanali', definition: { metrics: ['one_on_one_coverage_30d', 'headcount'], dimension: 'manager', filters: {}, compareDays: 7, visualization: 'trend', trendMetric: 'one_on_one_coverage_30d', trendDays: 14 }, sharing: { roles: [], userIds: [] }, schedule: null },
]);
console.log(`Seed completato. Tenant "${SLUG}". Login dev: POST /api/v1/auth/dev-login { tenantSlug: "acme", email: "giulia.ferri@acme.test" }`);
console.log('Password demo per tutti: Password!2026');
// operatore della console di piattaforma (ADR-0013)
await db.delete(platformUsers);
await db.insert(platformUsers).values({ email: 'ops@workingbetter.local', firstName: 'Ops', lastName: 'Piattaforma', passwordHash: DEMO_PASSWORD_HASH, mustChangePassword: 0 });
console.log('Console di piattaforma (porta 8443): ops@workingbetter.local / Password!2026');
console.log('Utenti: anna.colombo (tenant_admin), chiara.moretti (hr_admin), giulia.ferri / paolo.neri (manager), luca.bianchi, sara.ricci, marco.conti, elena.parisi, andrea.russo (employee)');
console.log('Pre-boarding demo: Nadia Esposito (senza account, ingresso tra 12 giorni) → Onboarding → Persone → Avvia con «Onboarding Vendite (con pre-boarding)»; il magic link arriva via email (Mailpit).');
await close();
