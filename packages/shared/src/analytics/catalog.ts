/**
 * Semantic layer v1 (ADR-0006, ANA-040/043/090): catalogo dichiarativo delle metriche.
 * Le metriche sono definite UNA volta qui e riusate da dashboard, report, export e API:
 * nessuna schermata calcola una metrica "a modo suo".
 *
 * Modello: il data mart contiene FATTI giornalieri a grana persona (`mart_person_facts`);
 * una metrica è la somma di un fatto oppure il rapporto tra le somme di due fatti.
 */

/** Fatti calcolati per persona a ogni snapshot (valore numerico; assente = 0). */
export const FactKeys = [
  // core
  'headcount',
  'has_manager',
  'no_manager',
  'new_hire_90d',
  // obiettivi
  'has_objectives',
  'no_objectives',
  'objectives_active',
  'objectives_progress_sum',
  'objectives_at_risk',
  'krs_active',
  'krs_stale',
  // 1:1
  'one_on_ones_done_30d',
  'has_one_on_one_30d',
  'no_one_on_one_30d',
  'actions_open',
  'actions_overdue',
  // feedback
  'feedback_given_30d',
  'feedback_received_30d',
  'recognitions_given_30d',
  'recognitions_received_30d',
  // review (con dimensione ciclo)
  'reviews',
  'reviews_self_submitted',
  'reviews_manager_submitted',
  'reviews_completed',
  'reviews_signed',
  'reviews_disagreed',
  'reviews_overdue',
  'reviews_rated',
  'review_rating_sum',
  // form
  'form_responses_overdue',
  // survey (ultimi 90 giorni)
  'survey_invited_90d',
  'survey_responded_90d',
  // welfare (anno corrente)
  'welfare_credited_year',
  'welfare_spent_year',
  'welfare_has_request_year',
  'welfare_in_plan',
  // sviluppo (DEV)
  'dev_has_profile',
  'dev_has_plan',
  'dev_actions_open',
  'dev_actions_overdue',
] as const;
export type FactKey = (typeof FactKeys)[number];

export const Dimensions = ['org_unit', 'manager', 'person', 'cycle'] as const;
export type Dimension = (typeof Dimensions)[number];
export const DimensionLabels: Record<Dimension, string> = { org_unit: 'Unità organizzativa', manager: 'Manager', person: 'Persona', cycle: 'Ciclo di review' };

export type MetricModule = 'core' | 'okr' | 'one' | 'fbk' | 'rev' | 'app' | 'eng' | 'wel' | 'dev';
export const ModuleLabels: Record<MetricModule, string> = { core: 'Persone', okr: 'Obiettivi', one: '1:1', fbk: 'Feedback', rev: 'Review', app: 'Form', eng: 'Survey', wel: 'Welfare', dev: 'Sviluppo' };

export type MetricFormat = 'count' | 'percent' | 'avg' | 'score';
export type MetricCalc = { type: 'sum'; fact: FactKey } | { type: 'ratio'; num: FactKey; den: FactKey };

export interface MetricDef {
  key: string;
  name: string;
  /** definizione leggibile per il data dictionary (ANA-043) */
  description: string;
  /** formula in linguaggio naturale */
  formula: string;
  module: MetricModule;
  format: MetricFormat;
  calc: MetricCalc;
  /** dimensioni ammesse oltre al totale e alla data */
  dimensions: readonly Dimension[];
  /** il manager la vede per il proprio team (riporti diretti) */
  teamVisible: boolean;
  /** dato sensibile: mai a grana persona, soglia più alta (ANA-091) */
  sensitive: boolean;
  /** dimensione minima del gruppo (persone, o denominatore per i rapporti) sotto cui il valore è soppresso (ANA-090) */
  minGroupSize: number;
}

const ORG: readonly Dimension[] = ['org_unit', 'manager'];
const ORG_PERSON: readonly Dimension[] = ['org_unit', 'manager', 'person'];
const REV: readonly Dimension[] = ['org_unit', 'manager', 'cycle'];
const REV_PERSON: readonly Dimension[] = ['org_unit', 'manager', 'cycle', 'person'];

