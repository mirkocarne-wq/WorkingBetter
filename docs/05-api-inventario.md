# 05-bis — Inventario degli endpoint API

> Generato da `pnpm docs:generate` a partire da `packages/api-client/openapi.json` (contratto OpenAPI, ADR-0009). **Non modificare a mano.** 311 operazioni su 257 percorsi, prefisso `/api/v1`. La documentazione interattiva con schemi di body, query e risposte è su `/docs` dell'API.

Le operazioni non marcate come pubbliche richiedono il Bearer token di sessione; i permessi per ruolo sono in `packages/shared/src/auth/roles.ts` e ogni rotta è verificata dal test di invarianti (docs/06).

## system (3)

| Metodo | Percorso | Descrizione | Accesso |
|---|---|---|---|
| `GET` | `/health` | Stato riepilogativo: versione, uptime, latenza del database, ultimi job del worker | pubblico |
| `GET` | `/health/live` | Liveness: il processo è vivo | pubblico |
| `GET` | `/health/ready` | Readiness: il database risponde (503 altrimenti) | pubblico |

## auth (23)

| Metodo | Percorso | Descrizione | Accesso |
|---|---|---|---|
| `GET` | `/auth/config` | Metodi di accesso disponibili per un tenant (password, SSO, login di sviluppo) | pubblico |
| `POST` | `/auth/dev-login` | Login di sviluppo (senza password). Disponibile solo con AUTH_MODE=dev. | pubblico |
| `POST` | `/auth/exchange` | Converte il codice monouso del login SSO in una sessione | pubblico |
| `POST` | `/auth/forgot-password` | Invia il link di reset se l’utente esiste (risposta sempre 202) | pubblico |
| `GET` | `/auth/invite/{token}` | Dettagli di un invito (email, tenant, scadenza, SSO) | pubblico |
| `POST` | `/auth/invite/{token}/accept` | Accetta l’invito impostando la password (o senza, se il tenant usa l’SSO) | pubblico |
| `POST` | `/auth/login` | Login con email e password; blocco temporaneo dopo 5 tentativi | pubblico |
| `POST` | `/auth/logout-all` | Esce da tutti i dispositivi: i token emessi finora non sono più validi (CORE-030) | sessione |
| `GET` | `/auth/mfa` | Stato della verifica in due passaggi dell’utente corrente | sessione |
| `POST` | `/auth/mfa/confirm` | Conferma con il primo codice: attiva l’MFA e restituisce i codici di recupero (una sola volta) | sessione |
| `POST` | `/auth/mfa/disable` | Disattiva l’MFA con la password corrente (o un codice valido per gli utenti senza password) | sessione |
| `POST` | `/auth/mfa/enroll` | Avvia l’attivazione: segreto, URI otpauth e QR da inquadrare | sessione |
| `POST` | `/auth/mfa/recovery-codes` | Rigenera i codici di recupero (richiede un codice TOTP valido) | sessione |
| `POST` | `/auth/mfa/verify` | Secondo passaggio del login: codice TOTP o codice di recupero → sessione | pubblico |
| `GET` | `/auth/oidc/callback` |  | pubblico |
| `GET` | `/auth/oidc/start` | Avvia il login SSO (Authorization Code + PKCE): redirect all’identity provider del tenant | pubblico |
| `PATCH` | `/auth/password` | Cambia la propria password: revoca le altre sessioni e ne restituisce una nuova | sessione |
| `POST` | `/auth/refresh` | Rinnova la sessione corrente (ruoli aggiornati) | sessione |
| `POST` | `/auth/reset-password` |  | pubblico |
| `GET` | `/tenant/security` |  | sessione |
| `PUT` | `/tenant/security` | Politiche di sicurezza del tenant: ruoli per cui l’MFA è obbligatoria | sessione |
| `GET` | `/tenant/sso` |  | sessione |
| `PUT` | `/tenant/sso` | Configura l’SSO OIDC del tenant (client secret cifrato, provisioning automatico, domini ammessi) | sessione |

## core (24)

