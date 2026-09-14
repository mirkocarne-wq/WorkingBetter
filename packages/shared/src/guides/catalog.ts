import type { GuideProfile, GuideProfileDefinition, GuideStep } from './types.js';

/** Ordine gerarchico dei profili: chi ha un profilo vede anche le guide di quelli successivi. */
export const GuideProfileOrder: GuideProfile[] = ['admin', 'hr', 'manager', 'employee'];
export const GuideProfileLabels: Record<GuideProfile, string> = { admin: 'Amministratore', hr: 'HR', manager: 'Manager', employee: 'Collaboratore' };

/** Profilo predefinito dai ruoli dell'utente. */
export function guideProfileForRoles(roles: string[]): GuideProfile {
  if (roles.includes('tenant_admin') || roles.includes('super_admin')) return 'admin';
  if (roles.includes('hr_admin') || roles.includes('hrbp')) return 'hr';
  if (roles.includes('manager')) return 'manager';
  return 'employee';
}
/** Profili consultabili: il proprio e quelli «inferiori». */
export function guideProfilesAvailable(roles: string[]): GuideProfile[] {
  const mine = guideProfileForRoles(roles);
  return GuideProfileOrder.slice(GuideProfileOrder.indexOf(mine));
}

const admin: GuideStep[] = [
  {
    key: 'admin_branding', title: 'Nome, lingua e marchio dell’azienda', check: 'tenant_branding', href: '/settings', cta: 'Apri Impostazioni', manual: '03-amministratore.md#marchio',
    why: 'Il logo e il colore compaiono in email, PDF delle review e pagine esterne (pre-boarding, 360° esterni): le persone riconoscono subito che la comunicazione arriva dall’azienda.',
    how: ['Vai in Impostazioni → Aspetto.', 'Carica il logo (PNG o JPEG, massimo 200 KB) e scegli il colore principale.', 'Controlla nome azienda, lingua predefinita e fuso orario: guidano date e scadenze di tutti i moduli.'],
  },
  {
    key: 'admin_org', title: 'Struttura organizzativa', check: 'org_units', href: '/people', cta: 'Apri Persone', manual: '03-amministratore.md#organizzazione',
    why: 'Le unità organizzative definiscono i perimetri: popolazione dei cicli di review, sessioni di calibrazione, survey, report per unità. Senza struttura ogni analisi è «tutta l’azienda».',
    how: ['Crea le unità principali (direzioni, aree) e le sotto-unità: la gerarchia è libera e si può cambiare dopo.', 'Usa un codice breve per unità se importi persone da CSV (`org_unit` accetta nome o codice).', 'Archivia, non cancellare, le unità dismesse: lo storico resta leggibile.'],
  },
  {
    key: 'admin_people', title: 'Carica le persone', check: 'people_loaded', href: '/people/import', cta: 'Importa da CSV', manual: '03-amministratore.md#persone',
    why: 'Tutto ruota intorno all’anagrafica: manager, unità e data di assunzione decidono chi entra nei cicli e chi vede cosa.',
    how: ['Scarica il modello CSV da Persone → Importa.', 'Compila almeno nome, cognome ed email; aggiungi ruolo, unità, data di assunzione e `manager_email`.', 'Esegui prima la prova (dry run): il report mostra righe valide, errori e anteprima.', 'Conferma l’import: le persone esistenti vengono aggiornate per email, nessun duplicato.'],
  },
  {
    key: 'admin_managers', title: 'Assegna un manager a ogni persona', check: 'managers_assigned', href: '/people', cta: 'Verifica in Persone', manual: '03-amministratore.md#persone',
    why: 'La linea gerarchica è la regola di visibilità principale: il manager vede obiettivi, feedback condivisi e review dei riporti diretti, e solo di quelli. Chi non ha manager viene saltato dai cicli di review.',
    how: ['In Persone la colonna «Manager» mostra «—» per chi non ce l’ha: solo il vertice dovrebbe restare senza.', 'Imposta il manager dalla scheda persona o reimporta il CSV con `manager_email`.', 'Ricorda: cambiare manager sposta subito la visibilità; i feedback «in fascicolo» restano visibili anche al nuovo manager.'],
  },
  {
    key: 'admin_hr_roles', title: 'Nomina i referenti HR', check: 'hr_roles', href: '/people/users', cta: 'Gestisci utenti e ruoli', manual: '01-concetti-e-ruoli.md#ruoli',
    why: 'Il ruolo HR admin gestisce cicli, template, survey e welfare; l’HRBP accompagna i manager (review, calibrazione, import). Separare i ruoli evita che l’amministratore tecnico veda dati sensibili senza necessità.',
    how: ['In Persone → Utenti invita i referenti HR indicando il ruolo.', 'Assegna `hr_admin` a chi governa i processi e `hrbp` a chi segue le persone sul campo.', 'Tieni `tenant_admin` per pochissime persone: è l’unico ruolo che tocca SSO, sicurezza e integrazioni.'],
  },
  {
    key: 'admin_invites', title: 'Invita le persone', check: 'users_active', href: '/people/users', cta: 'Invita', manual: '03-amministratore.md#inviti',
    why: 'Un invito personale (valido 7 giorni) crea l’account collegato alla scheda persona: senza account la persona esiste in anagrafica ma non può compilare nulla.',
    how: ['Da Persone → Utenti invita singolarmente o in blocco dalle schede persona.', 'Con SSO attivo e provisioning automatico gli account nascono al primo accesso: l’invito serve solo a comunicare l’indirizzo.', 'Chi non accetta entro 7 giorni può essere reinvitato: il vecchio link smette di valere.'],
  },
  {
    key: 'admin_security', title: 'Accesso sicuro: SSO o verifica in due passaggi', check: 'secure_access', href: '/settings', cta: 'Apri Sicurezza', manual: '03-amministratore.md#sicurezza',
    why: 'La piattaforma contiene valutazioni e dati personali: chi ha ruoli estesi deve proteggere l’accesso. Il sistema blocca l’account 15 minuti dopo 5 tentativi errati, ma la seconda barriera la scegli tu.',
    how: ['Se l’azienda ha un identity provider (Microsoft Entra, Google Workspace, Okta…), configura l’SSO OIDC in Impostazioni → SSO e prova l’accesso.', 'Altrimenti attiva la verifica in due passaggi sul tuo utente e rendila obbligatoria per i ruoli HR e admin (Impostazioni → Sicurezza).', 'Conserva i codici di recupero in un posto sicuro: vengono mostrati una sola volta.'],
  },
  {
    key: 'admin_integrations', title: 'Collega calendario e chat', check: 'integrations', optional: true, href: '/settings', cta: 'Apri Integrazioni', manual: '03-amministratore.md#integrazioni',
    why: 'Gli inviti dei 1:1 arrivano già via email in formato calendario; con Google/Microsoft collegati finiscono direttamente nel calendario di ciascuno e i riconoscimenti possono comparire su Slack o Teams.',
    how: ['Crea l’app OAuth nel tuo provider (istruzioni nel manuale) e incolla client id e secret in Impostazioni → Integrazioni.', 'Ogni persona collega poi il proprio account dalla stessa pagina: nessun accesso viene creato a sua insaputa.', 'Senza connettori tutto funziona lo stesso: resta l’invito .ics e il feed calendario personale.'],
  },
  {
    key: 'admin_backup', title: 'Backup e prova di ripristino', href: '/settings', cta: 'Vedi le note operative', manual: '03-amministratore.md#backup',
    why: 'Prima di far entrare le persone serve la certezza di poter tornare indietro: un backup non provato non è un backup.',
    how: ['Verifica che `make backup` (o il job equivalente in produzione) giri ogni notte.', 'Esegui un ripristino di prova su un ambiente separato e apri l’app: gli obiettivi e le persone devono essere quelli attesi.', 'Annota dove stanno i backup e chi può ripristinarli.'],
  },
];

