# Changelog

Tutte le modifiche rilevanti a questo progetto sono documentate in questo file.

Il formato segue [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e il progetto adotta il [Semantic Versioning](https://semver.org/lang/it/).

## [Unreleased]

### Added
- **Sprint 3 — Performance Review** (`REV`), costruito sul form engine.
  - Template di review (`REV-002/005/006/008/010`): form self e manager pubblicati, scadenze relative al lancio, regola di visibilità della self-review per il manager (subito / dopo l'invio / mai), scala di rating con etichette, rating complessivo da campo dedicato o derivato dal punteggio del form, snapshot del template nel ciclo.
  - Cicli (`REV-020/021/022/055/060/061`): popolazione per unità (con sottoalbero) e persone, esclusioni, anteprima con persone saltate perché senza manager; lancio che crea review e compilazioni self/manager e notifica persone e manager; avanzamento per stato e per manager; solleciti manuali (una volta al giorno) e promemoria automatici del worker a ridosso delle scadenze; chiusura del ciclo con annullamento delle review incomplete.
  - Review (`REV-031/034/051/052/053`): pannello di contesto con obiettivi del periodo, feedback visibili, riconoscimenti, 1:1 conclusi e review precedenti; condivisione con il collaboratore (con snapshot degli obiettivi), registrazione del colloquio, presa visione con commento e dissenso, override del rating da parte di HR con motivazione, riapertura di una fase; visibilità delle risposte calcolata lato server per soggetto, manager e HR.
  - Notifiche `review.launched`, `review.stage_due`, `review.shared`, `review.signed`; hook `onSubmitted` del form engine per collegare l'invio di una compilazione al suo contesto.
  - Web: `/reviews` (le mie, il mio team, cicli), `/reviews/cycles/[id]` (anteprima popolazione, lancio, solleciti, chiusura, avanzamento), `/reviews/[id]` (FormRunner per la propria fase, lettura delle fasi inviate, contesto, condivisione e firma). Seed con un ciclo attivo per il team Prodotto; 7 test e2e.
  - API: se l'host non supporta IPv6 il server ripiega automaticamente su IPv4.
- **Ambiente di test in Docker**: `Dockerfile` multi-stage (api, workers, web standalone), `docker-compose.yml` con profilo `app` (migrazioni + seed automatici, API, worker, web) e Mailpit per le email di prova, `Makefile` con comandi rapidi, guida passo-passo per macOS in `docs/12-ambiente-test-docker.md`. La web app usa `API_INTERNAL_URL` per le chiamate lato server dentro la rete Docker.
- **Sprint 2 — notifiche, import CSV, form engine.**
  - Notifiche (`INT-001…003`): centro notifiche in-app con conteggio non lette, preferenze per tipo e canale con default sensati, coda email (`email_outbox`) e helper `notify` condiviso; eventi collegati: feedback ricevuto, richiesta di feedback, riconoscimento, nuovo 1:1, azione assegnata, obiettivo off track (al manager, una volta al giorno), form assegnato, import completato.
  - Worker (`apps/workers`): job `reminders` (check-in in ritardo per cadenza del ciclo, 1:1 nelle prossime 24 h, azioni scadute, richieste di feedback in sospeso) idempotente per giorno tramite `dedupeKey`; job `email-dispatch` con 5 tentativi e backoff; scheduler BullMQ su Redis oppure in-process senza Redis; modalità `--once` per cron esterni e CI; tabella `job_runs` per osservabilità; 3 test.
  - Import persone da CSV (`CORE-012`): parser RFC 4180 con separatore automatico, anteprima con errori per riga e campo, upsert per email, risoluzione manager in due passate, creazione opzionale delle unità mancanti, template scaricabile, pagina web con anteprima e conferma.
  - Form engine (`APP-001…009`): schema dichiarativo validato (10 tipi di campo, obbligatorietà, limiti, `showIf`, commento obbligatorio sotto soglia, pesi), definizioni versionate con pubblicazione e nuova versione, compilazioni con bozza/validazione/invio, punteggi per sezione e totale, risposte normalizzate per l'analytics; 7 unit test del motore e test e2e; pagine web `/forms` e `/forms/responses/[id]` con `FormRunner` generico.
- **Sprint 1 — moduli 1:1 e Feedback & Riconoscimenti** (schema, migrazioni con RLS, API, test e2e, pagine web, seed).
  - 1:1 (`ONE`): relazioni manager–riporto/mentoring/skip-level/pari, incontri con cadenza, agenda condivisa con punti riportati automaticamente al successivo, note condivise e **note private cifrate** (AES-256-GCM, chiave per tenant via HKDF da `NOTES_MASTER_KEY`), action item, suggerimenti di agenda da obiettivi a rischio, azioni scadute e feedback recenti, metriche di adozione solo aggregate per HR/manager.
  - Feedback (`FBK`): valori aziendali, feedback privato o condiviso con il manager con controllo del destinatario ("condividi con il manager", "metti in fascicolo"), presa visione e utilità, richieste di feedback con inbox e rifiuto motivato, riconoscimenti pubblici con valori, reazioni, feed per azienda/unità/team, statistiche per valore, moderazione HR.
  - Web: pagine `/one-on-ones` (elenco e creazione), `/one-on-ones/[id]` (agenda, suggerimenti, note, azioni, storico), `/feedback` (feed, ricevuti, dati, richieste, form).
- **Codice applicativo (sprint 0 della Fase 1)**: monorepo pnpm + Turborepo.
  - `packages/shared`: ruoli e permessi, claim JWT, formule di progresso OKR (unit test).
  - `packages/db`: schema Drizzle (tenant, persone, utenti, unità, storico, ruoli, naming, audit; cicli, obiettivi, key result, check-in, contributori), migrazioni SQL con Row-Level Security e ruolo `wb_app`, helper `withTenant`, runner migrazioni, database PGlite per i test, seed demo "Acme".
  - `apps/api`: NestJS su Fastify; contesto richiesta con AsyncLocalStorage; auth JWT (dev HS256 / OIDC JWKS) con login di sviluppo; guard permessi; transazione tenant per richiesta; audit log transazionale; errori RFC 9457; OpenAPI su `/docs`; moduli Core (me, tenant, persone con storico e paginazione cursor, unità con path materializzato, utenti e ruoli) e Obiettivi (cicli, obiettivi con visibilità, allineamento anti-ciclo, KR, check-in con roll-up del progresso ai padri, chiusura, albero); 19 test e2e.
  - `apps/web`: Next.js App Router con login dev, dashboard di ruolo, obiettivi (viste miei/team/albero/tutti, check-in dal browser), persone con organigramma.
  - `docker-compose.yml` (Postgres, Redis, Keycloak), `.env.example`, workflow CI GitHub Actions.
- `docs/11-guida-sviluppo.md` e screenshot dell'app reale in `docs/screenshots/`.
- Struttura iniziale del repository e documentazione di progetto.
- `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, template issue e PR.
- Visione e obiettivi (`docs/00`), benchmark di PeopleGoal usato come specifica di partenza (`docs/01`).
- Indice delle specifiche funzionali e principi trasversali (`docs/02`) con specifiche di dettaglio per modulo in `docs/specifiche/`: Core & Amministrazione, Obiettivi & OKR, Performance Review, Feedback 360°, 1:1 & Check-in, Feedback continuo & Riconoscimenti, Engagement & Survey, Sviluppo & Carriera, Onboarding, App Studio, Analytics & Reporting, Integrazioni & Notifiche.
- Architettura proposta (`docs/03`), modello dati (`docs/04`), linee guida API (`docs/05`), sicurezza e compliance (`docs/06`), UX e design system (`docs/07`), roadmap (`docs/08`), glossario (`docs/09`).
- Documento per raccogliere le nostre modifiche e differenziazioni rispetto a PeopleGoal (`docs/10`).
- ADR iniziali: adozione delle ADR (0001), stack tecnologico proposto (0002), strategia multi-tenant (0003).
- Modulo **Welfare aziendale** (`docs/specifiche/welfare.md`, codice `WEL`): piani, fonti di budget, conto welfare, categorie e soglie fiscali per anno, catalogo interno e provider, richieste e rimborsi con giustificativi, conversione premio di risultato, flussi payroll, iniziative di benessere.
- ADR-0004 architettura della reportistica (data mart storicizzato, semantic layer, query engine, connettore BI).

- Mockup HTML/PNG di 12 schermate chiave in `docs/mockups/` con script di generazione e rendering.
- ADR-0005 strategia API (REST unica per web, mobile e connettori; PKCE; token con scope; webhook firmati).
- ADR 0002 (stack), 0003 (multi-tenancy) e 0004 (reportistica) passano a **Accettato** dopo validazione con il product owner.

### Changed
- CI: rimossa la versione esplicita di pnpm nell'action (letta da `packageManager`); azioni aggiornate a checkout v5 / setup-node v5.
- `docs/specifiche/analytics.md` riscritta come motore di reportistica ingegnerizzato: catalogo metriche, report builder, report programmati, Analytics API, connettore BI, governance (ANA-040…093). Report builder e BI passano da P2 a P1.
- `docs/specifiche/app-studio.md`: low-code a livelli L1–L5; entità custom (APP-036) e automazioni (APP-037/038) confermate a P2, script sandbox e marketplace a P3.
- Propagazione in README, `docs/01` (nuova sezione "funzionalità non presenti in PeopleGoal"), `docs/02` (nuovi ruoli Analista e Welfare, principio "ogni dato è una metrica"), `docs/03` (welfare, metadata-driven, reporting separato, API unica, mobile), `docs/04`, `docs/05`, `docs/08`, `docs/09`, `docs/10` (A15, A17, A18; C2 e C4 superate).
