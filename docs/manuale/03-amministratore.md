# 3 · Amministratore

Ruolo: `tenant_admin`. È l'unico che tocca marchio, SSO, politiche di sicurezza e integrazioni; include anche tutto ciò che può fare HR admin, ma la buona pratica è usarlo solo per la configurazione.

## 3.1 Marchio, nome, lingua e fuso {#marchio}

**Impostazioni → Aspetto.** Nome dell'organizzazione, colore principale e logo (PNG o JPEG, massimo 200 KB). Logo e colore compaiono in: email, PDF delle review e dei report 360°, pagine esterne (pre-boarding, valutatori esterni del 360°). `defaultLocale` (it/en) e `timezone` governano date e scadenze: i promemoria del mattino partono alle 7:00 UTC, le date di scadenza sono calcolate in giorni interi dal lancio.

Le impostazioni si salvano **chiave per chiave**: salvare l'aspetto non cancella l'SSO e viceversa.

### Moduli attivi {#moduli}

**Impostazioni → Personalizzazione → Moduli attivi.** Undici moduli (Obiettivi, 1:1, Feedback e riconoscimenti, Review, Survey, Welfare, Sviluppo, Feedback 360°, Onboarding, Processi, Report) si accendono e spengono per tenant; Persone, Form, Notifiche e Impostazioni sono sempre attivi. Un modulo spento **sparisce dal menu, dalla ricerca rapida, dalla Home (indicatori, «Da fare», prossimo 1:1) e dalla Guida** di tutti i profili; chi apre un suo indirizzo viene riportato alla Home. I dati restano al loro posto e riattivarlo li rende di nuovo visibili. Attenzione: spegnere un modulo **non è un controllo di sicurezza**, le API restano raggiungibili a chi ha il permesso; la barriera sono i ruoli.

Consiglio: all'avvio accendi solo i moduli del primo trimestre (tipicamente Obiettivi, 1:1, Feedback, Review) e aggiungi gli altri quando li introduci davvero. Ogni cambio è tracciato nell'audit (`tenant.modules`).

### Glossario aziendale {#glossario}

**Impostazioni → Personalizzazione → Glossario aziendale.** Per ciascun concetto (Obiettivo, Risultato chiave, Check-in, Review, 1:1, Feedback, Riconoscimento, Competenza, Processo) puoi indicare singolare e plurale **per lingua** (italiano e inglese): «Obiettivi» può diventare «Priorità», «Review» «Colloquio di valutazione», «1:1» «Punto periodico». I nomi si applicano a menu, ricerca rapida, titoli e contatori delle pagine e al vocabolario dell'App Studio. Restano invariati i nomi tecnici nelle API, nei CSV esportati, nelle email già inviate e nei PDF già generati. Un campo vuoto significa «nome standard». Anche qui ogni salvataggio è tracciato (`naming.update`).

## 3.2 Organizzazione {#organizzazione}

**Persone → Unità.** Le unità hanno nome, codice facoltativo e un genitore. La gerarchia serve ai perimetri «con sotto-unità» di review, calibrazione, survey e report. Le unità non si cancellano se in uso: si **archiviano** e lo storico resta leggibile. Non esiste un import CSV dedicato delle unità: si creano dall'interfaccia oppure automaticamente durante l'import persone con l'opzione «crea le unità mancanti».

## 3.3 Persone e import {#persone}

**Persone → Importa.** Scarica il modello CSV e compila:

| Colonna | Obbligatoria | Note |
|---|---|---|
| `first_name`, `last_name`, `email` | sì | l'email è la chiave: reimportare aggiorna, non duplica |
| `employee_number`, `job_title`, `job_level`, `location` | no | |
| `hire_date` | no | `AAAA-MM-GG`; usata per anzianità, onboarding, esclusioni «assunti dopo» nei cicli |
| `org_unit` | no | nome o codice; creata solo con «crea le unità mancanti» |
| `manager_email` | no | risolta tra persone esistenti o righe del file (due passate: prima le persone, poi i manager) |
| `status` | no | `active` (default), `invited`, `leaving`, `suspended` |
| `custom:<chiave>` | no | una colonna per ogni campo del catalogo **Campi persona** (es. `custom:contract_type`); il valore è validato per tipo (numero, data `AAAA-MM-GG`, sì/no, opzione ammessa); colonne con chiave sconosciuta sono ignorate e segnalate |

