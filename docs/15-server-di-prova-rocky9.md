# 15 — Primo server di prova su Rocky Linux 9

Procedura completa per installare WorkingBetter su **un solo server Rocky Linux 9** (vale anche per RHEL e AlmaLinux 9) con tutto lo stack in container: database, cache, API, worker, web app, console di piattaforma e un reverse proxy che ottiene i certificati da solo. È l'ambiente di prova o pilota descritto in `docs/14 §2`; le regole generali di deploy (segreti, migrazioni, scalabilità, monitoraggio) restano in `docs/13`.

Tutto quello che serve è nel repository:

| File | Scopo |
|---|---|
| `infra/rocky9/install.sh` | prepara il server: Docker, git, firewall, chiave SSH per GitHub, clone, timer di backup |
| `infra/rocky9/init-env.sh` | crea il file `.env` con i nomi host e i segreti generati |
| `infra/rocky9/deploy.sh` | aggiorna il codice, costruisce le immagini, applica le migrazioni, (ri)avvia i servizi |
| `infra/rocky9/backup.sh` + `systemd/` | backup notturno del database |
| `docker-compose.prod.yml` | definizione dello stack (profilo `mailtest` per la casella email di prova) |
| `infra/caddy/Caddyfile` | reverse proxy: TLS automatico, HSTS, instradamento per nome host, filtro di rete sulla console |

## 1. Cosa ottieni

| Servizio | URL | Note |
|---|---|---|
| Web app | `https://app.<dominio>` | login con password (nessun login di sviluppo: `AUTH_MODE=prod`) |
| API | `https://api.<dominio>` | `GET /health`, OpenAPI su `/docs` |
| Console di piattaforma | `https://console.<dominio>:8443` | operatori; limitabile a una rete (§7) |
| PostgreSQL 16, Redis 7 | solo rete interna dei container | dati nei volumi `pgdata` e `redisdata` |
| Mailpit (facoltativo) | `http://localhost:8025` **sul server** | cattura le email di prova; si raggiunge con un tunnel SSH (§6) |

Il proxy (Caddy) ascolta su 80, 443 e 8443; tutto il resto resta chiuso dal firewall.

## 2. Prerequisiti

- **Server**: Rocky Linux 9 minimale aggiornato, 2 vCPU e 4 GB di RAM (8 GB consigliati: la prima build delle immagini è impegnativa), 40 GB di disco, accesso `root` o utente con `sudo`, orologio sincronizzato (lo script abilita `chronyd`).
- **Nomi DNS**: tre nomi che puntano all'IP del server, per esempio `app.wb.esempio.it`, `api.wb.esempio.it`, `console.wb.esempio.it`. Due situazioni:
  - **server raggiungibile da Internet** con un dominio vero → certificati **Let's Encrypt** automatici (le porte 80 e 443 devono essere aperte verso il server);
  - **server solo in rete locale / senza dominio** → Caddy emette i certificati con una **CA interna** (`CADDY_TLS=internal`). Il browser avvisa finché non si importa la CA (§5.4). Per i nomi si può usare un servizio come `sslip.io`, che risolve `app.10-0-0-5.sslip.io` in `10.0.0.5` senza configurare nulla, oppure il file `hosts` dei PC che devono collegarsi.
- **Accesso al repository GitHub** (`mirkocarne-wq/WorkingBetter`, privato): vedi §3.
- Facoltativo: un account **SMTP** per le email reali (altrimenti Mailpit di prova, §6).

## 3. Collegare il server a GitHub

Il server deve poter scaricare il codice (e i suoi aggiornamenti) dal repository privato. La via consigliata è una **deploy key**: una chiave SSH che vale solo per questo repository, in sola lettura, senza legare il server all'account personale di nessuno.

1. `install.sh` (§4) genera la chiave in `/root/.ssh/wb_deploy_ed25519`, configura `~/.ssh/config` per `github.com` e stampa la chiave pubblica.
2. Su GitHub: repository **WorkingBetter → Settings → Deploy keys → Add deploy key**; titolo `server di prova`, incolla la chiave pubblica, lascia **disattivato** «Allow write access», salva.
3. Verifica dal server: `ssh -T git@github.com` risponde `Hi mirkocarne-wq/WorkingBetter! You've successfully authenticated…`.
4. Rilancia `install.sh`: trova la chiave autorizzata e fa il clone in `/opt/workingbetter` (branch `main`).

Alternativa senza SSH: un **fine-grained personal access token** con il solo permesso *Contents: read* sul repository, e clone via HTTPS con il token salvato nel credential helper:

