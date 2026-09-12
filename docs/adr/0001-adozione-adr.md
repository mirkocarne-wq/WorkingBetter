# ADR-0001 — Adozione degli Architecture Decision Records

| | |
|---|---|
| **Stato** | Accettato |
| **Data** | 2026-09-12 |
| **Decisori** | Team WorkingBetter |

## Contesto

Il progetto parte da zero e prenderà molte decisioni tecniche e di prodotto. Serve un modo leggero per registrarle, con motivazioni e alternative, così che chi arriva dopo (persone o agenti AI) capisca il perché.

## Decisione

Usiamo ADR in `docs/adr/`, un file per decisione, numerazione progressiva, template `0000-template.md`. Una ADR si modifica solo per cambiarne lo stato; una nuova decisione che sostituisce la precedente crea una nuova ADR.

## Conseguenze

- Ogni PR che introduce una scelta architetturale non banale collega una ADR.
- Le ADR in stato *Proposto* vanno validate esplicitamente prima di implementare.
