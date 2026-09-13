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

## Navigazione (proposta)

```
Home (dashboard di ruolo)
├── Obiettivi        (miei / team / azienda / albero)
├── 1:1              (prossimi / relazioni / azioni)
├── Feedback         (dai / chiedi / ricevuti / riconoscimenti feed)
├── Review           (le mie / da compilare / storico)
├── Sviluppo         (competenze / piano / carriera)
├── Survey           (da compilare / risultati se autorizzato)
├── Persone          (org chart / profili)
└── Amministrazione  (HR: processi, App Studio, analytics, impostazioni, integrazioni)
```

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

Stato (sprint 8): implementato nella web app come **token CSS + primitive React**, senza libreria esterna. La pagina **Impostazioni → Guida di stile** (`/settings/design`) mostra token e componenti reali ed è la documentazione vivente del sistema (al posto di uno Storybook separato, per ora).

### Token (`apps/web/app/globals.css`)

| Gruppo | Token | Note |
|---|---|---|
| Superfici e testo | `--bg`, `--surface`, `--surface-2`, `--ink`, `--ink2`, `--muted`, `--grid`, `--line`, `--border` | fondo caldo neutro, testo quasi nero |
| Brand | `--brand` (primario del tenant), `--brand-2`, `--brand-soft`, `--brand-line` | il primario si imposta in **Impostazioni → Aspetto**; le derivate sono calcolate con `color-mix()` (fallback statico per browser datati) |
| Stato | `--good`, `--warn`, `--serious`, `--crit` (+ `-text`, `-soft`) | riservati a segnali e badge, sempre con testo o icona, mai per serie di grafici |
| Serie grafici | `--s1` … `--s6` | ordine fisso, mai ciclato; oltre sei serie si raggruppa in "Altro" |
| Tipografia | `--font`, `--fs-xs` 11 → `--fs-kpi` 30 px | numeri tabulari nei KPI e nelle tabelle |
| Spaziatura | `--s-1` 4 → `--s-6` 32 px | scala 4pt |
| Forma | `--r-sm` 8, `--r` 10, `--r-pill`, `--shadow`, `--shadow-2`, `--focus` | anello di focus visibile derivato dal brand |
| Layout | `--side-w` 232, `--top-h` 56 px | |

### Primitive (`apps/web/components/ui.tsx`)

`PageHeader`, `Card`, `Kpi`, `Pill` (toni b/g/w/s/c/n), `Button` (primario, secondario, ghost, distruttivo, piccolo; anche come link), `EmptyState` (stato vuoto che insegna), `Field`/`Input`/`Select`/`Textarea`/`Checkbox` (classe `.input` unica: nessuno stile inline nei form), `Tabs`, `VisibilityBadge` (Solo tu · Tu e il tuo manager · Team · Unità · Azienda · Fascicolo HR), `Avatar`/`Who`, `Progress`, `TableWrap`.

### Regole applicate

- **Responsive**: sotto i 900 px la sidebar diventa un cassetto (`AppShell`), le griglie a più colonne collassano a una, le tabelle scorrono in orizzontale, i tab scorrono.
- **Accessibilità**: link "Vai al contenuto", `aria-current` nella navigazione, focus visibile su tutto, `prefers-reduced-motion` rispettato, controlli con etichetta.
- **Colore primario del tenant** applicato a pulsanti, tab, link attivi, barre e focus; il resto della palette resta neutro per garantire il contrasto.
- **Stampa**: navigazione nascosta, card senza ombre.
- Tema scuro, illustrazioni per gli stati vuoti e micro-copy bilingue restano da fare.

## Prototipazione

Prima del codice: wireframe dei flussi P0 validati con 3–5 utenti target. Una prima serie di mockup ad alta fedeltà è in `docs/mockups/` (8 schermate: dashboard manager, obiettivi, 1:1, review, welfare, report builder, App Studio, home mobile), rigenerabile con gli script inclusi.