Il file accetta `,` o `;` come separatore, BOM e virgolette. L'import parte sempre in **prova** (dry run): il report elenca righe valide e non, errori per campo, colonne sconosciute e un'anteprima. Confermando, l'import è tracciato nell'audit e chi lo ha lanciato riceve una notifica con il riepilogo.

Regole applicate:
- una persona senza manager **non entra nei cicli di review** (viene mostrata tra le «saltate» in anteprima);
- cambiare manager sposta subito la visibilità dei dati del team; i feedback «in fascicolo» restano visibili anche al nuovo manager, quelli condivisi solo con il precedente no;
- lo stato `terminated` esclude dai processi; l'anonimizzazione automatica dei dati personali **non è ancora implementata** (CORE-053, in roadmap).

Lo storico delle modifiche anagrafiche di ogni persona è conservato e consultabile da chi ha il permesso di scrittura sull'anagrafica (HRBP e superiori).

### Campi persona (attributi custom) {#campi-persona}

**Impostazioni → Personalizzazione → Campi persona** (HRBP e superiori). Il catalogo definisce gli attributi dell'anagrafica che la piattaforma non prevede di suo: tipo di contratto, centro di costo, giorni di lavoro da remoto, fine periodo di prova, badge consegnato… Ogni campo ha una **chiave** stabile (minuscole, numeri e `_`; non cambia più), un'etichetta, un **tipo** (testo, numero, data, sì/no, scelta con opzioni), una sezione facoltativa, un testo d'aiuto, l'obbligatorietà e una **visibilità**:

| Visibilità | Chi vede il valore |
|---|---|
| Solo HR e amministratori | chi ha il permesso di scrittura sull'anagrafica (HRBP, HR admin, tenant admin) |
| Anche il manager | in più il manager diretto della persona |
| Anche la persona | in più la persona stessa e chiunque apra la scheda |

I valori si compilano nella **scheda persona** (Persone → nome), con l'import CSV (colonne `custom:<chiave>`) o con l'azione «aggiorna attributo» di un processo dell'App Studio, che propone le chiavi del catalogo. Ogni scrittura è **validata contro il catalogo**: chiavi sconosciute, opzioni non ammesse o tipi sbagliati vengono rifiutati con l'elenco degli errori. Un campo non si cancella: si **archivia** (i valori già salvati restano nella scheda, non si accettano valori nuovi) e si può riattivare. Le API restituiscono per ogni persona solo i campi che chi legge può vedere. Non è ancora disponibile la segmentazione dei report per campo custom.

## 3.4 Inviti, utenti e ruoli {#inviti}

