# 9 · Console di piattaforma

La console è lo strumento di chi **gestisce la piattaforma per più organizzazioni**: crea i tenant, invita i loro amministratori, interviene sugli account, controlla lo stato dei servizi e le scadenze dei certificati. È un'applicazione separata dalla web app, pubblicata sulla **porta 8443** e raggiungibile solo dalla rete di gestione o via VPN. I suoi utenti, gli **operatori**, non sono utenti di nessun tenant.

> **Perimetro.** La console vede **conteggi e stati**, mai contenuti: non legge obiettivi, review, feedback, note o risposte alle survey di nessuna organizzazione. Ogni azione è registrata con operatore, data, tenant e indirizzo IP.

## 9.1 Accesso {#accesso}

Email e password dell'operatore. Regole: password di almeno 10 caratteri diversa dall'email; dopo 5 tentativi errati l'account resta bloccato 15 minuti; il cambio password chiude le altre sessioni. Il primo operatore lo crea chi installa la piattaforma; al primo accesso la console chiede di cambiare la password iniziale. La verifica in due passaggi per gli operatori non è ancora disponibile: per questo la console non va esposta su Internet.

## 9.2 Stato {#stato}

La pagina iniziale riassume la salute della piattaforma con semafori e tabelle:

| Riquadro | Cosa mostra | Quando preoccuparsi |
|---|---|---|
| **API** | versione, tempo di attività, ambiente | versione diversa da quella attesa dopo un aggiornamento |
| **Database** | latenza, dimensione, connessioni attive sul massimo, migrazioni applicate e ultima | latenza alta, connessioni vicine al massimo, ultima migrazione più vecchia della versione dell'API |
| **Worker** | ultimo esito per ogni job (promemoria, email, data mart, report, webhook, calendario, chat) con durata | «fermo» (nessun job da due giorni) o un job in errore |
| **Code** | per email, chat, webhook e calendario: consegne in attesa, in errore, età della più vecchia in attesa | in attesa che crescono senza svuotarsi, o in errore diverse da zero |
| **Certificati** | per gli URL pubblici (web, API, console) e per i file configurati: emittente, scadenza, giorni residui | giallo sotto 30 giorni, rosso sotto 7 o scaduto; «errore» se l'URL non risponde in TLS |
| **Utilizzo** | tenant attivi e sospesi, persone, utenti attivi a 7 e 30 giorni, conteggi per modulo, ultimi accessi per giorno | crollo degli accessi dopo un rilascio |

## 9.3 Tenant {#tenant}

**Elenco** con persone, utenti, attivi a 30 giorni, ultimo accesso e stato; ricerca per nome o slug.

**Nuovo tenant**: nome, slug (identificativo di accesso, immutabile), fuso orario, lingua, email e nome del primo amministratore. Alla conferma nascono il tenant, l'unità radice e l'amministratore con ruolo `tenant_admin`; un invito valido 7 giorni parte via email e il **link viene mostrato una sola volta** (utile dove la posta non è configurata). L'amministratore troverà al primo accesso la Guida con i passi di avviamento.

**Dettaglio**: conteggi per modulo, configurazione (SSO, verifica in due passaggi obbligatoria, integrazioni, marchio), amministratori e referenti HR con stato dell'invito, ultimi accessi, eventi della console su quel tenant, **audit** del tenant come elenco di azioni (chi, cosa, quando, su quale tipo di entità) senza i contenuti. Azioni: **Invita** un altro amministratore (o reinvia), modifica di nome, fuso e lingua, **Sospendi** / **Riattiva**.

> **Sospensione.** Blocca login e sessioni di tutti gli utenti del tenant entro 30 secondi, senza cancellare nulla. La riattivazione ripristina l'accesso. Entrambe sono tracciate.

## 9.4 Utenti {#utenti}

Ricerca per email su tutti i tenant (almeno due caratteri): tenant, ruoli, stato (attivo, invitato, bloccato, disattivato), verifica in due passaggi, ultimo accesso, tentativi falliti. Azioni per riga, ciascuna con conferma e registrata negli eventi:

| Azione | Effetto |
|---|---|
| Reset password | genera un link di reset valido 60 minuti e lo invia via email; azzera il blocco; chiude le sessioni aperte |
| Sblocca account | azzera tentativi falliti e blocco temporaneo |
| Revoca sessioni | chiude tutte le sessioni aperte (l'utente deve rientrare) |
| Disattiva / Riattiva | impedisce (o ripristina) l'accesso; la disattivazione chiude le sessioni |
| Disattiva verifica in due passaggi | rimuove il secondo fattore per un utente che ha perso l'app e i codici di recupero; chiude le sessioni |

La console non vede né imposta password: solo link monouso via email.

## 9.5 Log {#log}

- **Eventi della console**: ogni azione degli operatori (accessi, creazione tenant, inviti, reset, sospensioni, gestione operatori) con filtro per azione e tenant.
- **Job del worker**: gli ultimi cento run con esito, durata, riepilogo o errore.
- **Consegne fallite**: email, messaggi chat, webhook ed eventi calendario che hanno esaurito i tentativi, con l'errore restituito.

I log applicativi (l'output di API e worker) non passano dalla console: restano nel sistema di log dell'infrastruttura.

## 9.6 Operatori e account {#operatori}

**Operatori**: elenco con ultimo accesso e stato; creazione con password iniziale (da comunicare su un canale sicuro; l'operatore la cambia al primo accesso); disattivazione e riattivazione (non del proprio account). Tutti gli operatori hanno lo stesso ruolo.

**Il mio account**: cambio password (chiude le altre sessioni).

## 9.7 Cosa fare quando… {#quando}

| Situazione | Azione |
|---|---|
| Un nuovo cliente | Tenant → Nuovo tenant; consegna il link d'invito se l'email non arriva; verifica dopo qualche giorno che l'amministratore abbia fatto accesso |
| Un amministratore tenant è bloccato o ha perso la password | Utenti → cerca l'email → Reset password (o Sblocca) |
| Un amministratore ha perso l'app di autenticazione e i codici | Utenti → Disattiva verifica in due passaggi, dopo averlo identificato con certezza |
| Un cliente cessa o non paga | Tenant → Sospendi (reversibile); la cancellazione dei dati è un'operazione separata dell'infrastruttura |
| Certificato in scadenza | avvisa chi gestisce l'infrastruttura; dopo la sostituzione controlla in Stato che la data sia aggiornata |
| Coda email in errore | Log → Consegne fallite: leggi l'errore (spesso credenziali SMTP o destinatario); risolto il problema, il worker riprende da solo |
| Un operatore lascia il team | Operatori → Disattiva; le sue sessioni si chiudono subito |
