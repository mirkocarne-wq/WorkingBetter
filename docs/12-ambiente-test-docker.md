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
| Keycloak (opzionale, profilo `sso`) | http://localhost:8080 | admin/admin; identity provider di prova per l'SSO per tenant (sezione 5-bis) |

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

Accesso: pagina http://localhost:3000/login, organizzazione `acme`, password demo per tutti gli utenti **`Password!2026`**. In alternativa il link "Accesso rapido di sviluppo" entra senza password (solo con `AUTH_MODE=dev`).

1. **Dashboard manager** (Giulia): segnali del team, obiettivi a rischio.
2. **Obiettivi → Nuovo obiettivo** (chiunque): titolo, allineamento a un obiettivo padre, key result; poi **Albero di allineamento**: apri i key result e fai un check-in; il progresso risale ai padri.
3. **1:1 → Luca Bianchi**: aggiungi un suggerimento all'agenda, salva una nota privata, chiudi l'incontro: i punti non discussi passano al prossimo.
4. **Feedback**: dai un riconoscimento a Luca. Poi accedi come `luca.bianchi@acme.test`: la notifica compare nella campanella e in **Notifiche**; l'email è visibile su http://localhost:8025 entro 15 secondi.
5. **Form** (Giulia): compila la "Review leggera Q3" assegnata su Luca; prova a inviare incompleta per vedere la validazione, poi completa.
6. **Review, da zero** (Chiara): in **Form → Nuovo questionario** costruisci self-review e manager review e pubblicale; in **Review → Cicli → Nuovo template** collegale; poi crea e lancia un ciclo. **Review, flusso** (Giulia): in **Review → Il mio team** apri Luca Bianchi (la sua self-review è già inviata ma la vedrai solo dopo la tua), compila la manager review usando il pannello di contesto, invia e poi **Condividi con Luca**. Accedi come `luca.bianchi@acme.test`: leggi le due review e firma (anche in dissenso). Come `chiara.moretti@acme.test` apri **Review → Cicli → Review Q3 2026** per avanzamento, solleciti e chiusura.
7. **Report** (Chiara o Giulia): KPI e andamento degli ultimi 14 giorni (il seed genera gli snapshot), segnali per persona, tabella per unità/manager/persona con soglie di anonimato, report di processo del ciclo di review, export CSV. "Aggiorna dati" (solo HR) ricalcola lo snapshot di oggi; il worker lo fa ogni notte.
8. **Survey** (Luca): in **Survey** rispondi alla "Pulse di settembre" (anonima) e leggi la sintesi della "Engagement primavera 2026". Come Chiara: **Survey → Gestione → Risultati** mostra driver, eNPS, heatmap per unità/manager/anzianità con le soglie, commenti e il confronto con la precedente; da lì solleciti, proroga, chiusura e pubblicazione della sintesi. **Nuova survey** crea un questionario dalla libreria e lo lancia.
9. **Welfare** (Luca): saldo e soglie 2026, richiesta di rimborso dal pannello "Nuova richiesta" o dal catalogo (il budget viene prenotato), simulatore del premio di risultato con scelta irrevocabile, dichiarazione dei figli a carico, adesione a un'iniziativa. Come Chiara: **Welfare → Amministrazione** mostra la coda di verifica (approva, chiedi documenti, rifiuta), i piani con le fonti di budget, catalogo e iniziative, categorie e soglie con i preset per anno; in **Payroll** crea il lotto del mese, scarica il CSV e conferma la liquidazione (i movimenti passano da prenotati a spesi).
10. **Calendario** (Giulia): apri **1:1 → Luca Bianchi**: nel riquadro *Quando* scegli uno slot proposto o una data; su http://localhost:8025 arrivano a Giulia e Luca le email con l'invito `.ics` (aggiornato con la stessa SEQUENCE crescente; l'annullamento manda un CANCEL). **Aggiungi al calendario** scarica l'invito. In **Impostazioni → Calendario** attiva il feed personale e incolla l'indirizzo in Google Calendar (*Da URL*), Outlook (*Sottoscrivi dal Web*) o Apple Calendar: compaiono 1:1, scadenze delle review e delle survey e le azioni. Nota: l'indirizzo generato usa `API_PUBLIC_URL`; da un altro dispositivo deve essere raggiungibile.
11. **Report salvati** (Chiara): **Report → Report salvati → Nuovo report**: scegli metriche di moduli diversi, righe per unità, confronto con 30 giorni prima, condividi con i manager e imposta l'invio settimanale; salva. Apri il report come Giulia: vede solo il suo team. "Inviami via email" mette il CSV su Mailpit.
12. **Sviluppo** (Luca): radar delle competenze attese vs valutate, gap, "cosa manca per Senior Developer", piano attivo con azioni (una in scadenza), azioni suggerite da aggiungere. Come Giulia: **Sviluppo → Il mio team → Luca**: valutazione del manager, approvazione del piano, talent review (potenziale con nota). Come Chiara: **Sviluppo → Amministrazione**: 9-box, assegnazione dei job profile, competenze e libreria.
13. **Persone → Importa da CSV** (Chiara, HR): scarica il template, incolla righe, guarda l'anteprima con gli errori, conferma.
14. **Worker**: i promemoria girano ogni 15 minuti (configurabile). Per forzarli subito:

