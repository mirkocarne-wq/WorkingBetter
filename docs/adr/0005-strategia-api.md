# ADR-0005 — Strategia API per web, mobile e connettori

| | |
|---|---|
| **Stato** | Accettato |
| **Data** | 2026-09-13 |
| **Decisori** | Mirko Carne (product owner), team WorkingBetter |

## Contesto

La piattaforma deve esporre API per (a) la web app, (b) una mobile app, (c) connettori e integrazioni di terzi (HRIS, payroll, provider welfare, BI, Zapier). Serve una superficie unica, stabile e sicura, senza duplicare logica.

## Decisione

1. **Una sola API REST pubblica** (`/api/v1`), documentata con OpenAPI 3.1 generata dal codice, usata da tutti i client. Nessun BFF finché una necessità concreta non lo giustifica.
2. **Autenticazione per tipo di client**:
   - Web: sessione OIDC con cookie httpOnly + CSRF token.
   - Mobile: OAuth2 Authorization Code + PKCE, refresh token con rotazione e revoca.
   - Connettori: token API per tenant con **scope** granulari (`people:read`, `objectives:write`, `analytics:query`…), rate limit per token, rotazione e scadenza.
   - Webhook in uscita: firma HMAC-SHA256, timestamp anti-replay, retry esponenziale, log consultabile.
3. **Convenzioni**: tenant implicito nel token; paginazione cursor-based; filtri e ordinamenti espliciti; `Idempotency-Key` sulle POST critiche; errori RFC 9457; ETag per risorse editabili; deprecazioni annunciate con header `Sunset`.
4. **Permessi e privacy lato server**: il perimetro del ruolo e le soglie di anonimato sono applicati dall'API, mai dai client; nessun endpoint espone risposte individuali di survey anonime.
5. **Client generati**: da OpenAPI generiamo `packages/api-client` (TypeScript, usato da web e mobile) e pubblichiamo la specifica per i partner; SDK in altri linguaggi solo su richiesta.
6. **Mobile**: endpoint di sincronizzazione delta (`?updated_since=`) per un uso offline leggero; push notification tramite il servizio notifiche.
7. **Analytics API** sul semantic layer (ADR-0004) con gli stessi permessi dell'interfaccia.

## Alternative considerate

| Alternativa | Pro | Contro |
|---|---|---|
| GraphQL per la UI + REST per i partner | Query flessibili per la UI | Due superfici, doppia autorizzazione, più bug di permessi |
| BFF dedicato per mobile | Payload su misura | Duplicazione; prematuro |
| gRPC per connettori | Performance | Adozione bassa tra HRIS e strumenti no-code |

## Conseguenze

- Ogni endpoint nasce con decoratori OpenAPI, scope richiesti e test di contratto.
- Il versionamento è per path; le rotture richiedono `v2` e un periodo di convivenza.
- La generazione del client è parte della build del monorepo.
