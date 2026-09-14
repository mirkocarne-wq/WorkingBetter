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

Sprint 2 (fatto): notifiche in-app ed email con preferenze, worker promemoria (BullMQ o in-process, `--once`), import CSV persone con anteprima, form engine versionato con validazione e punteggi + FormRunner web.

Sprint 3 (fatto): **Performance Review** sul form engine: template con regole di visibilità e scala di rating, cicli con popolazione e lancio, fasi self/manager, pannello di contesto, condivisione, colloquio e firma, override HR, avanzamento e solleciti, promemoria del worker; pagine web e 7 test e2e.

Sprint 4 (fatto): **fondamenta della reportistica** (ADR-0006): catalogo metriche dichiarativo, data mart giornaliero a grana persona, query engine con perimetri e soglie, pagina Report con KPI, trend, segnali, tabella per dimensione, report di processo dei cicli di review, export CSV con audit.

Sprint 4b (fatto): creazione da web di obiettivi con key result e periodi, questionari con costruttore guidato, template di review.

Sprint 5 (fatto): autenticazione reale (ADR-0007): sessioni emesse dall'API, password con policy e blocco, inviti con link monouso, reset, SSO OIDC per tenant con PKCE e provisioning automatico, gestione utenti e ruoli dal web.

Sprint 6 (fatto): survey e pulse (ENG) con libreria di domande per driver, anonimato architetturale, soglie con protezione per differenza, heatmap, eNPS, confronto con la precedente, promemoria e chiusura automatica.

Sprint 7 (fatto): **welfare aziendale, fase 1** (WEL, ADR-0008): piani e fonti di budget, conto a registro append-only, categorie e soglie fiscali per anno con preset, catalogo interno, richieste con prenotazione del budget e coda di verifica, dichiarazioni, iniziative, conversione del premio con simulatore, lotti payroll CSV, accrediti e avvisi di scadenza dal worker.

Sprint 8 (fatto): **design system e client API generato** (ADR-0009): token e primitive UI, guida di stile, colore del tenant, navigazione mobile; contratto OpenAPI derivato dagli schemi Zod, pacchetto `@wb/api-client` con tipi generati e verifica in CI.

Sprint 9 (fatto): **calendario senza OAuth** (ADR-0010): inviti .ics con aggiornamento e annullamento per i 1:1, feed iCalendar personale con scadenze, proposta di slot, link videocall.

Sprint 10 (fatto): **report builder** sul semantic layer: report salvati con metriche di più moduli, dettaglio e filtri, variazione vs periodo precedente, tabella/barre/trend, condivisione per ruolo con perimetro del destinatario, invio programmato via email.

Sprint 11 (fatto): **sviluppo e carriera, fase 1** (DEV): framework competenze con libreria italiana, job profile con ruolo successivo, gap per fonte con azioni suggerite, piani di sviluppo con approvazione e follow-up nei 1:1, 9-box.

Sprint 12 (fatto): **consolidamento**: invarianti di sicurezza nei test, rate limiting, revoca sessioni, header, MFA TOTP, test end-to-end Playwright in CI, health per bilanciatori, guida di deploy, inventari generati di tabelle ed endpoint.

Sprint 13 (fatto): **feedback 360°** (F360): campagne su competenze del framework, nomine con suggerimenti e approvazione, raccolta per categoria con anonimato architetturale e soglia, esterni via magic link, report con radar/gap/forze/aree e regole di rilascio, debrief, azioni nel piano di sviluppo, heatmap aggregata e CSV.

Sprint 14 (fatto): **onboarding** (ONB): percorsi con fasi e task per ruolo a scadenza relativa, cinque template predefiniti con regole di assegnazione, avvio automatico per ingressi e uscite, buddy con suggerimenti, presa visione tracciata, survey 7/30/90 nominali con alert, dashboard, offboarding.

Prossimi sprint (da concordare): connettori OAuth calendario e Slack/Teams, App Studio workflow, HRIS, export PDF (review e 360°), pre-boarding con identità esterne.

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
- F360: pesi per categoria/competenza, trend tra campagne, limite di carico per valutatore, PDF
- ENG: piani d'azione, analisi commenti, export PDF/Excel (survey, pulse, eNPS e heatmap anticipati alla Fase 1)
- DEV: framework competenze, gap, IDP
- ONB: task condizionali, pre-boarding con identità esterne, contenuti allegati
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
