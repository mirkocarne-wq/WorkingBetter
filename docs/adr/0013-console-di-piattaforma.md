# ADR-0013 — Console di piattaforma: app separata su porta 8443, identità di piattaforma distinta dai tenant

| | |
|---|---|
| **Stato** | Proposto |
| **Data** | 2026-09-14 |
| **Decisori** | team prodotto/tech |
| **Collegate** | ADR-0002 (stack), ADR-0003 (multi-tenant e RLS), ADR-0007 (autenticazione), specifica PLT |

## Contesto

Chi gestisce la piattaforma per più clienti ha bisogno di una vista **trasversale ai tenant**: creare un tenant e invitarne l'amministratore, vedere statistiche d'uso, intervenire su un account (reset password, sblocco, revoca sessioni), controllare lo stato di API, database, worker e code, tenere d'occhio le scadenze dei certificati TLS, consultare gli eventi rilevanti. Oggi queste operazioni si fanno con script (`bootstrap`) e query dirette al database. Servono un'interfaccia dedicata e un perimetro di sicurezza chiaro: la console non deve diventare una porta d'accesso ai dati delle persone dei clienti.

## Decisione

1. **App separata, porta 8443.** La console è `apps/console` (Next.js, stesso design system), pubblicata su una porta dedicata (`CONSOLE_PORT`, predefinita **8443**) distinta da web (3000) e API (4000), così da poterla esporre solo su una rete di gestione o dietro VPN. Il server della console termina TLS da solo se riceve certificato e chiave (`CONSOLE_TLS_CERT_FILE`, `CONSOLE_TLS_KEY_FILE`); altrimenti ascolta in HTTP dietro il reverse proxy, come gli altri servizi.
2. **Identità di piattaforma separata dai tenant.** Gli operatori sono in `platform_users` (tabella senza `tenant_id`): password con la stessa policy e lo stesso blocco degli utenti tenant, revoca delle sessioni, eventi tracciati. Il token di sessione porta il claim `platform: true` e nessun `tenant_id`; l'`AuthGuard` accetta un token di piattaforma **solo** sulle rotte marcate `@PlatformOnly()` e rifiuta i token tenant su quelle rotte. Un operatore di piattaforma non può quindi chiamare le API dei moduli (review, feedback, note…) nemmeno per errore.
3. **Le rotte di piattaforma vivono nella stessa API** (`/api/v1/platform/*`), eseguite con `withPlatform` (fuori dal contesto tenant) dentro un modulo dedicato. Per le azioni su un tenant (provisioning, inviti, reset) il modulo apre esplicitamente `withTenant(tenantId)` e riusa la logica di `packages/db` (`provisionTenant`, token monouso), la stessa dello script `bootstrap`, così CLI e console non divergono.
4. **Sola aggregazione sui dati dei clienti.** La console espone conteggi e stati (persone, utenti, ultimi accessi, code, job, errori), mai contenuti: niente obiettivi, review, feedback, note, risposte. L'audit dei tenant è consultabile come elenco di azioni (chi, cosa, quando, su quale entità) senza `before/after`.
5. **Eventi di piattaforma append-only** (`platform_events`): ogni azione della console (creazione tenant, invito, reset, sospensione, cambio password operatore) è registrata con operatore, tenant, dettaglio e IP; sono la base del pannello «Log» insieme a `job_runs`, code in errore e audit dei tenant.
6. **Primo operatore** creato dal comando `platform-admin` di `packages/db` oppure, se `PLATFORM_BOOTSTRAP_EMAIL`/`PLATFORM_BOOTSTRAP_PASSWORD` sono impostate e non esistono operatori, all'avvio dell'API (utile in Docker). La password iniziale va cambiata al primo accesso (la console lo chiede).
7. **Certificati: monitoraggio, non gestione delle chiavi.** La console legge il certificato che usa lei stessa e interroga via TLS gli URL pubblici configurati (web, API, console), mostrando emittente, scadenza e giorni residui con soglie di avviso (30 e 7 giorni). La sostituzione dei certificati resta un'operazione dell'infrastruttura (documentata in `docs/13`), perché le chiavi private non devono passare da un'interfaccia web.

## Conseguenze

- Un secondo processo Next.js da costruire e pubblicare (target Docker `console`, servizio nel compose, riga in CI). Costo accettato in cambio dell'isolamento di rete.
- Il perimetro «solo aggregati» limita ciò che la console può fare (nessuna correzione di dati di un cliente): è voluto; le correzioni restano compito degli amministratori del tenant.
- La verifica in due passaggi per gli operatori di piattaforma non è in questa fase: la console è pensata per stare su una rete di gestione; MFA TOTP per `platform_users` è il primo passo successivo (riuso di `MfaService`).
- I log applicativi (stdout dell'API e del worker) non vengono raccolti dalla piattaforma: la console mostra ciò che è nel database (job, code, eventi, audit) e rimanda al sistema di log dell'infrastruttura per il resto.

## Alternative considerate

- **Pagine «piattaforma» dentro la web app dei tenant** con il ruolo `super_admin`: scartato, perché mescolerebbe sulla stessa porta e sullo stesso dominio l'accesso dei clienti e quello degli operatori, e perché il ruolo `super_admin` ha tutti i permessi tenant (troppo ampio).
- **Servizio separato con la propria API** (secondo backend): scartato per duplicazione di autenticazione, configurazione e accesso al database; la separazione utile è quella di identità e rete, ottenuta con il claim `platform` e la porta dedicata.
- **Solo CLI** (estendere `bootstrap`): insufficiente per statistiche, stato e operatività quotidiana di chi non ha accesso alla shell di produzione.
