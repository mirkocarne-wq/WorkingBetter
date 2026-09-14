# Onboarding (`ONB`)

| | |
|---|---|
| **Priorità** | P1 |
| **Stato** | In implementazione (sprint 14: ONB-001 editor con fasi, task per ruolo, scadenze relative, link e form del form engine, 002 cinque template predefiniti, 003 regole per unità/sede/job title con default, 004 milestone 30/60/90 come incontri e mini-survey preconfigurati, 010 avvio automatico per ingressi recenti e uscite dal worker o da HR, 012 vista «Il mio percorso», 013 buddy con suggerimenti, 014 presa visione con conferma esplicita tracciata, 015 task «obiettivi» chiuso automaticamente quando esiste un obiettivo attivo, 016 dashboard HR/manager, 017 survey 7/30/90 nominali con alert, 018 offboarding con exit survey come template dello stesso motore; sprint 17: 011 pre-boarding con identità esterna via magic link e convergenza del percorso sul motore dei processi; mancano ONB-005 task condizionali, contenuti allegati video/documento (solo link), Slack/Teams) |
| **Dipendenze** | CORE, ONE, ENG, OKR, APP (workflow engine) |
| **Ultimo aggiornamento** | 2026-09-14 |

## 1. Scopo

Accompagnare i nuovi assunti (e le persone che cambiano ruolo) con un percorso strutturato di task, incontri, contenuti e verifiche a 30/60/90 giorni, coordinando HR, manager, buddy e IT.

## 2. Concetti chiave

- **Percorso di onboarding (Journey)**: template con fasi temporali (pre-boarding, settimana 1, mese 1, 60 giorni, 90 giorni) e task; variabile per sede, job family, tipo contratto.
- **Task**: attività con assegnatario per ruolo (neoassunto, manager, HR, buddy, IT), scadenza relativa alla data di ingresso, tipo (da fare, leggere, firmare, compilare form, incontro), contenuto allegato.
- **Buddy**: collega di riferimento assegnato.
- **Milestone**: check-in 30/60/90 con 1:1 template e mini-survey.
- **Istanza di onboarding**: percorso applicato a una persona specifica.

## 3. Attori e permessi

| Azione | HR Admin | Manager | Neoassunto | Buddy / IT |
|---|---|---|---|---|
| Creare template percorso | ✅ | ❌ | ❌ | ❌ |
| Avviare onboarding per una persona | ✅ | ✅ (se abilitato) | ❌ | ❌ |
| Vedere l'intero percorso della persona | ✅ | ✅ | ✅ (propri task + panoramica) | ❌ (solo propri task) |
| Completare task | proprio ruolo | proprio ruolo | proprio ruolo | proprio ruolo |
| Vedere dashboard di avanzamento | ✅ | ✅ (team) | ❌ | ❌ |

## 4. Requisiti funzionali

### 4.1 Template

| ID | Requisito | Priorità |
|----|-----------|----------|
| ONB-001 | Editor percorso: fasi, task per ruolo con scadenza relativa (es. −5 giorni, +1, +30), contenuti (testo, link, documento, video), form da compilare (APP) | P1 |
| ONB-002 | Template predefiniti (generico, manager, remoto, cambio ruolo interno, offboarding) | P1 |
| ONB-003 | Regole di assegnazione automatica del template (per sede, job family, contratto) | P1 |
| ONB-004 | Milestone 30/60/90 con 1:1 template e mini-survey pre-configurati | P1 |
| ONB-005 | Task condizionali (es. "richiedi badge" solo se sede fisica) | P2 |

### 4.2 Esecuzione