/** Soglie di default: 3 per aggregati operativi, 5 per dati sensibili, 0 per conteggi di "cose da fare". */
export const DEFAULT_MIN_GROUP = 3;
export const SENSITIVE_MIN_GROUP = 5;

const sum = (fact: FactKey): MetricCalc => ({ type: 'sum', fact });
const ratio = (num: FactKey, den: FactKey): MetricCalc => ({ type: 'ratio', num, den });

export const MetricCatalog: readonly MetricDef[] = [
  // ---- persone ----
  { key: 'headcount', name: 'Persone attive', description: 'Numero di persone con stato attivo o in uscita alla data dello snapshot.', formula: 'conteggio persone attive', module: 'core', format: 'count', calc: sum('headcount'), dimensions: ORG, teamVisible: true, sensitive: false, minGroupSize: 0 },
  { key: 'people_without_manager', name: 'Persone senza manager', description: 'Persone attive che non hanno un manager assegnato: restano fuori da 1:1, review e roll-up.', formula: 'conteggio persone con manager mancante', module: 'core', format: 'count', calc: sum('no_manager'), dimensions: ORG, teamVisible: false, sensitive: false, minGroupSize: 0 },
  { key: 'new_hires_90d', name: 'Nuovi ingressi (90 gg)', description: 'Persone con data di assunzione negli ultimi 90 giorni.', formula: 'conteggio persone con hire_date ≥ data − 90 gg', module: 'core', format: 'count', calc: sum('new_hire_90d'), dimensions: ORG, teamVisible: true, sensitive: false, minGroupSize: 0 },
  // ---- obiettivi ----
  { key: 'objectives_active', name: 'Obiettivi attivi', description: 'Obiettivi in stato attivo nei periodi in corso, contati sul proprietario.', formula: 'somma obiettivi attivi per persona', module: 'okr', format: 'count', calc: sum('objectives_active'), dimensions: ORG_PERSON, teamVisible: true, sensitive: false, minGroupSize: 0 },
  { key: 'people_with_objectives_share', name: '% persone con obiettivi', description: 'Quota di persone attive che possiedono almeno un obiettivo attivo nel periodo in corso.', formula: 'persone con ≥1 obiettivo attivo ÷ persone attive', module: 'okr', format: 'percent', calc: ratio('has_objectives', 'headcount'), dimensions: ORG, teamVisible: true, sensitive: false, minGroupSize: DEFAULT_MIN_GROUP },
  { key: 'people_without_objectives', name: 'Persone senza obiettivi', description: 'Persone attive senza alcun obiettivo attivo nel periodo in corso.', formula: 'conteggio persone senza obiettivi attivi', module: 'okr', format: 'count', calc: sum('no_objectives'), dimensions: ORG, teamVisible: true, sensitive: false, minGroupSize: 0 },
  { key: 'objective_progress_avg', name: 'Progresso medio obiettivi', description: 'Media del progresso (0–100%) degli obiettivi attivi.', formula: 'somma progressi ÷ obiettivi attivi', module: 'okr', format: 'percent', calc: ratio('objectives_progress_sum', 'objectives_active'), dimensions: ORG_PERSON, teamVisible: true, sensitive: false, minGroupSize: DEFAULT_MIN_GROUP },
  { key: 'objectives_at_risk_share', name: '% obiettivi a rischio', description: 'Quota di obiettivi attivi con confidenza "a rischio" o "off track".', formula: 'obiettivi a rischio o off track ÷ obiettivi attivi', module: 'okr', format: 'percent', calc: ratio('objectives_at_risk', 'objectives_active'), dimensions: ORG, teamVisible: true, sensitive: false, minGroupSize: DEFAULT_MIN_GROUP },
  { key: 'objectives_at_risk', name: 'Obiettivi a rischio', description: 'Obiettivi attivi con confidenza "a rischio" o "off track".', formula: 'conteggio obiettivi a rischio', module: 'okr', format: 'count', calc: sum('objectives_at_risk'), dimensions: ORG_PERSON, teamVisible: true, sensitive: false, minGroupSize: 0 },
  { key: 'kr_stale_share', name: '% KR senza check-in', description: 'Quota di key result attivi senza check-in oltre la cadenza prevista dal periodo.', formula: 'KR senza check-in oltre cadenza ÷ KR attivi', module: 'okr', format: 'percent', calc: ratio('krs_stale', 'krs_active'), dimensions: ORG, teamVisible: true, sensitive: false, minGroupSize: DEFAULT_MIN_GROUP },
  // ---- 1:1 ----
  { key: 'one_on_one_coverage_30d', name: 'Copertura 1:1 (30 gg)', description: 'Quota di persone con manager che hanno avuto almeno un 1:1 concluso con il proprio manager negli ultimi 30 giorni.', formula: 'persone con 1:1 concluso con il manager negli ultimi 30 gg ÷ persone con manager', module: 'one', format: 'percent', calc: ratio('has_one_on_one_30d', 'has_manager'), dimensions: ORG, teamVisible: true, sensitive: false, minGroupSize: DEFAULT_MIN_GROUP },
  { key: 'people_without_one_on_one_30d', name: 'Persone senza 1:1 (30 gg)', description: 'Persone con manager senza alcun 1:1 concluso con il manager negli ultimi 30 giorni.', formula: 'conteggio persone con manager e nessun 1:1 concluso in 30 gg', module: 'one', format: 'count', calc: sum('no_one_on_one_30d'), dimensions: ORG, teamVisible: true, sensitive: false, minGroupSize: 0 },
  { key: 'one_on_ones_done_30d', name: '1:1 conclusi (30 gg)', description: 'Incontri 1:1 conclusi negli ultimi 30 giorni, contati su ciascun partecipante.', formula: 'somma incontri conclusi per partecipante', module: 'one', format: 'count', calc: sum('one_on_ones_done_30d'), dimensions: ORG_PERSON, teamVisible: true, sensitive: false, minGroupSize: 0 },
  { key: 'actions_overdue', name: 'Azioni scadute', description: 'Action item aperti con data di scadenza superata.', formula: 'conteggio action item aperti con scadenza < data', module: 'one', format: 'count', calc: sum('actions_overdue'), dimensions: ORG_PERSON, teamVisible: true, sensitive: false, minGroupSize: 0 },
  // ---- feedback ----
  { key: 'feedback_given_30d', name: 'Feedback dati (30 gg)', description: 'Feedback inviati negli ultimi 30 giorni.', formula: 'somma feedback per autore', module: 'fbk', format: 'count', calc: sum('feedback_given_30d'), dimensions: ORG_PERSON, teamVisible: true, sensitive: false, minGroupSize: 0 },
  { key: 'feedback_received_30d', name: 'Feedback ricevuti (30 gg)', description: 'Feedback ricevuti negli ultimi 30 giorni.', formula: 'somma feedback per destinatario', module: 'fbk', format: 'count', calc: sum('feedback_received_30d'), dimensions: ORG, teamVisible: true, sensitive: false, minGroupSize: DEFAULT_MIN_GROUP },
  { key: 'feedback_per_person_30d', name: 'Feedback per persona (30 gg)', description: 'Media dei feedback ricevuti per persona attiva negli ultimi 30 giorni.', formula: 'feedback ricevuti ÷ persone attive', module: 'fbk', format: 'avg', calc: ratio('feedback_received_30d', 'headcount'), dimensions: ORG, teamVisible: true, sensitive: false, minGroupSize: DEFAULT_MIN_GROUP },
  { key: 'recognitions_given_30d', name: 'Riconoscimenti dati (30 gg)', description: 'Riconoscimenti pubblici inviati negli ultimi 30 giorni.', formula: 'somma riconoscimenti per autore', module: 'fbk', format: 'count', calc: sum('recognitions_given_30d'), dimensions: ORG_PERSON, teamVisible: true, sensitive: false, minGroupSize: 0 },
  { key: 'recognitions_received_30d', name: 'Riconoscimenti ricevuti (30 gg)', description: 'Riconoscimenti pubblici ricevuti negli ultimi 30 giorni.', formula: 'somma riconoscimenti per destinatario', module: 'fbk', format: 'count', calc: sum('recognitions_received_30d'), dimensions: ORG_PERSON, teamVisible: true, sensitive: false, minGroupSize: 0 },
  // ---- review ----
  { key: 'review_completion', name: 'Completamento review', description: 'Quota di review condivise con il collaboratore (o firmate/chiuse) sul totale delle review dei cicli lanciati.', formula: 'review condivise, firmate o chiuse ÷ review', module: 'rev', format: 'percent', calc: ratio('reviews_completed', 'reviews'), dimensions: REV, teamVisible: true, sensitive: false, minGroupSize: 0 },
  { key: 'review_self_completion', name: 'Self-review inviate', description: 'Quota di self-review inviate sul totale delle review.', formula: 'self-review inviate ÷ review', module: 'rev', format: 'percent', calc: ratio('reviews_self_submitted', 'reviews'), dimensions: REV, teamVisible: true, sensitive: false, minGroupSize: 0 },
  { key: 'review_manager_completion', name: 'Manager review inviate', description: 'Quota di manager review inviate sul totale delle review.', formula: 'manager review inviate ÷ review', module: 'rev', format: 'percent', calc: ratio('reviews_manager_submitted', 'reviews'), dimensions: REV, teamVisible: true, sensitive: false, minGroupSize: 0 },
  { key: 'reviews_overdue', name: 'Review in ritardo', description: 'Review con una fase (self o manager) oltre la scadenza del ciclo.', formula: 'conteggio review con fase scaduta', module: 'rev', format: 'count', calc: sum('reviews_overdue'), dimensions: REV_PERSON, teamVisible: true, sensitive: false, minGroupSize: 0 },
  { key: 'review_rating_avg', name: 'Rating medio review', description: 'Media del rating finale delle review condivise, sulla scala del template. Mai a livello persona; gruppi con meno di 5 review valutate sono soppressi.', formula: 'somma rating finali ÷ review con rating', module: 'rev', format: 'score', calc: ratio('review_rating_sum', 'reviews_rated'), dimensions: REV, teamVisible: false, sensitive: true, minGroupSize: SENSITIVE_MIN_GROUP },
  { key: 'review_disagreement_share', name: '% firme in dissenso', description: 'Quota di review firmate in cui il collaboratore ha dichiarato di non concordare. Gruppi con meno di 5 firme sono soppressi.', formula: 'firme in dissenso ÷ review firmate', module: 'rev', format: 'percent', calc: ratio('reviews_disagreed', 'reviews_signed'), dimensions: REV, teamVisible: false, sensitive: true, minGroupSize: SENSITIVE_MIN_GROUP },
  // ---- survey ----
  { key: 'survey_response_rate_90d', name: 'Tasso di risposta survey (90 gg)', description: 'Quota di inviti alle survey degli ultimi 90 giorni che hanno ricevuto una risposta. Non dice chi ha risposto: solo il conteggio per gruppo.', formula: 'inviti con risposta ÷ inviti (survey lanciate negli ultimi 90 gg)', module: 'eng', format: 'percent', calc: ratio('survey_responded_90d', 'survey_invited_90d'), dimensions: ORG, teamVisible: false, sensitive: false, minGroupSize: SENSITIVE_MIN_GROUP },
  // ---- welfare (aggregati, mai a grana persona) ----
  { key: 'welfare_take_up', name: 'Take-up welfare', description: 'Quota di persone incluse in un piano welfare dell’anno che hanno fatto almeno una richiesta. Aggregata, soglia 5 persone.', formula: 'persone con ≥1 richiesta nell’anno ÷ persone in un piano', module: 'wel', format: 'percent', calc: ratio('welfare_has_request_year', 'welfare_in_plan'), dimensions: ORG, teamVisible: false, sensitive: false, minGroupSize: SENSITIVE_MIN_GROUP },
  { key: 'welfare_budget_used', name: 'Budget welfare utilizzato', description: 'Quota del credito welfare accreditato nell’anno che è stata spesa. Aggregata, soglia 5 persone.', formula: 'speso nell’anno ÷ accreditato nell’anno', module: 'wel', format: 'percent', calc: ratio('welfare_spent_year', 'welfare_credited_year'), dimensions: ORG, teamVisible: false, sensitive: false, minGroupSize: SENSITIVE_MIN_GROUP },
  { key: 'dev_profile_coverage', name: 'Persone con profilo di ruolo', description: 'Quota di persone attive a cui è assegnato un job profile (competenze attese).', formula: 'persone con profilo ÷ persone attive', module: 'dev', format: 'percent', calc: ratio('dev_has_profile', 'headcount'), dimensions: ORG, teamVisible: true, sensitive: false, minGroupSize: 0 },
  { key: 'dev_plan_coverage', name: 'Persone con piano di sviluppo', description: 'Quota di persone attive con un piano di sviluppo individuale attivo o in approvazione.', formula: 'persone con IDP attivo ÷ persone attive', module: 'dev', format: 'percent', calc: ratio('dev_has_plan', 'headcount'), dimensions: ORG, teamVisible: true, sensitive: false, minGroupSize: 0 },
  { key: 'dev_actions_overdue', name: 'Azioni di sviluppo scadute', description: 'Azioni dei piani di sviluppo aperte oltre la scadenza.', formula: 'conteggio azioni IDP scadute', module: 'dev', format: 'count', calc: sum('dev_actions_overdue'), dimensions: ORG_PERSON, teamVisible: true, sensitive: false, minGroupSize: 0 },
  // ---- form ----
  { key: 'form_responses_overdue', name: 'Compilazioni in ritardo', description: 'Compilazioni di form assegnate, ancora in bozza, con scadenza superata.', formula: 'conteggio compilazioni in bozza con scadenza < data', module: 'app', format: 'count', calc: sum('form_responses_overdue'), dimensions: ORG_PERSON, teamVisible: true, sensitive: false, minGroupSize: 0 },
];

