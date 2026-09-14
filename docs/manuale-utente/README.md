# Manuale utente di WorkingBetter

Questo manuale spiega **come si usa WorkingBetter, schermata per schermata**, per chi la usa ogni giorno: collaboratore, manager e HR. Ogni sezione mostra la schermata reale, dice cosa contiene e come si fa ogni operazione, passo per passo. Le schermate provengono dall'azienda dimostrativa «Acme S.p.A.» inclusa nel prodotto.

Il **[Manuale operativo](../manuale/README.md)** è il documento gemello: descrive le regole HR che il software applica da solo (chi vede cosa, anonimato, approvazioni, calibrazione) e i predefiniti che HR può cambiare. Qui le richiamiamo solo dove servono per usare bene una funzione.

## Come leggerlo

| Sei… | Leggi | Tempo |
|---|---|---|
| chiunque | [1 · Primi passi](01-primi-passi.md): accesso, menu, Home, notifiche, guida | 10 minuti |
| collaboratore o collaboratrice | [2 · Collaboratore](02-collaboratore.md) | 30 minuti |
| manager | [2 · Collaboratore](02-collaboratore.md) e poi [3 · Manager](03-manager.md) | 45 minuti |
| HR admin o HRBP | [3 · Manager](03-manager.md) e [4 · HR](04-hr.md) | 1 ora |

Ogni ruolo include quello precedente: un manager fa tutto ciò che fa un collaboratore, HR tutto ciò che fa un manager. La configurazione del tenant (SSO, sicurezza, marchio, integrazioni) è compito dell'amministratore ed è descritta nel [Manuale operativo, capitolo 3](../manuale/03-amministratore.md). Le funzioni in più compaiono nel menu di sinistra solo se il tuo ruolo le prevede.

## Convenzioni

- **Persone → Utenti e accessi** indica la voce del menu di sinistra e poi la scheda o il pulsante da premere.
- I nomi dei pulsanti sono scritti come appaiono nell'app: **Invia**, **Condividi con Luca**, **Blocca sessione**.
- Le note «Buono a sapersi» segnalano una regola applicata dal software o un consiglio d'uso.
- I dati delle schermate (nomi, numeri, date) sono quelli dell'ambiente dimostrativo e cambiano da azienda ad azienda.

## Indice

1. [Primi passi](01-primi-passi.md)
2. [Collaboratore](02-collaboratore.md)
3. [Manager](03-manager.md)
4. [HR](04-hr.md)
5. [Riferimenti rapidi](05-riferimenti.md): stati, scadenze, glossario

## Versione PDF

`pnpm docs:manual` genera anche questo manuale in PDF (`docs/manuale-utente/WorkingBetter-manuale-utente.pdf`). Le schermate si rigenerano dall'ambiente dimostrativo con lo script `scripts/manual-screenshots.mjs`.

*Ultimo aggiornamento: 2026-09-14 (sprint 22).*
