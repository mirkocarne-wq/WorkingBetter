# 14 — Preparazione al pilota

Checklist operativa per portare WorkingBetter davanti ai primi tenant pilota (criteri di uscita dall'MVP in `docs/08`). Integra `docs/13` (deploy) con i passi che dipendono da account esterni e da decisioni di prodotto. Ogni voce ha un responsabile atteso: **tech** (chi opera l'ambiente), **prodotto** (chi decide), **cliente** (amministratore del tenant pilota).

## 1. Decisioni da chiudere (prodotto)

| ADR | Decisione | Stato | Se rifiutata cambierebbe… |
|---|---|---|---|
| 0006 | Semantic layer v1: catalogo metriche dichiarativo, fatti giornalieri a grana persona | Proposto | il data mart e il report builder (sprint 4 e 10) |
| 0007 | L'API emette le sessioni; password locale + SSO OIDC per tenant; MFA TOTP | Proposto | tutto il flusso di accesso (sprint 5 e 12) |
| 0008 | Welfare come registro contabile append-only, soglie fiscali configurabili | Proposto | il modulo welfare (sprint 7) |
| 0009 | Contratto OpenAPI derivato dagli schemi Zod e client generato | Proposto | la pipeline `contract:check` e i tipi della web app |
| 0010 | Calendario: feed iCalendar e inviti .ics prima dei connettori OAuth | Proposto | nulla di strutturale: i connettori sono arrivati (ADR-0012) |
| 0011 | Workflow engine dichiarativo (App Studio L2); review e onboarding convergono sul motore | Proposto | App Studio, review e onboarding (sprint 15–17) |
| 0012 | Connettori esterni: app OAuth per tenant, code svuotate dal worker, `@wb/connectors` | Proposto | integrazioni calendario e chat (sprint 18) |

Tutte sono già implementate: la validazione conferma la direzione o apre una revisione con costo esplicito. L'indice con lo stato è in `docs/adr/README.md`.

## 2. Ambiente di staging (tech)

- [ ] Postgres 16 gestito, Redis, SMTP reale (o Mailpit per la sola staging), dominio per API e web con TLS.
- [ ] Segreti generati e conservati nel secret manager: `AUTH_SESSION_SECRET`, `NOTES_MASTER_KEY` (identica per API e worker), credenziali DB con `DB_APP_ROLE` (`docs/13 §2`).
- [ ] Console di piattaforma (target `console`, porta 8443) esposta solo su rete di gestione o VPN, `CONSOLE_PUBLIC_URL` impostato, primo operatore creato (`platform-admin` o `PLATFORM_BOOTSTRAP_*`) e password iniziale cambiata (`docs/13 §10`).
- [ ] Immagini costruite dal `Dockerfile` (target `api`, `workers`, `web`, `console`) con `NEXT_PUBLIC_API_URL` dell'API pubblica; `API_PUBLIC_URL`, `APP_BASE_URL`, `API_CORS_ORIGIN` coerenti con i domini.
- [ ] Migrazioni applicate (`pnpm --filter @wb/db migrate`) e bootstrap del primo tenant (`bootstrap`), non il seed demo.
- [ ] `ALLOW_PRIVATE_URLS` assente o `false` nel worker (difesa SSRF sui webhook attiva); `NODE_ENV=production` nell'API.
- [ ] Backup: `scripts/backup.sh` schedulato (o backup gestito del provider) e **un restore provato** con `scripts/restore.sh` su un database vuoto.
- [ ] Monitoraggio: `GET /health` sondato, allarmi di `docs/13 §6` (readiness, 5xx, code `email_outbox`, `webhook_deliveries`, `calendar_event_links`, `chat_outbox`, account connettori in errore, job `reminders`).
- [ ] Smoke test dopo ogni deploy: `node scripts/smoke.mjs https://api.<dominio> https://app.<dominio>` con le credenziali di un utente di prova (`SMOKE_TENANT`, `SMOKE_EMAIL`, `SMOKE_PASSWORD`).

## 3. App OAuth e canali (cliente, con supporto tech)

I redirect URI esatti sono mostrati in Impostazioni → Integrazioni → «Configurazione delle app OAuth»; qui il riepilogo.

