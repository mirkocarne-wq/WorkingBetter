# 12 — Ambiente di test in Docker (macOS)

Procedura per avere WorkingBetter completo sul proprio Mac in container: database, API, worker, web app, dati demo e una casella email di prova. Niente Node né Postgres da installare sulla macchina.

## Cosa ottieni

| Servizio | URL | Note |
|---|---|---|
| Web app | http://localhost:3000 | Login dev: tenant `acme`, email di un utente demo |
| API + OpenAPI | http://localhost:4000/docs | `GET /health` per lo stato |
| Mailpit (email di prova) | http://localhost:8025 | Tutte le email del worker finiscono qui, nessuna esce davvero |
| Postgres | localhost:5432 | utente `wb`, password `wb`, db `workingbetter` |
| Redis | localhost:6379 | code del worker |
| Keycloak (opzionale, profilo `sso`) | http://localhost:8080 | admin/admin; usato dalla Fase 1 quando arriva OIDC |

Utenti demo (nessuna password, login di sviluppo):

| Email | Ruolo |
|---|---|
| `anna.colombo@acme.test` | tenant_admin + manager (CEO) |
| `chiara.moretti@acme.test` | hr_admin |
| `giulia.ferri@acme.test`, `paolo.neri@acme.test` | manager |
| `luca.bianchi@acme.test`, `sara.ricci@acme.test`, `marco.conti@acme.test`, `elena.parisi@acme.test`, `andrea.russo@acme.test` | employee |

## 1. Prerequisiti (una volta sola)

1. **Docker Desktop per Mac** (Apple Silicon o Intel): https://www.docker.com/products/docker-desktop/ . In alternativa OrbStack, più leggero, funziona con gli stessi comandi.
2. In Docker Desktop → *Settings → Resources* assegna almeno **4 CPU e 6 GB di RAM** (la prima build compila TypeScript e Next.js).
3. **Git** (già presente con gli Xcode Command Line Tools: `xcode-select --install`).
4. Facoltativo: `make` è incluso negli Xcode Command Line Tools; i comandi `make` qui sotto hanno sempre l'equivalente `docker compose` esplicito.

Verifica:

```bash
docker --version && docker compose version
```

## 2. Clona il repository

```bash
git clone https://github.com/mirkocarne-wq/WorkingBetter.git
cd WorkingBetter
git checkout main          # oppure il branch che vuoi testare
```

## 3. Configurazione (facoltativa)

Lo stack parte senza alcun file `.env`: i valori di default sono nel `docker-compose.yml`. Se vuoi cambiare porte o segreti crea un `.env` nella root:

```bash
cat > .env <<'EOF2'
WEB_PORT=3000
API_PORT=4000
POSTGRES_PORT=5432
MAILPIT_UI_PORT=8025
# ogni quanto girano i promemoria nel worker (cron, UTC). Default: ogni 15 minuti
REMINDERS_CRON=*/15 * * * *
EOF2
```

I segreti di default (`AUTH_DEV_SECRET`, `NOTES_MASTER_KEY`) sono validi **solo per test locale**.

## 4. Avvio

```bash
make up
# equivalente: docker compose --profile app up -d --build
```

La prima volta la build richiede qualche minuto (dipendenze + compilazione). Sequenza automatica:

1. partono Postgres, Redis e Mailpit;
2. il servizio `migrate` applica le migrazioni e carica il tenant demo "Acme", poi termina;
3. partono API, worker e web.

Controlla lo stato:

```bash
make ps            # tutti "running (healthy)", migrate "exited (0)"
make logs          # log di api, workers, web (Ctrl+C per uscire)
curl http://localhost:4000/health
```

Apri http://localhost:3000, tenant `acme`, email `giulia.ferri@acme.test` → Entra.

## 5. Percorso di test consigliato

