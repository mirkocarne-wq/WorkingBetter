# 10 — Le nostre modifiche rispetto a PeopleGoal

Questo è il documento di lavoro in cui raccogliamo tutto ciò che vogliamo fare **diversamente o in più** rispetto alla base PeopleGoal. Ogni voce ha uno stato; quando viene **approvata** va propagata nella specifica del modulo (sezione 10 di ogni specifica) e nel CHANGELOG.

Stati: 💡 Idea · 🔍 In valutazione · ✅ Approvata · ❌ Scartata

## A. Modifiche già inserite nelle specifiche (proposte, da confermare)

| # | Modulo | Modifica | Perché | Stato |
|---|---|---|---|---|
| A1 | CORE | Perimetri espliciti per HRBP e storico organizzativo con validità temporale | Analytics affidabili e privacy verificabile | 🔍 |
| A2 | CORE | Vista "cosa vede X" per verificare i permessi | Fiducia e conformità | 🔍 |
| A3 | OKR | Modalità doppia OKR / Goal semplice per tenant | Non tutte le PMI vogliono gli OKR | 🔍 |
| A4 | OKR | Stale detection e vista "a rischio" per manager | Obiettivi vivi, non dimenticati | 🔍 |
| A5 | ONE | Suggerimenti automatici di agenda da obiettivi, feedback, sviluppo, check-in | Il 1:1 come hub | 🔍 |
| A6 | ONE | HR vede solo metriche di adozione, mai contenuti dei 1:1 | Fiducia manager–riporto | 🔍 |
| A7 | REV | Pannello di contesto sempre presente durante la compilazione | Review basate su evidenze | 🔍 |
| A8 | REV | Addendum su review chiuse invece di riapertura silenziosa; gestione cambi manager in corso di ciclo | Tracciabilità | 🔍 |
| A9 | FBK | Template SBI, nudge di frequenza, controllo del destinatario sulla condivisione | Qualità e privacy del feedback | 🔍 |
| A10 | F360 | Suggerimenti di nomina, regole di rilascio esplicite, link diretto alle azioni di sviluppo | Meno attrito, più utilità | ✅ (sprint 13: implementate tutte e tre; la media 360° alimenta il profilo competenze) |
| A11 | ENG | Anonimato architetturale (separazione invito/risposta) e protezione per differenza; follow-up azioni nella survey successiva | Garanzia reale, non promessa | 🔍 |
| A12 | DEV | Gap analysis con azioni suggerite; confronto con ruolo successivo; aspirazioni dichiarate | Crescita concreta | 🔍 |
| A13 | ONB | Alert su survey di onboarding con punteggi bassi; percorsi per cambio ruolo e offboarding | Intervento tempestivo | 🔍 |
| A14 | APP | Motore unico versionato; percorso rapido con template; import/export JSON | Ridurre la complessità percepita del no-code | 🔍 |
| A15 | ANA | **Reportistica ingegnerizzata**: data mart storicizzato, semantic layer con privacy nelle metriche, report builder, report programmati, connettore BI, Analytics API (ADR-0004) | Richiesta esplicita: "la reportistica va ingegnerizzata"; punto debole di PeopleGoal | ✅ |
| A16 | INT | HRIS del mercato italiano/europeo (Zucchetti, Personio, Factorial); azioni rapide in Slack/Teams | Target di mercato | 🔍 |
| A17 | WEL | **Modulo Welfare aziendale** (nuovo): piani, fonti di budget, conto welfare, catalogo interno/provider, rimborsi con giustificativi, soglie fiscali per anno, conversione premio di risultato, flussi payroll, iniziative di benessere | Richiesta esplicita; leva HR centrale in Italia, assente in PeopleGoal | ✅ |
| A18 | APP | Low-code a livelli L1–L5: entità custom (L3) e automazioni (L4) in roadmap P2, motore metadata-driven dall'MVP | Il low-code è il tratto distintivo del riferimento; non va sottovalutato | ✅ (direzione) |

## B. Idee da discutere

| # | Modulo | Idea | Note | Stato |
|---|---|---|---|---|
| B1 | Trasversale | **Assistente AI opt-in**: riassunto feedback per la review, suggerimenti di scrittura, analisi temi survey, bozza agenda 1:1 | Mai decisionale; DPIA; vedi `docs/06` | 💡 |
| B2 | Trasversale | **Pricing per PMI**: piano self-service, onboarding cliente guidato in-app, nessun costo di implementazione | Risponde al punto debole di PeopleGoal | 💡 |
| B3 | Trasversale | **Localizzazione italiana profonda**: prassi HR (periodo di prova, CCNL come attributo, fringe benefit), lingua, HRIS locali | Differenziazione sul mercato IT | 💡 |
| B4 | REV | Review "leggere" mensili/di progetto come default consigliato, con la review annuale come sintesi automatica | Performance continua | 💡 |
| B5 | OKR | Obiettivi di team con contributo % dichiarato per persona | Chiarezza sui carichi | 💡 |
| B6 | FBK/WEL | Wallet punti riconoscimento convertibile in credito welfare (WEL-004) | Assorbita nel modulo Welfare | ✅ → A17 |
| B7 | ENG | Benchmark esterno anonimo tra tenant aderenti | Serve massa critica | 💡 |
| B8 | DEV | Marketplace di percorsi di sviluppo (contenuti partner) | Post-lancio | 💡 |
| B9 | ANA | Indicatore di rischio uscita spiegabile | DPIA obbligatoria | 💡 |
| B10 | UX | App mobile nativa (oltre al web responsive) | Post-MVP | 💡 |

## C. Cose che PeopleGoal fa e noi non faremo (per ora)

| # | Funzionalità | Motivo | Stato |
|---|---|---|---|
| C1 | Supporto 24/7 e servizi di implementazione come parte del prodotto | Modello self-service | 🔍 |
| C2 | ~~App completamente custom con nuove entità~~ | Superata: entità custom e automazioni sono in roadmap P2 (vedi A18) | ❌ scartata la rinuncia |
| C3 | 10 lingue al lancio | Partiamo da IT/EN | 🔍 |
| C4 | ~~Report builder libero~~ | Superata: report builder P1 nella reportistica ingegnerizzata (A15) | ❌ scartata la rinuncia |

## Come aggiungere una modifica

1. Aggiungi una riga nella tabella B (o A se riguarda una specifica esistente) con stato 💡.
2. Discussione; aggiorna lo stato.
3. Se ✅: aggiorna la specifica del modulo (requisiti con ID e sezione 10), il catalogo `docs/01` se cambia una decisione ✅/🔧/❌, e il `CHANGELOG.md`.
