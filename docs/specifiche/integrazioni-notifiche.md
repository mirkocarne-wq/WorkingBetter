# Integrazioni & Notifiche (`INT`)

| | |
|---|---|
| **Priorità** | P0 (notifiche, SSO, CSV) / P1 (Slack, Teams, calendario, HRIS, API) |
| **Stato** | In implementazione (sprint 2: INT-001/002/003 e worker promemoria; mancano INT-004/005, Slack/Teams, calendario, HRIS, API token/webhook) |
| **Dipendenze** | CORE |
| **Ultimo aggiornamento** | 2026-09-12 |

## 1. Scopo

Far vivere la piattaforma dove le persone lavorano già (email, Slack, Teams, calendario) e tenerla allineata con i sistemi di record (HRIS, identity provider), esponendo API e webhook per estensioni.

## 2. Concetti chiave

- **Notifica**: evento → messaggio a destinatari su uno o più canali, con preferenze utente e digest.
- **Canale**: in-app, email, Slack, Microsoft Teams, (push mobile in futuro).
- **Connettore**: integrazione configurata a livello tenant (credenziali, mapping, frequenza).
- **Webhook**: chiamata HTTP in uscita su eventi.
- **API pubblica**: REST autenticata per lettura/scrittura delle risorse principali (vedi `docs/05`).

## 3. Requisiti funzionali

### 3.1 Notifiche

| ID | Requisito | Priorità |
|----|-----------|----------|
| INT-001 | Centro notifiche in-app con stato letto/non letto e link all'azione | P0 |
| INT-002 | Email transazionali con template per tenant (logo, firma) e lingua utente | P0 |
| INT-003 | Preferenze utente per tipo di evento e canale; digest giornaliero/settimanale | P1 |
| INT-004 | Regole tenant: canali abilitati, orari di quiet time, mittente | P1 |
| INT-005 | Template di notifica modificabili dall'HR per i processi (avvio, promemoria, scadenza) con variabili | P1 |

### 3.2 Slack e Microsoft Teams

| ID | Requisito | Priorità |
|----|-----------|----------|
| INT-010 | App Slack e Teams: notifiche personali con azioni rapide (check-in KR, rispondi a richiesta feedback, conferma 1:1) | P1 |
| INT-011 | Comandi: dare feedback/riconoscimento, aggiungere punto al 1:1, vedere i miei obiettivi | P1 |
| INT-012 | Canale riconoscimenti: pubblicazione automatica dei kudos | P1 |
| INT-013 | Compilazione pulse survey e check-in direttamente nel messaggio | P1 |
| INT-014 | Mappatura utenti via email/SSO; installazione a livello workspace/tenant | P1 |

### 3.3 Calendario

| ID | Requisito | Priorità |
|----|-----------|----------|
| INT-020 | Google Calendar e Microsoft 365: creazione/aggiornamento eventi 1:1, lettura per proporre slot | P1 |
| INT-021 | Link videocall (Meet/Teams) generati con l'evento | P1 |

### 3.4 Identità e HRIS

| ID | Requisito | Priorità |
|----|-----------|----------|
| INT-030 | SSO SAML/OIDC (Entra ID, Google, Okta) — vedi CORE-031 | P0 |
| INT-031 | SCIM 2.0 provisioning | P2 |
| INT-032 | Import CSV con template scaricabile e mapping colonne salvato | P0 |
| INT-033 | Connettori HRIS: sync persone, org, job, manager, date; frequenza; regole di precedenza; log differenze prima dell'applicazione. Priorità connettori: Personio, BambooHR, Factorial, HiBob, Workday, SAP SuccessFactors, ADP, Zucchetti (mercato IT) | P1/P2 |
| INT-034 | Sync in uscita opzionale (rating finale, job aggiornato) verso HRIS | P2 |

### 3.5 API e webhook

| ID | Requisito | Priorità |
|----|-----------|----------|
| INT-040 | API REST pubblica con token per tenant e scope, rate limit, documentazione OpenAPI | P1 |
| INT-041 | Webhook su eventi (obiettivo creato/chiuso, review condivisa, feedback dato, survey chiusa, persona creata/cessata) con firma e retry | P1 |
| INT-042 | Integrazione Jira/Asana per aggiornare KR da issue/epic | P2 |
| INT-043 | Zapier/Make connector | P2 |

## 4. Regole di business

- Le notifiche rispettano sempre i permessi: mai includere contenuti nella notifica che l'utente non potrebbe vedere nell'app.
- Le sincronizzazioni HRIS mostrano un'anteprima delle differenze; le cancellazioni non sono mai automatiche (le persone vengono marcate "in uscita").
- Le credenziali dei connettori sono cifrate e mai esposte via API.

## 5. Assunzioni / Domande aperte

- Priorità tra Slack e Teams per il primo rilascio: dipende dai primi clienti; Teams più diffuso nel mid-market italiano.
- Elenco HRIS da validare con il mercato target (Zucchetti, Personio, Factorial molto rilevanti in Italia).

## 6. Modifiche rispetto a PeopleGoal

- **Focus su HRIS del mercato italiano/europeo** (Zucchetti, Personio, Factorial) accanto a quelli globali.
- **Azioni rapide nei messaggi** Slack/Teams (check-in, feedback, survey) invece di sole notifiche.
- **Anteprima differenze** prima di applicare una sync HRIS.
