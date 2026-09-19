# 07 — UX e design system

## Principi UX

1. **Poche cose, chiare**: ogni ruolo atterra su una dashboard con "cosa devo fare" in cima.
2. **Azioni in 3 clic**: dare feedback, fare un check-in, aggiungere un punto al 1:1 non richiedono di navigare.
3. **Contesto sempre visibile**: durante review e 1:1 il pannello laterale mostra obiettivi, feedback, storico.
4. **Trasparenza sulla visibilità**: ogni contenuto mostra chi lo vede (badge "Solo tu", "Tu e il tuo manager", "Team", "Azienda").
5. **Mobile-first per collaboratori e manager**; le configurazioni HR sono ottimizzate per desktop.
6. **Linguaggio del tenant**: i nomi personalizzati compaiono ovunque.
7. **Stati vuoti che insegnano**: ogni sezione vuota spiega cosa fare e offre un template.
8. **Accessibilità WCAG 2.1 AA**: contrasto, tastiera, screen reader, focus visibile.

## Navigazione

Menu laterale a **sezioni con icone** (sprint 24, CORE-064), uguale su tutte le pagine; le voci compaiono solo se la persona ha il permesso del modulo.

```
[Tenant ▾]  WorkingBetter
[🔍 Cerca…  ⌘K]
IL MIO LAVORO      Home · Obiettivi · 1:1 · Feedback · Review · Form
CRESCITA           Sviluppo · Feedback 360° · Survey · Welfare
ORGANIZZAZIONE     Onboarding · Processi · Report · Persone
───────────────
Guida · Impostazioni
[LB] Luca Bianchi · Senior Developer            [Esci]
```

L'intestazione della pagina mostra il percorso (breadcrumb), il periodo attivo, le notifiche e l'aiuto (manuale). La **ricerca rapida** (⌘K / Ctrl+K) apre le pagine e trova le persone per nome o email. Sotto i 900 px la sidebar diventa un cassetto.

## Componenti chiave

| Componente | Uso |
|---|---|
| Card persona | Foto, nome, ruolo, segnali (obiettivi a rischio, 1:1 in ritardo) |
| Barra progresso con confidenza | KR e obiettivi |
| Albero obiettivi | Vista allineamento |
| Form runner | Rendering dei form dell'App Studio con salvataggio automatico |
| Pannello contesto | Sidebar in review e 1:1 |
| Timeline | Storico persona, onboarding |
| Heatmap | Survey, competenze |
| Radar | 360°, competenze |
| 9-box | Talent review |
| Feed | Riconoscimenti |
| Badge visibilità | Ovunque ci sia contenuto |

## Design system

Stato (sprint 24): **Direzione A «Workspace»**, scelta tra tre proposte su tela (Home, Obiettivi, Review, Persone): stile strumento di lavoro, neutri leggermente caldi, bordi sottili al posto delle ombre, densità media, un solo colore d'accento (il primario del tenant). Implementato come **token CSS + primitive React**, senza libreria esterna; la pagina **Impostazioni → Guida di stile** (`/settings/design`) mostra token e componenti reali.

### Token (`apps/web/app/globals.css`)

| Gruppo | Token | Valori |
|---|---|---|
| Superfici e testo | `--bg` #f8f8f6, `--surface` #fff, `--surface-2` #f3f3f0, `--side` #f2f2ef, `--ink` #1c1c1a, `--ink2` #55544f, `--muted` #75746f (contrasto ≥ 4.5:1 su bianco), `--grid` #eeede8, `--line` #e6e5e0, `--border` = `--line` | neutri caldi; niente grigi bluastri |
| Brand | `--brand` (primario del tenant, Impostazioni → Aspetto), `--brand-2`, `--brand-soft`, `--brand-line` | derivate con `color-mix()`; usato per azione primaria, voce attiva, progresso, anello di focus |
| Stato | `--good` #0f8a3c, `--warn` #d98b0b, `--serious` #e07a3f, `--crit` #d03b3b (+ `-text`, `-soft`) | riservati a pillole e segnali, sempre con testo o icona |
| Serie grafici | `--s1` #2a78d6, `--s2` #c9780f, `--s3` #159a6a, `--s4` #b34fc4, `--s5` #c9432f, `--s6` #6b5bd6 | ordine fisso, mai ciclato; palette validata (fascia di luminosità, croma minimo, separazione per daltonismo ΔE ≥ 8 fra adiacenti, contrasto ≥ 3:1 su bianco) |
| Tipografia | `--font` **Instrument Sans** (self-hosted in `public/fonts`, fallback Segoe UI/system-ui), `--fs-xs` 11 → `--fs-xl` 26, `--fs-kpi` 28 | numeri tabulari in KPI e tabelle; titoli con `letter-spacing -.02em` |
| Spaziatura | `--s-1` 4 → `--s-6` 32 px | scala 4pt |
| Forma | `--r-sm` 8, `--r` 12, `--r-pill`, `--shadow` (1 px, quasi invisibile), `--focus` | le card hanno bordo 1 px e ombra minima |
| Layout | `--side-w` 248, `--top-h` 52 px | |

### Shell (`components/app-shell.tsx`, `nav-links.tsx`, `command-palette.tsx`)

