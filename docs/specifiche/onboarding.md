# Onboarding (`ONB`)

| | |
|---|---|
| **Priorità** | P1 |
| **Stato** | Proposto |
| **Dipendenze** | CORE, ONE, ENG, OKR, APP (workflow engine) |
| **Ultimo aggiornamento** | 2026-09-12 |

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

- Il pre-boarding richiede gestione di identità esterne (email personale): confermare priorità.

## 10. Modifiche rispetto a PeopleGoal

- **Alert su survey di onboarding** con punteggi bassi (ONB-017) per intervento tempestivo.
- **Percorsi per cambio ruolo interno e offboarding** come template dello stesso motore.
