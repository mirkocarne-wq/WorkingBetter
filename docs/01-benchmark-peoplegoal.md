# 01 — Benchmark PeopleGoal: catalogo delle funzionalità estratte

Questo documento è l'**inventario delle funzionalità** di PeopleGoal che usiamo come base. Per ognuna indichiamo se la teniamo, come la adattiamo e con quale priorità. La specifica di dettaglio è in `docs/specifiche/`.

> Fonti: sito e pagine feature di PeopleGoal, schede su G2/Capterra/GetApp, articoli di settore. Alcuni dettagli sono ricostruiti da materiale pubblico e vanno considerati indicativi.

## Come PeopleGoal organizza il prodotto

PeopleGoal si presenta come piattaforma "all-in-one" di employee experience organizzata in cinque aree più l'onboarding:

1. **Performance Management** — review, 360°, competenze, calibrazione
2. **Employee Engagement** — survey, pulse, eNPS, wellbeing, riconoscimenti
3. **OKRs / Goals** — obiettivi e key result, allineamento, check-in
4. **Talent Management** — piani di sviluppo, carriera, succession, 9-box
5. **Remote Team Management** — 1:1, check-in, visibilità sul lavoro distribuito
6. **Onboarding** — percorsi di inserimento

Trasversalmente: **App Studio** (no-code builder di processi HR con "app" e template), **analytics**, **integrazioni** (HRIS, SSO, chat, Jira), **multilingua** (10 lingue), assistenza 24/7.

Il tratto distintivo è che ogni processo HR è una "app" configurabile: form, fasi, approvazioni, notifiche, permessi, con naming personalizzabile (es. chiamare gli OKR "Priorità trimestrali").

## Inventario funzionalità

Legenda priorità: **P0** = MVP, **P1** = prima release completa, **P2** = successivo, **–** = non previsto.
Legenda decisione: ✅ teniamo, 🔧 teniamo con modifiche, ⏸️ rimandiamo, ❌ scartiamo.

### Obiettivi & OKR

| Funzionalità PeopleGoal | Decisione | Priorità | Note |
|---|---|---|---|
| Obiettivi individuali, di team, aziendali | ✅ | P0 | |
| OKR con key result quantitativi (numero, %, valuta, booleano) | ✅ | P0 | |
| Allineamento a cascata / albero obiettivi | ✅ | P0 | Vista ad albero e "contribuisce a" |
| Check-in periodici con progresso e confidenza | ✅ | P0 | |
| Naming personalizzabile (Goal/OKR/Priorità…) | 🔧 | P1 | Rinominabile a livello tenant |
| Cicli e scadenze configurabili (trimestre, semestre, anno) | ✅ | P0 | |
| Obiettivi SMART con template | ✅ | P1 | |
| Peso degli obiettivi e scoring finale | ✅ | P1 | Usato nelle review |
| Collegamento obiettivi ↔ review | ✅ | P0 | |
| Tag, categorie, visibilità (pubblico/privato/team) | ✅ | P1 | |
| Integrazione Jira per aggiornare KR | ⏸️ | P2 | |

### Performance Review

| Funzionalità PeopleGoal | Decisione | Priorità | Note |
|---|---|---|---|
| Cicli di review configurabili (annuale, semestrale, trimestrale, continuo, probation) | ✅ | P0 | |
| Fasi: self-review, manager review, peer, skip-level, condivisione, firma | ✅ | P0 | Fasi opzionali/ordinabili |
| Template di form con domande a scala, testo, competenze, obiettivi | ✅ | P0 | |
| Scale di rating personalizzate (etichette e valori) | ✅ | P0 | |
| Valutazione competenze con pesi per ruolo | ✅ | P1 | |
| Calibrazione (sessioni, distribuzione rating, confronto tra manager) | 🔧 | P1 | Con 9-box e distribuzione forzata opzionale |
| Approvazioni multi-livello (manager → HRBP → direttore) | ✅ | P1 | |
| Firma / accettazione elettronica del collaboratore | ✅ | P1 | |
| Promemoria e solleciti automatici | ✅ | P0 | |
| Riepilogo AI del feedback raccolto | 🔧 | P2 | Vedi `docs/10` |
| Export PDF della review | ✅ | P1 | |

### Feedback 360°

| Funzionalità PeopleGoal | Decisione | Priorità | Note |
|---|---|---|---|
| Nomina dei valutatori (self, manager, pari, riporti, esterni) | ✅ | P1 | Con approvazione del manager |
| Domande per competenza/comportamento con rating + commento | ✅ | P1 | |
| Anonimato configurabile per categoria di valutatore | ✅ | P1 | Soglia minima risposte |
| Report con radar chart, gap self vs others, commenti aggregati | ✅ | P1 | |
| Punteggi pesati per ruolo | 🔧 | P2 | |
| Export report Excel/PDF | ✅ | P1 | |

### 1:1 & Check-in

| Funzionalità PeopleGoal | Decisione | Priorità | Note |
|---|---|---|---|
| Agenda condivisa con punti proposti da entrambi | ✅ | P0 | |
| Note private e condivise | ✅ | P0 | |
| Action item con owner e scadenza, riportati al 1:1 successivo | ✅ | P0 | |
| Ricorrenza e integrazione calendario | ✅ | P1 | Google/Microsoft |
| Template di agenda (onboarding, carriera, retrospettiva) | ✅ | P1 | |
| Vista "obiettivi e 1:1 attivi" per manager | ✅ | P0 | |
| Check-in settimanali strutturati (domande fisse) | ✅ | P1 | |