Sidebar con blocco tenant, pulsante di ricerca, sezioni, piè con Guida/Impostazioni e persona; intestazione con breadcrumb (`PageCrumb`), periodo, campanella con conteggio e aiuto. Le icone sono SVG inline a tratto (`components/icons.tsx`, griglia 24, spessore 1.75), mai emoji.

### Primitive (`apps/web/components/ui.tsx`)

`PageHeader`, `Card` (con intestazione `hd` e conteggio), `WorkflowCanvas` (diagramma SVG del processo, ADR-0014) e `WorkflowSimulator`, `FormBuilder` (condizioni, calcolati, scale), `KpiBand`/`Kpi` (fascia unica divisa da linee, anello di progresso opzionale), `Pill` (toni b/g/w/s/c/n, puntino), `Button` (primario, secondario, ghost, distruttivo, piccolo; con icona), `Segmented` (viste alternative), `Tabs`, `Stepper` (fasi di un processo: fatto · in corso · da fare), `Toolbar` (ricerca + filtri sopra le tabelle), `EmptyState`, `Field`/`Input`/`Select`/`Textarea`/`Checkbox`, `VisibilityBadge`, `Avatar` (iniziali su tinte deterministiche per persona)/`Who`, `Progress`, `TableWrap`.

### Grafici (`apps/web/components/charts.tsx`, `trend-chart.tsx`; sprint 30)

Nessuna libreria: SVG inline con i token. Prima si sceglie la **forma** dal compito del dato, poi il colore.

| Compito del dato | Componente | Note |
|---|---|---|
| Una cifra da leggere a colpo d'occhio, con contesto | `StatTile` (etichetta, valore, variazione, sparkline 14 punti) in una fascia `.stats` | il verso «buono» della variazione dipende dalla metrica (`goodWhen`: per ritardi, rischi e mancanze il calo è verde) |
| Andamento nel tempo di una metrica | `TrendChart` (griglia sottile, area al 10 %, mirino + tooltip, tabella gemella) | una sola serie per grafico: nessuna legenda, il titolo la nomina |
| Più andamenti da confrontare | `MiniTrend` in griglia `.multiples` (piccoli multipli) | **mai due scale nello stesso grafico** |
| Grandezza per categoria (unità, manager, segnali) | `BarList` (barre orizzontali ordinate, valore in inchiostro a destra, tooltip per barra) | una sola tonalità; gruppi sotto soglia mostrati come `n<` |
| Parte sul tutto (confidenza obiettivi, eNPS) | `Distribution` (barra a segmenti con 2 px di superficie fra loro, legenda con conteggi) | i colori di stato sono ammessi perché rappresentano stati |
| Distribuzione su categorie ordinate (rating) | `Columns` (colonne ≤ 24 px, angoli 4 px, etichetta solo sul massimo, tooltip, tabella gemella) | |

Regole: marcatori sottili (barre ≤ 24 px, linee 2 px, punti ≥ 8 px con anello di superficie di 2 px); testo sempre in inchiostro (`--ink`, `--ink2`, `--muted`), mai nel colore della serie; niente etichette su ogni punto; griglia e assi recessivi (`--grid`, `--line`); tooltip al passaggio per ogni marcatore; legenda per ≥ 2 serie e mai per una sola; vista tabella (`<details>`) dove la lettura puntuale conta; serie in ordine fisso `--s1…--s6`, mai ciclate né generate; stato (`--good/--warn/--serious/--crit`) riservato agli stati, sempre con testo o icona; nessun grafico a torta, a doppio asse o arcobaleno. Verifica della palette: `validate_palette` del metodo dataviz (tutti i controlli superati in modalità chiara; il tema scuro resta da fare).

### Regole applicate

- **Un solo accento**: il colore del tenant serve ad azione primaria, voce attiva, progresso e focus; il resto è neutro. Le pillole di stato usano i colori di stato, mai il brand.
- **Gerarchia dei bottoni**: al massimo un primario per intestazione; secondari con bordo; ghost per azioni terziarie.
- **Tabelle**: intestazione in maiuscoletto grigio su fondo `--bg`, righe da 44 px, avatar a 32 px, numeri allineati a destra.
- **Albero obiettivi**: indentazione con linee guida, chip di livello, owner con avatar, KR espandibili con check-in inline.
- **Responsive**: sotto i 900 px sidebar a cassetto, griglie a una colonna, tabelle scorrevoli, fascia KPI a due colonne.
- **Accessibilità**: link «Vai al contenuto», `aria-current`, focus visibile, `prefers-reduced-motion`, contrasto AA anche sul testo secondario, icone decorative con `aria-hidden` e testo sempre presente.
- **Stampa**: navigazione nascosta, card senza ombre.
- Tema scuro e illustrazioni per gli stati vuoti restano da fare.

## Prototipazione

Prima del codice: wireframe dei flussi P0 validati con 3–5 utenti target. Una prima serie di mockup ad alta fedeltà è in `docs/mockups/` (8 schermate: dashboard manager, obiettivi, 1:1, review, welfare, report builder, App Studio, home mobile), rigenerabile con gli script inclusi.
