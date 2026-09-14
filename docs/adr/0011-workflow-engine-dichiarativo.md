# ADR-0011 — Workflow engine dichiarativo per le app custom (App Studio L2)

| | |
|---|---|
| **Stato** | Proposto |
| **Data** | 2026-09-14 |
| **Decisori** | team prodotto/tech |
| **Collegate** | ADR-0002 (stack), ADR-0003 (multi-tenant), specifica APP §4.2–4.4 e §10 |

## Contesto

La specifica APP chiede un motore comune per processi HR configurabili senza sviluppatori (livello L2: processi custom su persona) e, in prospettiva, entità custom e automazioni (L3–L4). Il form engine esiste già (form versionati, risposte strutturate, hook alla consegna) ed è usato da review e onboarding. Serve decidere come rappresentare ed eseguire il **workflow**: fasi, attori, approvazioni, parallelismo, instradamento, log.

Le alternative erano un motore BPMN generale (Camunda, Temporal o simili), un grafo arbitrario di nodi in JSON, oppure una sequenza dichiarativa con poche estensioni mirate.

## Decisione

1. **Definizione dichiarativa in JSON, versionata come i form.** Un'app è `{ key, name, naming, permissions, stages[] }`; ogni fase ha tipo (`form`, `approval`, `notify`), attore relativo (`subject`, `manager`, `manager_of_manager`, `launcher`, `hr`, `person:<id>`, `role:<ruolo>`), scadenza relativa, visibilità delle fasi precedenti, eventuale gruppo parallelo, regola di rimando e instradamenti condizionali. La validazione strutturale è una funzione pura (`validateAppDefinition`) usata da API e test.
2. **Sequenza con estensioni, non grafo libero.** L'ordine delle fasi è la struttura; il parallelismo è un gruppo di fasi consecutive; il rimando riapre una fase precedente; l'instradamento salta in avanti (o chiude) su condizioni semplici sulle risposte o sull'esito. Copre APP-020/021/022/023 con un modello che l'HR può leggere come una lista.
3. **Istanze come snapshot.** Al lancio l'istanza copia la definizione e risolve gli attori; le modifiche successive creano nuove versioni dell'app (APP-007). Ogni fase è un *run* con tentativi (una riapertura = un nuovo tentativo); il log per istanza è una tabella append-only (APP-026).
4. **Il form engine resta l'unico posto dove si compila.** Le fasi `form` creano una compilazione con contesto `app_stage`; la consegna avanza il workflow tramite l'hook già usato dalle review. Nessuna duplicazione di validazione o punteggi.
5. **Il motore di avanzamento è puro e testato** (`afterStageDone`, `rejectPlan`, `instanceProgress` in `@wb/shared/apps`): il servizio API fa solo I/O (run, notifiche, log).
6. **Template e portabilità.** I template pronti (richiesta formazione, proposta promozione, fine progetto, exit interview, segnalazione HR) sono definizioni + form nel pacchetto condiviso; l'export/import JSON usa lo stesso formato (APP-035).

## Conseguenze

- Le app native con logica propria (survey, 360°, onboarding) **non** vengono migrate sul motore generico: anonimato, soglie e report non devono entrare nel motore L2. La **review** invece converge (sprint 16): il ciclo diventa un'app «silenziosa» per ciclo (`reviewTemplateToApp`), ogni review un'istanza; il modulo REV mantiene rating, visibilità, notifiche e firma e ascolta la conclusione delle fasi con un hook del motore (`onStageDone`). I moduli nativi usano API interne senza controllo dei permessi del motore (`launchInternal`, `decideInternal`, `reopenTo`, `completeInternal`), perché i permessi li verificano loro.
- Azioni automatiche (APP-024, sprint 16): fase `action` con action item, attributo persona, webhook e avvio di un'altra app; eseguite in sequenza all'attivazione, esiti nel run e nel log, nessun blocco del processo in caso di errore.
- Limiti accettati: nessun ciclo arbitrario (solo rimando all'indietro), condizioni su un solo campo, nessun ritentativo dei webhook, nessun editor grafico (l'editor è una lista di fasi con anteprima).
- Un motore esterno (BPMN) avrebbe dato più espressività al prezzo di un'infrastruttura in più, di un modello che l'HR non legge e di un'integrazione con RLS e form engine da costruire comunque.

## Alternative considerate

- **Camunda/Temporal**: potenti ma sproporzionati per processi HR a 3–6 fasi; complicano deploy e multi-tenancy.
- **Grafo di nodi libero**: massima flessibilità, ma editor e validazione molto più complessi e processi difficili da spiegare; rinviato a quando servirà davvero (L4).
