# ADR-0015 — Automazioni no-code «quando → se → allora» sugli eventi di piattaforma

| | |
|---|---|
| **Stato** | Proposto |
| **Data** | 2026-09-16 |
| **Decisori** | Team prodotto e tecnico |

## Contesto

Il livello L4 della piattaforma low-code (`docs/specifiche/app-studio.md` §4.4, APP-037/038) prevede regole del tipo «quando una persona compie 90 giorni → avvia l'app X», «quando una review chiude con rating < 2 → crea un'azione per l'HRBP», con connettori in uscita (webhook, email/chat, aggiornamento attributi). Oggi le fasi `action` dell'App Studio eseguono già azioni automatiche (APP-024) ma **dentro** un processo; le altre parti dell'applicazione non emettono eventi: ogni modulo chiama direttamente `NotificationsService` e `AuditService`. Non esiste un bus di eventi né uno scheduler nell'API; i lavori a tempo (promemoria, welfare, onboarding) vivono nel worker, che parla solo con il database.

## Decisione

1. **Eventi di dominio espliciti e pochi.** Un `PlatformEventsService` in-process (stesso pattern degli hook `onStageDone` dell'App Studio) espone `emit(event)` e `on(handler)`. I moduli emettono un catalogo ristretto di eventi normalizzati (`AutomationEvents` in `@wb/shared/automations`): `person.created`, `person.terminating`, `person.tenure` (a tempo), `person.leaving_in` (a tempo), `review.completed`, `review.shared`, `key_result.off_track`, `survey.closed`, `f360.released`, `onboarding.completed`, `app.completed`. Ogni evento porta `subjectPersonId` e un oggetto `data` piatto con i campi utilizzabili nelle condizioni. Il catalogo è documentato e versionato: non si espone l'audit né le notifiche come «eventi».
2. **Regola = trigger + condizioni + azioni, valutata nella stessa transazione dell'evento.** Le condizioni riusano la sintassi degli instradamenti dell'App Studio (`field`, `op` in eq/ne/lt/lte/gt/gte/in/not_empty, `value`) in AND, sui campi dell'evento e della persona soggetto (`person.jobLevel`, `person.location`, `person.orgUnitId`, `person.managerId`, `person.custom.<chiave>`). Le azioni riusano il vocabolario delle fasi `action` (`start_app`, `action_item`, `person_field`, `webhook`) più `notify` (in-app/email/chat secondo le preferenze, destinatari relativi al soggetto). Ogni esecuzione è registrata in `automation_runs` (regola, evento, soggetto, esito per azione): è il log che l'HR consulta, indipendente dall'audit (che richiede un principal umano).
3. **Trigger a tempo valutati dal worker attraverso l'API.** Il worker non duplica il motore: il job giornaliero `automations` chiama `POST /internal/automations/tick` con un segreto condiviso (`INTERNAL_JOB_TOKEN`); l'API scorre i tenant attivi e, per ciascuno, genera gli eventi a tempo (`person.tenure` per le regole con «N giorni dall'ingresso», `person.leaving_in` per «N giorni all'uscita») ed esegue le regole con un principal di sistema. Senza segreto configurato il job si limita a segnalarlo.
4. **Guardrail contro cicli e abusi.** Idempotenza per chiave (`regola:evento:soggetto[:giorno]`, indice unico in `automation_runs`); profondità massima 2 per gli eventi generati da un'azione (un'app avviata da una regola può a sua volta innescare una regola, non oltre); massimo 50 regole per tenant e 5 azioni per regola; gli URL dei webhook passano dalla stessa difesa SSRF e dallo stesso meccanismo di ritentativi (`webhook_deliveries`) dell'App Studio. Un'azione fallita non interrompe le altre né la transazione dell'evento: l'esito resta nel log della regola.

## Alternative considerate

| Alternativa | Pro | Contro |
|---|---|---|
| Leggere audit log / notifiche come eventi (polling dal worker) | nessuna modifica ai moduli | perde il contesto transazionale, dipende da nomi non pensati come contratto, latenza |
| Bus di eventi esterno (Redis streams, BullMQ) | disaccoppiamento, ritentativi | infrastruttura in più anche per il pilota; la valutazione sincrona nella transazione è sufficiente e più semplice da capire |
| Motore anche nel worker (duplicare `launchInternal` e le azioni) | nessuna chiamata HTTP | doppia implementazione dell'App Studio: divergenze certe |
| Scheduler nell'API (`@nestjs/schedule`) | niente segreto condiviso | lavoro in background nel processo API, duplicazioni con più istanze; il worker è già il posto dei job |
| Espressioni libere (script) nelle condizioni | espressività | fuori dal perimetro no-code (L5); rimandato ad APP-039 |

## Conseguenze

- Positive: le regole nascono sopra contratti espliciti (eventi e azioni già usati dall'App Studio), sono testabili con funzioni pure (`evaluateConditions`, `matchTrigger`), il log è leggibile dall'HR, nessuna dipendenza nuova.
- Negative: il catalogo degli eventi va esteso a mano quando un modulo introduce un fatto nuovo; le regole a tempo hanno la granularità del job giornaliero; i trigger a tempo richiedono la configurazione di `INTERNAL_JOB_TOKEN` (il compose lo genera).
- Da fare: tabelle `automation_rules`/`automation_runs` con RLS; `PlatformEventsService` e punti di emissione; `AutomationsService` (valutazione, azioni, tick); job del worker; pagina Processi → Automazioni con editor e log; test; manuali.