```bash
git config --global credential.helper store
git clone https://github.com/mirkocarne-wq/WorkingBetter.git /opt/workingbetter   # utente: il tuo login GitHub, password: il token
```

Il token ha una scadenza: annotala. La deploy key non scade.

## 4. Preparazione del server

Il repository è privato, quindi lo script si copia sul server dal tuo PC (dove hai il repository):

```bash
scp infra/rocky9/install.sh root@<server>:/root/
ssh root@<server> bash /root/install.sh          # oppure: sudo bash install.sh da un utente con sudo
```

Alla prima esecuzione lo script si ferma dopo aver stampato la chiave pubblica da autorizzare su GitHub (§3); una volta aggiunta, rilancialo e completerà clone e timer di backup. Lo script è **idempotente**: si può rilanciare finché tutti i passi sono completati. Cosa fa:

| Passo | Dettaglio |
|---|---|
| Pacchetti | `dnf update`, `git`, `curl`, `chrony`, utilità SELinux |
| Docker | repository ufficiale Docker (quello CentOS, valido per Rocky 9), `docker-ce` + plugin `compose` e `buildx`; rimuove `podman-docker` che è in conflitto; abilita il servizio; aggiunge al gruppo `docker` l'utente che ha lanciato `sudo` |
| Firewall | `firewalld`: servizi `http`, `https` e porta `8443/tcp` |
| Cartelle | `/opt/workingbetter` (codice) e `/var/backups/workingbetter` (dump) |
| GitHub | chiave di deploy, `~/.ssh/config`, `known_hosts`, clone del branch `main` |
| Backup | timer systemd `wb-backup.timer` (ogni notte alle 02:15, §8) |

Variabili per cambiare i valori predefiniti: `WB_DIR`, `WB_REPO`, `WB_BRANCH`, `WB_USER` (es. `WB_BRANCH=claude/xyz bash install.sh` per provare un branch di sviluppo).

**SELinux** resta in modalità *enforcing*: Docker CE lo supporta e l'unico file montato dal repository (il `Caddyfile`) è etichettato con l'opzione `z` nel compose.

## 5. Configurazione e primo avvio

### 5.1 Il file `.env`

```bash
cd /opt/workingbetter
infra/rocky9/init-env.sh app.wb.esempio.it api.wb.esempio.it console.wb.esempio.it ops@esempio.it
```

L'ultimo argomento è l'indirizzo email per Let's Encrypt; ometterlo (o scrivere `internal`) sceglie la CA interna di Caddy. Lo script genera `POSTGRES_PASSWORD`, `AUTH_SESSION_SECRET`, `NOTES_MASTER_KEY` e la password del primo operatore della console, scrive `.env` con permessi `600` e stampa il riepilogo. **Copia subito `NOTES_MASTER_KEY` e la password dell'operatore in un posto sicuro** (gestore di password): la chiave cifra note private, segreti SSO/MFA e token dei connettori e non è recuperabile dal database (`docs/13 §5`).

Voci del file che si possono cambiare a mano prima del deploy (o dopo, seguito da `deploy.sh --no-pull`):

| Variabile | Significato |
|---|---|
| `CADDY_TLS` | `internal` oppure l'email per Let's Encrypt |
| `CONSOLE_ALLOW` | reti ammesse alla console, CIDR separati da spazio (es. `10.0.0.0/8 203.0.113.4/32`); default: tutte |
| `PLATFORM_BOOTSTRAP_EMAIL/PASSWORD` | primo operatore della console, creato al primo avvio dell'API se non ne esistono |
| `EMAIL_TRANSPORT`, `SMTP_URL`, `EMAIL_FROM` | `log` (default: le email finiscono nei log del worker), oppure `smtp` con `smtp://utente:password@host:587` o Mailpit (§6) |
| `AUTH_SESSION_TTL_HOURS` | durata delle sessioni (12) |
| `NEXT_PUBLIC_MANUAL_URL` | URL del manuale pubblicato, mostrato nella Guida in app |

### 5.2 Deploy

```bash
infra/rocky9/deploy.sh
```

Sequenza: `git pull --ff-only` → build delle immagini (`api`, `workers`, `web`, `console`; la prima volta 5–15 minuti a seconda della macchina) → migrazioni (`migrate`, idempotente) → `docker compose up -d` → attesa di `GET /health/ready` → riepilogo con gli URL. Da questo momento i servizi ripartono da soli al riavvio del server (`restart: unless-stopped` e servizio `docker` abilitato).