| ID | Requisito | Priorità |
|----|-----------|----------|
| ONB-010 | Avvio automatico all'inserimento di una persona con data ingresso (da HRIS o manuale) | P1 |
| ONB-011 | Pre-boarding: accesso limitato del neoassunto prima del primo giorno (email personale, magic link) | P2 |
| ONB-012 | Vista "Il mio onboarding": timeline, task, persone chiave, documenti, progresso | P1 |
| ONB-013 | Assegnazione buddy con suggerimenti (stesso team, anzianità) | P1 |
| ONB-014 | Task con firma/presa visione tracciata | P1 |
| ONB-015 | Il neoassunto imposta i primi obiettivi (OKR) come task del percorso | P1 |
| ONB-016 | Dashboard HR/manager: avanzamento per persona, task in ritardo per assegnatario | P1 |
| ONB-017 | Survey di onboarding (7, 30, 90 giorni) con risultati aggregati e alert su punteggi bassi | P1 |
| ONB-018 | Offboarding: percorso speculare con exit survey e checklist restituzioni | P2 |

## 5. Flussi principali

```mermaid
gantt
    title Percorso tipo
    dateFormat  YYYY-MM-DD
    axisFormat  %d/%m
    section Pre-boarding
    Contratto firmato, benvenuto      :2026-01-05, 7d
    IT prepara dotazioni              :2026-01-05, 7d
    section Settimana 1
    Primo 1:1 con manager             :2026-01-12, 1d
    Incontro buddy                    :2026-01-13, 1d
    Formazione obbligatoria           :2026-01-12, 5d
    section Mese 1
    Definizione obiettivi             :2026-01-19, 10d
    Check-in 30 giorni + survey       :2026-02-11, 1d
    section 60/90
    Check-in 60 giorni                :2026-03-13, 1d
    Check-in 90 giorni + fine prova   :2026-04-12, 1d
```

## 6. Regole di business

- Le scadenze relative si calcolano dalla data di ingresso; se cambia, si ricalcolano i task non completati.
- Il cambio manager durante l'onboarding riassegna i task del ruolo "manager" non completati.
- Le survey di onboarding sono nominali (non anonime) per consentire intervento, e ciò è dichiarato.

## 7. Notifiche

| Evento | Destinatari | Canali |
|---|---|---|
| Nuovo onboarding avviato | Manager, buddy, IT, HR | Email, in-app |
| Task assegnato / in scadenza / scaduto | Assegnatario | In-app, email, Slack/Teams |
| Milestone raggiunta | Neoassunto, manager | In-app |
| Survey con punteggio basso | HR, manager | In-app, email |

## 8. Analytics del modulo

- Tempo medio di completamento percorso; task in ritardo per ruolo assegnatario.
- Punteggi survey 30/60/90 per unità/manager; correlazione con uscite entro 12 mesi.

## 9. Assunzioni / Domande aperte