```bash
docker compose --profile app run --rm workers node apps/workers/dist/main.js --once
```

## 5-bis. Inviti, password e SSO

**Verifica in due passaggi**: in **Impostazioni → Verifica in due passaggi** premi *Attiva*, inquadra il QR con un'app di autenticazione (o copia la chiave), inserisci il codice: ricevi 8 codici di recupero. Esci e rientra con la password: la pagina di login chiede il codice. Come `anna.colombo@acme.test` (amministratore) puoi rendere l'MFA obbligatoria per ruolo in *Politiche di sicurezza*.

- **Inviti** (Anna, `anna.colombo@acme.test`, amministratrice, o Chiara): **Persone → Utenti e accessi → Invita una persona**. L'email con il link arriva su Mailpit (http://localhost:8025); in sviluppo il link compare anche nella pagina. Aprilo in una finestra in incognito: imposti la password e l'account si attiva. Dalla stessa pagina puoi reinviare inviti, disattivare utenti e assegnare o togliere ruoli.
- **Password dimenticata**: link nella pagina di accesso; l'email di reset è su Mailpit. **Cambio password**: **Impostazioni → La mia password**.
- **SSO con Keycloak** (prova end-to-end del flusso OIDC):
  1. `docker compose --profile app --profile sso up -d`, poi apri http://localhost:8080 (admin/admin).
  2. Crea un realm `workingbetter`; al suo interno un client `wb-web` di tipo OpenID Connect con *Client authentication* ON, *Standard flow* ON e *Valid redirect URIs* = `http://localhost:4000/api/v1/auth/oidc/callback`; copia il *Client secret* dalla scheda Credentials.
  3. Crea un utente nel realm con email `luca.bianchi@acme.test` (email verificata) e una password.
  4. In WorkingBetter, come Anna: **Impostazioni → SSO aziendale**: issuer `http://localhost:8080/realms/workingbetter`, client id `wb-web`, client secret, domini ammessi `acme.test`, salva. Se vuoi che gli sconosciuti entrino al primo accesso attiva "Crea automaticamente le persone".
  5. Esci e nella pagina di accesso premi **Accedi con SSO aziendale**: Keycloak chiede le credenziali e torni in WorkingBetter come Luca. In **Utenti e accessi** l'utente risulta collegato con provider "SSO".
  Nota: il container `api` deve raggiungere Keycloak allo stesso URL usato come issuer. Con `http://localhost:8080` questo vale dal tuo Mac ma non da dentro Docker: aggiungi `extra_hosts: ["localhost:host-gateway"]` al servizio `api` oppure imposta come issuer `http://host.docker.internal:8080/realms/workingbetter` e configura Keycloak con lo stesso *frontend URL*.

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
