/**
 * Libreria survey (ENG-001/002/007): driver, domande validate e template pronti, costruiti sul form engine.
 * Le scale sono Likert 1–5 ("Per niente d'accordo" → "Completamente d'accordo"); l'eNPS è 0–10.
 */
export interface SurveyDriver { key: string; label: string; description: string }
export const SurveyDrivers: readonly SurveyDriver[] = [
  { key: 'leadership', label: 'Leadership', description: 'Fiducia nella direzione e nel proprio manager' },
  { key: 'chiarezza', label: 'Chiarezza', description: 'Obiettivi, priorità e aspettative chiare' },
  { key: 'crescita', label: 'Crescita', description: 'Opportunità di apprendimento e carriera' },
  { key: 'riconoscimento', label: 'Riconoscimento', description: 'Apprezzamento del contributo' },
  { key: 'autonomia', label: 'Autonomia', description: 'Libertà di decidere come lavorare' },
  { key: 'collaborazione', label: 'Collaborazione', description: 'Qualità del lavoro con colleghi e team' },
  { key: 'benessere', label: 'Benessere', description: 'Carico di lavoro, equilibrio ed energia' },
];

export interface SurveyQuestion { key: string; driver: string; text: string }
export const SurveyQuestionLibrary: readonly SurveyQuestion[] = [
  { key: 'q_lead_fiducia', driver: 'leadership', text: 'Ho fiducia nelle decisioni prese dalla direzione.' },
  { key: 'q_lead_manager', driver: 'leadership', text: 'Il mio manager mi sostiene e mi aiuta a crescere.' },
  { key: 'q_chiar_obiettivi', driver: 'chiarezza', text: 'So cosa ci si aspetta da me nel mio lavoro.' },
  { key: 'q_chiar_priorita', driver: 'chiarezza', text: 'Le priorità del mio team sono chiare e condivise.' },
  { key: 'q_cresc_opportunita', driver: 'crescita', text: 'Ho opportunità reali di imparare e crescere professionalmente.' },
  { key: 'q_cresc_futuro', driver: 'crescita', text: 'Vedo un percorso di carriera per me in questa azienda.' },
  { key: 'q_ric_apprezzamento', driver: 'riconoscimento', text: 'Il mio contributo viene riconosciuto e apprezzato.' },
  { key: 'q_ric_feedback', driver: 'riconoscimento', text: 'Ricevo feedback utili con regolarità.' },
  { key: 'q_auto_decisioni', driver: 'autonomia', text: 'Posso decidere come organizzare il mio lavoro.' },
  { key: 'q_auto_fiducia', driver: 'autonomia', text: 'Mi sento responsabilizzato/a sui risultati.' },
  { key: 'q_coll_team', driver: 'collaborazione', text: 'Nel mio team ci si aiuta a vicenda.' },
  { key: 'q_coll_altri', driver: 'collaborazione', text: 'La collaborazione con gli altri team funziona bene.' },
  { key: 'q_ben_carico', driver: 'benessere', text: 'Il mio carico di lavoro è sostenibile.' },
  { key: 'q_ben_equilibrio', driver: 'benessere', text: 'Riesco a conciliare lavoro e vita privata.' },
];

export const ENPS_FIELD = 'enps';
export const COMMENT_FIELD = 'commento';
export const LIKERT_LABELS: Record<string, string> = { '1': 'Per niente d’accordo', '3': 'Neutrale', '5': 'Completamente d’accordo' };

export type SurveyTemplateKind = 'engagement' | 'pulse' | 'enps' | 'wellbeing';
export interface SurveyTemplate { kind: SurveyTemplateKind; label: string; description: string; questionKeys: string[]; enps: boolean; comment: boolean; rotate?: number }
export const SurveyTemplates: readonly SurveyTemplate[] = [
  { kind: 'engagement', label: 'Engagement completa', description: '14 domande su 7 driver, eNPS e commento libero. Annuale o semestrale.', questionKeys: SurveyQuestionLibrary.map((q) => q.key), enps: true, comment: true },
  { kind: 'pulse', label: 'Pulse', description: '5 domande a rotazione dalla libreria + eNPS. Settimanale o mensile.', questionKeys: SurveyQuestionLibrary.map((q) => q.key), enps: true, comment: false, rotate: 5 },
  { kind: 'enps', label: 'eNPS', description: 'Solo la domanda eNPS con un commento facoltativo.', questionKeys: [], enps: true, comment: true },
  { kind: 'wellbeing', label: 'Benessere', description: 'Carico, equilibrio e riconoscimento, con commento.', questionKeys: ['q_ben_carico', 'q_ben_equilibrio', 'q_ric_apprezzamento', 'q_auto_decisioni'], enps: false, comment: true },
];

export interface BuiltSurveyForm {
  schema: Record<string, unknown>;
  /** chiave domanda → driver */
  drivers: Record<string, string>;
  enpsField: string | null;
  questionKeys: string[];
}

/**
 * Costruisce lo schema del form engine per un template. `rotation` (pulse) sceglie la finestra di domande
 * in modo che survey successive coprano tutti i driver (ENG-004).
 */
export function buildSurveyForm(kind: SurveyTemplateKind, title: string, opts: { rotation?: number } = {}): BuiltSurveyForm {
  const t = SurveyTemplates.find((x) => x.kind === kind);
  if (!t) throw new Error(`Template survey sconosciuto: ${kind}`);
  let keys = t.questionKeys;
  if (t.rotate && keys.length > t.rotate) {
    const start = ((opts.rotation ?? 0) * t.rotate) % keys.length;
    keys = Array.from({ length: t.rotate }, (_, i) => keys[(start + i) % keys.length]!);
  }
  const questions = keys.map((k) => SurveyQuestionLibrary.find((q) => q.key === k)!).filter(Boolean);
  const drivers: Record<string, string> = {};
  for (const q of questions) drivers[q.key] = q.driver;
  const sections: Record<string, unknown>[] = [];
  if (questions.length) sections.push({ key: 'domande', title: 'Quanto sei d’accordo con le seguenti affermazioni?', fields: questions.map((q) => ({ key: q.key, type: 'scale', label: q.text, required: true, scale: { min: 1, max: 5, labels: LIKERT_LABELS } })) });
  const finale: Record<string, unknown>[] = [];
  if (t.enps) finale.push({ key: ENPS_FIELD, type: 'scale', label: 'Quanto consiglieresti questa azienda come posto in cui lavorare a un amico o a una amica?', help: '0 = per nulla, 10 = assolutamente sì', required: true, scale: { min: 0, max: 10, labels: { '0': 'Per nulla', '10': 'Assolutamente' } } });
  if (t.comment) finale.push({ key: COMMENT_FIELD, type: 'long_text', label: 'C’è qualcosa che vorresti dirci? (facoltativo, anonimo)', required: false });
  if (finale.length) sections.push({ key: 'finale', title: t.enps ? 'Per concludere' : 'Un’ultima cosa', fields: finale });
  return { schema: { title, scoring: { enabled: false }, sections }, drivers, enpsField: t.enps ? ENPS_FIELD : null, questionKeys: keys };
}

export const driverLabel = (key: string) => SurveyDrivers.find((d) => d.key === key)?.label ?? key;
