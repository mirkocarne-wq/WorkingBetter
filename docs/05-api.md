# 05 — API (linee guida)

> L'elenco completo degli endpoint implementati (generato dal contratto OpenAPI) è in [05-api-inventario.md](05-api-inventario.md); la documentazione interattiva è su `/docs` dell'API.

## Principi

- **REST + JSON**, versionata nel path (`/api/v1`). Documentazione OpenAPI generata dal codice: body e query derivano dagli stessi schemi Zod della validazione, il contratto è versionato in `packages/api-client/openapi.json` e il client TypeScript `@wb/api-client` è generato da lì (ADR-0009).
- **Stessa API per web app e integrazioni**; gli scope dei token limitano ciò che le integrazioni possono fare.
- **Tenant implicito** nel token; mai nel path.
- **Permessi applicati lato server** su ogni risorsa, con filtro per perimetro. Le soglie di anonimato sono applicate nelle query, non nei client.
- **Paginazione cursor-based**, filtri espliciti, ordinamento; `include` per relazioni frequenti.
- **Idempotenza** per le POST critiche (header `Idempotency-Key`).
- **Errori** in formato Problem Details (RFC 9457) con codice stabile.
- **Rate limit** per token e per tenant.

## Autenticazione

| Client | Metodo |
|---|---|
| Web app | Sessione OIDC (cookie httpOnly) |
| Mobile app | OAuth2 Authorization Code + PKCE, refresh token con rotazione, endpoint di sync delta |
| Integrazioni server-to-server | Token API per tenant con scope (es. `people:read`, `objectives:write`) |
| Slack/Teams app | OAuth app + mapping utente |
| Webhook in uscita | Firma HMAC nell'header, timestamp, retry esponenziale |

## Risorse principali (estratto)

| Risorsa | Endpoint base | Note |
|---|---|---|
| Persone | `/people` | CRUD, import, storico manager/unità |
| Unità organizzative | `/org-units` | Albero |
| Ruoli | `/roles`, `/role-assignments` | |
| Periodi | `/cycles` | |
| Obiettivi | `/objectives`, `/objectives/{id}/key-results`, `/key-results/{id}/check-ins` | Albero via `parent_id` e `?tree=true` |
| App e processi | `/apps` (studio: template, installa, importa, crea, modifica, pubblica, versioni, duplica, esporta, dashboard), `/apps/instances` (avvio, caselle da fare/mie/avviate/team/tutte, dettaglio, annulla, CSV), `/apps/runs/{id}` (decidi, riassegna, proroga) | Motore generico L2 (ADR-0011); le compilazioni passano dal form engine; fasi `action` (action item, attributo persona, webhook, avvio app) |
| Review | `/review-cycles` (anche `/{id}/calibration-sessions`), `/reviews` (dettaglio, contesto, approvazione o rimando, condivisione, firma, riapertura, `/{id}/pdf`; casella `box=approvals`), `/calibration-sessions/{id}` (righe, distribuzione, manager, 9-box, rating con motivazione, blocco) | Specializzazione; dal sprint 16 ogni review è un'istanza del motore (`appInstanceId`), le approvazioni sono fasi del motore |
| 360° | `/f360/campaigns` (HR: configurazione, lancio, avvio raccolta, solleciti, chiusura, avanzamento, aggregato CSV), `/f360/subjects` (nomine, suggerimenti, approvazione, rilascio, debrief, azione di sviluppo, `/{id}/report.pdf`), `/f360/requests` (valutatori interni: questionario, bozza, invio, declino), `/f360/external/{token}` (esterni, pubblico con rate limit) | Nessun endpoint restituisce chi ha risposto nelle categorie anonime; il report è uno snapshot con soglia applicata |
| 1:1 | `/one-on-ones`, `/one-on-ones/{id}/meetings`, `/meetings/{id}/talking-points|notes|action-items` | Note private mai esposte a terzi |
| Feedback | `/feedback`, `/feedback-requests` | |
| Riconoscimenti | `/recognitions`, `/company-values` | |
| Survey | `/surveys`, `/surveys/{id}/results` | Nessun endpoint per risposte individuali in survey anonime |
| Competenze | `/competency-frameworks`, `/competencies`, `/job-profiles`, `/competency-assessments` | |
| Sviluppo | `/development-plans`, `/development-actions` | |
| Integrazioni | `/integrations` (i miei collegamenti e connettori disponibili), `/integrations/config` (amministratori: app OAuth per tenant con segreti cifrati, webhook Teams, endpoint alternativi), `/integrations/{provider}/connect` (URL OAuth con PKCE e state firmato), `/integrations/callback/{provider}` (pubblico con rate limit), `/integrations/{provider}` (DELETE: scollega), `/integrations/{provider}/test` | ADR-0012: l'API accoda (`calendar_event_links`, `chat_outbox`), il worker consegna |
| Onboarding | `/onboarding/templates` (HR: percorsi, predefiniti), `/onboarding/journeys` (avvio manuale/automatico, dettaglio, buddy, task ad hoc, survey, `/{id}/external-link`), `/onboarding/tasks` (i miei task, completamento e presa visione), `/onboarding/me`, `/onboarding/dashboard`, `/onboarding/external/{token}` (pubblico con rate limit: pre-boarding senza account, ONB-011) | Buddy e IT vedono solo i propri task; le survey di onboarding sono nominali e dichiarate tali; dallo sprint 17 ogni percorso è anche un'istanza del motore (`appInstanceId`) |
| Welfare | `/welfare/plans`, `/welfare/accounts`, `/welfare/accounts/{id}/transactions`, `/welfare/catalog`, `/welfare/requests`, `/welfare/payroll-batches`, `/welfare/fiscal-categories` | Giustificativi via upload firmato; nessun dettaglio richiesta nelle metriche |
| Reportistica | `/analytics/metrics` (catalogo), `/analytics/query` (metriche × dimensioni × filtri), `/analytics/reports`, `/analytics/schedules`, `/analytics/dashboards` | Stessi permessi e soglie dell'interfaccia; usata da web e mobile |
| Entità custom | `/custom-entities`, `/custom-entities/{id}/records`, `/automations` | L3–L4 |
| Notifiche | `/notifications`, `/notification-preferences` | |
| Webhook | `/webhooks` | Gestione sottoscrizioni |
| Audit | `/audit-logs` | Solo admin |
| Export | `/exports` | Job asincroni con link temporaneo |

## Eventi webhook (prima lista)

`person.created`, `person.updated`, `person.terminated`, `objective.created`, `objective.closed`, `key_result.checked_in`, `review_cycle.launched`, `review.shared`, `review.signed`, `feedback.given`, `recognition.given`, `survey.closed`, `one_on_one.meeting.completed`, `onboarding.journey.started`, `onboarding.task.completed`, `welfare.request.submitted`, `welfare.request.approved`, `welfare.payroll_batch.ready`, `custom_record.created`, `custom_record.updated`.

## Esempio

```http
POST /api/v1/key-results/8f1c.../check-ins
Idempotency-Key: 6d2b...
Content-Type: application/json

{
  "value": 125,
  "confidence": "on_track",
  "comment": "Chiusi 3 nuovi contratti questa settimana"
}
```

```json
{
  "id": "c0a8...",
  "value": 125,
  "confidence": "on_track",
  "progress": 0.5,
  "created_at": "2026-09-12T10:15:00Z"
}
```
