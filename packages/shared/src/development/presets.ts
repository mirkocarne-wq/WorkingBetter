/**
 * Libreria di competenze predefinite in italiano (DEV-001) con 4 livelli e descrittori comportamentali,
 * e azioni di sviluppo suggerite per competenza (DEV-011). Modificabile dal tenant dopo il caricamento.
 */

export type CompetencyKind = 'core' | 'role' | 'leadership';
export interface CompetencyLevel {
  level: number;
  label: string;
  descriptor: string;
}
export interface CompetencyPreset {
  key: string;
  name: string;
  kind: CompetencyKind;
  description: string;
  levels: CompetencyLevel[];
}

export type DevelopmentActionKind = 'training' | 'mentoring' | 'experience' | 'reading' | 'other';
export interface SuggestedAction {
  competencyKey: string;
  kind: DevelopmentActionKind;
  title: string;
  description: string;
  /** livello a cui l'azione aiuta ad arrivare (null = qualsiasi) */
  targetLevel?: number | null;
}

const L = (a: string, b: string, c: string, d: string): CompetencyLevel[] => [
  { level: 1, label: 'In apprendimento', descriptor: a },
  { level: 2, label: 'Autonomo', descriptor: b },
  { level: 3, label: 'Riferimento', descriptor: c },
  { level: 4, label: 'Modello', descriptor: d },
];

export const CompetencyPresets: CompetencyPreset[] = [
  { key: 'communication', name: 'Comunicazione', kind: 'core', description: 'Esprime idee in modo chiaro, ascolta e adatta il messaggio a chi ha davanti.', levels: L('Comunica in modo comprensibile con il proprio team se guidato.', 'Struttura messaggi chiari, scritti e orali, e verifica di essere stato capito.', 'Facilita conversazioni difficili e allinea gruppi con interessi diversi.', 'È il punto di riferimento per la comunicazione dell’organizzazione; forma gli altri.') },
  { key: 'collaboration', name: 'Collaborazione', kind: 'core', description: 'Lavora con gli altri verso obiettivi comuni, condivide informazioni e chiede aiuto.', levels: L('Contribuisce ai lavori di gruppo quando gli viene chiesto.', 'Cerca attivamente il contributo degli altri e condivide ciò che sa.', 'Crea le condizioni perché team diversi collaborino; risolve gli attriti.', 'Costruisce una cultura di collaborazione tra funzioni e sedi.') },
  { key: 'ownership', name: 'Ownership', kind: 'core', description: 'Si prende la responsabilità dei risultati, non solo dei compiti.', levels: L('Porta a termine i compiti assegnati con supervisione.', 'Si assume la responsabilità del risultato e segnala i rischi in anticipo.', 'Si fa carico di problemi fuori dal proprio perimetro quando serve.', 'Rende l’ownership la norma del team; gli altri lo prendono a modello.') },
  { key: 'customer_focus', name: 'Orientamento al cliente', kind: 'core', description: 'Tiene al centro il valore per il cliente interno o esterno.', levels: L('Conosce chi sono i clienti del proprio lavoro.', 'Raccoglie feedback dai clienti e li usa per migliorare.', 'Anticipa i bisogni dei clienti e influenza le priorità di conseguenza.', 'Definisce come l’organizzazione ascolta e serve i clienti.') },
  { key: 'problem_solving', name: 'Analisi e soluzione dei problemi', kind: 'core', description: 'Scompone problemi complessi, valuta alternative e decide con dati.', levels: L('Risolve problemi noti con procedure definite.', 'Analizza problemi nuovi, propone alternative e sceglie con criteri espliciti.', 'Affronta problemi ambigui e sistemici; porta metodo al team.', 'Risolve problemi strategici e insegna il metodo all’organizzazione.') },
  { key: 'learning_agility', name: 'Apprendimento continuo', kind: 'core', description: 'Impara in fretta da esperienze, feedback ed errori.', levels: L('Accetta il feedback e applica ciò che gli viene indicato.', 'Cerca feedback, sperimenta e adatta il proprio modo di lavorare.', 'Trasforma gli errori in apprendimento per il team.', 'Costruisce pratiche di apprendimento condivise nell’organizzazione.') },
  { key: 'planning', name: 'Pianificazione e organizzazione', kind: 'role', description: 'Organizza tempo, priorità e risorse per consegnare nei tempi.', levels: L('Gestisce il proprio lavoro con priorità date da altri.', 'Pianifica il proprio lavoro, stima e rispetta le scadenze.', 'Pianifica il lavoro di un gruppo e gestisce le dipendenze.', 'Pianifica programmi complessi multi-team con rischi e trade-off espliciti.') },
  { key: 'technical_excellence', name: 'Eccellenza tecnica', kind: 'role', description: 'Padroneggia gli strumenti e le pratiche del proprio mestiere.', levels: L('Applica le pratiche del team con revisione.', 'Lavora in autonomia con qualità e cura del dettaglio.', 'Definisce standard e fa crescere la qualità del team.', 'È riconosciuto come esperto oltre il team; guida scelte tecniche di lungo periodo.') },
  { key: 'people_development', name: 'Sviluppo delle persone', kind: 'leadership', description: 'Fa crescere gli altri con feedback, delega e opportunità.', levels: L('Dà feedback quando richiesto.', 'Dà feedback regolare e specifico; delega compiti adeguati.', 'Costruisce piani di crescita e crea opportunità per il team.', 'Sviluppa leader; il team è una fucina di talenti per l’organizzazione.') },
  { key: 'strategic_thinking', name: 'Visione strategica', kind: 'leadership', description: 'Collega le scelte quotidiane alla direzione dell’azienda.', levels: L('Conosce gli obiettivi aziendali.', 'Collega il lavoro del team agli obiettivi aziendali e spiega il perché.', 'Contribuisce a definire priorità di area con scenari e trade-off.', 'Definisce la direzione di lungo periodo e la rende attuabile.') },
  { key: 'decision_making', name: 'Decisione', kind: 'leadership', description: 'Decide in tempi adeguati con informazioni incomplete e se ne assume la responsabilità.', levels: L('Decide su questioni operative con supporto.', 'Decide in autonomia nel proprio perimetro e comunica la decisione.', 'Prende decisioni difficili e impopolari spiegandone le ragioni.', 'Prende decisioni di impatto organizzativo bilanciando rischi e valori.') },
];

