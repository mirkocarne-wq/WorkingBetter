# 13 — Deploy in produzione

Guida operativa per portare WorkingBetter in un ambiente reale (staging o produzione). L'ambiente di prova su un solo computer è in `docs/12`; qui si parla di segreti, servizi, migrazioni, backup, scalabilità e monitoraggio. Le scelte architetturali di riferimento sono in `docs/03` e nelle ADR.

## 1. Componenti da eseguire

| Componente | Immagine / comando | Porta | Note |
|---|---|---|---|
| API | `Dockerfile` target `api` → `node apps/api/dist/main.js` | 4000 | stateless salvo due cache in memoria (vedi §6) |
| Worker | target `workers` → `node apps/workers/dist/main.js` | — | una sola replica; promemoria, email, data mart, report programmati |
| Web | target `web` → Next.js standalone | 3000 | server component: parla con l'API via `API_INTERNAL_URL` |
| PostgreSQL 16 | gestito (RDS, Cloud SQL, Aiven…) o proprio | 5432 | ruolo applicativo `wb_app` creato dalle migrazioni |
| Redis 7 | opzionale | 6379 | se assente il worker usa lo scheduler in-process |
| SMTP | provider transazionale (SES, Postmark, Mailgun…) | — | `EMAIL_TRANSPORT=smtp` |

Il reverse proxy (Caddy, nginx, il bilanciatore del cloud) termina TLS e instrada: `app.<dominio>` → web, `api.<dominio>` → API. Entrambi devono essere raggiungibili dal browser: la web app chiama l'API dal server (`API_INTERNAL_URL`) e il browser usa i link e i feed pubblicati dall'API (`API_PUBLIC_URL`).

## 2. Variabili d'ambiente e segreti

Tutte le variabili sono elencate in `.env.example`; qui quelle che in produzione **devono** cambiare.

| Variabile | Chi la usa | Produzione |
|---|---|---|
| `DATABASE_URL` | api, worker, migrazioni | utente **owner** dello schema per le migrazioni; per l'API può essere lo stesso utente (le transazioni tenant fanno `SET LOCAL ROLE wb_app`, che è soggetto a RLS) |
| `DB_APP_ROLE` | api, worker | `wb_app` (mai vuoto in produzione: senza SET ROLE le policy RLS non si applicano) |
| `AUTH_MODE` | api | `prod`: disattiva il login di sviluppo |
| `AUTH_SESSION_SECRET` | api | ≥ 32 caratteri casuali (`openssl rand -base64 48`); cambiarla invalida tutte le sessioni |
| `NOTES_MASTER_KEY` | api | 32 byte hex (`openssl rand -hex 32`): cifra note private dei 1:1, client secret SSO e segreti MFA. **Perderla significa perdere quei dati**: conservarla nel secret manager con backup |
| `APP_BASE_URL`, `API_PUBLIC_URL` | api, worker, web | URL https pubblici (link nelle email, redirect SSO, feed calendario, cookie `Secure`) |
| `API_CORS_ORIGIN` | api | l'origine della web app, separata da virgola se più d'una |
| `EMAIL_TRANSPORT`, `SMTP_URL`, `EMAIL_FROM` | worker | `smtp` e credenziali del provider; `EMAIL_FROM` con dominio autenticato (SPF/DKIM) |
| `CALENDAR_ORGANIZER_EMAIL` | api | stesso indirizzo di `EMAIL_FROM` |
| `REDIS_URL` | worker | consigliato in produzione per lo scheduler persistente |
| `NEXT_PUBLIC_API_URL`, `API_INTERNAL_URL` | web | pubblico e interno dell'API (il primo è fissato al build dell'immagine) |
| `AUTH_ISSUER`, `AUTH_AUDIENCE` | api | solo se un IdP di piattaforma emette token per client macchina |

I segreti si passano come variabili d'ambiente dal secret manager della piattaforma; non esistono file di configurazione da montare. Nessun segreto entra nelle immagini.

## 3. Prima installazione

1. Creare database e utente owner; nessuna estensione richiesta oltre `pgcrypto`/`gen_random_uuid` (presente in Postgres 13+).
2. Eseguire le migrazioni con l'immagine di build (target `build` del `Dockerfile`, la stessa usata dal servizio `migrate` di Docker Compose): `pnpm --filter @wb/db migrate`. Le migrazioni sono idempotenti e registrano quelle applicate.
3. Creare il primo tenant e il primo amministratore con lo script di bootstrap, nella stessa immagine: `pnpm --filter @wb/db bootstrap -- --tenant "<nome>" --slug <slug> --admin <email>`. Crea tenant, unità radice, persona e utente amministratore con un invito valido 7 giorni: l'email parte dalla coda quando il worker è attivo e il link è comunque stampato a video. **Non usare `seed` in produzione**: crea il tenant demo "Acme" con dati di prova.
4. Avviare API, worker e web; verificare `GET /health/ready` sull'API e `GET /login` sulla web app.
5. Dal primo accesso: Impostazioni → SSO (se previsto), Aspetto, Politiche di sicurezza (MFA obbligatoria per gli amministratori è la scelta consigliata).

## 4. Aggiornamenti

