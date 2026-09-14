import type { OnboardingPhase, OnboardingSurveyKey, OnboardingTaskDef, OnboardingTemplateDef } from './types.js';

/** Fasi standard (ONB-001): pre-boarding, settimana 1, mese 1, 60 e 90 giorni. */
export const StandardPhases: readonly OnboardingPhase[] = [
  { key: 'pre', label: 'Pre-boarding', fromDay: -30, toDay: -1 },
  { key: 'w1', label: 'Settimana 1', fromDay: 0, toDay: 7 },
  { key: 'm1', label: 'Mese 1', fromDay: 8, toDay: 30 },
  { key: 'd60', label: '60 giorni', fromDay: 31, toDay: 60 },
  { key: 'd90', label: '90 giorni', fromDay: 61, toDay: 90 },
];
const OffboardingPhases: readonly OnboardingPhase[] = [
  { key: 'notice', label: 'Preavviso', fromDay: -30, toDay: -8 },
  { key: 'last', label: 'Ultima settimana', fromDay: -7, toDay: 0 },
  { key: 'after', label: 'Dopo l’uscita', fromDay: 1, toDay: 15 },
];

const t = (key: string, phase: string, title: string, role: OnboardingTaskDef['role'], kind: OnboardingTaskDef['kind'], dueDay: number, extra: Partial<OnboardingTaskDef> = {}): OnboardingTaskDef => ({ key, phase, title, role, kind, dueDay, required: true, description: null, link: null, formKey: null, surveyKey: null, ...extra });

const generic: OnboardingTaskDef[] = [
  t('welcome_mail', 'pre', 'Inviare l’email di benvenuto con le informazioni del primo giorno', 'hr', 'todo', -7, { description: 'Orario, sede o link, documenti da portare, chi accoglie.' }),
  t('it_setup', 'pre', 'Preparare account, laptop e accessi', 'it', 'todo', -3, { description: 'Email, SSO, strumenti del team, badge se in sede.' }),
  t('buddy_assign', 'pre', 'Assegnare il buddy', 'manager', 'todo', -3, { link: '/onboarding' }),
  t('plan_week1', 'pre', 'Preparare il piano della prima settimana', 'manager', 'todo', -2, { description: 'Persone da incontrare, primi contenuti, un primo compito concreto.' }),
  t('read_handbook', 'w1', 'Leggere il manuale aziendale e le policy', 'newcomer', 'read', 3),
  t('sign_policies', 'w1', 'Presa visione di codice di condotta e sicurezza', 'newcomer', 'sign', 5),
  t('first_one_on_one', 'w1', 'Primo 1:1 con il manager', 'manager', 'meeting', 1, { link: '/one-on-ones', description: 'Aspettative, come lavoriamo, domande aperte.' }),
  t('buddy_meet', 'w1', 'Caffè con il buddy', 'buddy', 'meeting', 2),
  t('team_intro', 'w1', 'Presentazione al team e ai principali interlocutori', 'manager', 'todo', 3),
  t('survey_d7', 'w1', 'Come sta andando la prima settimana?', 'newcomer', 'survey', 7, { surveyKey: 'd7' }),
  t('objectives', 'm1', 'Definire i primi obiettivi con il manager', 'newcomer', 'objective', 20, { link: '/objectives', description: 'Almeno un obiettivo con key result per il periodo in corso.' }),
  t('mandatory_training', 'm1', 'Completare la formazione obbligatoria', 'newcomer', 'todo', 25),
  t('checkin_30', 'm1', 'Check-in a 30 giorni', 'manager', 'meeting', 30, { link: '/one-on-ones', description: 'Cosa funziona, cosa manca, prime evidenze.' }),
  t('survey_d30', 'm1', 'Survey a 30 giorni', 'newcomer', 'survey', 30, { surveyKey: 'd30' }),
  t('checkin_60', 'd60', 'Check-in a 60 giorni', 'manager', 'meeting', 60, { link: '/one-on-ones' }),
  t('dev_plan', 'd60', 'Autovalutazione delle competenze e prima bozza del piano di sviluppo', 'newcomer', 'todo', 55, { link: '/development', required: false }),
  t('checkin_90', 'd90', 'Check-in a 90 giorni e fine del periodo di prova', 'manager', 'meeting', 90, { link: '/one-on-ones', description: 'Bilancio, conferma, obiettivi del trimestre successivo.' }),
  t('survey_d90', 'd90', 'Survey a 90 giorni', 'newcomer', 'survey', 90, { surveyKey: 'd90' }),
  t('probation_hr', 'd90', 'Registrare l’esito del periodo di prova', 'hr', 'todo', 90),
];