### 5.3 Primo tenant e primo amministratore

Il server parte **senza dati** (nessun seed demo, come richiesto da `docs/13 §3`). Crea il tenant pilota e il suo amministratore:

```bash
docker compose -f docker-compose.prod.yml run --rm migrate \
  pnpm --filter @wb/db bootstrap -- --tenant "Azienda Prova" --slug prova --admin admin@esempio.it
```

Il comando stampa il **link di invito** (valido 7 giorni); con `EMAIL_TRANSPORT=smtp` parte anche l'email. L'amministratore apre il link, imposta la password e da lì in poi accede su `https://app.<dominio>/login?tenant=prova`. Gli altri tenant si creano dalla console (Tenant → Nuovo), che invia l'invito nello stesso modo.

### 5.4 Console di piattaforma

`https://console.<dominio>:8443` con l'operatore indicato in `.env`: al primo accesso la console chiede di cambiare la password. Da Stato si verificano database, migrazioni, worker, code e certificati.

**Certificati con CA interna** (`CADDY_TLS=internal`): per togliere l'avviso del browser esporta la CA di Caddy e importala tra le autorità attendibili dei PC che si collegano:

```bash
docker compose -f docker-compose.prod.yml exec caddy cat /data/caddy/pki/authorities/local/root.crt > workingbetter-ca.crt
```

(su Windows: doppio clic → Installa certificato → Autorità di certificazione radice attendibili; su macOS: Accesso Portachiavi → Sistema → Fidati sempre.)

### 5.5 Verifica

```bash
curl -s https://api.<dominio>/health | python3 -m json.tool     # con CA interna aggiungi -k
docker compose -f docker-compose.prod.yml ps                     # tutti "healthy" o "running"
docker compose -f docker-compose.prod.yml logs --tail=50 workers # almeno un run del job reminders/mart
```

Poi il giro di prova di `docs/14 §5` (login, 1:1, feedback, review) e, con le credenziali di un utente di prova, lo smoke test dal tuo PC: `SMOKE_TENANT=prova SMOKE_EMAIL=… SMOKE_PASSWORD=… node scripts/smoke.mjs https://api.<dominio> https://app.<dominio>`.

## 6. Email di prova con Mailpit

Se non hai ancora un SMTP, imposta in `.env`:

```
EMAIL_TRANSPORT=smtp
SMTP_URL=smtp://mailpit:1025
```

`deploy.sh` riconosce l'indirizzo e avvia anche il servizio `mailpit` (profilo `mailtest`). Tutte le email (inviti, promemoria, reset password) finiscono nella sua casella, che ascolta **solo su localhost del server**: dal tuo PC apri un tunnel e vai su http://localhost:8025.

```bash
ssh -L 8025:127.0.0.1:8025 utente@<server>
```

Passaggio a un SMTP reale: `SMTP_URL=smtp://utente:password@smtp.provider.it:587`, `EMAIL_FROM` con un dominio autenticato (SPF/DKIM), poi `deploy.sh --no-pull`. L'invito di prova deve arrivare davvero prima del pilota (`docs/13 §9`).

## 7. Sicurezza minima del server di prova

- **Console**: limita `CONSOLE_ALLOW` alle reti degli operatori (uffici, VPN) e, in aggiunta, il firewall: `firewall-cmd --permanent --remove-port=8443/tcp && firewall-cmd --permanent --add-rich-rule='rule family=ipv4 source address=203.0.113.0/24 port port=8443 protocol=tcp accept' && firewall-cmd --reload`.
- **SSH**: solo chiavi (`PasswordAuthentication no` in `/etc/ssh/sshd_config.d/`), `fail2ban` se il server è esposto.
- **Aggiornamenti automatici di sicurezza**: `dnf -y install dnf-automatic && systemctl enable --now dnf-automatic-install.timer`.
- **Segreti**: `.env` è leggibile solo da root e non è versionato (`.gitignore`). Non copiarlo in chat o ticket.
- **Primo amministratore del tenant**: attiva la MFA e la politica «MFA obbligatoria per gli amministratori» (Impostazioni → Sicurezza).

## 8. Backup e ripristino

Il timer `wb-backup.timer` esegue `infra/rocky9/backup.sh` ogni notte: dump `pg_dump` in formato custom in `/var/backups/workingbetter/`, conservati gli ultimi 30. Controllo: `systemctl list-timers wb-backup.timer`, `journalctl -u wb-backup.service`. Backup a mano: `infra/rocky9/backup.sh`.