1. Costruire le nuove immagini (`docker compose --profile app build` o la pipeline).
2. Eseguire le migrazioni **prima** di avviare le nuove API (`migrate` termina con codice 0 se non c'è nulla da fare). Le migrazioni sono additive: la versione precedente dell'API continua a funzionare durante il rollout.
3. Sostituire worker, API e web. Il worker va fermato prima delle migrazioni se queste toccano tabelle dei job (raro, indicato nel CHANGELOG).
4. Verificare `GET /health` (versione, latenza DB, ultimi job) e il run del worker nei log.

Rollback: ripristinare le immagini precedenti; le migrazioni non si annullano in automatico (sono progettate per essere compatibili con la versione precedente).

## 5. Backup e ripristino

- Backup giornaliero del database più WAL/PITR se il provider lo offre; conservazione almeno 30 giorni. Il database contiene tutto lo stato applicativo (nessun file su disco). Senza backup gestito: `scripts/backup.sh` (pg_dump custom, tiene gli ultimi 30) e `scripts/restore.sh` su database vuoto, oppure `make backup` / `make restore FILE=…` con Docker Compose.
- Il `NOTES_MASTER_KEY` va nel backup dei segreti, separato dal database: senza chiave note private, client secret SSO e segreti MFA cifrati sono irrecuperabili (gli utenti possono comunque riconfigurare SSO e MFA).
- Test di restore trimestrale in un ambiente separato: ripristino, `migrate` (no-op), avvio API, login.

## 6. Scalabilità e limiti noti

- **API**: più repliche dietro bilanciatore vanno bene con due avvertenze. (1) Il *rate limiting* è in memoria per istanza: il limite effettivo è moltiplicato per il numero di repliche; con più di due repliche spostarlo sul gateway o su Redis. (2) I *codici di scambio* del login SSO (`/auth/exchange`) vivono in memoria per 60 secondi: servono sessioni "sticky" al bilanciatore oppure una sola replica finché non vengono spostati su Redis (voce di roadmap).
- **Connettori (ADR-0012)**: il worker deve avere la stessa `NOTES_MASTER_KEY` dell'API per decifrare i token; `API_PUBLIC_URL` deve essere l'URL pubblico dell'API perché i redirect URI dei provider sono `<API_PUBLIC_URL>/api/v1/integrations/callback/{google|microsoft|slack}` e vanno registrati tali e quali nelle app OAuth; `APP_BASE_URL` è dove il callback rimanda l'utente. Le uscite verso `*.googleapis.com`, `login.microsoftonline.com`, `graph.microsoft.com`, `slack.com` e i webhook Teams devono essere permesse dal worker e dall'API (solo callback).
- **Worker**: una sola replica. Con Redis i job sono persistenti e ripartono dopo un riavvio; senza Redis lo scheduler in-process riparte dal cron successivo. Tutti i job sono idempotenti per giorno (chiavi di deduplica sulle notifiche).
- **Web**: stateless, più repliche senza vincoli.
- **Database**: dimensionare per le tabelle `mart_person_facts` (≈ persone × fatti × giorni: 1.000 persone × 40 fatti × 365 giorni ≈ 15 M righe/anno; indicizzate per giorno) e `audit_log`. Politica di retention consigliata: mart 24 mesi, audit secondo il registro dei trattamenti.

## 7. Monitoraggio

- `GET /health/live` (liveness), `GET /health/ready` (readiness, 503 se il DB non risponde), `GET /health` (versione, uptime, latenza DB, ultimo run per job del worker).
- Log strutturati JSON su stdout (Fastify/pino) con `reqId`; ogni risposta porta `x-request-id` e gli errori RFC 9457 lo riportano in `instance`: è la chiave per correlare una segnalazione utente ai log.
- Tabella `job_runs`: ogni esecuzione del worker con esito e riepilogo; un job che non gira da più di 24 ore va allertato.
- Allarmi minimi: readiness in errore, errori 5xx > 1 % per 5 minuti, coda `email_outbox` con righe `pending` più vecchie di un'ora, righe `failed` in `webhook_deliveries` (consegne webhook esaurite dopo 5 tentativi), righe `failed` in `calendar_event_links`/`chat_outbox` e account in `connector_accounts` con `status = 'error'` (token da ricollegare), job `reminders` assente nelle ultime 26 ore.

## 8. Sicurezza operativa

Vedi `docs/06`: TLS terminato dal proxy con HSTS (l'API lo aggiunge quando `API_PUBLIC_URL` è https), cookie `Secure`, rate limiting, revoca sessioni, MFA. Il ruolo `wb_app` non è owner delle tabelle: anche un bug applicativo non può leggere dati di un altro tenant. Gli accessi al database con l'utente owner vanno riservati a migrazioni e manutenzione.

## 9. Checklist di go-live

- [ ] `AUTH_MODE=prod`, `AUTH_SESSION_SECRET`, `NOTES_MASTER_KEY`, `DB_APP_ROLE=wb_app` impostati
- [ ] `APP_BASE_URL` e `API_PUBLIC_URL` in https e coerenti con il proxy; `API_CORS_ORIGIN` corretto
- [ ] SMTP verificato (email di invito ricevuta) e dominio autenticato
- [ ] Backup attivo e restore provato una volta
- [ ] `node scripts/smoke.mjs <api> <web>` verde dopo il deploy (vedi `docs/14`)
- [ ] `GET /health` verde, worker con almeno un run in `job_runs`
- [ ] Primo amministratore con MFA attiva; SSO configurato se previsto
- [ ] Registro dei trattamenti e DPIA aggiornati per i moduli attivi (survey, welfare, talent review)