1. **Dashboard manager** (Giulia): segnali del team, obiettivi a rischio.
2. **Obiettivi → Albero di allineamento**: apri i key result e fai un check-in; il progresso risale ai padri.
3. **1:1 → Luca Bianchi**: aggiungi un suggerimento all'agenda, salva una nota privata, chiudi l'incontro: i punti non discussi passano al prossimo.
4. **Feedback**: dai un riconoscimento a Luca. Poi accedi come `luca.bianchi@acme.test`: la notifica compare nella campanella e in **Notifiche**; l'email è visibile su http://localhost:8025 entro 15 secondi.
5. **Form** (Giulia): compila la "Review leggera Q3" assegnata su Luca; prova a inviare incompleta per vedere la validazione, poi completa.
6. **Review** (Giulia): in **Review → Il mio team** apri Luca Bianchi (la sua self-review è già inviata ma la vedrai solo dopo la tua), compila la manager review usando il pannello di contesto, invia e poi **Condividi con Luca**. Accedi come `luca.bianchi@acme.test`: leggi le due review e firma (anche in dissenso). Come `chiara.moretti@acme.test` apri **Review → Cicli → Review Q3 2026** per avanzamento, solleciti e chiusura.
7. **Persone → Importa da CSV** (Chiara, HR): scarica il template, incolla righe, guarda l'anteprima con gli errori, conferma.
8. **Worker**: i promemoria girano ogni 15 minuti (configurabile). Per forzarli subito:

```bash
docker compose --profile app run --rm workers node apps/workers/dist/main.js --once
```

## 6. Comandi utili

| Comando | Effetto |
|---|---|
| `make down` | ferma tutto, **conserva** i dati |
| `make reset` | ferma tutto e **cancella** il database; al prossimo `make up` il tenant demo viene ricreato |
| `make seed` | ricrea solo i dati demo (schema intatto) |
| `make build` poi `make up` | dopo un `git pull` con modifiche al codice |
| `make test` | tutta la suite di test (usa PGlite, non tocca il tuo database) |
| `make shell-db` | `psql` sul database |
| `make infra` | solo Postgres/Redis/Mailpit, per chi sviluppa con `pnpm` fuori da Docker (vedi `docs/11`) |
| `docker compose --profile app --profile sso up -d` | aggiunge Keycloak |

## 7. Aggiornare a una nuova versione

```bash
git pull
make build && make up
```

Le migrazioni nuove vengono applicate automaticamente dal servizio `migrate`; i dati esistenti restano. Se vuoi ripartire da zero: `make reset && make up`.

## 8. Problemi comuni

| Sintomo | Causa e rimedio |
|---|---|
| `port is already allocated` | Un'altra app usa 3000/4000/5432/6379/8025. Cambia la porta nel `.env` (es. `WEB_PORT=3001`) e rilancia `make up` |
| La build fallisce con "killed" o errori di memoria | Aumenta la RAM di Docker Desktop (Resources) ad almeno 6 GB |
| `migrate` esce con errore di connessione | Postgres non era ancora pronto: `make up` di nuovo (le dipendenze aspettano l'healthcheck, ma un volume corrotto può bloccare: `make reset`) |
| `dependency failed to start: container workingbetter-api-1 is unhealthy` | L'API non ha superato l'healthcheck entro 2 minuti. Guarda `docker compose --profile app logs api`: se l'API è partita (`in ascolto su http://localhost:4000`) era un problema di risoluzione `localhost` in IPv6 nell'immagine, corretto dalla versione con healthcheck su `127.0.0.1`; fai `git pull && make build && make up`. Se l'API è crashata, il log mostra l'errore di configurazione o di connessione al database |
| La web app mostra "Errore interno" al login | L'API non è raggiungibile: `docker compose --profile app logs api`; controlla `curl http://localhost:4000/health` |
| Le email non compaiono in Mailpit | Il worker le invia ogni 15 s: controlla `docker compose --profile app logs workers`; verifica che la preferenza email del tipo di notifica sia attiva (Notifiche → Preferenze) |
| Apple Silicon: immagine `postgres:16` lenta | Assicurati che Docker Desktop usi **VirtioFS** e Rosetta disattivata per le immagini arm64 (sono tutte native) |
| Ho modificato il codice ma non vedo cambiamenti | Le immagini sono compilate: `make build && make up` |

## 9. Cosa NON è questo ambiente

- Non è produzione: login senza password (`AUTH_MODE=dev`), segreti fissi, email intercettate. La configurazione di produzione (OIDC, SMTP reale, segreti da vault, HTTPS) è nella roadmap della Fase 1.
- I dati vivono nel volume Docker `workingbetter_pgdata` sul tuo Mac: `make reset` li cancella.