export const OnboardingPresets: readonly OnboardingTemplateDef[] = [
  { name: 'Onboarding generico', kind: 'onboarding', description: 'Percorso standard per ogni nuovo ingresso: pre-boarding, prima settimana, obiettivi nel primo mese, check-in e survey a 30/60/90 giorni.', phases: [...StandardPhases], tasks: generic, isDefault: true },
  {
    name: 'Onboarding manager',
    kind: 'onboarding',
    description: 'Come il generico, più incontri con ogni riporto, revisione degli obiettivi del team e formazione per chi guida persone.',
    phases: [...StandardPhases],
    tasks: [
      ...generic.filter((x) => x.key !== 'objectives'),
      t('meet_reports', 'w1', 'Incontrare individualmente ogni persona del team', 'newcomer', 'meeting', 7, { link: '/one-on-ones' }),
      t('team_objectives', 'm1', 'Rivedere gli obiettivi del team con il proprio manager', 'newcomer', 'objective', 20, { link: '/objectives?view=team' }),
      t('manager_training', 'm1', 'Percorso “guidare persone in WorkingBetter”: 1:1, feedback, review', 'newcomer', 'read', 30, { link: '/settings/design', required: false }),
      t('skip_level', 'd60', 'Skip-level con il team del nuovo manager', 'manager', 'meeting', 45, { required: false }),
    ],
    rules: { jobTitleKeywords: ['manager', 'head', 'lead', 'responsabile', 'direttore'] },
  },
  {
    name: 'Onboarding da remoto',
    kind: 'onboarding',
    description: 'Per chi lavora prevalentemente da remoto: spedizione dotazioni, rituali del team online, incontro in presenza entro il primo mese.',
    phases: [...StandardPhases],
    tasks: [
      ...generic.map((x) => (x.key === 'it_setup' ? { ...x, title: 'Spedire laptop e dotazioni a casa; verificare gli accessi da remoto', dueDay: -7 } : x)),
      t('remote_rituals', 'w1', 'Spiegare i rituali del team: stand-up, canali, orari di reperibilità', 'buddy', 'todo', 2),
      t('onsite_day', 'm1', 'Organizzare una giornata in presenza con il team', 'manager', 'meeting', 25, { required: false }),
    ],
    rules: { locations: ['remoto', 'remote', 'smart working'] },
  },
  {
    name: 'Cambio ruolo interno',
    kind: 'role_change',
    description: 'Passaggio a un nuovo ruolo o team: chiusura delle attività precedenti, nuove aspettative, obiettivi e check-in a 30 e 90 giorni.',
    phases: [{ key: 'pre', label: 'Prima del passaggio', fromDay: -14, toDay: -1 }, { key: 'w1', label: 'Prime due settimane', fromDay: 0, toDay: 14 }, { key: 'm1', label: 'Primo mese', fromDay: 15, toDay: 30 }, { key: 'd90', label: '90 giorni', fromDay: 31, toDay: 90 }],
    tasks: [
      t('handover', 'pre', 'Passaggio di consegne delle attività precedenti', 'newcomer', 'todo', -3),
      t('expectations', 'w1', 'Definire aspettative e perimetro del nuovo ruolo', 'manager', 'meeting', 2, { link: '/one-on-ones' }),
      t('role_profile', 'w1', 'Assegnare il job profile del nuovo ruolo', 'hr', 'todo', 3, { link: '/development/admin' }),
      t('new_objectives', 'm1', 'Nuovi obiettivi per il ruolo', 'newcomer', 'objective', 20, { link: '/objectives' }),
      t('checkin_30', 'm1', 'Check-in a 30 giorni', 'manager', 'meeting', 30, { link: '/one-on-ones' }),
      t('survey_d30', 'm1', 'Come va nel nuovo ruolo?', 'newcomer', 'survey', 30, { surveyKey: 'd30' }),
      t('checkin_90', 'd90', 'Check-in a 90 giorni', 'manager', 'meeting', 90, { link: '/one-on-ones' }),
    ],
  },
  {
    name: 'Offboarding',
    kind: 'offboarding',
    description: 'Uscita ordinata: passaggio di consegne, exit survey, restituzione dotazioni e chiusura accessi. La data di riferimento è l’ultimo giorno.',
    phases: [...OffboardingPhases],
    tasks: [
      t('handover_plan', 'notice', 'Piano di passaggio consegne e destinatari', 'manager', 'todo', -20),
      t('knowledge', 'notice', 'Documentare attività, accessi e contatti', 'newcomer', 'todo', -10),
      t('exit_survey', 'last', 'Exit survey', 'newcomer', 'survey', -3, { surveyKey: 'exit' }),
      t('exit_interview', 'last', 'Colloquio di uscita', 'hr', 'meeting', -2),
      t('return_equipment', 'last', 'Restituzione laptop, badge e dotazioni', 'newcomer', 'sign', 0),
      t('revoke_access', 'after', 'Disattivare gli account e revocare gli accessi', 'it', 'todo', 1),
      t('final_docs', 'after', 'Documenti di fine rapporto', 'hr', 'todo', 10),
    ],
  },
];