export const SuggestedActions: SuggestedAction[] = [
  { competencyKey: 'communication', kind: 'training', title: 'Corso di comunicazione efficace', description: 'Un percorso breve su struttura del messaggio, ascolto attivo e feedback.', targetLevel: 2 },
  { competencyKey: 'communication', kind: 'experience', title: 'Presentare al team un progetto concluso', description: 'Prepara e tieni una presentazione di 15 minuti; chiedi feedback su chiarezza e ritmo.', targetLevel: 2 },
  { competencyKey: 'communication', kind: 'experience', title: 'Facilitare una retrospettiva', description: 'Conduci una retrospettiva di team con un facilitatore esperto come osservatore.', targetLevel: 3 },
  { competencyKey: 'collaboration', kind: 'experience', title: 'Progetto cross-funzionale', description: 'Partecipa a un’iniziativa con un altro team e cura tu il coordinamento.', targetLevel: 3 },
  { competencyKey: 'collaboration', kind: 'mentoring', title: 'Shadowing di un collega di un’altra funzione', description: 'Una giornata con un collega di un’altra area per capire vincoli e linguaggio.', targetLevel: 2 },
  { competencyKey: 'ownership', kind: 'experience', title: 'Responsabilità end-to-end di una consegna', description: 'Prendi in carico una consegna dall’inizio alla fine, incluse comunicazione e rischi.', targetLevel: 2 },
  { competencyKey: 'ownership', kind: 'reading', title: 'Lettura: Extreme Ownership', description: 'Leggi e discuti con il tuo manager tre principi applicabili al tuo ruolo.', targetLevel: null },
  { competencyKey: 'customer_focus', kind: 'experience', title: 'Affiancamento al servizio clienti', description: 'Mezza giornata ad ascoltare le richieste dei clienti; raccogli tre spunti di miglioramento.', targetLevel: 2 },
  { competencyKey: 'customer_focus', kind: 'experience', title: 'Intervistare tre clienti', description: 'Conduci interviste strutturate e presenta le evidenze al team.', targetLevel: 3 },
  { competencyKey: 'problem_solving', kind: 'training', title: 'Metodi di problem solving strutturato', description: 'Formazione su albero dei problemi, analisi delle cause e decisione con criteri.', targetLevel: 2 },
  { competencyKey: 'problem_solving', kind: 'experience', title: 'Guidare una post-mortem', description: 'Conduci l’analisi di un incidente o di un obiettivo mancato con azioni tracciate.', targetLevel: 3 },
  { competencyKey: 'learning_agility', kind: 'experience', title: 'Chiedere feedback a 360°', description: 'Chiedi feedback a tre colleghi su un comportamento specifico e definisci un cambiamento.', targetLevel: 2 },
  { competencyKey: 'learning_agility', kind: 'mentoring', title: 'Trovare un mentor interno', description: 'Un incontro al mese per sei mesi su un tema di crescita concordato.', targetLevel: null },
  { competencyKey: 'planning', kind: 'training', title: 'Gestione del tempo e delle priorità', description: 'Tecniche di pianificazione settimanale, stima e gestione delle interruzioni.', targetLevel: 2 },
  { competencyKey: 'planning', kind: 'experience', title: 'Pianificare il prossimo trimestre del team', description: 'Prepara il piano con dipendenze e rischi e presentalo al manager.', targetLevel: 3 },
  { competencyKey: 'technical_excellence', kind: 'training', title: 'Certificazione o corso avanzato del proprio ambito', description: 'Scegli con il manager un percorso riconosciuto e pianifica lo studio.', targetLevel: 3 },
  { competencyKey: 'technical_excellence', kind: 'mentoring', title: 'Revisioni incrociate con un esperto', description: 'Quattro sessioni di revisione del lavoro con un collega di riferimento.', targetLevel: 2 },
  { competencyKey: 'people_development', kind: 'training', title: 'Dare feedback che fa crescere', description: 'Laboratorio pratico su feedback specifico, tempestivo e orientato al comportamento.', targetLevel: 2 },
  { competencyKey: 'people_development', kind: 'experience', title: 'Costruire il piano di sviluppo di un riporto', description: 'Definisci con una persona del team un piano con tre azioni e verifica mensile.', targetLevel: 3 },
  { competencyKey: 'strategic_thinking', kind: 'reading', title: 'Analisi della strategia aziendale', description: 'Leggi il piano aziendale e scrivi come il lavoro del tuo team lo sostiene.', targetLevel: 2 },
  { competencyKey: 'strategic_thinking', kind: 'experience', title: 'Partecipare a un ciclo di pianificazione di area', description: 'Prendi parte alla definizione delle priorità del semestre con la direzione.', targetLevel: 3 },
  { competencyKey: 'decision_making', kind: 'experience', title: 'Documentare tre decisioni con alternative', description: 'Per tre decisioni reali scrivi contesto, opzioni, criteri e scelta; rileggile dopo un mese.', targetLevel: 2 },
  { competencyKey: 'decision_making', kind: 'mentoring', title: 'Confronto con un leader senior', description: 'Discuti una decisione difficile con un leader esperto prima e dopo averla presa.', targetLevel: 3 },
];

export const ActionKindLabels: Record<DevelopmentActionKind, string> = { training: 'Formazione', mentoring: 'Mentoring', experience: 'Esperienza sul campo', reading: 'Lettura', other: 'Altro' };
export const CompetencyKindLabels: Record<CompetencyKind, string> = { core: 'Trasversale', role: 'Di ruolo', leadership: 'Leadership' };
