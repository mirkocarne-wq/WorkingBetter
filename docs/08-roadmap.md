# 08 — Roadmap

> Le date sono indicative e verranno fissate al termine della fase di specifica.

## Fase 0 — Discovery e specifiche (in corso)

- [x] Struttura repo e documentazione
- [x] Catalogo funzionalità da PeopleGoal
- [x] Specifiche per modulo (prima versione)
- [ ] Raccolta e approvazione delle **nostre modifiche** (`docs/10`)
- [x] Validazione ADR stack (0002), multi-tenancy (0003), reportistica (0004) e strategia API (0005)
- [x] Prima serie di mockup delle schermate chiave (`docs/mockups/`)
- [ ] Test dei mockup con 3–5 utenti target e iterazione
- [ ] Definizione MVP definitiva

## Fase 1 — MVP (P0) — in corso

Obiettivo: un tenant reale può usare la piattaforma per obiettivi, 1:1, feedback e un ciclo di review.

Sprint 0 (fatto): monorepo, package `db` con schema Core+OKR, migrazioni e RLS testata su PGlite, API NestJS con auth JWT, permessi, audit transazionale, moduli Core e Obiettivi (ciclo, albero di allineamento, KR, check-in con roll-up del progresso), OpenAPI, 33 test automatici, web app con login dev, dashboard, albero obiettivi con check-in e persone, seed demo, CI.

Sprint 1 (fatto): moduli 1:1 (relazioni, incontri, agenda con riporto automatico, note private cifrate, action item, suggerimenti, metriche di adozione) e Feedback & Riconoscimenti (valori, feedback con controllo del destinatario, richieste, riconoscimenti con reazioni e moderazione), con pagine web e 15 nuovi test e2e.

Prossimi sprint: notifiche (in-app + email) e worker promemoria, import CSV persone, form engine + review (APP/REV), Keycloak/OIDC, client API generato, design system, integrazione calendario.

| Modulo | Contenuto MVP |
|---|---|
| CORE | Tenant, persone, org, ruoli base, SSO, import CSV, audit, profilo persona |
| OKR | Obiettivi/KR, allineamento, check-in, viste, chiusura |
| ONE | Relazioni, incontri, agenda, note, action item |
| FBK | Feedback, richieste, riconoscimenti, valori, feed |
| APP (nucleo) | Form engine e workflow lineare usati da REV |
| REV | Template, ciclo, self + manager review, condivisione, monitoraggio |
| ANA | Dashboard per ruolo, export, report di processo; **fondamenta del data mart e del catalogo metriche** (le metriche P0 sono definite nel semantic layer fin dall'MVP) |
| INT | Notifiche in-app/email, SSO |

## Fase 2 — Release completa (P1)

- REV: calibrazione, 9-box, approvazioni, firma, PDF
- F360 completo
- ENG: survey, pulse, eNPS, heatmap
- DEV: framework competenze, gap, IDP
- ONB: percorsi e milestone
- APP: fasi parallele, approvazioni, store template, naming (L1–L2)
- **WEL: modulo Welfare** (piani, budget, catalogo interno + primo provider, rimborsi, soglie, conversione premio, tracciato payroll)
- **ANA: motore di reportistica** (semantic layer completo, report builder, report programmati, connettore BI, Analytics API)
- Mobile app (React Native) per collaboratori e manager
- INT: Slack/Teams, calendario, primo connettore HRIS, API pubblica e webhook
- Localizzazione IT/EN completa

## Fase 3 — Estensioni (P2)

- Piani d'azione survey, wellbeing, analisi AI commenti (opt-in)
- Carriera, succession, skills matrix, promozioni
- Pre-boarding, offboarding
- APP L3–L4: entità custom e automazioni; import/export app
- WEL: altri provider, connettori payroll, previdenza/sanità, programmi wellbeing
- ANA: metriche custom, motore colonnare, estrazioni Parquet, embedded, benchmark esterno
- Dataset BI, report programmati, alert avanzati
- SCIM, altri HRIS, Jira, Zapier
- Certificazioni ISO 27001 / SOC 2

## Criteri di uscita dall'MVP

- 2–3 tenant pilota attivi con almeno 50 utenti ciascuno.
- Un ciclo di review completato end-to-end per tenant.
- Adozione 1:1 > 50 % dei manager; NPS interno dei pilota ≥ 30.
