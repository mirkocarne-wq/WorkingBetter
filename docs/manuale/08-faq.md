# 8 · Domande frequenti e problemi

## Accesso e account

**Non riesco ad accedere: «account bloccato».** Dopo 5 tentativi errati l'accesso è sospeso 15 minuti. Aspetta o usa «Password dimenticata» (link valido 60 minuti). Con SSO attivo e password disabilitata, entra dal pulsante SSO.

**Il link di invito non funziona.** Vale 7 giorni ed è monouso; chiedi un nuovo invito (il vecchio smette di valere).

**Ho perso l'app di autenticazione.** Usa uno degli 8 codici di recupero; se li hai persi, un amministratore può disattivare la verifica in due passaggi dal tuo utente dopo averti identificato.

## Persone e visibilità

**Una persona non compare nel ciclo di review.** Non ha un manager in anagrafica, è esclusa dalla popolazione (unità, esclusioni, «assunti dopo»), oppure non è `active`/`invited`. L'anteprima del ciclo elenca i «saltati» con il motivo.

**Il manager non vede gli obiettivi di una persona.** La persona non è un suo riporto **diretto** in anagrafica, oppure l'obiettivo è `private` (lo vedono solo owner, manager e HR) o in bozza.

**Un manager vede ancora i dati di un ex riporto.** Aggiorna il campo manager: la visibilità segue l'anagrafica in tempo reale. Le review già nate restano con il manager di allora.

**HR non vede le note dei 1:1.** Corretto: HR vede solo la copertura aggregata. Le note private sono cifrate e visibili al solo autore.

## Review

**Non posso condividere la review.** Cause possibili, in ordine: il ciclo non è attivo; la manager review non è stata inviata; la review è **in approvazione** (attendi l'ultimo approvatore); la review è in una **sessione di calibrazione aperta** (HR o il facilitatore devono bloccarla); è già condivisa.

**Il manager non vede la self-review.** Regola del template: «dopo aver inviato la propria» (invii e poi la vedi) oppure «mai».

**La persona non vede il rating.** Vede tutto solo dopo la condivisione. Prima nessun dato, per costruzione.

**La review è stata rimandata: cosa cambia?** Il commento dell'approvatore è nella pagina; la manager review è tornata bozza con le risposte precedenti; il rating proposto è azzerato; dopo il nuovo invio la catena riparte dal primo passo.

**Il rating è diverso da quello che avevo dato.** Lo storico del rating mostra chi lo ha cambiato, quando e perché (correzione HR o calibrazione). La persona non vede lo storico.

**Devo correggere una risposta dopo la condivisione.** HR riapre la fase: condivisione e firma si azzerano, le risposte restano come bozza; poi si ricondivide e la persona rifirma.

**Posso cambiare il questionario di un ciclo in corso?** No: la versione pubblicata è immutabile e il ciclo ha congelato le regole. Crea una nuova versione per il prossimo ciclo.

## Calibrazione

**Una persona non compare nella sessione.** La sua manager review non è ancora stata inviata, oppure il suo soggetto non appartiene al perimetro di unità della sessione, oppure è già in un'altra sessione aperta.

**Chi può bloccare o riaprire?** Blocco: HR o facilitatore. Riapertura: solo HR.

**Un manager è segnalato «outlier».** La sua media si scosta di almeno 0,75 punti dalla media della sessione (con almeno 2 review): è un invito a confrontare le evidenze, non un errore.

## Survey

**Non riesco a lanciare la survey.** Popolazione sotto la soglia di anonimato (predefinita 5), popolazione vuota o data di chiusura non futura.

**Non vedo i risultati di un'unità.** Ha meno risposte della soglia, oppure è stata nascosta per proteggere dalla differenza (un solo gruppo nascosto accanto al totale sarebbe ricostruibile).

**Posso sapere chi non ha risposto?** No: «Sollecita» restituisce solo conteggi; il promemoria parte a tutti gli invitati senza risposta senza mostrarli.

**Posso cambiare la soglia dopo il lancio?** No.

## Obiettivi e 1:1

**L'obiettivo risulta «in ritardo» anche se lo aggiorno.** Il check-in si fa sui **risultati chiave**; l'obiettivo con almeno un risultato chiave usa la data dell'ultimo check-in. Se l'obiettivo ha progresso manuale, aggiorna il progresso.

**Il 1:1 non compare nel calendario Google/Microsoft.** Il collegamento è personale: ogni partecipante deve collegare il proprio account da Impostazioni → Integrazioni; se l'account è in stato «errore», ricollegalo. In ogni caso arriva l'invito `.ics` via email.

## Welfare

**La richiesta è stata segnalata come parzialmente imponibile.** Il cumulo dell'anno nella categoria supera la soglia: l'eccedenza va a payroll come imponibile. Le soglie precaricate sono indicative: HR le verifica per anno.

**Il manager può approvare i rimborsi del team?** No: approva chi ha `welfare:manage`.

## Notifiche e integrazioni

**Ricevo troppe email.** Notifiche → Preferenze: per ogni tipo scegli i canali. Il digest giornaliero non è ancora disponibile.

**Slack non manda messaggi diretti.** Serve il workspace collegato da un amministratore e la tua email Slack uguale a quella della piattaforma (la mappatura è per email).

## Dove chiedere

Per problemi di accesso e configurazione: l'amministratore del tenant. Per regole dei processi: HR. Per anomalie tecniche: chi gestisce il deploy (vedi [`docs/13`](../13-deploy-produzione.md), sezione monitoraggio e smoke test).
