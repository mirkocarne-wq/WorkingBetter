# Changelog

Tutte le modifiche rilevanti a questo progetto sono documentate in questo file.

Il formato segue [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e il progetto adotta il [Semantic Versioning](https://semver.org/lang/it/).

## [Unreleased]

### Added
- Struttura iniziale del repository e documentazione di progetto.
- `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, template issue e PR.
- Visione e obiettivi (`docs/00`), benchmark di PeopleGoal usato come specifica di partenza (`docs/01`).
- Indice delle specifiche funzionali e principi trasversali (`docs/02`) con specifiche di dettaglio per modulo in `docs/specifiche/`: Core & Amministrazione, Obiettivi & OKR, Performance Review, Feedback 360°, 1:1 & Check-in, Feedback continuo & Riconoscimenti, Engagement & Survey, Sviluppo & Carriera, Onboarding, App Studio, Analytics & Reporting, Integrazioni & Notifiche.
- Architettura proposta (`docs/03`), modello dati (`docs/04`), linee guida API (`docs/05`), sicurezza e compliance (`docs/06`), UX e design system (`docs/07`), roadmap (`docs/08`), glossario (`docs/09`).
- Documento per raccogliere le nostre modifiche e differenziazioni rispetto a PeopleGoal (`docs/10`).
- ADR iniziali: adozione delle ADR (0001), stack tecnologico proposto (0002), strategia multi-tenant (0003).
- Modulo **Welfare aziendale** (`docs/specifiche/welfare.md`, codice `WEL`): piani, fonti di budget, conto welfare, categorie e soglie fiscali per anno, catalogo interno e provider, richieste e rimborsi con giustificativi, conversione premio di risultato, flussi payroll, iniziative di benessere.
- ADR-0004 architettura della reportistica (data mart storicizzato, semantic layer, query engine, connettore BI).

### Changed
- `docs/specifiche/analytics.md` riscritta come motore di reportistica ingegnerizzato: catalogo metriche, report builder, report programmati, Analytics API, connettore BI, governance (ANA-040…093). Report builder e BI passano da P2 a P1.
- `docs/specifiche/app-studio.md`: low-code a livelli L1–L5; entità custom (APP-036) e automazioni (APP-037/038) confermate a P2, script sandbox e marketplace a P3.
- Propagazione in README, `docs/01` (nuova sezione "funzionalità non presenti in PeopleGoal"), `docs/02` (nuovi ruoli Analista e Welfare, principio "ogni dato è una metrica"), `docs/03` (welfare, metadata-driven, reporting separato, API unica, mobile), `docs/04`, `docs/05`, `docs/08`, `docs/09`, `docs/10` (A15, A17, A18; C2 e C4 superate).