/** Mini-survey di onboarding nominali (ONB-017): scala 1–5, commento libero. */
export interface OnboardingSurveyDef { key: OnboardingSurveyKey; title: string; questions: { key: string; text: string }[] }
export const OnboardingSurveys: Record<OnboardingSurveyKey, OnboardingSurveyDef> = {
  d7: { key: 'd7', title: 'Prima settimana', questions: [
    { key: 'welcome', text: 'Mi sono sentito/a accolto/a dal team.' },
    { key: 'tools', text: 'Avevo strumenti e accessi pronti quando servivano.' },
    { key: 'clarity', text: 'Ho capito cosa ci si aspetta da me nelle prime settimane.' },
    { key: 'support', text: 'So a chi rivolgermi quando ho un dubbio.' },
  ] },
  d30: { key: 'd30', title: 'Primo mese', questions: [
    { key: 'role', text: 'Il ruolo corrisponde a quanto mi era stato presentato.' },
    { key: 'manager', text: 'Il mio manager mi dedica il tempo necessario.' },
    { key: 'objectives', text: 'Ho obiettivi chiari per i prossimi mesi.' },
    { key: 'belonging', text: 'Mi sento parte del team.' },
  ] },
  d90: { key: 'd90', title: 'Novanta giorni', questions: [
    { key: 'confidence', text: 'Mi sento efficace nel mio lavoro.' },
    { key: 'growth', text: 'Vedo opportunità di crescita per me qui.' },
    { key: 'recommend', text: 'Consiglierei a un amico di lavorare qui.' },
    { key: 'stay', text: 'Mi vedo in azienda tra un anno.' },
  ] },
  exit: { key: 'exit', title: 'Exit survey', questions: [
    { key: 'reason', text: 'La decisione di lasciare dipende soprattutto da fattori interni all’azienda.' },
    { key: 'manager', text: 'Il rapporto con il mio manager è stato positivo.' },
    { key: 'growth', text: 'Ho avuto opportunità di crescita adeguate.' },
    { key: 'recommend', text: 'Consiglierei l’azienda a un amico.' },
  ] },
};
