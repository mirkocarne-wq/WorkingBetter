# Mockup delle schermate

Mockup statici (HTML + CSS, nessun framework) delle 12 schermate chiave, costruiti a partire dalle specifiche in `docs/specifiche/` e dai principi in `docs/07-ux-e-design-system.md`. Servono a validare flussi, gerarchia delle informazioni e linguaggio prima di scrivere codice applicativo. **Non sono l'implementazione.**

| # | Schermata | Ruolo | Specifiche di riferimento |
|---|---|---|---|
| 01 | Dashboard manager | Manager | ANA-002, ONE-030, OKR-051 |
| 02 | Obiettivi · albero di allineamento + dettaglio KR | Manager | OKR-003, OKR-030, OKR-052, OKR-061 |
| 03 | 1:1 · agenda, note, action item, suggerimenti | Manager | ONE-010…019, ONE-020…023 |
| 04 | Review · compilazione manager con pannello di contesto | Manager | REV-003, REV-004, REV-031, REV-033 |
| 05 | Il mio welfare · saldo, soglie, catalogo, rimborso | Collaboratore | WEL-007, WEL-011, WEL-020, WEL-024, WEL-050 |
| 06 | Report builder · heatmap con soglie di anonimato | HRBP | ANA-050…055, ANA-090 |
| 07 | App Studio · editor workflow | HR Admin | APP-020…027, APP-037 |
| 08 | Home mobile | Collaboratore | ANA-001, OKR-034, WEL-053 |
| 09 | Calibrazione · 9-box e distribuzione rating | HRBP | REV-040…045, DEV-032 |
| 10 | Report 360° · radar, gap, commenti | Collaboratore | F360-020…026 |
| 11 | Il mio onboarding · timeline, task, milestone | Neoassunto | ONB-012…017 |
| 12 | Piano welfare · configurazione lato HR | HR Admin | WEL-001…003, WEL-010…013, WEL-040…042 |

## Rigenerare

```bash
python3 docs/mockups/build.py                 # genera gli HTML
node docs/mockups/render.mjs                  # PNG in docs/mockups/png/ (richiede playwright + Chromium)
```

Se Playwright è installato globalmente e non risolvibile dal file, passare il percorso: `PLAYWRIGHT_PKG="$(npm root -g)/playwright/index.mjs" node docs/mockups/render.mjs`.

## Convenzioni visive

- Palette: primario blu `#2a78d6`; stati (good/warning/serious/critical) riservati e sempre accompagnati da etichetta; scala sequenziale blu per le heatmap; segmenti sotto soglia di anonimato mostrati con tratteggio, mai come zero.
- Badge di visibilità su ogni contenuto sensibile ("solo tu", "visibili a te e Luca", "condiviso con manager").
- Naming del tenant visibile dove rilevante (anteprima in App Studio).
