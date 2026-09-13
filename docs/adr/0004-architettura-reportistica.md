# ADR-0004 — Architettura della reportistica

| | |
|---|---|
| **Stato** | Accettato |
| **Data** | 2026-09-13 (proposto il 2026-09-12) |
| **Decisori** | Da definire |

## Contesto

La reportistica è un requisito primario del prodotto e un punto debole noto del prodotto di riferimento. Deve: combinare dati di tutti i moduli, essere storicizzata, applicare permessi e soglie di anonimato in modo centralizzato, servire dashboard, report builder, report programmati, API e strumenti BI esterni, e scalare con il numero di tenant senza degradare il DB operativo.

## Decisione (proposta)

1. **Separazione operativo / analitico**: i moduli scrivono sul DB operativo; una pipeline alimenta un **data mart** dedicato (schema a stella) a partire dagli eventi di dominio (outbox) e da estrazioni incrementali. Le dimensioni persona, unità, manager, job sono **a validità temporale** (SCD tipo 2).
2. **Semantic layer proprietario**: le metriche sono definite in modo dichiarativo (file YAML/TS versionati nel repo per le metriche standard, tabella per le custom) con formula, grana, dimensioni, ruoli e soglia di anonimato. Un **query engine** compila le richieste in SQL applicando perimetro, ruolo, soglie e protezione per differenza. Valuteremo l'adozione di un motore open source (es. Cube) per pre-aggregazioni e API SQL, mantenendo comunque il catalogo metriche come nostro asset.
3. **Motore di storage in due fasi**: fase 1 **PostgreSQL** (schema `mart_*` su replica di lettura o istanza dedicata, viste materializzate con refresh incrementale); fase 2 **motore colonnare** (ClickHouse o equivalente gestito in UE) quando i volumi o le latenze lo richiedono, senza cambiare il semantic layer.
4. **Accesso esterno**: connettore BI come accesso SQL in sola lettura a viste per tenant (credenziali dedicate, RLS sul mart); Analytics API REST sul semantic layer.
5. **Rendering**: libreria di grafici unica (es. ECharts) per web e PDF; export Excel lato server; PDF via browser headless.
6. **Qualità**: test di regressione sulle metriche con dataset sintetico a ogni rilascio; monitor di freschezza e di drift tra operativo e mart.

## Alternative considerate

| Alternativa | Pro | Contro |
|---|---|---|
| Report calcolati direttamente sul DB operativo | Semplice all'inizio | Carico sul DB, nessuna storicizzazione, metriche duplicate e incoerenti tra schermate |
| Warehouse gestito (BigQuery/Snowflake) fin da subito | Scala, SQL potente | Costo e complessità per PMI; latenza; lock-in; residenza dati da verificare |
| BI embedded di terzi (Metabase/Superset/Looker embedded) come unica UI | Report builder pronto | Permessi e soglie difficili da garantire in profondità; UX non integrata; costi per utente |
| Solo dataset + BI del cliente (posizione iniziale in `docs/01`) | Poco sviluppo | Non copre PMI senza BI; lascia il punto debole irrisolto |

## Conseguenze

- Ogni modulo deve emettere eventi di dominio completi e definire le proprie metriche nel catalogo (parte della "definition of done" di una feature).
- Il team deve possedere competenze di data modeling; prevedere un ruolo/persona dedicata dalla Fase 2.
- Costo infrastrutturale aggiuntivo (replica/istanza analitica) accettato in cambio di isolamento del carico.
- Il report builder è P1, non P2: aggiorna `docs/01` e `docs/08`.