const hr: GuideStep[] = [
  {
    key: 'hr_values', title: 'Definisci i valori aziendali', check: 'company_values', href: '/feedback', cta: 'Apri Feedback', manual: '04-hr.md#valori',
    why: 'I riconoscimenti si collegano ai valori: così il feed racconta i comportamenti che l’azienda vuole vedere, e HR misura quali valori vengono vissuti davvero.',
    how: ['In Feedback → Valori aziendali crea da 3 a 6 valori con una frase che li spieghi.', 'Ordina i valori: l’ordine è quello mostrato a chi scrive un riconoscimento.', 'Guarda le statistiche per valore ogni trimestre e aggiorna le descrizioni se restano inutilizzati.'],
  },
  {
    key: 'hr_okr_cycle', title: 'Apri il periodo degli obiettivi', check: 'okr_cycle_active', href: '/objectives/new', cta: 'Crea il periodo', manual: '04-hr.md#obiettivi',
    why: 'Gli obiettivi vivono dentro un periodo (trimestre o semestre) con una cadenza di check-in: il sistema segnala «in ritardo» chi non aggiorna i progressi oltre la cadenza scelta.',
    how: ['Da Obiettivi → Nuovo crea il periodo con date e cadenza dei check-in (predefinita 7 giorni).', 'Pubblica gli obiettivi aziendali: manager e persone vi allineano i propri.', 'Comunica le regole: obiettivi pubblici per impostazione predefinita, privati solo se necessario.'],
  },
  {
    key: 'hr_review_forms', title: 'Prepara i questionari di review', check: 'review_forms', href: '/forms/new?kind=review', cta: 'Nuovo questionario', manual: '04-hr.md#review',
    why: 'La review è un questionario pubblicato: una volta pubblicato non cambia più, così tutte le review dello stesso ciclo sono confrontabili e la calibrazione ha senso.',
    how: ['Crea il questionario del manager (scale con etichette, commenti obbligatori sotto una certa soglia se vuoi motivazioni) e, se previsto, quello della self-review.', 'Pubblica entrambi: solo i questionari pubblicati si possono usare nei template.', 'Per cambiare un questionario crea una nuova versione: le review già lanciate restano sulla vecchia.'],
  },
  {
    key: 'hr_review_template', title: 'Crea il template di review', check: 'review_template', href: '/reviews?box=cycles', cta: 'Apri Cicli di review', manual: '04-hr.md#review',
    why: 'Il template fissa le regole HR del processo: quando il manager vede la self-review, se serve la firma, la scala di rating e l’eventuale catena di approvazione prima della condivisione.',
    how: ['In Review → Cicli, sezione «Nuovo template», scegli i questionari e le scadenze in giorni dal lancio.', 'Decidi la regola «il manager vede la self-review»: dopo aver inviato la propria è la scelta che evita l’ancoraggio.', 'Se vuoi un controllo prima della condivisione, seleziona la catena di approvazione (manager del manager, HRBP, HR).'],
  },
  {
    key: 'hr_review_cycle', title: 'Lancia un ciclo di review', check: 'review_cycle', href: '/reviews?box=cycles', cta: 'Crea il ciclo', manual: '04-hr.md#review',
    why: 'Al lancio le regole del template vengono congelate nel ciclo e ogni persona con un manager riceve la propria review; chi non ha manager viene saltato e segnalato in anteprima.',
    how: ['Crea il ciclo scegliendo template, periodo valutato e popolazione (tutta l’azienda o un’unità con le sotto-unità).', 'Controlla l’anteprima: incluse, escluse e «senza manager» da sistemare prima.', 'Lancia: le persone ricevono la notifica; i solleciti automatici partono a ridosso delle scadenze, al massimo uno al giorno.', 'Segui l’avanzamento per manager e usa «Sollecita» quando serve.'],
  },
  {
    key: 'hr_survey', title: 'Ascolta le persone con una survey', check: 'survey_launched', href: '/surveys', cta: 'Apri Survey', manual: '04-hr.md#survey',
    why: 'L’anonimato è garantito dall’architettura: le risposte sono slegate dagli inviti e i risultati compaiono solo se un gruppo raggiunge la soglia minima (5 persone di default). Comunicarlo alza il tasso di risposta.',
    how: ['Crea una survey di engagement dal modello o una pulse breve.', 'Imposta la soglia di anonimato (3–50, consigliata 5) e la data di chiusura.', 'Lancia, sollecita chi non ha risposto (senza sapere chi ha risposto cosa) e alla chiusura condividi una sintesi con azioni concrete.'],
  },
  {
    key: 'hr_competencies', title: 'Framework delle competenze e job profile', check: 'competency_framework', href: '/development/admin', cta: 'Apri Sviluppo', manual: '04-hr.md#sviluppo',
    why: 'Competenze e profili di ruolo rendono confrontabili le valutazioni, alimentano le domande del 360° e i piani di sviluppo con azioni suggerite sui gap.',
    how: ['In Sviluppo → Amministrazione carica un preset di competenze e adattalo (livelli da 2 a 6).', 'Crea i job profile con i livelli attesi per competenza e assegna il profilo alle persone.', 'Chiedi ai manager la prima valutazione: il gap si calcola in automatico.'],
  },
  {
    key: 'hr_onboarding', title: 'Percorso di onboarding', check: 'onboarding_template', href: '/onboarding/templates', cta: 'Apri Onboarding', manual: '04-hr.md#onboarding',
    why: 'Un percorso standard (prima dell’ingresso, prima settimana, primo mese) distribuisce i compiti tra HR, manager, buddy e IT e misura come sta andando con survey al giorno 7 e 30.',
    how: ['Parti dal modello e adatta compiti, ruoli e scadenze (in giorni rispetto all’ingresso).', 'Per i nuovi assunti senza account usa il pre-boarding: ricevono un link personale via email, valido per i compiti prima dell’ingresso.', 'Avvia il percorso dalla scheda persona indicando manager e buddy.'],
  },
  {
    key: 'hr_welfare', title: 'Piano welfare', check: 'welfare_plan', optional: true, href: '/welfare/admin', cta: 'Apri Welfare', manual: '04-hr.md#welfare',
    why: 'Il modulo applica le soglie fiscali (fringe benefit, categorie esenti) e tiene il conto di ogni persona; le richieste di rimborso passano da un’approvazione e finiscono in un export per il payroll.',
    how: ['Crea il piano dell’anno con budget per persona e categorie abilitate.', 'Controlla le soglie precaricate per l’anno e aggiornale se la normativa cambia.', 'Accredita i budget e comunica alle persone come usare il catalogo.'],
  },
  {
    key: 'hr_apps', title: 'Processi e richieste', check: 'app_published', optional: true, href: '/apps?tab=studio', cta: 'Apri Processi', manual: '04-hr.md#processi',
    why: 'Richieste di formazione, cambi di ruolo, esigenze del personale: ogni processo con un form e delle approvazioni si costruisce senza codice, con audit e scadenze.',
    how: ['Da Processi → Studio parti da un modello (es. richiesta di formazione) o creane uno nuovo.', 'Definisci le fasi: form, approvazione, notifica, azione automatica.', 'Pubblica: le persone lo trovano in «Avvia», i manager approvano dalle proprie attività.'],
  },
  {
    key: 'hr_communicate', title: 'Comunica le regole alle persone', href: '/inizia', cta: 'Rileggi le regole nel manuale', manual: '07-regole-hr.md',
    why: 'Le regole incorporate (chi vede cosa, anonimato, approvazioni, calibrazione) funzionano solo se le persone le conoscono: la fiducia nel processo dipende dalla chiarezza iniziale.',
    how: ['Prepara una comunicazione breve per collaboratori e una per manager usando il capitolo «Regole HR applicate» del manuale.', 'Indica il calendario dell’anno: periodi obiettivi, finestra review, survey.', 'Segna questo passo come fatto quando la comunicazione è partita.'],
  },
];

