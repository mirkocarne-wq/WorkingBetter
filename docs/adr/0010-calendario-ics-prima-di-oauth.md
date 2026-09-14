# ADR-0010 — Calendario: feed iCalendar e inviti .ics prima dei connettori OAuth

| | |
|---|---|
| **Stato** | Proposto |
| **Data** | 2026-09-13 |
| **Decisori** | team prodotto/tech |
| **Collegate** | ADR-0005 (strategia API), specifiche INT §3.3 e ONE-003 |

## Contesto

Le specifiche chiedono che i 1:1 compaiano nel calendario delle persone (ONE-003, INT-020/021). La via "nativa" richiede connettori OAuth verso Google Workspace e Microsoft 365: registrazione di un'app presso ogni provider, consenso amministrativo per tenant, gestione e cifratura dei refresh token, quote e webhook di sincronizzazione, oltre a un ambiente con accesso di rete a quei servizi per svilupparli e testarli. Sono settimane di lavoro per ottenere, all'inizio, lo stesso risultato visibile: un evento nel calendario che si aggiorna quando il 1:1 cambia.

## Decisione

1. **Standard prima dei connettori.** Il calendario si integra con due meccanismi basati su iCalendar (RFC 5545 / iTIP RFC 5546), che ogni client di calendario supporta:
   - **inviti email `.ics`** per i 1:1: `METHOD:REQUEST` alla creazione e alla riprogrammazione (stesso `UID`, `SEQUENCE` crescente), `METHOD:CANCEL` all'annullamento; i destinatari sono i due partecipanti, l'organizzatore è la piattaforma;
   - **feed iCalendar personale** (`text/calendar`, sola lettura) con 1:1, scadenze delle review in carico, chiusura delle survey a cui si è invitati e azioni in scadenza; URL segreto per utente, revocabile e rigenerabile da Impostazioni.
2. **Il codice che costruisce iCalendar è puro e condiviso** (`packages/shared/src/calendar`): stessi eventi per email, feed e, domani, connettori.
3. **La proposta di slot** usa solo dati interni (orario di lavoro, giorni feriali, altri 1:1 dei partecipanti). Quando arriveranno i connettori aggiungerà la disponibilità esterna senza cambiare l'interfaccia.
4. **I connettori OAuth (INT-020/021) restano in roadmap** come fase 2, dietro la stessa astrazione: un `CalendarProvider` che riceve gli stessi eventi iCalendar e li scrive/aggiorna nel calendario esterno.

## Conseguenze

- Zero configurazione per il tenant: funziona dal primo giorno con Google, Outlook/Exchange, Apple Calendar, Thunderbird.
- Nessun dato del calendario aziendale entra nella piattaforma: meno superficie in termini di privacy e DPIA.
- Limiti accettati: l'evento non viene creato "dal" calendario dell'utente (l'organizzatore è la piattaforma), le risposte accetta/rifiuta non tornano indietro, il feed si aggiorna con la frequenza di polling del client (da minuti a ore secondo il provider), la disponibilità esterna non è considerata negli slot.
- Il feed è un URL "capability": chi lo conosce legge titoli e date. Per questo contiene solo informazioni già visibili all'utente nell'app, mai note o contenuti, ed è revocabile in un clic.

## Alternative considerate

- **Solo connettori OAuth**: valore identico all'inizio, costo e rischio molto maggiori; escluso come primo passo.
- **CalDAV**: poco supportato da Google/Microsoft per scrittura; scartato.
- **Solo feed, senza inviti email**: il feed non notifica i cambi in tempo reale e non crea l'evento nel calendario dell'altro partecipante senza che anche lui lo sottoscriva; gli inviti coprono questo caso.
