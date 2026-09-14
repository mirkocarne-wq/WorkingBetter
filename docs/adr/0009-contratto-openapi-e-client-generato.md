# ADR-0009 — Contratto OpenAPI derivato dagli schemi Zod e client generato

| | |
|---|---|
| **Stato** | Proposto |
| **Data** | 2026-09-13 |
| **Decisori** | team prodotto/tech |
| **Collegate** | ADR-0002 (stack), ADR-0005 (strategia API) |

## Contesto

L'ADR-0005 stabilisce una sola API REST con specifica OpenAPI generata dal codice e client generati per web, mobile e partner. Fino allo sprint 7 la specifica esposta su `/docs` elencava i percorsi ma non descriveva body, query e risposte: la validazione avveniva con schemi Zod nei controller, invisibili al contratto. La web app tipizzava le chiamate a mano in `lib/api.ts`, senza alcuna verifica che i percorsi esistessero davvero.

Servono tre cose: (1) un contratto pubblicato completo e sempre allineato al codice, (2) un client TypeScript che ne derivi i tipi, (3) una verifica automatica che impedisca al contratto di divergere dall'implementazione.

## Decisione

1. **Zod resta l'unica fonte degli schemi di input.** I decoratori `@ZBody(schema)` e `@ZQuery(schema)` (`apps/api/src/common/zod.pipe.ts`) validano a runtime **e** registrano lo stesso schema nel documento OpenAPI (conversione con `zod-to-json-schema`, dialetto OpenAPI 3, senza `$ref`). Un endpoint non può avere una validazione diversa da quella pubblicata.
2. **Le risposte si dichiarano con `@ZOk(schema)`** dove il contratto deve essere vincolante per i client (oggi: `health`, `me`, `auth/config`, `auth/login`, `notifications/unread-count`). Le altre risposte restano non tipizzate nel contratto e si estendono in modo incrementale, endpoint per endpoint. Tutti gli errori sono `application/problem+json` con lo schema `Problem` (RFC 9457), aggiunto come risposta `default` di ogni operazione.
3. **Il contratto è un artefatto versionato**: `packages/api-client/openapi.json`, emesso da `pnpm --filter @wb/api openapi:emit` (avvia l'app su PGlite in memoria, quindi funziona in CI senza servizi). Le chiavi sono ordinate per rendere leggibili i diff nelle pull request.
4. **`@wb/api-client`** contiene i tipi generati con `openapi-typescript` (`src/schema.ts`), un client tipizzato su `openapi-fetch` (`createApiClient`) per mobile e integrazioni, e una funzione `request()` con percorso verificato a compile time (`ApiRoute`) usata dai server component della web app. Errori e messaggi utente passano da `ApiError`/`errorMessage`.
5. **La CI fallisce se il contratto non è aggiornato**: `pnpm contract:check` rigenera `openapi.json` e `schema.ts` e confronta con quanto committato.

## Conseguenze

- Ogni nuovo endpoint entra nel contratto senza lavoro aggiuntivo: basta usare `ZBody`/`ZQuery`; le risposte tipizzate richiedono un `ZOk` esplicito e diventano parte della checklist "nuovo modulo" (docs/11).
- La web app non può chiamare percorsi inesistenti: un refuso o un endpoint rimosso è un errore di compilazione, non un 404 in produzione.
- I client esterni (mobile, connettori) partono da `openapi.json` e dallo stesso pacchetto TypeScript; SDK in altri linguaggi si generano dallo stesso file.
- Costo: un passo di generazione in più quando cambia l'API (documentato nel README del pacchetto e nella guida di sviluppo) e un file generato di qualche migliaio di righe nel repository.

## Alternative considerate

- **Decoratori `@nestjs/swagger` con classi DTO e `class-validator`**: duplicherebbe gli schemi già scritti in Zod e introdurrebbe una seconda libreria di validazione (esclusa dall'ADR-0002).
- **`nestjs-zod`**: accoppia versioni di Zod, Nest e Swagger e sostituisce la pipe già in uso; la conversione diretta è più piccola e sotto controllo.
- **tRPC o schema condiviso "a mano" tra API e web**: renderebbe il contratto privato alla web app, contro l'ADR-0005 (una sola API per tutti i client).
- **Generare la specifica a partire dal client**: inverte la fonte di verità; la specifica deve nascere dall'API.
