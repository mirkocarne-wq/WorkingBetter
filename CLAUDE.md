# CLAUDE.md — Istruzioni per agenti AI su questo repository

Questo file guida Claude Code (e altri agenti) quando lavorano su WorkingBetter.

## Contesto

- **Prodotto**: piattaforma SaaS di performance management ed employee experience, ispirata a PeopleGoal.
- **Fase attuale**: discovery / specifiche. Non esiste ancora codice applicativo. La fonte di verità sono i documenti in `docs/`.
- **Lingua**: la documentazione, i commenti di prodotto e le comunicazioni con l'utente sono in **italiano**. Identificatori di codice, nomi di entità, endpoint API e commit message sono in **inglese**.

## Regole di lavoro

1. **Tieni il repo sempre aggiornato**: ogni modifica significativa va committata e pushata sul branch di lavoro indicato, con messaggio chiaro. Aggiorna `CHANGELOG.md` (sezione `[Unreleased]`) a ogni cambiamento rilevante.
2. **Documentazione prima del codice**: quando si introduce una funzionalità, prima si aggiorna o crea la specifica in `docs/specifiche/`, poi si implementa.
3. **Decisioni architetturali**: ogni scelta tecnica non banale va registrata come ADR in `docs/adr/` (usa il template `docs/adr/0000-template.md`). Le ADR esistenti con stato *Proposto* vanno validate con l'utente prima di essere considerate definitive.
4. **Le nostre modifiche** rispetto a PeopleGoal si raccolgono in `docs/10-modifiche-nostre.md`. Quando una modifica viene approvata, va propagata nella specifica del modulo interessato.
5. **Non inventare requisiti**: se un requisito è ambiguo, esplicita l'assunzione nel documento (sezione "Assunzioni / Domande aperte") invece di decidere in silenzio.
6. **Formato documenti**: Markdown, titoli con `#`, tabelle per confronti, diagrammi in Mermaid. Ogni specifica di modulo segue il template `docs/specifiche/_template.md`.
7. **Identificatori requisiti**: ogni requisito ha un ID stabile nel formato `<MODULO>-<NNN>` (es. `OKR-012`, `REV-003`). Non riutilizzare ID rimossi.

## Struttura del repository

```
.
├── README.md                 # Panoramica e mappa della documentazione
├── CLAUDE.md                 # Questo file
├── CONTRIBUTING.md           # Convenzioni di contributo
├── CHANGELOG.md              # Storico modifiche (Keep a Changelog)
├── .github/                  # Template issue/PR
└── docs/
    ├── 00-visione-e-obiettivi.md
    ├── 01-benchmark-peoplegoal.md
    ├── 02-specifiche-funzionali.md   # Indice + principi trasversali
    ├── specifiche/                    # Una specifica per modulo
    ├── 03-architettura.md
    ├── 04-modello-dati.md
    ├── 05-api.md
    ├── 06-sicurezza-e-compliance.md
    ├── 07-ux-e-design-system.md
    ├── 08-roadmap.md
    ├── 09-glossario.md
    ├── 10-modifiche-nostre.md
    └── adr/                           # Architecture Decision Records
```

## Convenzioni Git

- Branch di lavoro: quello indicato dalla sessione (mai pushare su `main` direttamente senza indicazione).
- Commit in inglese, formato [Conventional Commits](https://www.conventionalcommits.org/): `docs:`, `feat:`, `fix:`, `chore:`, `refactor:`, `test:`.
- Un commit per unità logica di lavoro; niente commit "wip" pushati.

## Quando arriverà il codice

Lo stack proposto è descritto in `docs/03-architettura.md` e in `docs/adr/0002-stack-tecnologico.md`. Fino alla validazione dell'ADR, non inizializzare progetti applicativi (package.json, ecc.) senza conferma dell'utente.
