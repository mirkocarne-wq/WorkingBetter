# ADR-0002 — Stack tecnologico

| | |
|---|---|
| **Stato** | Proposto (da validare) |
| **Data** | 2026-09-12 |
| **Decisori** | Da definire |

## Contesto

Serve uno stack che consenta a un team piccolo di consegnare rapidamente un prodotto SaaS multi-tenant con UI ricca (form dinamici, dashboard), job asincroni, integrazioni e buona manutenibilità. Il team e gli strumenti AI di sviluppo sono più produttivi con un linguaggio unico end-to-end.

## Decisione (proposta)

- **TypeScript** ovunque.
- **Frontend**: Next.js (React, App Router) con design system proprio su componenti accessibili headless.
- **Backend**: Node.js con **NestJS** come monolite modulare (un modulo per area funzionale, API interne esplicite).
- **Database**: **PostgreSQL 16** con Row-Level Security per tenant; **Prisma** come ORM/migrazioni (Drizzle come alternativa se servono query più vicine a SQL).
- **Code e cache**: Redis + BullMQ per job e promemoria.
- **Auth**: OIDC/SAML tramite broker (Keycloak self-hosted o servizio gestito) per non reimplementare SAML.
- **Monorepo**: pnpm workspaces + Turborepo.
- **Infra**: container Docker; deploy iniziale su PaaS europeo o Kubernetes gestito in UE; Terraform per l'infrastruttura.
- **Test**: Vitest (unit), Playwright (e2e), test di contratto API da OpenAPI.

## Alternative considerate

| Alternativa | Pro | Contro |
|---|---|---|
| Python/Django + React | Django admin, ecosistema HR/data | Due linguaggi; meno condivisione tipi |
| Next.js full-stack senza NestJS | Meno pezzi | Confini di modulo più deboli; job e integrazioni meno naturali |
| Microservizi dall'inizio | Scala per team | Complessità operativa ingiustificata per un team piccolo |
| Auth0/Clerk | Veloce | Costo per utente su volumi enterprise; lock-in |

## Conseguenze

- Un solo linguaggio riduce attrito e permette tipi condivisi tra API e UI.
- Il monolite modulare va disciplinato (lint sui confini dei package).
- Keycloak aggiunge un componente da operare; valutare alternative gestite.
- **Da fare**: validare con l'utente; poi inizializzare il monorepo (Fase 1).