const byKey = new Map(MetricCatalog.map((m) => [m.key, m]));
export const getMetric = (key: string): MetricDef | undefined => byKey.get(key);
export const metricsForModule = (m: MetricModule) => MetricCatalog.filter((x) => x.module === m);

/** Fatti necessari per calcolare le metriche indicate. */
export function factsFor(metrics: readonly MetricDef[]): FactKey[] {
  const out = new Set<FactKey>();
  for (const m of metrics) {
    if (m.calc.type === 'sum') out.add(m.calc.fact);
    else {
      out.add(m.calc.num);
      out.add(m.calc.den);
    }
  }
  return [...out];
}

/** Controlli di coerenza del catalogo (eseguiti nei test e all'avvio dell'API). */
export function validateCatalog(catalog: readonly MetricDef[] = MetricCatalog): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const m of catalog) {
    if (!/^[a-z][a-z0-9_]*$/.test(m.key)) errors.push(`${m.key}: chiave non valida`);
    if (seen.has(m.key)) errors.push(`${m.key}: chiave duplicata`);
    seen.add(m.key);
    for (const f of factsFor([m])) if (!FactKeys.includes(f)) errors.push(`${m.key}: fatto sconosciuto ${f}`);
    if (m.sensitive && m.minGroupSize < SENSITIVE_MIN_GROUP) errors.push(`${m.key}: metrica sensibile con soglia < ${SENSITIVE_MIN_GROUP}`);
    if (m.sensitive && m.dimensions.includes('person')) errors.push(`${m.key}: metrica sensibile esposta a grana persona`);
    if (m.calc.type === 'ratio' && m.format === 'count') errors.push(`${m.key}: un rapporto non può avere formato count`);
    if (m.calc.type === 'sum' && m.format !== 'count') errors.push(`${m.key}: una somma deve avere formato count`);
    if (!m.description || !m.formula) errors.push(`${m.key}: descrizione o formula mancante`);
  }
  return errors;
}
