# Feedback continuo & Riconoscimenti (`FBK`)

| | |
|---|---|
| **Priorità** | P0 |
| **Stato** | Proposto |
| **Dipendenze** | CORE, INT (Slack/Teams) |
| **Ultimo aggiornamento** | 2026-09-12 |

## 1. Scopo

Rendere il feedback un'abitudine quotidiana e non un evento annuale: chiunque può dare, chiedere e ricevere feedback in pochi secondi, e riconoscere pubblicamente i colleghi collegando il riconoscimento ai valori aziendali.

## 2. Concetti chiave

- **Feedback**: messaggio da una persona a un'altra, con tipo (apprezzamento / suggerimento di miglioramento / osservazione), visibilità (privato al destinatario, condiviso con il manager del destinatario), eventuale collegamento a competenza, valore, obiettivo o progetto.
- **Richiesta di feedback**: domanda rivolta a uno o più colleghi su un tema/progetto; le risposte sono feedback.
- **Riconoscimento (Kudos)**: apprezzamento pubblico (feed) associato a uno o più valori aziendali, con reazioni e commenti.
- **Valori aziendali**: elenco configurabile dal tenant con icona e descrizione.
- **Feed**: bacheca dei riconoscimenti (azienda, unità, team).
- **Badge / Premi**: riconoscimenti speciali assegnati dall'HR o dai manager (es. "Dipendente del trimestre"); eventuale budget punti.

## 3. Attori e permessi

| Azione | Chiunque | Manager | HR Admin |
|---|---|---|---|
| Dare feedback a chiunque | ✅ | ✅ | ✅ |
| Chiedere feedback | ✅ (per sé) | ✅ (per sé o su un riporto) | ✅ |
| Vedere feedback ricevuti | ✅ (propri) | ✅ (dei riporti, se condivisi con manager) | ✅ (se policy lo consente; default no per feedback privati) |
| Dare riconoscimenti | ✅ | ✅ | ✅ |
| Moderare feed (nascondere) | ❌ | ❌ | ✅ |
| Configurare valori, badge, budget | ❌ | ❌ | ✅ |

## 4. Requisiti funzionali

### 4.1 Feedback

| ID | Requisito | Priorità |
|----|-----------|----------|
| FBK-001 | Dare feedback: destinatario, testo, tipo, visibilità, tag opzionali (competenza, valore, obiettivo) | P0 |
| FBK-002 | Chiedere feedback a uno o più colleghi con domanda libera o template ("Come ho gestito il progetto X?") e scadenza | P0 |
| FBK-003 | Il manager può chiedere feedback su un riporto a colleghi (usato per le review) | P1 |
| FBK-004 | Feedback anonimo opzionale (attivabile dall'HR; mai anonimo verso l'HR per moderazione abusi) | P2 |
| FBK-005 | Il destinatario può rispondere/ringraziare e marcare "utile" | P1 |
| FBK-006 | I feedback compaiono nel profilo, nel pannello di contesto della review e nei suggerimenti 1:1 | P0 |
| FBK-007 | Invio e richiesta da Slack / Teams (comando o azione) | P1 |
| FBK-008 | Template di feedback strutturato (Situazione–Comportamento–Impatto) con suggerimenti | P1 |
| FBK-009 | Promemoria gentili: "Non dai feedback da 30 giorni", "Hai 2 richieste in sospeso" | P1 |

### 4.2 Riconoscimenti

| ID | Requisito | Priorità |
|----|-----------|----------|
| FBK-020 | Dare un riconoscimento pubblico a una o più persone con testo, valori aziendali, immagine/GIF opzionale | P0 |
| FBK-021 | Feed con filtri (azienda, mia unità, mio team), reazioni, commenti | P0 |
| FBK-022 | Valori aziendali configurabili; statistiche di quali valori vengono riconosciuti | P0 |
| FBK-023 | Badge/premi assegnati da HR o manager con motivazione | P1 |
| FBK-024 | Budget punti mensile per persona e catalogo premi (integrazione esterna) | P2 |
| FBK-025 | Pubblicazione automatica nel canale Slack/Teams configurato | P1 |
| FBK-026 | Moderazione: HR può nascondere un post con log | P1 |
| FBK-027 | Riepilogo riconoscimenti nella review e nel profilo | P0 |

## 5. Flussi principali

```mermaid
flowchart LR
    A[Collega apre "Dai feedback"] --> B{Tipo}
    B -->|Feedback| C[Scegli visibilità: privato / con manager]
    B -->|Riconoscimento| D[Scegli valori, pubblica nel feed]
    C --> E[Destinatario notificato]
    D --> F[Feed + Slack/Teams]
    E --> G[Compare in profilo, review, 1:1]
    F --> G
```

## 6. Regole di business

- Un feedback privato è visibile solo al destinatario; il destinatario può decidere di condividerlo con il proprio manager in seguito.
- Un feedback "condiviso con il manager" è visibile anche ai manager successivi? Default: no, salvo il destinatario lo renda "parte del fascicolo".
- I riconoscimenti sono pubblici per definizione; un destinatario può chiedere la rimozione.
- Il feedback richiesto dal manager su un riporto è visibile al manager e, se configurato, al riporto.

## 7. Notifiche

| Evento | Destinatari | Canali |
|---|---|---|
| Feedback ricevuto | Destinatario | In-app, email, Slack/Teams |
| Richiesta di feedback + promemoria | Richiesti | In-app, Slack/Teams |
| Riconoscimento ricevuto | Destinatari | In-app, Slack/Teams |
| Reazione/commento su un riconoscimento | Autore | In-app |

## 8. Analytics del modulo

- Feedback dati/ricevuti per periodo, per unità; % persone che hanno dato almeno un feedback nel mese.
- Riconoscimenti per valore; mappa di chi riconosce chi (rete); persone mai riconosciute.
- Tempo medio di risposta alle richieste.

## 9. Assunzioni / Domande aperte

- Il feedback anonimo (FBK-004) è utile o dannoso? Ipotesi: disattivo di default; da validare.
- Budget punti e catalogo premi: build o integrazione? Ipotesi: integrazione con provider esterni.

## 10. Modifiche rispetto a PeopleGoal

- **Template SBI** (FBK-008) e nudge (FBK-009) per alzare la qualità e la frequenza del feedback.
- **Controllo del destinatario sulla condivisione** con il manager (privacy by default).
- **Rete dei riconoscimenti** come analytics per individuare persone isolate.
