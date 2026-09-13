# ADR-0008 — Welfare: conto come registro contabile append-only, soglie fiscali configurate per anno, payroll a lotti

| | |
|---|---|
| **Stato** | Proposto |
| **Data** | 2026-09-13 |
| **Decisori** | Da validare con il product owner |
| **Collegata a** | `docs/specifiche/welfare.md`, ADR-0003 (multi-tenant), ADR-0006 (metriche) |

## Contesto

Il modulo Welfare (nostra aggiunta, `docs/10`) gestisce denaro figurativo con vincoli fiscali che cambiano ogni anno e che nessun sistema può "conoscere" in modo affidabile. Servono tracciabilità completa (chi ha accreditato, speso, stornato cosa e quando), calcoli di disponibile e di cumulo annuo per categoria sempre ricostruibili, e un passaggio ordinato verso le paghe. Il primo incremento (sprint 7) copre piani, fonti di budget, conto, catalogo interno, rimborsi con approvazione, soglie, conversione del premio, tracciato payroll, iniziative e dichiarazioni.

## Decisione

1. **Il conto welfare è un registro di movimenti append-only** (`welfare_movements`): accrediti, prenotazioni (richiesta in verifica), rilasci, spese, rimborsi/storni, scadenze e rettifiche manuali con motivazione. Saldo, disponibile, impegnato e speso sono **sempre calcolati** dai movimenti, mai memorizzati; nessun movimento viene modificato o cancellato. Ogni movimento porta anno fiscale e categoria, così il cumulo per soglia si ricava dallo stesso registro.
2. **Le soglie fiscali sono dati configurati per anno** (`welfare_thresholds`: anno, categoria, condizione facoltativa come "figli a carico", importo). Il prodotto fornisce **preset indicativi** con valori storicamente stabili e segnala esplicitamente che vanno verificati dall'HR o dal consulente del lavoro; il calcolo del cumulo e dell'eccedenza imponibile è una funzione pura e testata (`packages/shared/src/welfare`). Le dichiarazioni del dipendente (es. figli a carico) valgono per anno e selezionano la variante di soglia.
3. **Richieste con prenotazione del budget**: all'invio la richiesta prenota l'importo (movimento `reserve`), l'approvazione lo converte in spesa (`release` + `spend`), il rifiuto o l'annullamento lo rilascia. Il disponibile visto dal dipendente tiene quindi conto delle richieste in corso. Le categorie "imponibili" o oltre soglia non bloccano: l'eccedenza è calcolata e marcata per payroll.
4. **Payroll a lotti**: le richieste approvate da liquidare (rimborsi) e le eccedenze imponibili confluiscono in un lotto (`welfare_payroll_batches`) esportato come CSV con separatore `;`; la conferma del lotto chiude i movimenti (stato `paid`). I connettori verso i sistemi paghe arriveranno sopra lo stesso lotto.
5. **Conversione del premio di risultato**: la finestra, l'importo e le percentuali ammesse sono attributi del piano; la scelta del dipendente è registrata una sola volta con presa visione del regolamento e accredita subito il credito nella fonte `premium_conversion`; il simulatore netto usa parametri configurati nel piano ed è dichiarato indicativo.
6. **Privacy per costruzione**: il manager non ha alcun permesso sui dati welfare dei riporti; le metriche del catalogo (take-up, budget utilizzato) sono aggregate, soglia minima 5, mai a grana persona; i dettagli delle richieste (beneficiario, giustificativo) sono visibili solo a chi approva.
7. I giustificativi sono per ora **riferimenti** (nome file e dichiarazione) in attesa dello storage documentale; il modello prevede già il campo per l'allegato.

## Alternative considerate

| Alternativa | Pro | Contro |
|---|---|---|
| Saldo memorizzato sulla persona e aggiornato a ogni operazione | Letture veloci | Incoerenze in caso di errori o concorrenza; nessuna ricostruzione per anno/categoria; audit debole |
| Soglie cablate nel codice per anno | Nessuna configurazione | Impossibile seguire norme temporanee e casi particolari; responsabilità legale implicita del prodotto |
| Integrare subito un provider esterno | Catalogo ricco | Dipendenza commerciale prima di validare il modello; il catalogo interno e i rimborsi coprono già il caso base |

## Conseguenze

- Le tabelle del ledger crescono con l'uso: indici per (tenant, persona, anno) e per (tenant, piano); aggregazioni nel data mart per i report.
- Ogni nuova origine di credito (punti riconoscimento, provider) è un nuovo `kind` di fonte, non una nuova tabella.
- Upload dei giustificativi, provider esterni, previdenza/sanità e connettori payroll sono incrementi successivi compatibili.
