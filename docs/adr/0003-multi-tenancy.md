# ADR-0003 — Strategia multi-tenant

| | |
|---|---|
| **Stato** | Proposto (da validare) |
| **Data** | 2026-09-12 |
| **Decisori** | Da definire |

## Contesto

La piattaforma serve molte aziende (tenant) con dati sensibili. Serve isolamento forte, costi operativi contenuti e possibilità di soddisfare richieste enterprise (database dedicato, residenza specifica).

## Decisione (proposta)

- **Database condiviso, schema condiviso**, colonna `tenant_id` su ogni tabella.
- **Row-Level Security** PostgreSQL attiva su tutte le tabelle: la connessione applicativa imposta `app.tenant_id` a inizio transazione; nessuna query può leggere righe di altri tenant anche in caso di bug applicativo.
- Il ruolo DB dell'applicazione **non** può bypassare RLS; migrazioni e job di manutenzione usano un ruolo separato.
- Architettura pronta per **database dedicato per tenant** (routing per tenant nel pool di connessioni) da attivare per clienti enterprise senza cambiare il codice applicativo.
- Chiavi di cifratura applicativa (note private, credenziali connettori) **per tenant**.

## Alternative considerate

| Alternativa | Pro | Contro |
|---|---|---|
| Schema per tenant | Isolamento logico più netto | Migrazioni su N schemi; limiti con migliaia di tenant |
| Database per tenant per tutti | Isolamento massimo | Costo e complessità operativa; analytics cross-tenant difficili |
| Solo filtro applicativo (senza RLS) | Semplice | Un bug espone dati di altri clienti |

## Conseguenze

- Ogni test di integrazione verifica l'isolamento (tentativi cross-tenant devono restituire zero righe).
- Indici composti con `tenant_id` come prima colonna.
- Il piano enterprise può offrire DB dedicato come opzione commerciale.
