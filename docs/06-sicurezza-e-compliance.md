# 06 — Sicurezza e compliance

## Principi

- **Privacy by design e by default** (GDPR art. 25): visibilità minima necessaria, anonimato garantito a livello di schema, retention definita.
- **Isolamento tenant** su due livelli: filtro applicativo + Row-Level Security in PostgreSQL.
- **Minimo privilegio**: RBAC con perimetri; ruoli tecnici separati per app, job e migrazioni.
- **Tracciabilità**: audit log append-only per ogni scrittura e accesso a dati sensibili.
- **Residenza dati UE**; sub-processor documentati.

## Controlli

| Area | Controllo |
|---|---|
| Autenticazione | SSO OIDC per tenant (PKCE) e, in seguito, SAML; password con hashing scrypt (formato autodescrittivo, migrabile ad Argon2id) e policy minima; blocco temporaneo dopo 5 tentativi; link monouso con hash in database per inviti e reset; sessioni JWT emesse dall'API (ADR-0007); MFA opzionale (TOTP) e sessioni revocabili in Fase 2 |
| Autorizzazione | Policy centralizzata (ruolo × permesso × perimetro) valutata server-side; test automatici della matrice RBAC |
| Dati a riposo | Cifratura storage e DB; note private 1:1 cifrate a livello applicativo con chiave per tenant (KMS) |
| Dati in transito | TLS 1.2+; HSTS |
| Segreti | Gestiti da secret manager; mai in repository |
| Input | Validazione schema su ogni endpoint; protezione XSS/CSRF/SQLi; upload con scansione e limiti |
| Logging | Log strutturati senza dati personali in chiaro; correlazione per tenant e richiesta |
| Backup | Giornalieri cifrati, PITR, test di restore |
| Dipendenze | Scansione vulnerabilità in CI; aggiornamenti periodici |
| Sviluppo | Code review obbligatoria; test di sicurezza automatici; penetration test annuale |

## GDPR

| Diritto / obbligo | Come lo copriamo |
|---|---|
| Informativa | Testi configurabili per tenant mostrati al primo accesso |
| Accesso e portabilità (art. 15, 20) | Export dati persona in formato leggibile (CORE-052) |
| Rettifica | Modifica dati anagrafici da HR; campi self-service |
| Cancellazione (art. 17) | Job di anonimizzazione: i dati aggregati restano, gli identificativi vengono rimossi (CORE-053) |
| Limitazione | Stato "sospeso" per la persona |
| Retention | Policy per tenant per tipo di dato (es. review 5 anni dopo cessazione, survey aggregate senza limite, feedback 3 anni) |
| Registro trattamenti | Censimento tabelle con dati personali in `docs/04` |
| DPA e sub-processor | Documento contrattuale + elenco pubblico |
| DPIA | Prevista per: analisi AI dei commenti, indicatori di rischio persona |
| Data breach | Procedura con notifica entro 72 h |

## Anonimato: garanzie tecniche

- Survey anonime: nessuna relazione tra invito e risposta nel DB; i promemoria usano token cieco.
- Soglia minima (default 5 survey, 3 per categoria 360°) applicata in query e negli export. Nel 360° le categorie sotto soglia confluiscono in «Altri»; se anche «Altri» è sotto soglia, punteggi e commenti di quelle risposte non compaiono da nessuna parte (report, aggregato, CSV) e la media «altri» usa solo le categorie visibili, così non è ricavabile per differenza. I valutatori esterni entrano con un link monouso (solo l'hash del token è salvato) e non vedono nulla oltre il proprio questionario.
- Protezione dalla ricostruzione per differenza: i segmenti derivabili per sottrazione vengono soppressi.
- Nessun ruolo, incluso Super Admin, ha un endpoint per risposte individuali anonime.

## AI (quando introdotta)

- Opt-in per tenant; informativa esplicita.
- Nessun addestramento sui dati dei clienti.
- Funzioni AI mai decisionali (suggeriscono, non valutano); output sempre modificabile dall'umano.
- DPIA e log delle chiamate.

## Certificazioni (roadmap)

ISO 27001 e SOC 2 Type II come obiettivi post-lancio; nel frattempo questionari di sicurezza standard (CAIQ) compilati.

## Feed iCalendar personale (INT-022)

- L'URL del feed è una *capability*: chi lo conosce legge titoli e date. Per questo il feed contiene solo ciò che l'utente vede già nell'app (1:1 con il nome dell'altro partecipante, scadenze di review, chiusura survey, titoli delle azioni), mai note, risposte o contenuti.
- Il token (192 bit casuali, base64url) è per utente, unico, mostrato in Impostazioni, rigenerabile e revocabile; un utente disattivato non serve più il feed. Attivazione, rigenerazione e revoca sono in audit (`calendar.feed_*`).
- La risposta è `Cache-Control: private` e il feed non è indicizzabile; il rate limiting sull'endpoint pubblico va aggiunto con il gateway (vedi INT-040).

## Irrobustimento dell'API (sprint 12)

- **Invarianti verificate dai test**: ogni rotta dell'API è pubblica in modo esplicito (`@Public`) oppure richiede un permesso (`@RequirePermission`), salvo una lista chiusa di rotte "solo autenticato" documentata nel test (`apps/api/test/security-invariants.e2e.test.ts`); ogni tabella con `tenant_id` ha la Row-Level Security attiva e una policy (`packages/db/src/rls.test.ts`). Una nuova rotta o tabella non conforme fa fallire la CI.
- **Rate limiting** sugli endpoint pubblici (login, password dimenticata e reset, accettazione invito, scambio codice SSO, login di sviluppo, feed iCalendar): finestra scorrevole per indirizzo IP, risposta `429` in formato Problem con `Retry-After`. Lo stato è in memoria per istanza: con più repliche il limite effettivo è moltiplicato per il numero di repliche, e va spostato su Redis o sul gateway quando si scala (nota in `docs/13`).
- **Revoca delle sessioni** (CORE-030): ogni token porta l'istante di emissione; il guard rifiuta i token emessi prima di `users.sessions_revoked_at` e quelli di utenti disattivati (controllo per richiesta con cache di 30 secondi). La revoca scatta al cambio o reset della password, alla disattivazione dell'utente e su richiesta ("Esci da tutti i dispositivi" in Impostazioni, `POST /auth/logout-all`). Il cambio password restituisce una nuova sessione al chiamante.
- **Header di sicurezza**: API e web app rispondono con `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`; l'API aggiunge `Cache-Control: no-store` alle risposte JSON e `Strict-Transport-Security` quando è pubblicata in https. Il cookie di sessione della web app è `HttpOnly`, `SameSite=Lax` e `Secure` in https.
- **Verifica in due passaggi (TOTP, RFC 6238)**: attivazione dall'utente con QR o chiave manuale e conferma del primo codice; il segreto è cifrato con la chiave derivata del tenant (`NOTES_MASTER_KEY`, HKDF) e non è mai restituito dopo l'attivazione; 8 codici di recupero monouso salvati come hash SHA-256 e mostrati una sola volta; al login con password il server restituisce una sfida firmata di 5 minuti al posto della sessione e la sessione nasce solo da `POST /auth/mfa/verify` (limitato a 10 tentativi per IP ogni 5 minuti, con lo stesso blocco account dei tentativi di password). La disattivazione richiede la password corrente. Il tenant può dichiarare i ruoli per cui l'MFA è obbligatoria (`PUT /tenant/security`): chi non l'ha attivata viene guidato all'attivazione a ogni accesso. L'accesso SSO non passa dalla verifica interna: l'MFA la applica l'identity provider aziendale.
