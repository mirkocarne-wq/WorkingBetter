# CLAUDE.md — Istruzioni per agenti AI su questo repository

Questo file guida Claude Code (e altri agenti) quando lavorano su WorkingBetter.

## Contesto

- **Prodotto**: piattaforma SaaS di performance management ed employee experience, ispirata a PeopleGoal.
- **Fase attuale**: sviluppo Fase 1 (MVP). Le specifiche in `docs/` restano la fonte di verità funzionale; il codice vive in `apps/` e `packages/` (vedi `docs/11-guida-sviluppo.md`).
- **Lingua**: la documentazione, i commenti di prodotto e le comunicazioni con l'utente sono in **italiano**. Identificatori di codice, nomi di entità, endpoint API e commit message sono in **inglese**.

## Regole di lavoro

1. **Tieni il repo sempre aggiornato**: ogni modifica significativa va committata e pushata sul branch di lavoro indicato, con messaggio chiaro. Aggiorna `CHANGELOG.md` (sezione `[Unreleased]`) a ogni cambiamento rilevante.
2. **Documentazione prima del codice**: quando si introduce una funzionalità, prima si aggiorna o crea la specifica in `docs/specifiche/`, poi si implementa.
3. **Decisioni architetturali**: ogni scelta tecnica non banale va registrata come ADR in `docs/adr/` (usa il template `docs/adr/0000-template.md`). Le ADR esistenti con stato *Proposto* vanno validate con l'utente prima di essere considerate definitive.
4. **Le nostre modifiche** rispetto a PeopleGoal si raccolgono in `docs/10-modifiche-nostre.md`. Quando una modifica viene approvata, va propagata nella specifica del modulo interessato.
5. **Non inventare requisiti**: se un requisito è ambiguo, esplicita l'assunzione nel documento (sezione "Assunzioni / Domande aperte") invece di decidere in silenzio.
6. **Formato documenti**: Markdown, titoli con `#`, tabelle per confronti, diagrammi in Mermaid. Ogni specifica di modulo segue il template `docs/specifiche/_template.md`.
7. **Identificatori requisiti**: ogni requisito ha un ID stabile nel formato `<MODULO>-<NNN>` (es. `OKR-012`, `REV-003`). Non riutilizzare ID rimossi.

## Struttura del repository

```
.
├── apps/api                  # NestJS + Fastify (API REST unica, OpenAPI su /docs)
├── apps/web                  # Next.js (App Router)
├── apps/console              # Console di piattaforma (Next.js, porta 8443, operatori; ADR-0013)
├── packages/shared           # tipi, ruoli/permessi, logica pura (progresso OKR)
├── packages/db               # schema Drizzle, migrazioni SQL + RLS, withTenant, PGlite per test, seed
├── packages/connectors       # node-only: cifratura per tenant, client Google/Microsoft/Slack/Teams, sync calendario e dispatch chat (ADR-0012)
├── packages/api-client       # contratto OpenAPI (openapi.json) + tipi e client generati (ADR-0009)
├── apps/workers              # job: promemoria, invio email (BullMQ o in-process)
├── Dockerfile                # multi-stage: target api | workers | web
├── docker-compose.yml        # infra (postgres, redis, mailpit, keycloak) + profilo `app` con lo stack completo
├── docker-compose.prod.yml   # stack completo su un server con Caddy (TLS automatico); usato da infra/rocky9/deploy.sh
├── infra/                    # caddy/Caddyfile, rocky9/ (install.sh, init-env.sh, deploy.sh, backup.sh, unit systemd)
├── Makefile                  # make up / down / reset / logs / test / backup / restore / smoke
├── scripts/                  # backup.sh, restore.sh, smoke.mjs, generatori degli inventari
├── README.md                 # Panoramica e mappa della documentazione
├── CLAUDE.md                 # Questo file
├── CONTRIBUTING.md           # Convenzioni di contributo
├── CHANGELOG.md              # Storico modifiche (Keep a Changelog)
├── .github/                  # Template issue/PR
└── docs/
    ├── 00-visione-e-obiettivi.md
    ├── 01-benchmark-peoplegoal.md
    ├── 02-specifiche-funzionali.md   # Indice + principi trasversali
    ├── specifiche/                    # Una specifica per modulo
    ├── 03-architettura.md
    ├── 04-modello-dati.md
    ├── 05-api.md
    ├── 06-sicurezza-e-compliance.md
    ├── 07-ux-e-design-system.md
    ├── 08-roadmap.md
    ├── 09-glossario.md
    ├── 10-modifiche-nostre.md
    ├── 11-guida-sviluppo.md           # Come avviare, struttura, convenzioni di codice, checklist nuovo modulo
    ├── 12-ambiente-test-docker.md     # Ambiente di test completo in Docker (macOS)
    ├── 13-deploy-produzione.md        # Deploy: componenti, segreti, migrazioni, backup, monitoraggio
    ├── 14-preparazione-pilota.md      # Checklist pilota: ADR da validare, staging, app OAuth, tenant, verifica end-to-end
    ├── 15-server-di-prova-rocky9.md   # Primo server di prova su Rocky 9: GitHub deploy key, install/deploy, TLS, backup
    ├── manuale/                       # Manuale operativo per profilo + regole HR applicate (sprint 21)
    ├── manuale-utente/                # Manuale utente con schermate (img/ generate da scripts/manual-screenshots.mjs)
    ├── 04-modello-dati-inventario.md  # Generato: tabelle e colonne (pnpm docs:generate)
    ├── 05-api-inventario.md           # Generato: endpoint dal contratto OpenAPI (pnpm docs:generate)
    ├── adr/                           # Architecture Decision Records (0002–0005 accettate)
    └── mockups/                       # Mockup HTML/PNG delle schermate (build.py + render.mjs)
```

## Convenzioni Git

- Branch di lavoro: quello indicato dalla sessione (mai pushare su `main` direttamente senza indicazione).
- Commit in inglese, formato [Conventional Commits](https://www.conventionalcommits.org/): `docs:`, `feat:`, `fix:`, `chore:`, `refactor:`, `test:`.
- Un commit per unità logica di lavoro; niente commit "wip" pushati.

## Regole per il codice

- Stack accettato (ADR-0002): TypeScript, NestJS + Fastify, Drizzle + PostgreSQL con RLS, Next.js, pnpm + Turborepo. Non introdurre framework alternativi senza una nuova ADR.
- Prima di pushare: `pnpm -r --filter "./packages/*" build && pnpm -r typecheck && pnpm -r lint && pnpm -r test` devono passare; se hai toccato controller o DTO dell'API, `pnpm contract:update` e committa `packages/api-client/openapi.json` e `src/schema.ts` (la CI esegue `pnpm contract:check`); se cambiano schema o endpoint, `pnpm docs:generate` rigenera gli inventari in `docs/` (la CI esegue `pnpm docs:check`).
- Ogni nuova tabella multi-tenant ha `tenant_id` e policy RLS nella migrazione; ogni endpoint ha `@RequirePermission` e usa `@ZBody`/`@ZQuery` (mai `@Body` nudo); ogni scrittura rilevante scrive nell'audit log.
- Web: campi modulo con la classe `.input` o le primitive di `apps/web/components/ui.tsx`; niente nuovi stili inline per input/select/textarea.
- Segui la checklist "Aggiungere un modulo funzionale" in `docs/11-guida-sviluppo.md`.
- Il dev server dell'API usa `tsc --watch` (non `tsx`): esbuild non emette i metadata dei decoratori richiesti da NestJS.
- Non committare segreti; `.env.example` è l'unico file di configurazione versionato.