- **Pre-boarding con identità esterna** (ONB-011, sprint 17): all'avvio di un percorso di onboarding, se la persona non ha ancora un account e ha un'email, riceve un magic link (valido fino a 30 giorni dopo l'ingresso) che mostra solo i suoi task nelle fasi che iniziano prima della data di riferimento (`fromDay < 0`): attività, letture, prese visione con conferma esplicita e moduli del form engine. Nessuna sessione, nessun'altra pagina raggiungibile; le azioni passano dallo stesso servizio degli utenti autenticati con un principal sintetico della persona (stesse regole, audit con marcatore `external`). HR e manager possono (ri)inviare il link, che invalida il precedente; chi ha già un account non lo riceve. Le survey non sono compilabili dal link (richiedono l'account). Da confermare: durata del link e se il pre-boarding debba includere anche task di altre fasi con scadenza negativa.
- **Convergenza sul motore dei processi** (ADR-0011, sprint 17): ogni percorso avviato è anche un'istanza silenziosa del motore (`onboarding_<percorso>`), con una fase per task in un unico gruppo parallelo (tutti aperti dall'avvio, ognuno con la propria scadenza); i task `form` sono fasi form (la compilazione nasce dal motore), gli altri approvazioni «fatto/saltato» concluse dal modulo. Il modulo resta padrone di ruoli, buddy, survey, traguardi, notifiche e permessi; il motore dà tentativi, log e la pagina «Processo» per l'HR. Le decisioni non si prendono dal motore (le fasi sono «gestite dal modulo»). I task ad hoc aggiunti dopo l'avvio non sono rispecchiati; i percorsi precedenti alla convergenza continuano senza istanza.
- **Ruoli HR e IT**: il percorso ha un referente HR (chi avvia, se HR) e uno IT opzionale; senza referente i task ricadono su HR → manager. Da confermare se serve un ruolo IT a livello di tenant.
- **Survey nominali** (ONB §6): la mini-survey (4 domande 1–5 + commento) è interna al modulo, non passa dal motore survey anonimo; la pagina lo dichiara. Alert a manager e HR se la media è sotto 3 o una risposta è ≤ 2.
- **Avvio automatico**: il worker avvia il percorso per chi ha data di ingresso negli ultimi 30 giorni senza percorso, e l'offboarding per chi è in stato «in uscita» con data; l'HR può forzarlo da «Persone». Il cambio manager non riassegna ancora i task automaticamente (si fa dal percorso).
- **Task «obiettivi»** (ONB-015): chiuso dal worker quando la persona ha almeno un obiettivo attivo; resta comunque chiudibile a mano.
- **Editor**: fasi e task si modificano come JSON con anteprima tabellare; un editor visuale è previsto con l'App Studio.

## 10. Modifiche rispetto a PeopleGoal

- **Alert su survey di onboarding** con punteggi bassi (ONB-017) per intervento tempestivo.
- **Percorsi per cambio ruolo interno e offboarding** come template dello stesso motore.

## 11. Note di implementazione (sprint 14 e 17)

- Tabelle `onboarding_templates` (fasi, task e regole in JSON), `onboarding_journeys` (istanza con snapshot delle fasi, manager, buddy, HR, IT, data di riferimento, traguardi notificati), `onboarding_tasks` (assegnatario risolto, scadenza assoluta, stato e nota di presa visione), `onboarding_survey_responses`; RLS (migrazioni 0024/0025). Metriche «Onboarding in corso» e «Task di onboarding scaduti».
- Logica pura in `@wb/shared/onboarding`: preset, scadenze relative, avanzamento e completamento, regole di assegnazione, suggerimenti buddy, punteggio e alert survey, risoluzione dell'assegnatario per ruolo con fallback (buddy → manager → HR).
- Endpoint `/onboarding/*`; permessi `onboarding:use` (tutti), `onboarding:team` (manager: avvia per i riporti, dashboard del team, buddy, task ad hoc), `onboarding:manage` (HR). I task di tipo `form` creano la compilazione nel form engine e si chiudono alla consegna. Notifiche `onboarding.*`; il worker avvia i percorsi mancanti, ricorda i task in scadenza (2 giorni) e scaduti, chiude i task «obiettivi», completa i percorsi.
- Web: **Onboarding** con «Il mio percorso» (timeline per fase, presa visione, survey inline), «I miei task» (anche come manager/buddy/HR/IT), «Persone» (dashboard, avvio, task scaduti per assegnatario) e «Percorsi» (template con anteprima ed editor).
- Sprint 17: `onboarding_journeys.app_instance_id`, `external_email`, `external_token_hash`, `external_token_expires_at`; `onboarding_tasks.stage_key` (migrazione 0029). `onboardingJourneyToApp` in `@wb/shared/apps` traduce percorso e task in definizione di app; `OnboardingService` avvia con `AppsService.launchInternal`, sincronizza completamento/salto/riapertura, scadenze e assegnatari con `completeRunInternal`/`skipRunInternal`/`reopenStage`/`setDueInternal`/`reassignInternal`, chiude o annulla l'istanza con il percorso e ascolta le fasi form con `onStageDone`. Endpoint: `POST /onboarding/journeys/{id}/external-link` (HR/manager) e, pubblici con rate limit, `GET /onboarding/external/{token}`, `POST /onboarding/external/{token}/tasks/{taskId}`, `POST /onboarding/external/{token}/tasks/{taskId}/form`. Web: pagina pubblica `/onboarding/external/[token]`, pulsanti «Invia link pre-boarding» e «Processo» nel percorso.