const manager: GuideStep[] = [
  {
    key: 'mgr_team', title: 'Verifica il tuo team', check: 'has_reports', href: '/people', cta: 'Apri Persone', manual: '05-manager.md#team',
    why: 'Vedi obiettivi, feedback condivisi, review e sviluppo solo dei riporti diretti: se manca qualcuno o c’è una persona in più, chiedi a HR di correggere l’anagrafica.',
    how: ['Apri Persone e filtra per il tuo nome come manager.', 'Segnala a HR differenze rispetto alla realtà.', 'In Home trovi la tabella «Il tuo team» con segnali su obiettivi e check-in.'],
  },
  {
    key: 'mgr_objectives', title: 'Obiettivi del team', check: 'team_objectives', href: '/objectives', cta: 'Apri Obiettivi', manual: '05-manager.md#obiettivi',
    why: 'Ogni persona dovrebbe avere almeno un obiettivo attivo allineato a quelli aziendali: è la base della review e del pannello di contesto che vedrai quando la scriverai.',
    how: ['Crea un obiettivo di team o chiedi a ciascuno di pubblicare i propri, allineandoli al livello superiore.', 'Concordate risultati chiave misurabili (numero, percentuale, sì/no, tappe).', 'La confidenza dell’obiettivo è la peggiore tra i risultati chiave: un «off track» ti arriva come notifica.'],
  },
  {
    key: 'mgr_one_on_one', title: 'Imposta i 1:1 con ogni riporto', check: 'one_on_one_relations', href: '/one-on-ones', cta: 'Apri 1:1', manual: '05-manager.md#uno-a-uno',
    why: 'Una relazione 1:1 con cadenza fissa (ogni 1–2 settimane) è la pratica con più impatto sul coinvolgimento; il sistema riporta i punti non discussi al prossimo incontro e ti segnala i ritardi.',
    how: ['In 1:1 crea la relazione con ciascun riporto scegliendo cadenza e durata (30 minuti di default).', 'Aggiungi il link della videochiamata: finisce nell’invito calendario.', 'Le note private sono cifrate e visibili solo a te; quella condivisa la vedete entrambi.'],
  },
  {
    key: 'mgr_first_meeting', title: 'Fai il primo incontro e chiudilo nell’app', check: 'one_on_one_done', href: '/one-on-ones', cta: 'Apri 1:1', manual: '05-manager.md#uno-a-uno',
    why: 'Chiudere l’incontro nell’app programma il successivo, riporta i punti aperti e alimenta la metrica di copertura dei 1:1 che HR vede solo in forma aggregata.',
    how: ['Prima dell’incontro guarda i suggerimenti di agenda: obiettivi a rischio, check-in mancanti, azioni scadute.', 'Durante: spunta i punti discussi, assegna azioni con scadenza.', 'Alla fine premi «Concludi»: il prossimo incontro viene creato secondo la cadenza.'],
  },
  {
    key: 'mgr_feedback', title: 'Dai il primo feedback o riconoscimento', check: 'feedback_given', href: '/feedback', cta: 'Apri Feedback', manual: '05-manager.md#feedback',
    why: 'Il feedback privato arriva solo alla persona, che decide se condividerlo con il manager o metterlo in fascicolo; i riconoscimenti sono pubblici e collegati ai valori. Entrambi compaiono nel contesto della review.',
    how: ['Scrivi un riconoscimento pubblico per un comportamento concreto collegato a un valore.', 'Usa il feedback privato per suggerimenti: 3 righe, un esempio, un passo successivo.', 'Chiedi feedback su un tuo riporto ai colleghi con cui lavora: le risposte a una tua richiesta ti sono visibili.'],
  },
  {
    key: 'mgr_reviews', title: 'Scrivi le review del ciclo attivo', check: 'team_reviews', optional: true, href: '/reviews?box=team', cta: 'Apri Review del team', manual: '05-manager.md#review',
    why: 'Vedi la self-review secondo la regola del template (di solito solo dopo aver inviato la tua); la persona vede la tua review solo quando la condividi, e può firmare esprimendo dissenso.',
    how: ['Apri la review dalla lista «Il mio team» e usa il pannello di contesto: obiettivi, feedback condivisi, riconoscimenti, 1:1.', 'Invia: se il template prevede approvazioni, la review passa agli approvatori prima della condivisione.', 'Condividi, fai il colloquio e segnalo: la persona firma dall’app.'],
  },
  {
    key: 'mgr_calibration', title: 'Preparati alla calibrazione', href: '/reviews?box=calibration', cta: 'Vedi le sessioni', manual: '05-manager.md#calibrazione',
    why: 'In sessione i rating proposti si confrontano tra team: la distribuzione, la media per manager e gli scostamenti sono visibili a tutti i partecipanti; ogni modifica richiede una motivazione tracciata.',
    how: ['Per ogni persona prepara due fatti concreti a sostegno del rating.', 'Verifica di aver inviato tutte le manager review: entrano in sessione solo quelle inviate.', 'Durante la sessione le review del perimetro non si possono condividere; dopo il blocco sì.'],
  },
];

