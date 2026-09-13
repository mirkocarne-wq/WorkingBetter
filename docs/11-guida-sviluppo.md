# 11 — Guida allo sviluppo

> Vuoi solo provare il prodotto senza installare Node? Segui `docs/12-ambiente-test-docker.md` (`make up`).

## Prerequisiti

- Node.js 22, pnpm 10 (`corepack enable`)
- PostgreSQL 16 e Redis (via `docker compose up -d`, oppure installati in locale)

## Avvio rapido

```bash
pnpm install
cp .env.example .env                 # valori di default già validi per lo sviluppo
docker compose up -d postgres redis  # oppure un Postgres locale su :5432 con utente wb/wb
pnpm -r --filter "./packages/*" build
pnpm db:migrate                      # applica drizzle/*.sql (schema + policy RLS)
pnpm db:seed                         # tenant demo "acme" con persone e obiettivi
pnpm --filter @wb/api dev            # API su http://localhost:4000 · OpenAPI su /docs
pnpm --filter @wb/web dev            # Web su http://localhost:3000
pnpm --filter @wb/workers dev        # Worker: promemoria + invio email (log in dev); `pnpm --filter @wb/workers once` per un giro singolo
```

Le note private dei 1:1 sono cifrate se `NOTES_MASTER_KEY` è impostata (obbligatoria in produzione): `openssl rand -hex 32`.

Login di sviluppo (solo `AUTH_MODE=dev`): tenant `acme`, email di uno degli utenti del seed, ad esempio `giulia.ferri@acme.test` (manager), `chiara.moretti@acme.test` (HR admin), `luca.bianchi@acme.test` (collaboratore). Nessuna password: l'API emette un JWT firmato con `AUTH_DEV_SECRET`.

## Struttura

```
apps/
  api/        NestJS + Fastify. Moduli: auth, core (persone, import CSV, org, ruoli), objectives, one-on-one, feedback, notifications (in-app, preferenze), forms (definizioni versionate, compilazioni, hook di invio), reviews (template, cicli, review, contesto), analytics (catalogo, query engine, alert, report di processo, export), audit, health
  web/        Next.js (App Router). Login dev, dashboard, obiettivi (albero + check-in), 1:1, feedback e riconoscimenti, review (cicli HR, team, self-review, condivisione e firma), report (KPI, trend, segnali, processo, export), form, notifiche, persone
  workers/    job: reminders (promemoria giornalieri, idempotenti), email-dispatch (coda email con retry); BullMQ se REDIS_URL, altrimenti scheduler in-process
packages/
  shared/     tipi di dominio, ruoli e permessi, formule di progresso OKR (puro TS, testato)
  db/         schema Drizzle, migrazioni SQL, helper withTenant (RLS), PGlite per i test, seed
  api-client/ (fase 1) client TypeScript generato da OpenAPI
  ui/         (fase 1) design system condiviso web/mobile
```

## Come funziona una richiesta

1. Hook Fastify `onRequest` apre un `AsyncLocalStorage` con `requestId`, ip e user-agent.
2. `AuthGuard` verifica il Bearer JWT (HS256 in dev, JWKS dell'issuer OIDC in produzione), imposta il `principal` nel contesto e controlla i permessi dichiarati con `@RequirePermission`.
3. `TenantTxInterceptor` apre una transazione Postgres con `SET LOCAL ROLE wb_app` e `app.tenant_id = <tenant del principal>`: le policy RLS filtrano ogni tabella. La transazione è disponibile ai servizi tramite `tx()`.
4. I servizi applicano la logica di dominio e scrivono l'`audit_log` nella stessa transazione: se qualcosa fallisce, non resta traccia.
5. `ProblemDetailsFilter` converte ogni errore in `application/problem+json` (RFC 9457) con un `code` stabile.

## Comandi

| Comando | Cosa fa |
|---|---|
| `pnpm test` | Test di tutti i package (shared: unit; db: RLS su PGlite; api: e2e su PGlite) |
| `pnpm typecheck` / `pnpm lint` / `pnpm format` | Qualità |
| `pnpm db:generate` | Genera una migrazione dallo schema Drizzle (poi aggiungi a mano le policy RLS per le nuove tabelle) |
| `pnpm db:migrate` | Applica le migrazioni al `DATABASE_URL` |
| `pnpm db:seed -- --reset` | Ricrea il tenant demo |

## Convenzioni di codice

- TypeScript strict, ESM, import con estensione `.js` nei package Node.
- Un modulo Nest per area funzionale; i servizi usano `tx()` e `principal()` dal contesto, mai il client DB globale.
- Validazione input con Zod (`ZodValidationPipe`); nessun DTO a classi.
- Ogni tabella multi-tenant ha `tenant_id`, indice con `tenant_id` come prima colonna e policy RLS nella migrazione.
- Ogni scrittura rilevante chiama `AuditService.log`; gli eventi rilevanti per le persone chiamano `NotificationsService.send` (i template sono in `@wb/shared`, mai contenuti riservati nel testo).
- Test: e2e sull'API tramite `app.inject` con database PGlite isolato per file di test; niente mock del database.

## Aggiungere un modulo funzionale (checklist)

1. Specifica in `docs/specifiche/` aggiornata (ID requisiti).
2. Schema in `packages/db/src/schema/<modulo>.ts` + `pnpm db:generate` + policy RLS nella migrazione.
3. Modulo Nest in `apps/api/src/<modulo>/` con DTO Zod, servizio, controller con `@RequirePermission`.
4. Permessi in `packages/shared/src/auth/roles.ts`.
5. Test e2e in `apps/api/test/<modulo>.e2e.test.ts`.
6. Fatti del modulo in `packages/db/src/analytics/refresh.ts` e metriche nel catalogo `packages/shared/src/analytics/catalog.ts` (ADR-0006): ogni metrica dichiara formula, dimensioni, visibilità team, sensibilità e soglia; `validateCatalog` gira nei test e all'avvio dell'API.
7. Pagine web in `apps/web/app/(app)/<modulo>/`.
8. CHANGELOG.