### Feedback continuo & Riconoscimenti

| Funzionalità PeopleGoal | Decisione | Priorità | Note |
|---|---|---|---|
| Feedback istantaneo (dare / chiedere) | ✅ | P0 | |
| Riconoscimenti pubblici (kudos) collegati ai valori aziendali | ✅ | P0 | |
| Feed aziendale / di team | ✅ | P1 | |
| Collegamento a review e premi | 🔧 | P1 | Feedback visibile nella review |
| Invio da Slack / Teams | ✅ | P1 | |

### Engagement & Survey

| Funzionalità PeopleGoal | Decisione | Priorità | Note |
|---|---|---|---|
| Survey di clima con template e libreria domande | ✅ | P1 | |
| Pulse survey ricorrenti (settimanali/mensili) | ✅ | P1 | |
| eNPS | ✅ | P1 | |
| Wellbeing check-in | ✅ | P2 | |
| Anonimato con soglia minima per segmento | ✅ | P1 | |
| Heatmap per team/driver, trend nel tempo, benchmark interno | ✅ | P1 | |
| Piani d'azione post-survey | ✅ | P2 | |

### Sviluppo & Carriera (Talent)

| Funzionalità PeopleGoal | Decisione | Priorità | Note |
|---|---|---|---|
| Competency framework (competenze, livelli, descrittori per ruolo) | ✅ | P1 | Base condivisa per review e 360° |
| Piano di sviluppo individuale (IDP) con azioni e scadenze | ✅ | P1 | |
| Percorsi di carriera / job level | ✅ | P2 | |
| 9-box (performance × potenziale) | ✅ | P1 | |
| Succession planning | ⏸️ | P2 | |
| Skills matrix di team | ✅ | P2 | |

### Onboarding

| Funzionalità PeopleGoal | Decisione | Priorità | Note |
|---|---|---|---|
| Percorsi di onboarding per ruolo/sede con task e milestone | ✅ | P1 | |
| Task assegnati a neoassunto, manager, HR, buddy, IT | ✅ | P1 | |
| Check-in 30/60/90 giorni | ✅ | P1 | Usa 1:1 e survey |
| Documenti e link | ✅ | P1 | |
| Pre-boarding (prima del primo giorno) | ✅ | P2 | |

### App Studio (no-code)

| Funzionalità PeopleGoal | Decisione | Priorità | Note |
|---|---|---|---|
| Form builder (tipi campo, logica condizionale, validazioni) | ✅ | P1 | Motore condiviso da review, survey, onboarding |
| Workflow builder (fasi, assegnatari, approvazioni, scadenze) | 🔧 | P1 | Partiamo da workflow lineari, poi rami |
| Libreria di template ("App Store") | ✅ | P1 | Template nostri + salvataggio dei propri |
| Naming personalizzabile di moduli e entità | ✅ | P1 | |
| Permessi per app | ✅ | P1 | |
| App completamente custom (nuovi tipi di dato) | ⏸️ | P2 | Valutare complessità |

### Analytics & Reporting

| Funzionalità PeopleGoal | Decisione | Priorità | Note |
|---|---|---|---|
| Dashboard per ruolo (HR, manager, collaboratore, leadership) | ✅ | P0 | |
| Completamento processi in tempo reale | ✅ | P0 | |
| Distribuzione rating, radar competenze, trend engagement | ✅ | P1 | |
| Export Excel/CSV | ✅ | P0 | |
| Connessione a BI (dataset/API) | ✅ | P2 | |
| Report builder custom | ⏸️ | P2 | |

### Core, integrazioni e piattaforma

| Funzionalità PeopleGoal | Decisione | Priorità | Note |
|---|---|---|---|
| Multi-tenant, org chart, team, ruoli | ✅ | P0 | |
| SSO (SAML/OIDC: Azure AD, Okta, Google) | ✅ | P0 | |
| Import/sync dipendenti da HRIS (BambooHR, Workday, ADP…) | 🔧 | P1 | CSV a P0, connettori a P1/P2 |
| Slack / Microsoft Teams (notifiche, azioni rapide) | ✅ | P1 | |
| Calendario Google / Microsoft | ✅ | P1 | |
| Jira | ⏸️ | P2 | |
| API pubblica + webhook | ✅ | P1 | |
| Multilingua (10 lingue) | 🔧 | P1 | Partiamo da IT + EN |
| Audit log | ✅ | P0 | |
| Supporto 24/7 | – | – | Non è funzionalità di prodotto |

## Cosa impariamo dai punti deboli di PeopleGoal

Dalle recensioni pubbliche emergono alcuni temi ricorrenti che indirizzano le nostre scelte:

- **Prezzo elevato per le PMI** (piano base da ~299 $/mese, costi extra per implementazione e formazione) → puntiamo su self-service e onboarding guidato del cliente.
- **Curva di configurazione**: la flessibilità del no-code può risultare complessa → template pronti e "percorso rapido" con impostazioni sensate di default.
- **Reportistica avanzata a volte limitata** → investiamo su export e dataset per BI.

## Prossimo passo

Le funzionalità marcate ✅/🔧 sono dettagliate in `docs/specifiche/`. Le nostre modifiche e aggiunte si raccolgono in `docs/10-modifiche-nostre.md`.