const employee: GuideStep[] = [
  {
    key: 'emp_profile', title: 'Controlla la tua scheda', href: '/people', cta: 'Apri Persone', manual: '06-collaboratore.md#scheda',
    why: 'Manager, unità e ruolo decidono chi vede cosa e in quali processi entri: se sono sbagliati, lo sono anche le review e le survey a cui vieni invitato.',
    how: ['Cerca il tuo nome in Persone e verifica manager, ruolo e unità.', 'Segnala a HR eventuali errori.', 'Segna il passo come fatto.'],
  },
  {
    key: 'emp_objective', title: 'Il tuo primo obiettivo', check: 'own_objective', href: '/objectives/new', cta: 'Crea un obiettivo', manual: '06-collaboratore.md#obiettivi',
    why: 'Un obiettivo pubblico e allineato a quelli del team rende visibile il tuo contributo e sarà il primo elemento del pannello di contesto nella tua review.',
    how: ['Da Obiettivi → Nuovo scrivi un titolo chiaro e allinealo a un obiettivo del team o dell’azienda.', 'Aggiungi 1–3 risultati chiave misurabili.', 'Pubblica: le bozze non si vedono e non contano.'],
  },
  {
    key: 'emp_check_in', title: 'Fai un check-in', check: 'own_check_in', href: '/objectives', cta: 'Apri Obiettivi', manual: '06-collaboratore.md#obiettivi',
    why: 'Il check-in aggiorna valore e confidenza di un risultato chiave; oltre la cadenza del periodo l’obiettivo risulta «in ritardo» in Home tua e del manager.',
    how: ['Apri l’obiettivo e premi «Check-in» sul risultato chiave.', 'Indica il valore attuale, la confidenza e due righe di commento.', 'Se sei «off track», il manager riceve una notifica: è il momento di chiedere aiuto, non un giudizio.'],
  },
  {
    key: 'emp_one_on_one', title: 'I tuoi 1:1', check: 'own_one_on_one', href: '/one-on-ones', cta: 'Apri 1:1', manual: '06-collaboratore.md#uno-a-uno',
    why: 'Il 1:1 è il tuo spazio: puoi aggiungere punti all’agenda prima dell’incontro e le tue note private restano cifrate e invisibili al manager.',
    how: ['Se il manager non ha ancora creato la relazione, chiediglielo o proponila tu.', 'Prima di ogni incontro aggiungi i punti che vuoi trattare.', 'Le azioni assegnate a te compaiono nelle notifiche quando scadono.'],
  },
  {
    key: 'emp_feedback', title: 'Dai o chiedi un feedback', check: 'feedback_given', href: '/feedback', cta: 'Apri Feedback', manual: '06-collaboratore.md#feedback',
    why: 'Il feedback che ricevi è privato: decidi tu se condividerlo con il manager o metterlo in fascicolo per le review future. I riconoscimenti sono pubblici.',
    how: ['Scrivi un riconoscimento a un collega collegandolo a un valore aziendale.', 'Chiedi feedback su di te dopo un progetto: scegli fino a 20 persone e una domanda precisa.', 'Quando ricevi un feedback utile, segnalo come «utile» e valuta se condividerlo.'],
  },
  {
    key: 'emp_notifications', title: 'Scegli come ricevere le notifiche', href: '/notifications', cta: 'Apri Notifiche', manual: '06-collaboratore.md#notifiche',
    why: 'Scadenze di review, inviti ai 1:1 e richieste di feedback arrivano in app e via email; puoi disattivare i canali per tipo, ma le scadenze restano visibili in Home.',
    how: ['In Notifiche → Preferenze scegli, per ogni tipo, app, email e chat.', 'Se l’azienda ha collegato Slack, attiva i messaggi diretti dalle Impostazioni.', 'Segna il passo come fatto.'],
  },
  {
    key: 'emp_mfa', title: 'Attiva la verifica in due passaggi', check: 'own_mfa', optional: true, href: '/settings', cta: 'Apri Impostazioni', manual: '06-collaboratore.md#sicurezza',
    why: 'Nel tuo account ci sono valutazioni e feedback che ti riguardano: un secondo fattore protegge te, non solo l’azienda.',
    how: ['In Impostazioni → Sicurezza avvia la configurazione e inquadra il QR con un’app di autenticazione.', 'Conferma il primo codice e salva i codici di recupero.', 'Se l’azienda usa l’SSO, la verifica la gestisce il tuo provider.'],
  },
];

export const GuideCatalog: Record<GuideProfile, GuideProfileDefinition> = {
  admin: { profile: 'admin', title: 'Avviamento per l’amministratore', intro: 'Mettere in piedi il tenant: identità, struttura, persone, accessi. In quest’ordine, prima di invitare tutti.', steps: admin },
  hr: { profile: 'hr', title: 'Avviamento per HR', intro: 'Attivare i processi nell’ordine in cui le persone li incontrano: valori e obiettivi, poi review, ascolto, sviluppo e onboarding.', steps: hr },
  manager: { profile: 'manager', title: 'Primi passi per il manager', intro: 'Tre abitudini prima della review: obiettivi condivisi, 1:1 regolari, feedback frequente.', steps: manager },
  employee: { profile: 'employee', title: 'Primi passi', intro: 'Cosa fare nelle prime due settimane e cosa il sistema garantisce su ciò che vedi e su ciò che vedono gli altri.', steps: employee },
};

export const guideSteps = (profile: GuideProfile): GuideStep[] => GuideCatalog[profile].steps;
