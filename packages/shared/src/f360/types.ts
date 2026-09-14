/**
 * Feedback 360° (F360): tipi e default condivisi tra API, worker e web.
 * L'anonimato è per categoria (docs/specifiche/feedback-360.md §6): sotto soglia le risposte confluiscono in "Altri";
 * se anche "Altri" è sotto soglia, punteggi e commenti non vengono mostrati.
 */
export const F360Categories = ['self', 'manager', 'peer', 'report', 'other', 'external'] as const;
export type F360Category = (typeof F360Categories)[number];

export const F360CategoryLabels: Record<F360Category, string> = {
  self: 'Autovalutazione',
  manager: 'Manager',
  peer: 'Pari',
  report: 'Riporti diretti',
  other: 'Altri interni',
  external: 'Esterni',
};

/** Configurazione di una categoria di valutatori nella campagna (F360-002). */
export interface F360CategoryConfig {
  key: F360Category;
  enabled: boolean;
  /** numero minimo di valutatori da nominare (verificato all'invio delle nomine) */
  min: number;
  /** numero massimo di nomine per categoria */
  max: number;
  /** risposte mai attribuite alla persona; soggette alla soglia di aggregazione */
  anonymous: boolean;
}

export const DefaultF360Categories: readonly F360CategoryConfig[] = [
  { key: 'self', enabled: true, min: 1, max: 1, anonymous: false },
  { key: 'manager', enabled: true, min: 1, max: 1, anonymous: false },
  { key: 'peer', enabled: true, min: 3, max: 6, anonymous: true },
  { key: 'report', enabled: true, min: 0, max: 8, anonymous: true },
  { key: 'other', enabled: true, min: 0, max: 4, anonymous: true },
  { key: 'external', enabled: false, min: 0, max: 3, anonymous: true },
];

export interface F360Scale { min: number; max: number; labels: Record<string, string> }
export const DefaultF360Scale: F360Scale = { min: 1, max: 5, labels: { '1': 'Raramente', '2': 'A volte', '3': 'Spesso', '4': 'Quasi sempre', '5': 'Sempre' } };

export interface F360OpenQuestion { key: string; label: string }
/** Domande aperte standard (F360-006): continua / smetti / inizia. */
export const DefaultF360OpenQuestions: readonly F360OpenQuestion[] = [
  { key: 'continue', label: 'Cosa dovrebbe continuare a fare?' },
  { key: 'stop', label: 'Cosa dovrebbe smettere di fare?' },
  { key: 'start', label: 'Cosa dovrebbe iniziare a fare?' },
];

export type F360NominationBy = 'subject' | 'manager' | 'hr';
export type F360ReleaseRule = 'immediately' | 'manager' | 'after_debrief';
export const F360ReleaseRuleLabels: Record<F360ReleaseRule, string> = {
  immediately: 'Subito alla chiusura',
  manager: 'Quando il manager lo rilascia',
  after_debrief: 'Dopo il debrief registrato',
};

/** Contenuto di una risposta (self, manager o anonima). */
export interface F360ResponseInput {
  category: F360Category;
  /** livello per competenza sulla scala della campagna; null = non so / non applicabile */
  ratings: Record<string, number | null>;
  /** commento per competenza */
  comments: Record<string, string>;
  /** risposte alle domande aperte */
  openAnswers: Record<string, string>;
}
