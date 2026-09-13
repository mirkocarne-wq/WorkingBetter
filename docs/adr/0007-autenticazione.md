# ADR-0007 — Autenticazione: l'API emette le sessioni; password locale e SSO OIDC per tenant

| | |
|---|---|
| **Stato** | Proposto |
| **Data** | 2026-09-13 |
| **Decisori** | Da validare con il product owner |
| **Collegata a** | ADR-0002 (stack), ADR-0003 (multi-tenant), ADR-0005 (API), `docs/06` |

## Contesto

Fino allo sprint 4 l'accesso era solo di sviluppo (`dev-login` senza password) e l'API sapeva verificare token emessi da Keycloak configurato a livello di piattaforma. Per portare tenant pilota reali servono: inviti via email (CORE-014), login con password (CORE-030), SSO OIDC configurabile **per tenant** con provisioning automatico opzionale (CORE-031), gestione utenti e ruoli dal web, con la stessa esperienza per web, mobile e connettori (ADR-0005).

## Decisione

1. **L'API è l'emittente delle sessioni.** Qualunque sia il metodo di accesso, l'API emette un JWT di sessione (HS256, `AUTH_SESSION_SECRET`, durata `AUTH_SESSION_TTL_HOURS`, default 12 h) con i claim già usati dal resto del sistema (`sub`, `tenant_id`, `person_id`, `roles`). Il web lo conserva in un cookie httpOnly; mobile e connettori lo usano come Bearer. `POST /auth/refresh` rinnova la sessione a scorrimento. I token emessi direttamente da un IdP di piattaforma (`AUTH_ISSUER`, JWKS) restano accettati per i client macchina.
2. **Password locale** (CORE-030): hash con **scrypt** (N=2¹⁵, r=8, p=1, salt 32 byte, formato autodescrittivo `scrypt$N$r$p$salt$hash`) tramite `node:crypto`, senza dipendenze native; policy minima 10 caratteri; blocco temporaneo dopo 5 tentativi falliti (15 minuti); cambio password dall'app; reset via link con token monouso (1 ora). Argon2id (indicato in `docs/06`) resta l'obiettivo quando il costo di una dipendenza nativa sarà giustificato: il formato con prefisso consente la migrazione trasparente al primo login.
3. **Inviti** (CORE-014): l'HR crea l'utente (collegato a una persona esistente o nuova) e il sistema invia un'email con link monouso (7 giorni). L'accettazione imposta la password (o, se il tenant ha l'SSO, indirizza al login federato) e attiva la persona. Gli inviti sono reinviabili; gli utenti disattivabili.
4. **SSO OIDC per tenant** (CORE-031): configurazione salvata nelle impostazioni del tenant (issuer, client id, client secret cifrato con la chiave per tenant, provisioning automatico sì/no, ruolo di default, domini email ammessi). Flusso Authorization Code + **PKCE** gestito dall'API: `/auth/oidc/start` costruisce l'URL di autorizzazione (discovery `.well-known`), lo `state` è un JWT firmato che porta tenant, nonce, verifier e destinazione; `/auth/oidc/callback` scambia il codice, verifica l'`id_token` con le chiavi dell'IdP (issuer, audience, nonce), collega l'utente per `sub` o per email, esegue il provisioning automatico se abilitato e consegna al web un **codice di scambio monouso** (60 s) che il web converte in sessione. Nessun token transita nell'URL del browser.
5. **Nessuna dipendenza da Keycloak nel codice**: Keycloak resta l'IdP di riferimento per i test locali (`docker compose --profile sso`) ma qualunque provider OIDC standard (Entra ID, Google, Okta) è configurabile dal tenant. SAML (CORE-031) e SCIM (CORE-032) restano fuori da questa decisione.
6. **Token monouso** (inviti, reset, scambio): in database si conserva solo l'hash SHA-256; il codice di scambio OIDC vive in memoria per 60 s (una sola istanza API nell'MVP; passerà a Redis quando l'API sarà replicata).

## Alternative considerate

| Alternativa | Pro | Contro |
|---|---|---|
| Solo Keycloak (realm per piattaforma, utenti gestiti lì) | Nessun codice di autenticazione nostro | Inviti, password, MFA e branding vivrebbero in un secondo prodotto da operare e integrare; UX di onboarding frammentata; SSO per tenant richiede identity brokering e admin API |
| Libreria di sessioni di terze parti nel web (NextAuth/Auth.js) | Flussi pronti | La sessione sarebbe del web, non dell'API: mobile e connettori dovrebbero replicarla; contrario ad ADR-0005 |
| Token dell'IdP usati direttamente ovunque | Semplice con un solo IdP | Impossibile con IdP diversi per tenant; nessun login con password |

## Conseguenze

- `AUTH_MODE` passa a `dev` (login di sviluppo attivo) / `prod` (solo password e SSO); `AUTH_SESSION_SECRET` diventa obbligatoria in produzione.
- Le email di invito e reset richiedono `APP_BASE_URL` configurata nell'API e il worker di invio attivo.
- MFA (TOTP), sessioni revocabili con elenco dispositivi (CORE-033) e magic link (CORE-034) sono incrementi successivi compatibili con questa architettura.