### Google Calendar
1. Google Cloud Console → progetto → «API e servizi» → abilitare **Google Calendar API**.
2. Schermata di consenso OAuth: tipo *Interno* (Workspace) oppure *Esterno* in test con gli utenti pilota; scope `openid`, `email`, `https://www.googleapis.com/auth/calendar.events`.
3. Credenziali → ID client OAuth → *Applicazione web*; URI di reindirizzamento autorizzato: `https://<API_PUBLIC_URL>/api/v1/integrations/callback/google`.
4. Incollare client ID e client secret in Impostazioni → Integrazioni, abilitare, salvare; ogni persona preme «Collega».

### Microsoft 365 (Entra ID)
1. Entra ID → Registrazioni app → Nuova registrazione; account *solo in questa directory* (o multi-tenant); piattaforma **Web** con URI `https://<API_PUBLIC_URL>/api/v1/integrations/callback/microsoft`.
2. Autorizzazioni API → Microsoft Graph → *delegate*: `openid`, `email`, `offline_access`, `User.Read`, `Calendars.ReadWrite`; concedere il consenso amministratore.
3. Certificati e segreti → nuovo segreto client (annotare la scadenza: va rinnovato in Impostazioni prima che scada).
4. In Impostazioni → Integrazioni: Application (client) ID, tenant (id o dominio, `common` solo per multi-tenant), segreto.

### Slack
1. api.slack.com/apps → *Create New App* → **From an app manifest** → incollare `docs/integrazioni/slack-app-manifest.json` sostituendo `API_PUBLIC_URL`.
2. *Basic Information* → client ID e client secret in Impostazioni → Integrazioni (abilitato).
3. Un amministratore preme «Collega Slack» e autorizza l'installazione nel workspace; gli utenti vengono mappati per email al primo messaggio (l'email Slack deve coincidere con quella in WorkingBetter).
4. Canale riconoscimenti: invitare il bot nel canale (`/invite @WorkingBetter`) e inserire l'ID del canale (Dettagli canale → in fondo).
5. Verifica: «Inviami una prova» in Impostazioni; la consegna passa dal worker entro `EMAIL_DISPATCH_EVERY_MS`.

### Microsoft Teams
1. Nel canale: … → Connettori (o Workflow «Post to a channel when a webhook request is received») → Incoming Webhook → copiare l'URL.
2. Impostazioni → Integrazioni → Teams: incollare l'URL, abilitare, «Prova nel canale».

## 4. Tenant pilota (cliente + prodotto)

- [ ] Persone e organigramma importati da CSV (`docs/05`, template scaricabile) con manager e date di assunzione; utenti invitati o SSO configurato (`docs/13 §3`).
- [ ] Aspetto: nome, colore primario, logo (Impostazioni → Aspetto) → compaiono nei PDF.
- [ ] Un ciclo di review configurato (template, popolazione, scadenze) con lancio simulato su 2–3 persone prima del lancio reale.
- [ ] Almeno un percorso di onboarding e una campagna 360° pronti come esempio; App Studio: installare i template utili (richiesta formazione, proposta di promozione).
- [ ] Preferenze di notifica di default riviste con l'HR (email/Slack per tipo).
- [ ] Referenti: un amministratore di tenant (accesso, integrazioni), un HR admin (processi), un canale per il feedback dei pilota.

## 5. Verifica end-to-end prima del via (tech + prodotto)

1. Login con password e, se attivo, SSO; MFA per gli amministratori.
2. Crea un 1:1: arrivano l'invito .ics e, con il calendario collegato, l'evento nativo con link Meet/Teams entro un minuto (`calendar_event_links.status = synced`).
3. Dai un feedback e un riconoscimento: notifica in-app, email, DM Slack (se collegato) e post nel canale.
4. Lancia il ciclo di review di prova: self, manager, condivisione, firma, PDF con logo; pagina «Processo» per l'HR.
5. Avvia un onboarding per una persona senza account con una fase di pre-boarding: email con magic link, pagina pubblica, modulo compilato, task chiuso anche sul motore.
6. Esegui `scripts/smoke.mjs`; controlla `job_runs` e le code senza righe `failed`.

## 6. Cosa non c'è ancora (da dire ai pilota)

Calibrazione e approvazioni delle review, editor domande survey da UI e piani d'azione, HRIS, API pubblica e webhook firmati, azioni rapide nei messaggi Slack, notifiche personali in Teams, app mobile, interfaccia in inglese. Elenco completo per modulo nelle righe «mancano» delle specifiche e in `docs/08`.