| Metodo | Percorso | Descrizione | Accesso |
|---|---|---|---|
| `GET` | `/me` | Principal corrente, persona collegata e permessi effettivi | sessione |
| `GET` | `/org-units` |  | sessione |
| `POST` | `/org-units` |  | sessione |
| `DELETE` | `/org-units/{id}` |  | sessione |
| `PATCH` | `/org-units/{id}` |  | sessione |
| `GET` | `/people` |  | sessione |
| `POST` | `/people` |  | sessione |
| `GET` | `/people/{id}` |  | sessione |
| `PATCH` | `/people/{id}` |  | sessione |
| `GET` | `/people/{id}/history` |  | sessione |
| `POST` | `/people/{id}/terminate` |  | sessione |
| `POST` | `/people/import` | Import persone da CSV. dryRun=true restituisce anteprima ed errori senza scrivere (CORE-012). | sessione |
| `GET` | `/people/import/template` |  | sessione |
| `POST` | `/role-assignments` |  | sessione |
| `DELETE` | `/role-assignments/{id}` |  | sessione |
| `GET` | `/tenant` |  | sessione |
| `PATCH` | `/tenant` |  | sessione |
| `GET` | `/users` | Utenti del tenant con persona, ruoli e stato (invitato, attivo, disattivato) | sessione |
| `POST` | `/users` |  | sessione |
| `POST` | `/users/{id}/disable` |  | sessione |
| `POST` | `/users/{id}/enable` |  | sessione |
| `POST` | `/users/{id}/resend-invite` |  | sessione |
| `GET` | `/users/{id}/roles` |  | sessione |
| `POST` | `/users/invite` | Invita una persona: crea utente (e persona se nuova), assegna i ruoli e invia il link di invito | sessione |

## objectives (16)

| Metodo | Percorso | Descrizione | Accesso |
|---|---|---|---|
| `GET` | `/cycles` |  | sessione |
| `POST` | `/cycles` |  | sessione |
| `PATCH` | `/cycles/{id}` |  | sessione |
| `GET` | `/cycles/current` |  | sessione |
| `DELETE` | `/key-results/{id}` |  | sessione |
| `PATCH` | `/key-results/{id}` |  | sessione |
| `GET` | `/key-results/{id}/check-ins` |  | sessione |
| `POST` | `/key-results/{id}/check-ins` | Check-in: nuovo valore, confidenza, commento; ricalcola progresso di obiettivo e padri | sessione |
| `GET` | `/objectives` | Elenco obiettivi visibili; ?tree=true restituisce l'albero di allineamento | sessione |
| `POST` | `/objectives` |  | sessione |
| `DELETE` | `/objectives/{id}` |  | sessione |
| `GET` | `/objectives/{id}` |  | sessione |
| `PATCH` | `/objectives/{id}` |  | sessione |
| `POST` | `/objectives/{id}/close` |  | sessione |
| `POST` | `/objectives/{id}/key-results` |  | sessione |
| `POST` | `/objectives/{id}/publish` |  | sessione |

## one-on-ones (18)

| Metodo | Percorso | Descrizione | Accesso |
|---|---|---|---|
| `GET` | `/action-items` |  | sessione |
| `PATCH` | `/action-items/{id}` |  | sessione |
| `GET` | `/meetings/{id}` |  | sessione |
| `PATCH` | `/meetings/{id}` |  | sessione |
| `POST` | `/meetings/{id}/action-items` |  | sessione |
| `POST` | `/meetings/{id}/complete` |  | sessione |
| `PUT` | `/meetings/{id}/notes/private` | Nota privata: visibile solo all'autore, cifrata a riposo | sessione |
| `PUT` | `/meetings/{id}/notes/shared` |  | sessione |
| `POST` | `/meetings/{id}/talking-points` |  | sessione |
| `GET` | `/one-on-ones` |  | sessione |
| `POST` | `/one-on-ones` |  | sessione |
| `GET` | `/one-on-ones/{id}` |  | sessione |
| `PATCH` | `/one-on-ones/{id}` |  | sessione |
| `POST` | `/one-on-ones/{id}/meetings` |  | sessione |
| `GET` | `/one-on-ones/{id}/suggestions` | Punti di agenda suggeriti da obiettivi, azioni scadute e feedback | sessione |
| `GET` | `/one-on-ones/metrics` | Metriche di adozione (solo aggregati: mai contenuti) | sessione |
| `DELETE` | `/talking-points/{id}` |  | sessione |
| `PATCH` | `/talking-points/{id}` |  | sessione |

## feedback (18)

