# ADR-0006 — Semantic layer v1: catalogo metriche dichiarativo e fatti giornalieri a grana persona

| | |
|---|---|
| **Stato** | Proposto |
| **Data** | 2026-09-13 |
| **Decisori** | Da validare con il product owner |
| **Collegata a** | ADR-0004 (architettura della reportistica) |

## Contesto

ADR-0004 fissa l'architettura a cinque strati (data mart, semantic layer, query engine, presentazione, accesso esterno) e prevede una fase 1 su PostgreSQL. Serve ora decidere la forma concreta del primo incremento (sprint 4 della Fase 1), che deve:

- far nascere il **catalogo metriche** come asset del prodotto, usato da dashboard, report ed export senza duplicare formule nelle schermate;
- **storicizzare** da subito, così che i trend esistano dal primo giorno di utilizzo del tenant;
- applicare **perimetro, ruolo e soglie di anonimato** in un solo punto lato server;
- restare semplice da operare nell'MVP (nessun servizio aggiuntivo oltre Postgres e il worker).

## Decisione

1. **Catalogo metriche in TypeScript** (`packages/shared/src/analytics/catalog.ts`), versionato con il codice. Ogni metrica dichiara: chiave stabile, nome e definizione leggibile (data dictionary), formula, modulo sorgente, formato, **calcolo** (somma di un fatto oppure rapporto tra due fatti), dimensioni ammesse, visibilità al manager per il proprio team, flag `sensitive` (mai a livello persona) e **soglia minima di gruppo**. Le metriche custom (ANA-042) avranno in futuro una tabella con lo stesso contratto.
2. **Fatti giornalieri a grana persona** nella tabella `mart_person_facts` (tenant, data snapshot, persona, manager e unità *valide quel giorno*, ciclo opzionale, chiave fatto, valore). Un job del worker (`mart-refresh`) scatta lo snapshot una volta al giorno per ogni tenant; l'HR può forzare l'aggiornamento dall'interfaccia. Le dimensioni organizzative sono quindi già "alla data" (ANA-044) senza una SCD separata.
3. **Query engine nell'API** (`apps/api/src/analytics`): riceve metriche × una dimensione × filtri × data (o intervallo per i trend), applica il perimetro del richiedente (tutto per HR/analista, riporti diretti per il manager), aggrega i fatti e applica le soglie: sulle persone del gruppo per le metriche operative, sul denominatore per quelle sensibili, con **soppressione complementare** per le metriche sensibili (se un solo gruppo è soppresso, ne viene soppresso anche un secondo per impedire il calcolo per differenza). Il client non riceve mai valori sotto soglia.
4. **Export** in CSV dagli stessi endpoint, con registrazione in audit (chi, quale report, quali filtri) — ANA-063.
5. La tabella dei fatti vive nello **stesso database** dell'operativo, con RLS per tenant, in uno schema logico separato dal prefisso `mart_`. Il passaggio a replica/istanza dedicata o a motore colonnare (ADR-0004, punto 3) non cambia il catalogo né il contratto del query engine.

## Alternative considerate

| Alternativa | Pro | Contro |
|---|---|---|
| Calcolare le metriche al volo dalle tabelle operative | Nessun job, sempre fresco | Nessuno storico; formule sparse; carico sull'operativo; soglie difficili da centralizzare |
| Schema a stella completo con SCD2 fin da subito | Aderente al target | Troppo per l'MVP; le dimensioni "alla data" si ottengono già dallo snapshot giornaliero |
| Adottare subito Cube o simili | Pre-aggregazioni e API SQL pronte | Servizio in più da operare; il catalogo resterebbe comunque nostro; da rivalutare in Fase 2 |
| Snapshot a grana aggregata (per unità) | Tabella più piccola | Perde la possibilità di ricalcolare per manager, per persona (dove lecito) e di applicare le soglie a posteriori |

## Conseguenze

- Ogni modulo che introduce dati misurabili aggiunge i propri **fatti** al refresh e le proprie **metriche** al catalogo (checklist in `docs/11`).
- I test di regressione delle metriche (ANA-092) si scrivono contro il catalogo e il refresh su PGlite con dataset sintetico.
- Lo snapshot giornaliero implica una latenza fino a 24 ore salvo aggiornamento manuale; il target di 15 minuti (ANA-070) arriverà con l'alimentazione a eventi prevista da ADR-0004.
- Le dimensioni disponibili nella v1 sono: unità organizzativa, manager, persona (solo metriche non sensibili e nel perimetro), ciclo di review, data.
