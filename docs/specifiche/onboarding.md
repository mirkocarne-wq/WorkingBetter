# Onboarding (`ONB`)

| | |
|---|---|
| **Priorità** | P1 |
| **Stato** | In implementazione (sprint 14: ONB-001 editor con fasi, task per ruolo, scadenze relative, link e form del form engine, 002 cinque template predefiniti, 003 regole per unità/sede/job title con default, 004 milestone 30/60/90 come incontri e mini-survey preconfigurati, 010 avvio automatico per ingressi recenti e uscite dal worker o da HR, 012 vista «Il mio percorso», 013 buddy con suggerimenti, 014 presa visione con conferma esplicita tracciata, 015 task «obiettivi» chiuso automaticamente quando esiste un obiettivo attivo, 016 dashboard HR/manager, 017 survey 7/30/90 nominali con alert, 018 offboarding con exit survey come template dello stesso motore; mancano ONB-005 task condizionali, 011 pre-boarding con identità esterne, contenuti allegati video/documento (solo link), Slack/Teams) |
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

- Il pre-boarding richiede gestione di identità esterne (email personale): confermare priorità. **Rinviato**: oggi i task del neoassunto partono dal primo accesso; quelli con scadenza negativa (pre-boarding) sono assegnati a HR, manager, buddy e IT.
- **Ruoli HR e IT**: il percorso ha un referente HR (chi avvia, se HR) e uno IT opzionale; senza referente i task ricadono su HR → manager. Da confermare se serve un ruolo IT a livello di tenant.
- **Survey nominali** (ONB §6): la mini-survey (4 domande 1–5 + commento) è interna al modulo, non passa dal motore survey anonimo; la pagina lo dichiara. Alert a manager e HR se la media è sotto 3 o una risposta è ≤ 2.
- **Avvio automatico**: il worker avvia il percorso per chi ha data di ingresso negli ultimi 30 giorni senza percorso, e l'offboarding per chi è in stato «in uscita» con data; l'HR può forzarlo da «Persone». Il cambio manager non riassegna ancora i task automaticamente (si fa dal percorso).
- **Task «obiettivi»** (ONB-015): chiuso dal worker quando la persona ha almeno un obiettivo attivo; resta comunque chiudibile a mano.
- **Editor**: fasi e task si modificano come JSON con anteprima tabellare; un editor visuale è previsto con l'App Studio.

## 10. Modifiche rispetto a PeopleGoal

- **Alert su survey di onboarding** con punteggi bassi (ONB-017) per intervento tempestivo.
- **Percorsi per cambio ruolo interno e offboarding** come template dello stesso motore.

## 11. Note di implementazione (sprint 14)

- Tabelle `onboarding_templates` (fasi, task e regole in JSON), `onboarding_journeys` (istanza con snapshot delle fasi, manager, buddy, HR, IT, data di riferimento, traguardi notificati), `onboarding_tasks` (assegnatario risolto, scadenza assoluta, stato e nota di presa visione), `onboarding_survey_responses`; RLS (migrazioni 0024/0025). Metriche «Onboarding in corso» e «Task di onboarding scaduti».
- Logica pura in `@wb/shared/onboarding`: preset, scadenze relative, avanzamento e completamento, regole di assegnazione, suggerimenti buddy, punteggio e alert survey, risoluzione dell'assegnatario per ruolo con fallback (buddy → manager → HR).
- Endpoint `/onboarding/*`; permessi `onboarding:use` (tutti), `onboarding:team` (manager: avvia per i riporti, dashboard del team, buddy, task ad hoc), `onboarding:manage` (HR). I task di tipo `form` creano la compilazione nel form engine e si chiudono alla consegna. Notifiche `onboarding.*`; il worker avvia i percorsi mancanti, ricorda i task in scadenza (2 giorni) e scaduti, chiude i task «obiettivi», completa i percorsi.
- Web: **Onboarding** con «Il mio percorso» (timeline per fase, presa visione, survey inline), «I miei task» (anche come manager/buddy/HR/IT), «Persone» (dashboard, avvio, task scaduti per assegnatario) e «Percorsi» (template con anteprima ed editor).