Copia i dump **fuori dal server** (rsync verso un NAS, bucket S3…) insieme a `NOTES_MASTER_KEY`: il database senza chiave non basta.

Ripristino su questo stesso server (svuota il database corrente):

```bash
docker compose -f docker-compose.prod.yml stop api workers web console
docker compose -f docker-compose.prod.yml exec -T postgres pg_restore -U wb --clean --if-exists --no-owner --no-privileges --dbname=workingbetter < /var/backups/workingbetter/wb-YYYYmmdd-HHMMSS.dump
docker compose -f docker-compose.prod.yml run --rm migrate      # no-op se il backup è della stessa versione
docker compose -f docker-compose.prod.yml up -d
```

Fai una prova di ripristino almeno una volta prima del pilota (`docs/14 §2`).

## 9. Aggiornamenti e rollback

```bash
cd /opt/workingbetter && infra/rocky9/deploy.sh          # prende l'ultimo main, ricostruisce, migra, riavvia
infra/rocky9/deploy.sh --branch claude/xyz                # prova un branch di sviluppo
infra/rocky9/deploy.sh --no-pull                          # solo dopo aver cambiato .env
```

Le migrazioni sono additive e compatibili con la versione precedente (`docs/13 §4`): per tornare indietro basta `git checkout <commit precedente>` e `deploy.sh --no-pull`. L'interruzione del servizio durante un aggiornamento è di pochi secondi (riavvio dei container); per un pilota è accettabile, per la produzione vedi `docs/13 §6`.

## 10. Diagnostica

| Sintomo | Dove guardare |
|---|---|
| `deploy.sh` si ferma alla build per memoria esaurita | aggiungi swap (`fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`) o costruisci le immagini altrove e importale |
| il browser non raggiunge `https://app.<dominio>` | DNS (`dig app.<dominio>` deve dare l'IP del server), firewall (`firewall-cmd --list-all`), log del proxy: `docker compose -f docker-compose.prod.yml logs caddy` |
| Caddy non ottiene il certificato Let's Encrypt | porte 80/443 non raggiungibili da Internet o nome DNS non ancora propagato; nel frattempo usa `CADDY_TLS=internal` |
| API `unhealthy` | `docker compose -f docker-compose.prod.yml logs api`: variabile mancante in `.env`, `AUTH_SESSION_SECRET` corta, database non pronto |
| login negato / cookie non impostato | `APP_HOST`/`API_HOST` devono coincidere con i nomi digitati nel browser (il cookie è `Secure` e l'origine CORS è `https://APP_HOST`) |
| email che non partono | `EMAIL_TRANSPORT`, `SMTP_URL`; tabella `email_outbox` (Console → Log → consegne fallite); `logs workers` |
| accesso negato SELinux | `ausearch -m avc -ts recent`; il volume del `Caddyfile` è già etichettato (`:z`) |
| console «Accesso non consentito da questa rete» | il tuo IP non è in `CONSOLE_ALLOW` (con un proxy davanti al server l'IP visto è quello del proxy) |
| porta 80/443/8443 già occupata | `ss -ltnp` per trovare il processo (spesso `httpd` o `nginx` preinstallati) |

Log in tempo reale: `docker compose -f docker-compose.prod.yml logs -f api workers web console caddy`. Ogni risposta dell'API porta `x-request-id`, che compare anche negli errori mostrati all'utente: è la chiave per cercare nei log.

## 11. Differenze rispetto a una produzione vera

Un solo server, PostgreSQL e Redis in container sullo stesso host, backup logici notturni, nessuna alta disponibilità. Va bene per prova e pilota; per la produzione `docs/13` indica database gestito con PITR, repliche dell'API, secret manager e monitoraggio esterno.

## 12. Checklist

- [ ] DNS dei tre nomi verso il server; porte 80/443 (e 8443 dalle reti degli operatori) aperte
- [ ] Deploy key autorizzata su GitHub, `install.sh` completato, `/opt/workingbetter` clonato
- [ ] `.env` creato; `NOTES_MASTER_KEY` e password dell'operatore salvate fuori dal server
- [ ] `deploy.sh` verde, `GET /health` `db: ok`, worker con un run
- [ ] Primo tenant creato con `bootstrap`, invito ricevuto e accettato, MFA dell'amministratore attiva
- [ ] Console raggiungibile, password iniziale cambiata, `CONSOLE_ALLOW` ristretto
- [ ] SMTP reale o Mailpit funzionante
- [ ] Timer di backup attivo e un ripristino provato