**Persone → Utenti.** Invita per email indicando i ruoli. Il link è **monouso e vale 7 giorni**; scaduto, si reinvia (il precedente smette di valere). Accettando, la persona imposta la password (minimo 10 caratteri, diversa dall'email) oppure entra con l'SSO.

### Ruoli e permessi {#ruoli}

**Impostazioni → Personalizzazione → Ruoli e permessi** (HR admin e amministratore). I sette ruoli predefiniti (Amministratore, HR admin, HRBP, Manager, Collaboratore, Osservatore, Analista) hanno permessi standard che puoi **personalizzare per modulo**: la griglia elenca ogni permesso atomico raggruppato per modulo (Obiettivi, 1:1, Review, Survey…) e una spunta lo concede o lo toglie. Esempio tipico: togliere al Manager «risultati aggregati del team» delle survey finché l'azienda non ha comunicato la politica di anonimato. **Ripristina i default** riporta il ruolo allo standard. L'Amministratore conserva sempre impostazioni e gestione dei ruoli, così nessuno resta chiuso fuori.

Un **ruolo custom** si compone allo stesso modo sopra un **ruolo base**: dal ruolo base eredita il *perimetro* (il Manager vede il suo team, l'HRBP il suo perimetro, il profilo della Guida), ma concede **solo i permessi spuntati**. Serve per figure come «Referente welfare» (gestisce piani, catalogo e paghe senza vedere review e valutazioni) o «People Ops» (anagrafica e import senza i cicli di review). I ruoli custom compaiono tra quelli assegnabili in Utenti e accessi e negli inviti; un ruolo assegnato a qualcuno non si elimina, si **archivia** dopo averlo rimosso dagli utenti.

Le modifiche valgono **dalla richiesta successiva** di chi ha il ruolo (nessun nuovo accesso necessario) e sono tracciate nell'audit (`role.customize`, `role.update`, `role.reset`, `role.create`). I ruoli non toccano i perimetri di dato: un permesso concesso vale sempre nel perimetro del ruolo base.

Ruoli: assegna `hr_admin` a chi governa i processi e `hrbp` a chi accompagna i manager; `manager` a chi ha riporti (i permessi di team si applicano comunque **solo ai riporti diretti** presenti in anagrafica); `observer`/`analyst` alla direzione. Ogni assegnazione e revoca è nell'audit.

Disattivare un utente revoca subito tutte le sue sessioni. Lo stesso accade al cambio o reset della password e con «Esci da tutti i dispositivi».

## 3.5 Sicurezza dell'accesso {#sicurezza}

Regole sempre attive:
- **blocco dopo 5 tentativi errati per 15 minuti** (anche sul codice della verifica in due passaggi);
- limiti per indirizzo IP su login, recupero password e accettazione inviti;
- sessioni firmate con scadenza configurabile dal deploy (`AUTH_SESSION_TTL_HOURS`), revocabili;
- reset password con link valido **60 minuti**.

Scelte dell'amministratore:
- **SSO OpenID Connect** (Impostazioni → SSO): issuer, client id e secret (cifrato, mai restituito dall'API), provisioning automatico al primo accesso con ruolo predefinito (`employee`, `manager` o `observer`), domini email ammessi, opzione «disabilita la password» (esente `tenant_admin`, per non chiudersi fuori). Flusso Authorization Code con PKCE.
- **Verifica in due passaggi (TOTP)**: ogni utente la attiva da Impostazioni → Sicurezza con un'app di autenticazione; riceve 8 codici di recupero monouso mostrati una sola volta. L'amministratore può renderla **obbligatoria per ruolo** (Impostazioni → Politiche di sicurezza): chi ha quei ruoli deve completare l'attivazione al prossimo accesso.

Cosa proteggere con priorità: `tenant_admin`, `hr_admin`, `hrbp`, `welfare:payroll`.

## 3.6 Integrazioni {#integrazioni}

Il modello è **un'app OAuth per tenant**: l'azienda registra la propria app presso il provider e incolla le credenziali in **Impostazioni → Integrazioni**; ogni persona collega poi il **proprio** account dalla stessa pagina. Nessun account viene collegato a insaputa della persona.

| Provider | Cosa serve | Cosa fa |
|---|---|---|
| Google Calendar | app OAuth (Google Cloud) con redirect URI dell'API; scope `calendar.events` | i 1:1 creati, riprogrammati o annullati diventano eventi nel calendario di ciascun partecipante collegato, con link Meet |
| Microsoft 365 | app in Entra ID (client id, secret, tenant) con `Calendars.ReadWrite` | come sopra, con link Teams |
| Slack | app con bot token (`chat:write`, `users:read.email`); manifest in [`docs/integrazioni/slack-app-manifest.json`](../integrazioni/slack-app-manifest.json) | messaggi diretti per le notifiche con canale «chat»; riconoscimenti su un canale scelto |
| Microsoft Teams | incoming webhook di canale | riconoscimenti sul canale |

Sempre disponibile anche senza connettori: inviti `.ics` via email per ogni 1:1 e **feed calendario personale** (URL segreto, rigenerabile) con 1:1, scadenze review, chiusure survey e azioni.

Le consegne verso i provider sono asincrone (il worker ritenta con attesa crescente fino a 5 volte); se un account perde l'autorizzazione compare in stato «errore» e la persona lo ricollega. Dettagli architetturali in [ADR-0012](../adr/0012-connettori-esterni.md).

## 3.7 Backup e ripristino {#backup}

Un backup non provato non è un backup. Prima di aprire alle persone:
1. verifica con chi gestisce il deploy che il backup notturno del database giri (procedura in [`docs/13`](../13-deploy-produzione.md#backup));
2. fai eseguire un **ripristino di prova** su un ambiente separato e apri l'app;
3. annota dove stanno i backup e chi può ripristinarli;
4. conserva la chiave `NOTES_MASTER_KEY` separatamente dai backup: senza di essa note private, segreti SSO e token dei connettori restano cifrati e illeggibili.

## 3.8 Audit e tracciabilità {#audit}

**Impostazioni → Audit** (HR admin e amministratore, permesso `audit:read`). La pagina elenca ogni azione tracciata: quando, quale azione (`review.share`, `person.update`, `role.assign`…), su quale entità, **quali campi sono cambiati**, chi l'ha fatta e da quale IP. I **valori** prima/dopo non compaiono mai nell'interfaccia né nell'export: l'audit serve a verificare *chi ha toccato cosa*, non a leggere contenuti. Filtri combinabili: azione (per famiglia o singola), tipo ed id dell'entità, utente, periodo, testo; dalla riga si apre l'elenco di tutte le azioni sulla stessa entità o la scheda persona. **Esporta CSV** produce il file con gli stessi filtri (fino a 10 000 righe) ed è a sua volta registrato come `audit.export`.

**Persone → Utenti → «Cosa vede»** mostra per un utente i ruoli (con eventuali personalizzazioni e ruolo base), i permessi effettivi per modulo, i moduli spenti, il perimetro di dato (riporti diretti e indiretti, se vede tutta l'azienda, quali campi custom), il profilo della Guida e lo stato dell'accesso (ultimo accesso, SSO, verifica in due passaggi). È la risposta operativa alla domanda «questa persona può vedere le review del team X?». Il perimetro per unità delle assegnazioni HRBP è registrato e mostrato, ma i moduli oggi distinguono solo tenant e team del manager: la vista lo segnala.


Ogni scrittura rilevante produce una riga **append-only** nell'audit: chi, quando, cosa, prima e dopo, indirizzo IP e identificativo della richiesta. Sono tracciati, tra gli altri: impostazioni del tenant, inviti e ruoli, import, modifiche anagrafiche, review (lancio, condivisione, firma, correzioni del rating, calibrazioni, export PDF), survey, welfare, export dei report.

**Stato attuale**: l'audit è scritto e conservato nel database, ma non esiste ancora una pagina o un endpoint di consultazione (CORE-051, in roadmap). Per un'estrazione si interroga la tabella `audit_log` in sola lettura dal database (vedi [`docs/06`](../06-sicurezza-e-compliance.md)).

## 3.9 Cosa fare quando…

| Situazione | Azione |
|---|---|
| Una persona cambia manager | aggiorna la scheda o reimporta; le review in corso mantengono il manager con cui sono nate |
| Una persona lascia l'azienda | stato `leaving` e poi `terminated`; disattiva l'utente (revoca le sessioni); il percorso di offboarding parte dal modulo Onboarding |
| Un manager chiede di vedere dati di un non-riporto | non è possibile dall'interfaccia: la visibilità segue la linea gerarchica; se è legittimo, si crea una relazione 1:1 di tipo `skip_level` o `mentoring` per quel perimetro |
| Sospetto di accesso indebito | disattiva l'utente, ruota la password, verifica l'audit; ruota il feed calendario della persona |
