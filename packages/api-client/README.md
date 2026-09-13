# @wb/api-client

Client TypeScript **generato** dal contratto OpenAPI dell'API WorkingBetter (ADR-0005, ADR-0009).

- `openapi.json` — il contratto pubblicato, emesso dall'API (`pnpm --filter @wb/api openapi:emit`). È la fonte per web, mobile e partner.
- `src/schema.ts` — tipi generati con `openapi-typescript` (`pnpm generate`). **Non modificare a mano.**
- `src/index.ts` — `createApiClient()` (client tipizzato su `openapi-fetch`), `request()` (chiamata con percorso verificato a compile time), `ApiError`/`Problem` (RFC 9457), `errorMessage()`.

Quando cambi un endpoint: `pnpm --filter @wb/api openapi:emit && pnpm --filter @wb/api-client generate`, poi committa `openapi.json` e `schema.ts`. La CI fallisce se non sono allineati (`pnpm --filter @wb/api-client check`).
