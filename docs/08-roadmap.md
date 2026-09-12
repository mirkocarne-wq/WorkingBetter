# 08 — Roadmap

> Le date sono indicative e verranno fissate al termine della fase di specifica.

## Fase 0 — Discovery e specifiche (in corso)

- [x] Struttura repo e documentazione
- [x] Catalogo funzionalità da PeopleGoal
- [x] Specifiche per modulo (prima versione)
- [ ] Raccolta e approvazione delle **nostre modifiche** (`docs/10`)
- [ ] Validazione ADR stack e multi-tenancy
- [ ] Wireframe flussi P0 e test con utenti
- [ ] Definizione MVP definitiva

## Fase 1 — MVP (P0)

Obiettivo: un tenant reale può usare la piattaforma per obiettivi, 1:1, feedback e un ciclo di review.

| Modulo | Contenuto MVP |
|---|---|
| CORE | Tenant, persone, org, ruoli base, SSO, import CSV, audit, profilo persona |
| OKR | Obiettivi/KR, allineamento, check-in, viste, chiusura |
| ONE | Relazioni, incontri, agenda, note, action item |
| FBK | Feedback, richieste, riconoscimenti, valori, feed |
| APP (nucleo) | Form engine e workflow lineare usati da REV |
| REV | Template, ciclo, self + manager review, condivisione, monitoraggio |
| ANA | Dashboard per ruolo, export |
| INT | Notifiche in-app/email, SSO |

## Fase 2 — Release completa (P1)

- REV: calibrazione, 9-box, approvazioni, firma, PDF
- F360 completo
- ENG: survey, pulse, eNPS, heatmap
- DEV: framework competenze, gap, IDP
- ONB: percorsi e milestone
- APP: fasi parallele, approvazioni, store template, naming
- INT: Slack/Teams, calendario, primo connettore HRIS, API pubblica e webhook
- Localizzazione IT/EN completa

## Fase 3 — Estensioni (P2)

- Piani d'azione survey, wellbeing, analisi AI commenti (opt-in)
- Carriera, succession, skills matrix, promozioni
- Pre-boarding, offboarding
- App custom avanzate, import/export app
- Dataset BI, report programmati, alert avanzati
- SCIM, altri HRIS, Jira, Zapier
- Certificazioni ISO 27001 / SOC 2

## Criteri di uscita dall'MVP

- 2–3 tenant pilota attivi con almeno 50 utenti ciascuno.
- Un ciclo di review completato end-to-end per tenant.
- Adozione 1:1 > 50 % dei manager; NPS interno dei pilota ≥ 30.
