import type { FormSchema } from '../forms/schema.js';
import type { AppDefinition } from './types.js';

/** Template pronti (APP-030): ogni template porta i form che usa; l'installazione crea form pubblicati e app in bozza. */
export interface AppTemplate { key: string; name: string; description: string; category: string; app: AppDefinition; forms: { key: string; name: string; schema: FormSchema }[] }

const likert = (min = 1, max = 5, labels: Record<string, string> = { '1': 'Per niente', '3': 'In parte', '5': 'Pienamente' }) => ({ min, max, labels, allowNa: false });

export const AppTemplates: readonly AppTemplate[] = [
  {
    key: 'training_request',
    name: 'Richiesta formazione',
    category: 'Sviluppo',
    description: 'La persona chiede un corso o una certificazione; il manager approva (o rimanda con commento); l’HR conferma il budget e la persona riceve l’esito.',
    forms: [
      { key: 'app_training_request', name: 'Richiesta formazione', schema: { title: 'Richiesta formazione', locale: 'it', scoring: { enabled: false }, sections: [{ key: 'req', title: 'La richiesta', fields: [
        { key: 'course', type: 'short_text', label: 'Corso o certificazione', required: true },
        { key: 'provider', type: 'short_text', label: 'Ente o piattaforma', required: false },
        { key: 'cost', type: 'number', label: 'Costo stimato (€)', required: true, min: 0 },
        { key: 'when', type: 'date', label: 'Quando', required: false },
        { key: 'why', type: 'long_text', label: 'Perché serve e quale competenza sviluppa', required: true, min: 20 },
        { key: 'competency', type: 'single_choice', label: 'Competenza principale', required: false, options: [{ value: 'technical', label: 'Tecnica' }, { value: 'communication', label: 'Comunicazione' }, { value: 'leadership', label: 'Leadership' }, { value: 'other', label: 'Altro' }] },
      ] }] } },
    ],
    app: {
      key: 'training_request', name: 'Richiesta formazione', description: 'Richiesta di corso o certificazione con approvazione del manager e conferma HR.', icon: '🎓',
      naming: { instanceLabel: 'Richiesta formazione', launchVerb: 'Chiedi una formazione', subjectLabel: 'Persona' },
      permissions: { launch: ['employee', 'manager', 'hr'], launchForSelfOnly: true, viewInstances: ['hr', 'subject', 'launcher', 'actors', 'manager'] },
      stages: [
        { key: 'request', name: 'Compila la richiesta', type: 'form', actor: 'subject', formKey: 'app_training_request', dueDays: 7, seePrevious: false, transitions: [{ when: { source: 'answer', field: 'cost', op: 'lte', value: 0 }, goto: 'manager_ok' }] },
        { key: 'manager_ok', name: 'Approvazione del manager', type: 'approval', actor: 'manager', dueDays: 5, seePrevious: true, approval: { rejectTo: 'request', requireComment: true } },
        { key: 'hr_ok', name: 'Conferma budget HR', type: 'approval', actor: 'hr', dueDays: 5, seePrevious: true, approval: { rejectTo: 'request', requireComment: true }, transitions: [] },
        { key: 'done', name: 'Esito alla persona', type: 'notify', actor: 'hr', dueDays: 0, seePrevious: true, notify: { to: ['subject', 'manager'], message: 'La richiesta di formazione è stata approvata: puoi procedere con l’iscrizione.' } },
      ],
    },
  },
  {
    key: 'promotion_proposal',
    name: 'Proposta di promozione',
    category: 'Carriera',
    description: 'Il manager propone un avanzamento con motivazione ed evidenze; il manager del manager e l’HR approvano; la persona viene informata.',
    forms: [
      { key: 'app_promotion_proposal', name: 'Proposta di promozione', schema: { title: 'Proposta di promozione', locale: 'it', scoring: { enabled: false }, sections: [{ key: 'p', title: 'La proposta', fields: [
        { key: 'target_role', type: 'short_text', label: 'Ruolo o livello proposto', required: true },
        { key: 'effective', type: 'date', label: 'Decorrenza proposta', required: false },
        { key: 'readiness', type: 'scale', label: 'Prontezza per il nuovo ruolo', required: true, scale: likert(1, 5, { '1': 'Da preparare', '3': 'Pronto con affiancamento', '5': 'Già opera al livello' }) },
        { key: 'evidence', type: 'long_text', label: 'Evidenze (risultati, feedback, review)', required: true, min: 40 },
        { key: 'risks', type: 'long_text', label: 'Rischi e piano di supporto', required: false },
      ] }] } },
    ],
    app: {
      key: 'promotion_proposal', name: 'Proposta di promozione', description: 'Avanzamento proposto dal manager con doppia approvazione.', icon: '🚀',
      naming: { instanceLabel: 'Proposta', launchVerb: 'Proponi una promozione', subjectLabel: 'Persona proposta' },
      permissions: { launch: ['manager', 'hr'], launchForSelfOnly: false, viewInstances: ['hr', 'launcher', 'actors'] },
      stages: [
        { key: 'proposal', name: 'Proposta del manager', type: 'form', actor: 'launcher', formKey: 'app_promotion_proposal', dueDays: 10, seePrevious: false },
        { key: 'skip_level', name: 'Parere del manager di secondo livello', type: 'approval', actor: 'manager_of_manager', dueDays: 7, seePrevious: true, approval: { rejectTo: 'proposal', requireComment: true } },
        { key: 'hr_ok', name: 'Approvazione HR', type: 'approval', actor: 'hr', dueDays: 7, seePrevious: true, approval: { rejectTo: 'proposal', requireComment: true } },
        { key: 'inform', name: 'Comunicazione alla persona', type: 'notify', actor: 'hr', dueDays: 0, seePrevious: true, notify: { to: ['subject', 'launcher'], message: 'La proposta di avanzamento è stata approvata: il manager e l’HR ti contatteranno per i dettagli.' } },
      ],
    },
  },
  {
    key: 'project_review',
    name: 'Valutazione di fine progetto',
    category: 'Performance',
    description: 'A fine progetto la persona e il responsabile compilano in parallelo una breve valutazione; il responsabile la condivide e la persona ne prende visione.',
    forms: [
      { key: 'app_project_self', name: 'Fine progetto: autovalutazione', schema: { title: 'Fine progetto: autovalutazione', locale: 'it', scoring: { enabled: true }, sections: [{ key: 's', title: 'Il tuo contributo', fields: [
        { key: 'result', type: 'scale', label: 'Risultato raggiunto rispetto agli obiettivi', required: true, scale: likert() },
        { key: 'collab', type: 'scale', label: 'Collaborazione con il team', required: true, scale: likert() },
        { key: 'learned', type: 'long_text', label: 'Cosa hai imparato', required: true },
        { key: 'next', type: 'long_text', label: 'Cosa faresti diversamente', required: false },
      ] }] } },
      { key: 'app_project_manager', name: 'Fine progetto: valutazione del responsabile', schema: { title: 'Fine progetto: valutazione del responsabile', locale: 'it', scoring: { enabled: true }, sections: [{ key: 'm', title: 'Valutazione', fields: [
        { key: 'result', type: 'scale', label: 'Risultato raggiunto', required: true, scale: likert(), commentRequiredBelow: 2, commentKey: 'result_comment' },
        { key: 'result_comment', type: 'long_text', label: 'Commento sul risultato', required: false },
        { key: 'collab', type: 'scale', label: 'Collaborazione', required: true, scale: likert() },
        { key: 'strengths', type: 'long_text', label: 'Punti di forza emersi', required: true },
        { key: 'growth', type: 'long_text', label: 'Aree di crescita', required: true },
      ] }] } },
    ],
    app: {
      key: 'project_review', name: 'Valutazione di fine progetto', description: 'Autovalutazione e valutazione del responsabile in parallelo, poi condivisione.', icon: '🏁',
      naming: { instanceLabel: 'Valutazione di progetto', launchVerb: 'Avvia una valutazione di fine progetto', subjectLabel: 'Persona valutata' },
      permissions: { launch: ['manager', 'hr'], launchForSelfOnly: false, viewInstances: ['hr', 'subject', 'launcher', 'actors', 'manager'] },
      stages: [
        { key: 'self', name: 'Autovalutazione', type: 'form', actor: 'subject', formKey: 'app_project_self', dueDays: 7, parallelGroup: 'eval', seePrevious: false },
        { key: 'lead', name: 'Valutazione del responsabile', type: 'form', actor: 'launcher', formKey: 'app_project_manager', dueDays: 7, parallelGroup: 'eval', seePrevious: false },
        { key: 'share', name: 'Condivisione e confronto', type: 'approval', actor: 'launcher', dueDays: 5, seePrevious: true, approval: { rejectTo: null, requireComment: false } },
        { key: 'ack', name: 'Presa visione della persona', type: 'approval', actor: 'subject', dueDays: 5, seePrevious: true, approval: { rejectTo: null, requireComment: false } },
      ],
    },
  },
  {
    key: 'exit_interview',
    name: 'Exit interview',
    category: 'Persone',
    description: 'All’uscita l’HR avvia il colloquio: la persona compila il questionario, l’HR registra il colloquio e chiude.',
    forms: [
      { key: 'app_exit_interview', name: 'Exit interview', schema: { title: 'Exit interview', locale: 'it', scoring: { enabled: false }, sections: [{ key: 'e', title: 'La tua esperienza', fields: [
        { key: 'reason', type: 'single_choice', label: 'Motivo principale', required: true, options: [{ value: 'growth', label: 'Crescita professionale' }, { value: 'pay', label: 'Retribuzione' }, { value: 'manager', label: 'Rapporto con il manager' }, { value: 'balance', label: 'Equilibrio vita-lavoro' }, { value: 'relocation', label: 'Trasferimento / motivi personali' }, { value: 'other', label: 'Altro' }] },
        { key: 'recommend', type: 'scale', label: 'Consiglieresti l’azienda a un amico?', required: true, scale: likert(0, 10, { '0': 'Per niente', '10': 'Certamente' }) },
        { key: 'best', type: 'long_text', label: 'Cosa ti è piaciuto di più', required: false },
        { key: 'improve', type: 'long_text', label: 'Cosa dovremmo migliorare', required: true },
        { key: 'return', type: 'boolean', label: 'Torneresti in futuro?', required: false },
      ] }] } },
      { key: 'app_exit_hr_notes', name: 'Exit interview: note HR', schema: { title: 'Note del colloquio di uscita', locale: 'it', scoring: { enabled: false }, sections: [{ key: 'n', title: 'Colloquio', fields: [
        { key: 'date', type: 'date', label: 'Data del colloquio', required: true },
        { key: 'summary', type: 'long_text', label: 'Sintesi', required: true },
        { key: 'actions', type: 'long_text', label: 'Azioni per l’organizzazione', required: false },
      ] }] } },
    ],
    app: {
      key: 'exit_interview', name: 'Exit interview', description: 'Questionario di uscita e colloquio con l’HR.', icon: '👋',
      naming: { instanceLabel: 'Exit interview', launchVerb: 'Avvia un’exit interview', subjectLabel: 'Persona in uscita' },
      permissions: { launch: ['hr'], launchForSelfOnly: false, viewInstances: ['hr', 'subject'] },
      stages: [
        { key: 'survey', name: 'Questionario di uscita', type: 'form', actor: 'subject', formKey: 'app_exit_interview', dueDays: 10, seePrevious: false },
        { key: 'interview', name: 'Colloquio e note HR', type: 'form', actor: 'hr', formKey: 'app_exit_hr_notes', dueDays: 10, seePrevious: true },
      ],
    },
  },
  {
    key: 'hr_ticket',
    name: 'Segnalazione all’HR',
    category: 'Persone',
    description: 'La persona apre una segnalazione (dubbio, problema, richiesta amministrativa); l’HR la prende in carico e chiude con una risposta.',
    forms: [
      { key: 'app_hr_ticket', name: 'Segnalazione', schema: { title: 'Segnalazione all’HR', locale: 'it', scoring: { enabled: false }, sections: [{ key: 't', title: 'Di cosa si tratta', fields: [
        { key: 'topic', type: 'single_choice', label: 'Argomento', required: true, options: [{ value: 'admin', label: 'Amministrativo (buste paga, ferie, contratto)' }, { value: 'welfare', label: 'Welfare e benefit' }, { value: 'workplace', label: 'Ambiente di lavoro' }, { value: 'other', label: 'Altro' }] },
        { key: 'urgent', type: 'boolean', label: 'È urgente?', required: false },
        { key: 'text', type: 'long_text', label: 'Descrizione', required: true, min: 10 },
      ] }] } },
      { key: 'app_hr_ticket_reply', name: 'Risposta HR', schema: { title: 'Risposta alla segnalazione', locale: 'it', scoring: { enabled: false }, sections: [{ key: 'r', title: 'Risposta', fields: [
        { key: 'reply', type: 'long_text', label: 'Risposta alla persona', required: true },
        { key: 'resolved', type: 'boolean', label: 'Risolta', required: true },
      ] }] } },
    ],
    app: {
      key: 'hr_ticket', name: 'Segnalazione all’HR', description: 'Canale strutturato verso l’HR con presa in carico e risposta.', icon: '📮',
      naming: { instanceLabel: 'Segnalazione', launchVerb: 'Apri una segnalazione', subjectLabel: 'Persona' },
      permissions: { launch: ['employee', 'manager', 'hr'], launchForSelfOnly: true, viewInstances: ['hr', 'subject'] },
      stages: [
        { key: 'open', name: 'Apri la segnalazione', type: 'form', actor: 'subject', formKey: 'app_hr_ticket', dueDays: 3, seePrevious: false },
        { key: 'reply', name: 'Risposta dell’HR', type: 'form', actor: 'hr', formKey: 'app_hr_ticket_reply', dueDays: 5, seePrevious: true },
        { key: 'close', name: 'Conferma della persona', type: 'approval', actor: 'subject', dueDays: 5, seePrevious: true, approval: { rejectTo: 'reply', requireComment: true } },
      ],
    },
  },
];
