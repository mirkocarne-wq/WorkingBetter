# Analytics & Reporting (`ANA`)

| | |
|---|---|
| **Priorità** | P0 |
| **Stato** | Proposto |
| **Dipendenze** | Tutti i moduli |
| **Ultimo aggiornamento** | 2026-09-12 |

## 1. Scopo

Trasformare i dati raccolti dai moduli in viste utili per ruolo (collaboratore, manager, HR, leadership), con export e accesso per strumenti di BI, nel rispetto dei permessi e delle soglie di anonimato.

## 2. Concetti chiave

- **Dashboard di ruolo**: pagina iniziale con i widget rilevanti per il ruolo.
- **Report standard**: viste predefinite per modulo con filtri e export.
- **Segmentazione**: per unità, sede, job, livello, manager, anzianità, attributi custom.
- **Dataset**: tabelle denormalizzate esportabili / interrogabili via API per BI.
- **Soglia di anonimato**: ereditata dai moduli (ENG, F360).

## 3. Attori e permessi

I dati mostrati rispettano sempre il perimetro del ruolo (CORE). La leadership vede aggregati; l'HR vede dettaglio nel perimetro; il manager vede il team; il collaboratore vede sé stesso.

## 4. Requisiti funzionali

### 4.1 Dashboard

| ID | Requisito | Priorità |
|----|-----------|----------|
| ANA-001 | Dashboard collaboratore: miei obiettivi, prossimo 1:1, azioni, feedback recenti, cose da fare (review, survey) | P0 |
| ANA-002 | Dashboard manager: stato team (obiettivi a rischio, 1:1 in ritardo, review da fare, riconoscimenti dati), persone del team con "segnali" | P0 |
| ANA-003 | Dashboard HR: completamento processi in corso, adozione per modulo, alert (persone senza obiettivi, senza 1:1, review scadute) | P0 |
| ANA-004 | Dashboard leadership: progresso obiettivi aziendali, engagement/eNPS, distribuzione performance, headcount | P1 |
| ANA-005 | Widget configurabili (aggiungi/rimuovi/ordina) | P2 |

### 4.2 Report standard

| ID | Requisito | Priorità |
|----|-----------|----------|
| ANA-010 | Report per modulo (elenco in ogni specifica, sezione 8) con filtri, segmentazione, grafici e tabella | P0/P1 |
| ANA-011 | Confronti tra periodi/cicli | P1 |
| ANA-012 | Report "Persona": vista storica completa (obiettivi, rating, feedback, 360°, IDP) per HR/manager | P1 |
| ANA-013 | Report "Manager effectiveness": adozione 1:1, feedback dati, tempi review, engagement del team | P2 |
| ANA-014 | Report salvati e condivisibili con filtri fissati | P2 |

### 4.3 Export e BI

| ID | Requisito | Priorità |
|----|-----------|----------|
| ANA-020 | Export Excel/CSV da ogni tabella, nel rispetto di permessi e soglie | P0 |
| ANA-021 | Export PDF di dashboard e report di sintesi | P1 |
| ANA-022 | Dataset per BI: endpoint API paginati / estrazione programmata (es. verso S3/SFTP) | P2 |
| ANA-023 | Report programmati via email (settimanale/mensile) | P2 |

### 4.4 Segnali e alert

| ID | Requisito | Priorità |
|----|-----------|----------|
| ANA-030 | Regole di alert configurabili (es. "collaboratore senza 1:1 da 45 giorni", "eNPS team < 0", "3 obiettivi off track") con destinatari | P1 |
| ANA-031 | Indicatore di rischio persona (composito, spiegabile, opzionale) visibile a manager/HR | P2 |

## 5. Regole di business

- Nessun report può aggirare le soglie di anonimato dei moduli sorgente.
- I dati storici usano le appartenenze organizzative valide alla data (CORE-017).
- Gli export sono tracciati in audit (chi, cosa, quando).

## 6. Assunzioni / Domande aperte

- Report builder libero (P2 in PeopleGoal) lo rimandiamo: puntiamo su dataset + BI del cliente.

## 7. Modifiche rispetto a PeopleGoal

- **Alert configurabili** (ANA-030) e **segnali per persona** nella dashboard manager.
- **Dataset per BI** come strategia principale per la reportistica avanzata.
