# Manuale operativo di WorkingBetter

Questo manuale spiega **come si usa la piattaforma** e, soprattutto, **quali regole HR il software applica da solo**: chi vede cosa, quando una survey è davvero anonima, cosa succede a una review prima che la persona la legga, come si calibra un rating. È scritto per chi amministra il tenant, per HR, per i manager e per chi usa la piattaforma ogni giorno.

> Il manuale descrive **solo comportamenti implementati** nel prodotto. Quando una funzione è pianificata ma non ancora disponibile lo diciamo esplicitamente, con rimando alla [roadmap](../08-roadmap.md). Le specifiche funzionali di dettaglio restano in [`docs/specifiche/`](../specifiche/).

## Come leggerlo

| Se sei… | Parti da | Poi leggi |
|---|---|---|
| chi attiva la piattaforma (IT o HR) | [02 · Avviamento](02-avviamento.md) | [03 · Amministratore](03-amministratore.md) |
| HR admin o HR business partner | [01 · Concetti e ruoli](01-concetti-e-ruoli.md) | [04 · HR](04-hr.md), [07 · Regole HR applicate](07-regole-hr.md) |
| manager | [05 · Manager](05-manager.md) | [07 · Regole HR applicate](07-regole-hr.md) |
| collaboratore o collaboratrice | [06 · Collaboratore](06-collaboratore.md) | [08 · Domande frequenti](08-faq.md) |

Il **[Manuale utente](../manuale-utente/README.md)** è il documento gemello con le schermate e le procedure passo per passo. Dentro l'app la pagina **Guida** (`/inizia`) propone lo stesso percorso in forma di wizard per profilo: i passi si spuntano da soli quando il sistema rileva che l'azione è stata fatta (specifica [AVV](../specifiche/avviamento-guidato.md)).

## Indice

1. [Concetti e ruoli](01-concetti-e-ruoli.md) — tenant, persone e utenti, ruoli e permessi, linea gerarchica, visibilità dei dati, calendario tipo dell'anno HR.
2. [Avviamento](02-avviamento.md) — l'ordine giusto per partire: amministratore, HR, manager, collaboratori; tempi e checklist.
3. [Amministratore](03-amministratore.md) — marchio, organizzazione, persone e import, inviti, ruoli, SSO e verifica in due passaggi, integrazioni, backup, audit.
4. [HR](04-hr.md) — valori, periodi obiettivi, review (template, cicli, approvazioni, calibrazione, correzioni), survey, 360°, sviluppo e talento, onboarding, welfare, processi, report, notifiche automatiche.
5. [Manager](05-manager.md) — team, obiettivi, 1:1, feedback, review del team, approvazioni e calibrazione, 9-box, onboarding di un nuovo ingresso.
6. [Collaboratore](06-collaboratore.md) — scheda, obiettivi e check-in, 1:1, feedback, self-review e firma, survey, 360°, sviluppo, welfare, onboarding, notifiche, sicurezza dell'account.
7. [Regole HR applicate dal software](07-regole-hr.md) — il catalogo delle garanzie: anonimato, visibilità, approvazioni, calibrazione, tracciabilità, soglie fiscali, isolamento dei dati.
8. [Domande frequenti e problemi](08-faq.md) — «perché non vedo…», «perché non posso…», cosa fare.

Il [glossario](../09-glossario.md) definisce i termini ricorrenti (OKR, check-in, calibrazione, eNPS…).

## Convenzioni

- **Percorsi nell'app** sono scritti come `Review → Cicli`: la voce del menu a sinistra e poi la scheda o il pulsante.
- **Regola applicata** indica un comportamento che il software impone e che nessun utente può aggirare dall'interfaccia (es. «la persona vede la review del manager solo dopo la condivisione»).
- **Impostazione** indica un parametro che HR o l'amministratore possono cambiare (es. la soglia di anonimato di una survey).
- Numeri e soglie citati sono quelli del codice alla data di aggiornamento del manuale; il capitolo 7 riporta per ciascuno il file di riferimento.

## Versione PDF

`pnpm docs:manual` compone i capitoli in un unico PDF con copertina e indice (`docs/manuale/WorkingBetter-manuale-operativo.pdf`, A4). Richiede `python3` con il pacchetto `markdown` e Chromium di Playwright (già presenti nell'ambiente di sviluppo web). Il PDF committato è quello dell'ultima revisione del manuale.

*Ultimo aggiornamento: 2026-09-14 (sprint 21).*
