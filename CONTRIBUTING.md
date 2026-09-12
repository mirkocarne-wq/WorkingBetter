# Contribuire a WorkingBetter

Grazie per contribuire! Questo documento descrive come lavoriamo.

## Flusso di lavoro

1. **Apri o scegli una issue** (vedi template in `.github/ISSUE_TEMPLATE/`).
2. **Crea un branch** dal branch principale: `feature/<breve-descrizione>`, `docs/<breve-descrizione>`, `fix/<breve-descrizione>`.
3. **Lavora a piccoli passi** con commit atomici.
4. **Apri una Pull Request** usando il template; collega la issue.
5. **Review**: almeno una approvazione prima del merge. Le PR di sola documentazione possono essere mergiate dall'autore dopo review leggera.

## Commit

Usiamo [Conventional Commits](https://www.conventionalcommits.org/) in inglese:

```
<tipo>(<scope opzionale>): <descrizione breve all'imperativo>

<corpo opzionale: cosa e perché, non come>
```

Tipi ammessi: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`, `perf`, `build`.

Esempi:

```
docs(okr): add acceptance criteria for key result check-ins
feat(reviews): add calibration session entity
```

## Documentazione

- Lingua: **italiano** per i documenti, **inglese** per codice, nomi entità, API.
- Ogni modulo funzionale ha una specifica in `docs/specifiche/` basata su `docs/specifiche/_template.md`.
- Ogni requisito ha un ID stabile `<MODULO>-<NNN>`. Se un requisito viene rimosso, marcalo come *Deprecato* invece di cancellarlo, finché non è uscito dalla roadmap.
- Le decisioni tecniche vanno in `docs/adr/` (una decisione = una ADR, numerazione progressiva).
- Aggiorna `CHANGELOG.md` sotto `[Unreleased]` per ogni modifica rilevante.

## Stile dei documenti

- Frasi brevi, una idea per frase.
- Tabelle per confronti e matrici (es. permessi per ruolo).
- Diagrammi in [Mermaid](https://mermaid.js.org/) direttamente nel Markdown.
- User story nel formato: *Come `<ruolo>` voglio `<azione>` così da `<beneficio>`*.
- Criteri di accettazione verificabili (Given / When / Then quando utile).

## Codice (quando arriverà)

Le convenzioni di codice (linting, test, struttura) verranno aggiunte in questo file al momento dell'inizializzazione del progetto applicativo, coerentemente con l'ADR sullo stack tecnologico.

## Domande

Apri una issue con l'etichetta `question`.
