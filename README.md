# WorkingBetter

> Piattaforma di **performance management ed employee experience** per PMI e mid-market, ispirata a [PeopleGoal](https://www.peoplegoal.com/) e arricchita con le nostre modifiche.

[![Stato](https://img.shields.io/badge/stato-discovery%20%2F%20specifiche-blue)]()
[![Docs](https://img.shields.io/badge/docs-italiano-green)]()

## Cos'è

WorkingBetter aiuta le aziende a gestire in un unico posto tutto il ciclo di vita della performance delle persone:

| Area | Cosa fa |
|------|---------|
| **Obiettivi & OKR** | Obiettivi individuali, di team e aziendali, allineati a cascata e tracciati in tempo reale |
| **Performance Review** | Cicli di valutazione configurabili (annuali, semestrali, trimestrali, continui) con self-review, manager review e calibrazione |
| **Feedback 360°** | Feedback multi-fonte su competenze e comportamenti, con report e radar chart |
| **1:1 & Check-in** | Agende condivise, note, action item e follow-up tra manager e collaboratore |
| **Feedback continuo & Riconoscimenti** | Feedback istantaneo, kudos pubblici, valori aziendali |
| **Engagement** | Survey di clima, pulse survey, eNPS, wellbeing check-in con analytics |
| **Sviluppo & Carriera** | Piani di sviluppo individuali, competency framework, percorsi di carriera, 9-box |
| **Onboarding** | Percorsi di inserimento con task, documenti e milestone |
| **Welfare aziendale** | Piani welfare, budget per persona, catalogo e provider, rimborsi, soglie fiscali, conversione premio, flussi payroll |
| **App Studio (low-code / no-code)** | Form e workflow personalizzati, template, entità custom e automazioni |
| **Reportistica** | Data mart storicizzato, catalogo metriche, report builder, report programmati, connettore BI e Analytics API |

## Stato del progetto

Il progetto è in fase di **discovery e specifica**. In questa fase il repository contiene esclusivamente documentazione: visione, benchmark del prodotto di riferimento, requisiti funzionali, architettura proposta e roadmap. Il codice arriverà nelle fasi successive (vedi [Roadmap](docs/08-roadmap.md)).

## Mappa della documentazione

| Documento | Contenuto |
|-----------|-----------|
| [docs/00-visione-e-obiettivi.md](docs/00-visione-e-obiettivi.md) | Perché esistiamo, per chi, cosa non faremo |
| [docs/01-benchmark-peoplegoal.md](docs/01-benchmark-peoplegoal.md) | Analisi di PeopleGoal usata come specifica di partenza |
| [docs/02-specifiche-funzionali.md](docs/02-specifiche-funzionali.md) | Indice dei requisiti funzionali, ruoli e principi trasversali |
| [docs/specifiche/](docs/specifiche/) | Una specifica dettagliata per ogni modulo (user story + criteri di accettazione) |
| [docs/03-architettura.md](docs/03-architettura.md) | Architettura logica, stack proposto, multi-tenancy, deployment |
| [docs/04-modello-dati.md](docs/04-modello-dati.md) | Entità principali e diagramma ER |
| [docs/05-api.md](docs/05-api.md) | Principi API, risorse, autenticazione, webhook |
| [docs/06-sicurezza-e-compliance.md](docs/06-sicurezza-e-compliance.md) | GDPR, RBAC, SSO, audit, data retention |
| [docs/07-ux-e-design-system.md](docs/07-ux-e-design-system.md) | Principi UX, navigazione, design system |
| [docs/08-roadmap.md](docs/08-roadmap.md) | Fasi, milestone e definizione di MVP |
| [docs/09-glossario.md](docs/09-glossario.md) | Terminologia condivisa |
| [docs/10-modifiche-nostre.md](docs/10-modifiche-nostre.md) | **Le nostre modifiche e differenziazioni rispetto a PeopleGoal** (da compilare insieme) |
| [docs/adr/](docs/adr/) | Architecture Decision Records |
| [docs/mockups/](docs/mockups/) | Mockup HTML/PNG delle schermate chiave (dashboard, obiettivi, 1:1, review, welfare, report builder, App Studio, mobile) |

## Come contribuire

Leggi [CONTRIBUTING.md](CONTRIBUTING.md) per convenzioni su branch, commit, documentazione e processo di review. Le istruzioni per gli agenti AI che lavorano sul repo sono in [CLAUDE.md](CLAUDE.md).

## Changelog

Tutte le modifiche rilevanti sono tracciate in [CHANGELOG.md](CHANGELOG.md).