| Metodo | Percorso | Descrizione | Accesso |
|---|---|---|---|
| `GET` | `/company-values` |  | sessione |
| `POST` | `/company-values` |  | sessione |
| `PATCH` | `/company-values/{id}` |  | sessione |
| `GET` | `/company-values/stats` |  | sessione |
| `GET` | `/feedback` |  | sessione |
| `POST` | `/feedback` | Dai un feedback (privato al destinatario o condiviso con il suo manager) | sessione |
| `POST` | `/feedback-request-recipients/{id}/decline` |  | sessione |
| `GET` | `/feedback-requests` |  | sessione |
| `POST` | `/feedback-requests` |  | sessione |
| `GET` | `/feedback-requests/{id}` |  | sessione |
| `GET` | `/feedback/{id}` |  | sessione |
| `POST` | `/feedback/{id}/acknowledge` |  | sessione |
| `POST` | `/feedback/{id}/add-to-record` | Il destinatario rende il feedback parte del proprio fascicolo (visibile anche ai manager successivi e all'HR) | sessione |
| `POST` | `/feedback/{id}/share-with-manager` |  | sessione |
| `GET` | `/recognitions` |  | sessione |
| `POST` | `/recognitions` |  | sessione |
| `DELETE` | `/recognitions/{id}` |  | sessione |
| `POST` | `/recognitions/{id}/reactions` |  | sessione |

## notifications (6)

| Metodo | Percorso | Descrizione | Accesso |
|---|---|---|---|
| `GET` | `/notification-preferences` |  | sessione |
| `PUT` | `/notification-preferences` |  | sessione |
| `GET` | `/notifications` |  | sessione |
| `POST` | `/notifications/{id}/read` |  | sessione |
| `POST` | `/notifications/read-all` |  | sessione |
| `GET` | `/notifications/unread-count` |  | sessione |

## forms (12)

| Metodo | Percorso | Descrizione | Accesso |
|---|---|---|---|
| `GET` | `/form-responses` |  | sessione |
| `POST` | `/form-responses` |  | sessione |
| `GET` | `/form-responses/{id}` |  | sessione |
| `PUT` | `/form-responses/{id}/draft` |  | sessione |
| `POST` | `/form-responses/{id}/submit` |  | sessione |
| `POST` | `/form-responses/{id}/validate` |  | sessione |
| `GET` | `/forms` |  | sessione |
| `POST` | `/forms` | Crea una definizione di form (bozza) a partire da uno schema dichiarativo | sessione |
| `GET` | `/forms/{id}` |  | sessione |
| `PATCH` | `/forms/{id}` |  | sessione |
| `POST` | `/forms/{id}/publish` |  | sessione |
| `POST` | `/forms/{id}/versions` |  | sessione |

## reviews (29)

| Metodo | Percorso | Descrizione | Accesso |
|---|---|---|---|
| `GET` | `/calibration-sessions` | Sessioni di calibrazione: tutte per HR, le proprie per partecipanti e facilitatori | sessione |
| `GET` | `/calibration-sessions/{id}` | Sessione: righe, distribuzione vs attesa, medie per manager con outlier, 9-box | sessione |
| `PATCH` | `/calibration-sessions/{id}` |  | sessione |
| `POST` | `/calibration-sessions/{id}/lock` | Blocca la sessione (HR o facilitatore): i rating diventano definitivi e le review si possono condividere | sessione |
| `POST` | `/calibration-sessions/{id}/ratings` | Cambia rating e/o potenziale di una review in sessione (storico REV-043, alimenta la 9-box) | sessione |
| `POST` | `/calibration-sessions/{id}/unlock` |  | sessione |
| `GET` | `/review-cycles` |  | sessione |
| `POST` | `/review-cycles` |  | sessione |
| `GET` | `/review-cycles/{id}` |  | sessione |
| `PATCH` | `/review-cycles/{id}` |  | sessione |
| `POST` | `/review-cycles/{id}/calibration-sessions` | Crea una sessione di calibrazione sul ciclo: perimetro per unità, partecipanti, distribuzione attesa | sessione |
| `POST` | `/review-cycles/{id}/close` |  | sessione |
| `POST` | `/review-cycles/{id}/launch` |  | sessione |
| `GET` | `/review-cycles/{id}/population` | Anteprima popolazione: inclusi, esclusi e persone senza manager | sessione |
| `GET` | `/review-cycles/{id}/progress` |  | sessione |
| `POST` | `/review-cycles/{id}/remind` |  | sessione |
| `GET` | `/review-templates` |  | sessione |
| `POST` | `/review-templates` | Template di review: form self/manager (chiavi del form engine), fasi, scadenze, regole | sessione |
| `PATCH` | `/review-templates/{id}` |  | sessione |
| `GET` | `/reviews` |  | sessione |
| `GET` | `/reviews/{id}` |  | sessione |
| `POST` | `/reviews/{id}/approve` | Catena di approvazione (REV-050): approva il passo attivo o rimanda al manager con commento | sessione |
| `GET` | `/reviews/{id}/context` | Pannello di contesto: obiettivi, feedback condivisi, riconoscimenti, review precedenti, 1:1 | sessione |
| `POST` | `/reviews/{id}/conversation` |  | sessione |
| `GET` | `/reviews/{id}/pdf` | Export PDF della review (REV-054): contenuti secondo la visibilità di chi chiede; tracciato nell’audit | sessione |
| `POST` | `/reviews/{id}/rating-override` |  | sessione |
| `POST` | `/reviews/{id}/reopen` |  | sessione |
| `POST` | `/reviews/{id}/share` |  | sessione |
| `POST` | `/reviews/{id}/sign` |  | sessione |

## surveys (13)

| Metodo | Percorso | Descrizione | Accesso |
|---|---|---|---|
| `GET` | `/surveys` | Survey: le mie (invitato) oppure tutte (HR, box=all) | sessione |
| `POST` | `/surveys` | Crea una survey da template della libreria (engagement, pulse, eNPS, benessere) o da un form pubblicato | sessione |
| `GET` | `/surveys/{id}` |  | sessione |
| `PATCH` | `/surveys/{id}` |  | sessione |
| `POST` | `/surveys/{id}/close` |  | sessione |
| `POST` | `/surveys/{id}/extend` |  | sessione |
| `GET` | `/surveys/{id}/form` | Questionario da compilare (solo invitati) con dichiarazione di anonimato | sessione |
| `POST` | `/surveys/{id}/launch` | Lancia: crea gli inviti e notifica la popolazione | sessione |
| `POST` | `/surveys/{id}/remind` | Sollecita i non rispondenti (restituisce solo i conteggi) | sessione |
| `POST` | `/surveys/{id}/respond` | Invia le risposte: nelle survey anonime nessun legame con la persona | sessione |
| `GET` | `/surveys/{id}/results` | Risultati aggregati con soglia di anonimato: driver, domande, eNPS, heatmap, commenti (HR), confronto con la precedente | sessione |
| `POST` | `/surveys/{id}/share` | Pubblica la sintesi ai rispondenti | sessione |
| `GET` | `/surveys/{id}/summary` | Sintesi pubblicata dall’HR (dopo la condivisione) | sessione |

## welfare (33)

| Metodo | Percorso | Descrizione | Accesso |
|---|---|---|---|
| `POST` | `/welfare/adjustments` | Ricarica o storno manuale con motivazione (WEL-005) | sessione |
| `GET` | `/welfare/catalog` |  | sessione |
| `POST` | `/welfare/catalog` |  | sessione |
| `PATCH` | `/welfare/catalog/{id}` |  | sessione |
| `GET` | `/welfare/categories` |  | sessione |
| `PUT` | `/welfare/categories` |  | sessione |
| `PUT` | `/welfare/declarations` | Dichiarazione annuale (es. figli a carico) che seleziona la variante di soglia | sessione |
| `GET` | `/welfare/initiatives` |  | sessione |
| `POST` | `/welfare/initiatives` |  | sessione |
| `POST` | `/welfare/initiatives/{id}/join` |  | sessione |
| `POST` | `/welfare/initiatives/{id}/leave` |  | sessione |
| `GET` | `/welfare/me` | Il mio welfare: piani, saldo, movimenti, richieste, categorie con cumulo e soglie, catalogo, dichiarazioni, iniziative, premio | sessione |
| `GET` | `/welfare/payroll/batches` |  | sessione |
| `POST` | `/welfare/payroll/batches` | Crea il lotto payroll con rimborsi approvati ed eccedenze imponibili | sessione |
| `POST` | `/welfare/payroll/batches/{id}/confirm` | Conferma liquidazione: le richieste passano a "pagata" | sessione |
| `GET` | `/welfare/payroll/batches/{id}/csv` |  | sessione |
| `GET` | `/welfare/payroll/preview` |  | sessione |
| `GET` | `/welfare/plans` |  | sessione |
| `POST` | `/welfare/plans` |  | sessione |
| `GET` | `/welfare/plans/{id}` |  | sessione |
| `PATCH` | `/welfare/plans/{id}` |  | sessione |
| `POST` | `/welfare/plans/{id}/activate` | Attiva il piano e accredita le fonti con data raggiunta (pro-rata per gli ingressi in corso d’anno) | sessione |
| `POST` | `/welfare/plans/{id}/close` | Chiude il piano applicando la regola di roll-over al residuo | sessione |
| `POST` | `/welfare/plans/{id}/sources` |  | sessione |
| `POST` | `/welfare/premium/choice` | Scelta irrevocabile di conversione del premio (nella finestra, con presa visione del regolamento) | sessione |
| `GET` | `/welfare/premium/simulate` | Simulatore indicativo cash vs welfare | sessione |
| `POST` | `/welfare/presets` | Carica categorie e soglie di riferimento per l’anno (indicative, da verificare) | sessione |
| `GET` | `/welfare/requests` | Coda richieste (status=open \| approved \| …) | sessione |
| `POST` | `/welfare/requests` | Nuova richiesta (rimborso, voucher, servizio): prenota il budget e calcola l’eccedenza sulla soglia | sessione |
| `POST` | `/welfare/requests/{id}/cancel` |  | sessione |
| `POST` | `/welfare/requests/{id}/decide` |  | sessione |
| `GET` | `/welfare/thresholds` |  | sessione |
| `PUT` | `/welfare/thresholds` |  | sessione |

## analytics (16)

| Metodo | Percorso | Descrizione | Accesso |
|---|---|---|---|
| `GET` | `/analytics/alerts` | Segnali: persone senza obiettivi, senza 1:1, review scadute, KR stale, azioni scadute | sessione |
| `GET` | `/analytics/metrics` | Data dictionary: catalogo metriche visibili al richiedente | sessione |
| `GET` | `/analytics/process` |  | sessione |
| `GET` | `/analytics/process/{cycleId}` | Report di processo di un ciclo di review: completamento per fase, unità e manager, ritardatari, tempi | sessione |
| `GET` | `/analytics/query` | Metriche × dimensione × filtri alla data (ultimo snapshot); soglie e perimetro applicati lato server | sessione |
| `POST` | `/analytics/refresh` | Ricalcola lo snapshot di oggi del data mart per il tenant | sessione |
| `GET` | `/analytics/reports` | Report salvati visibili all’utente: propri e condivisi con il suo ruolo o con lui (ANA-052) | sessione |
| `POST` | `/analytics/reports` | Salva un report: metriche, dimensione, filtri, confronto, visualizzazione, condivisione, pianificazione (ANA-050/060) | sessione |
| `DELETE` | `/analytics/reports/{id}` |  | sessione |
| `GET` | `/analytics/reports/{id}` |  | sessione |
| `PATCH` | `/analytics/reports/{id}` |  | sessione |
| `POST` | `/analytics/reports/{id}/duplicate` |  | sessione |
| `GET` | `/analytics/reports/{id}/recipients` |  | sessione |
| `GET` | `/analytics/reports/{id}/run` | Esegue il report con perimetro e soglie di chi lo apre; filtri dinamici date/orgUnitId/managerId/cycleId (ANA-051); format=csv per l’export | sessione |
| `POST` | `/analytics/reports/{id}/send` | Invia subito il report all’utente corrente via email (CSV allegato) | sessione |
| `GET` | `/analytics/trend` | Serie giornaliera di una metrica | sessione |

## calendar (6)

| Metodo | Percorso | Descrizione | Accesso |
|---|---|---|---|
| `DELETE` | `/calendar/feed` | Disattiva il feed personale | sessione |
| `GET` | `/calendar/feed` | Stato del feed iCalendar personale (URL segreto) e anteprima dei prossimi eventi (INT-022) | sessione |
| `GET` | `/calendar/feed/{token}.ics` | Feed iCalendar (text/calendar) da sottoscrivere in Google Calendar, Outlook, Apple Calendar | pubblico |
| `POST` | `/calendar/feed/rotate` | Attiva il feed o rigenera l’URL segreto (il precedente smette di funzionare) | sessione |
| `GET` | `/meetings/{id}.ics` | Invito .ics del singolo 1:1 (Aggiungi al calendario) | sessione |
| `GET` | `/one-on-ones/{id}/slots` | Proposte di slot per il prossimo 1:1 da orario di lavoro e impegni noti (INT-024) | sessione |

## development (16)

| Metodo | Percorso | Descrizione | Accesso |
|---|---|---|---|
| `PATCH` | `/development/actions/{id}` |  | sessione |
| `PUT` | `/development/competencies` |  | sessione |
| `GET` | `/development/framework` | Competenze, job profile (con persone assegnate) e libreria di azioni suggerite | sessione |
| `POST` | `/development/framework/presets` | Carica la libreria di competenze predefinita (DEV-001), senza sovrascrivere quelle esistenti | sessione |
| `POST` | `/development/job-profiles` |  | sessione |
| `PATCH` | `/development/job-profiles/{id}` |  | sessione |
| `GET` | `/development/me` | Il mio profilo competenze: atteso vs valutato per fonte, gap, ruolo successivo, piano e azioni suggerite | sessione |
| `GET` | `/development/people` | Persone del perimetro con profilo, piano e azioni (manager: riporti; HR: tutti) | sessione |
| `GET` | `/development/people/{id}` |  | sessione |
| `POST` | `/development/people/{id}/assessments` | Valutazione competenze: source=self (la persona) o manager (manager/HR) | sessione |
| `PUT` | `/development/people/{id}/job-profile` |  | sessione |
| `POST` | `/development/plans` |  | sessione |
| `PATCH` | `/development/plans/{id}` | Aggiorna il piano: invio in approvazione, approvazione (manager/HR), completamento, archiviazione | sessione |
| `POST` | `/development/plans/{id}/actions` |  | sessione |
| `GET` | `/development/talent` | 9-box: performance dall’ultima review, potenziale del manager; mai visibile al collaboratore | sessione |
| `PUT` | `/development/talent/{personId}` |  | sessione |

## apps (20)

| Metodo | Percorso | Descrizione | Accesso |
|---|---|---|---|
| `GET` | `/apps` | App: quelle che posso avviare (launchable) oppure tutte le versioni correnti (all, HR) | sessione |
| `POST` | `/apps` | Crea un’app in bozza da una definizione dichiarativa (fasi, attori, approvazioni, instradamenti) | sessione |
| `GET` | `/apps/{id}` |  | sessione |
| `PATCH` | `/apps/{id}` | Modifica una bozza (le versioni pubblicate sono immutabili: usa versions) | sessione |
| `POST` | `/apps/{id}/archive` |  | sessione |
| `POST` | `/apps/{id}/duplicate` | Duplica come nuova app in bozza (APP-031) | sessione |
| `GET` | `/apps/{id}/export` | Esporta definizione e form in JSON (APP-035) | sessione |
| `POST` | `/apps/{id}/publish` | Pubblica: valida la definizione contro i form pubblicati e archivia la versione precedente | sessione |
| `POST` | `/apps/{id}/versions` | Nuova versione in bozza a partire da quella pubblicata (le istanze in corso restano sulla loro) | sessione |
| `GET` | `/apps/dashboard` | Istanze per app e fase: attive, scadute, concluse (APP-034) | sessione |
| `POST` | `/apps/import` | Importa un’app da JSON (definizione + form), come esportata da un altro tenant (APP-035) | sessione |
| `GET` | `/apps/instances` | Istanze: da fare (todo), su di me (mine), avviate da me (launched), del mio team (team), tutte (all, HR); format=csv per l’export | sessione |
| `POST` | `/apps/instances` | Avvia un’istanza per un soggetto secondo i permessi dell’app; risolve gli attori e attiva la prima fase | sessione |
| `GET` | `/apps/instances/{id}` | Istanza con fasi, run, risposte visibili secondo il ruolo e log | sessione |
| `POST` | `/apps/instances/{id}/cancel` |  | sessione |
| `POST` | `/apps/runs/{id}/decide` | Approva o rimanda una fase di approvazione (con commento); il rimando riapre la fase indicata | sessione |
| `POST` | `/apps/runs/{id}/extend` | Proroga la scadenza di una fase attiva (APP-025) | sessione |
| `POST` | `/apps/runs/{id}/reassign` | Riassegna una fase attiva a un’altra persona (APP-025) | sessione |
| `GET` | `/apps/templates` | Template pronti (richiesta formazione, proposta promozione, fine progetto, exit interview, segnalazione HR) | sessione |
| `POST` | `/apps/templates/install` | Installa un template: crea e pubblica i suoi form, crea l’app in bozza | sessione |

## f360 (30)

| Metodo | Percorso | Descrizione | Accesso |
|---|---|---|---|
| `GET` | `/f360/campaigns` | Campagne 360° del tenant con avanzamento | sessione |
| `POST` | `/f360/campaigns` | Crea una campagna 360°: competenze del framework, scala, domande aperte, categorie con min/max/anonimato, regole di nomina e rilascio, popolazione | sessione |
| `GET` | `/f360/campaigns/{id}` |  | sessione |
| `PATCH` | `/f360/campaigns/{id}` |  | sessione |
| `GET` | `/f360/campaigns/{id}/aggregate` | Heatmap competenze per unità o manager sui report generati, con soppressione sotto soglia; format=csv per l’export | sessione |
| `POST` | `/f360/campaigns/{id}/close` | Chiude la raccolta e genera i report con la soglia di anonimato; alimenta le valutazioni di competenza (fonte 360°) | sessione |
| `POST` | `/f360/campaigns/{id}/launch` | Lancia la fase di nomina: crea i soggetti (self e manager già inclusi) e avvisa chi deve nominare | sessione |
| `GET` | `/f360/campaigns/{id}/population` | Anteprima dei soggetti della popolazione | sessione |
| `GET` | `/f360/campaigns/{id}/progress` | Avanzamento per soggetto: stato, invitati e risposte per categoria (mai chi ha risposto nelle categorie anonime) | sessione |
| `POST` | `/f360/campaigns/{id}/remind` | Sollecita i valutatori che non hanno ancora risposto (una volta al giorno) | sessione |
| `POST` | `/f360/campaigns/{id}/start-collection` | Avvia la raccolta: approva le nomine rimaste in sospeso, invita i valutatori (magic link per gli esterni) | sessione |
| `GET` | `/f360/external/{token}` | Questionario per un valutatore esterno tramite il link ricevuto via email | sessione |
| `PUT` | `/f360/external/{token}/draft` |  | sessione |
| `POST` | `/f360/external/{token}/submit` |  | sessione |
| `DELETE` | `/f360/nominations/{id}` |  | sessione |
| `GET` | `/f360/requests` | Richieste di feedback 360° ricevute, con stato e scadenza (F360-012) | sessione |
| `GET` | `/f360/requests/{id}` | Questionario da compilare: competenze con livelli, scala, domande aperte, bozza | sessione |
| `POST` | `/f360/requests/{id}/decline` |  | sessione |
| `PUT` | `/f360/requests/{id}/draft` |  | sessione |
| `POST` | `/f360/requests/{id}/submit` | Invia le risposte: nelle categorie anonime nessun legame con la richiesta | sessione |
| `GET` | `/f360/subjects` | I miei 360° (mine), quelli dei miei riporti (team) o tutti (all, HR) | sessione |
| `GET` | `/f360/subjects/{id}` | Dettaglio: nomine per categoria, stato, report se rilasciato a chi chiede | sessione |
| `POST` | `/f360/subjects/{id}/debrief` | Registra il debrief (data e nota); con la regola "dopo debrief" rilascia il report | sessione |
| `POST` | `/f360/subjects/{id}/dev-actions` | Crea un’azione nel piano di sviluppo a partire da un’area del report (F360-026) | sessione |
| `POST` | `/f360/subjects/{id}/nominations` | Nomina un valutatore interno (persona) o esterno (email e nome) | sessione |
| `POST` | `/f360/subjects/{id}/nominations/approve` | Approva le nomine (manager o HR), con eventuali esclusioni | sessione |
| `POST` | `/f360/subjects/{id}/nominations/submit` | Invia le nomine: verifica i minimi per categoria e, se previsto, chiede l’approvazione al manager | sessione |
| `POST` | `/f360/subjects/{id}/release` | Rilascia il report alla persona secondo la regola della campagna | sessione |
| `GET` | `/f360/subjects/{id}/report.pdf` | Export PDF del report 360° (F360-024), solo se visibile a chi chiede; tracciato nell’audit | sessione |
| `GET` | `/f360/subjects/{id}/suggestions` | Suggerimenti di nomina dall’organizzazione: riporti, pari dello stesso team, colleghi con 1:1 (F360-010) | sessione |

## integrations (7)

| Metodo | Percorso | Descrizione | Accesso |
|---|---|---|---|
| `GET` | `/integrations` | Connettori disponibili nel tenant e i miei collegamenti (calendario Google/Microsoft, Slack) | sessione |
| `DELETE` | `/integrations/{provider}` | Scollega il mio calendario oppure (amministratori) disinstalla Slack | sessione |
| `POST` | `/integrations/{provider}/connect` | URL di autorizzazione OAuth (PKCE, state firmato): calendario personale o installazione Slack (amministratori) | sessione |
| `POST` | `/integrations/{provider}/test` | Messaggio di prova: DM Slack a chi chiede o card nel canale Teams (consegna dal worker) | sessione |
| `GET` | `/integrations/callback/{provider}` | Callback OAuth del provider: salva i token cifrati e rimanda alle Impostazioni della web app | sessione |
| `GET` | `/integrations/config` | Configurazione dei connettori (app OAuth per tenant, webhook Teams); i segreti non vengono restituiti | sessione |
| `PUT` | `/integrations/config` | Aggiorna la configurazione: client id/secret (cifrato), abilitazione, canale riconoscimenti, webhook Teams, endpoint alternativi | sessione |

## onboarding (21)

| Metodo | Percorso | Descrizione | Accesso |
|---|---|---|---|
| `GET` | `/onboarding/dashboard` | Avanzamento per persona, task in ritardo per ruolo, punteggi delle survey con segnali (ONB-016/017) | sessione |
| `GET` | `/onboarding/external/{token}` | Percorso di pre-boarding della persona senza account: task prima dell’ingresso, moduli inclusi | sessione |
| `POST` | `/onboarding/external/{token}/tasks/{taskId}` | Completa un task di pre-boarding (lettura, presa visione con conferma, attività) | sessione |
| `POST` | `/onboarding/external/{token}/tasks/{taskId}/form` | Invia il modulo di un task di pre-boarding (form engine) | sessione |
| `GET` | `/onboarding/journeys` | Percorsi: miei (mine), dei miei riporti (team) o tutti (all, HR) | sessione |
| `POST` | `/onboarding/journeys` | Avvia un percorso per una persona: template esplicito o scelto dalle regole; scadenze dalla data di riferimento | sessione |
| `GET` | `/onboarding/journeys/{id}` |  | sessione |
| `PATCH` | `/onboarding/journeys/{id}` | Buddy, IT/HR di riferimento, data di riferimento (ricalcola le scadenze aperte), stato | sessione |
| `GET` | `/onboarding/journeys/{id}/buddy-suggestions` | Suggerimenti buddy: stesso team o unità, anzianità, carico (ONB-013) | sessione |
| `POST` | `/onboarding/journeys/{id}/external-link` | Invia (o reinvia) alla persona il magic link del pre-boarding: task prima dell’ingresso senza account (ONB-011) | sessione |
| `POST` | `/onboarding/journeys/{id}/surveys/{key}` | Invia la mini-survey di onboarding (nominale); punteggi bassi avvisano manager e HR | sessione |
| `POST` | `/onboarding/journeys/{id}/tasks` | Aggiunge un task ad hoc al percorso | sessione |
| `POST` | `/onboarding/journeys/auto` | Avvia i percorsi mancanti per i nuovi ingressi recenti e le uscite programmate (ONB-010) | sessione |
| `GET` | `/onboarding/me` | Il mio onboarding (percorso attivo o ultimo) e i task assegnati a me in tutti i percorsi (ONB-012) | sessione |
| `GET` | `/onboarding/tasks` | Task di onboarding assegnati a me (come persona, manager, buddy, HR o IT) | sessione |
| `PATCH` | `/onboarding/tasks/{id}` | Completa, salta o riapre un task; la presa visione richiede la conferma esplicita (ONB-014) | sessione |
| `GET` | `/onboarding/templates` | Template di percorso (onboarding, cambio ruolo, offboarding) con fasi, task e regole di assegnazione | sessione |
| `POST` | `/onboarding/templates` |  | sessione |
| `GET` | `/onboarding/templates/{id}` |  | sessione |
| `PATCH` | `/onboarding/templates/{id}` |  | sessione |
| `POST` | `/onboarding/templates/presets` | Carica i percorsi predefiniti (generico, manager, remoto, cambio ruolo, offboarding) non ancora presenti | sessione |
