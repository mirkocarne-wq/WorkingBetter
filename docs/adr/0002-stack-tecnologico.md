# ADR-0002 — Stack tecnologico

| | |
|---|---|
| **Stato** | Accettato |
| **Data** | 2026-09-13 (proposto il 2026-09-12) |
| **Decisori** | Mirko Carne (product owner), team WorkingBetter |

## Contesto

Serve uno stack che consenta a un team piccolo di consegnare rapidamente un prodotto SaaS multi-tenant con UI ricca (form dinamici, dashboard, report builder), job asincroni, integrazioni, **API pubbliche per connettori e per una mobile app**, e che scali orizzontalmente senza riscritture. Un solo linguaggio end-to-end massimizza la condivisione di tipi e la produttività, anche con strumenti AI di sviluppo.

## Decisione

| Livello | Scelta |
|---|---|
| Linguaggio | **TypeScript** ovunque (strict) |
| Backend | **NestJS** su Node.js, monolite modulare: un modulo Nest per area funzionale, API interne esplicite, eventi di dominio via outbox |
| API | **REST versionata + OpenAPI 3.1** generata dal codice, unica per web, mobile e connettori (dettagli in ADR-0005) |
| Database | **PostgreSQL 16** con Row-Level Security per tenant (ADR-0003); **Drizzle ORM** + drizzle-kit per schema e migrazioni (SQL esplicito, `SET LOCAL` per transazione naturale) |
| Test DB | **PGlite** (Postgres in WASM) per unit/integration test veloci senza server; Postgres reale per e2e e CI |
| Code / cache | **Redis + BullMQ** |
| Auth | OAuth2/OIDC: **Keycloak** come broker (SAML/OIDC verso gli IdP dei clienti; PKCE per mobile). Per lo sviluppo locale e i primi tenant, login email+password gestito dallo stesso broker |
| Web | **Next.js** (App Router) + design system proprio su componenti headless accessibili |
| Mobile | **React Native con Expo** (fase 2), stesso client API tipizzato |
| Reportistica | Data mart su Postgres, semantic layer proprio (ADR-0004) |
| Grafici | ECharts (web e PDF) |
| Monorepo | **pnpm workspaces + Turborepo** |
| Qualità | ESLint + Prettier, Vitest, Playwright, test di contratto da OpenAPI |
| Infra | Docker; Docker Compose in locale; deploy container in regione UE (Kubernetes gestito o ECS/Cloud Run); Terraform |
| Osservabilità | OpenTelemetry, log strutturati JSON con `tenant_id` e `request_id` |

## Alternative considerate

| Alternativa | Pro | Contro |
|---|---|---|
| Python/Django + React | Ecosistema data | Due linguaggi; meno condivisione tipi |
| Next.js full-stack senza NestJS | Meno pezzi | Confini di modulo deboli; job e integrazioni meno naturali |
| Prisma al posto di Drizzle | Maturità, DX | RLS con `SET LOCAL` per transazione è macchinoso; query builder meno vicino a SQL |
| Microservizi dall'inizio | Scala per team | Complessità operativa ingiustificata |
| Auth0 / Clerk / WorkOS | Veloci | Costo per utente/tenant; lock-in. WorkOS resta un'opzione se operare Keycloak pesa |
| GraphQL | Flessibilità per la UI | Seconda superficie API da mantenere; i partner preferiscono REST |
| Flutter | Ottimo rendering | Perde la condivisione dei tipi TypeScript |

## Conseguenze

- Inizializzare il monorepo: `apps/api`, `apps/web`, `apps/workers`, `packages/db`, `packages/shared`, `packages/ui`, `packages/api-client`.
- Ogni modulo funzionale = un package Nest con schema Drizzle proprio, eventi di dominio e metriche nel catalogo (ADR-0004).
- Lint sui confini dei package per proteggere il monolite modulare.
- Keycloak aggiunge un componente da operare: prevederlo nel Docker Compose fin da subito; fino alla sua integrazione (Fase 1) l'API accetta JWT emessi da un issuer configurabile.
