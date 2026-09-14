# ADR-0012 — Connettori esterni: OAuth per calendari (Google, Microsoft 365) e chat (Slack, Teams)

| | |
|---|---|
| **Stato** | Proposto |
| **Data** | 2026-09-14 |
| **Decisori** | team prodotto/tech |
| **Collegate** | ADR-0002 (stack), ADR-0003 (multi-tenant), ADR-0010 (calendario: prima feed e inviti .ics), specifica INT §3.2–3.3 |

## Contesto

Feed iCalendar e inviti .ics (ADR-0010) coprono il caso base senza registrare app presso Google o Microsoft. I clienti chiedono ora il passo successivo: l'evento del 1:1 creato **nel** calendario della persona con link videocall (INT-020/021), le notifiche personali in Slack (INT-010/014), il canale dei riconoscimenti in Slack o Teams (INT-012). Serve decidere dove vivono credenziali e token, chi parla con i provider e come si gestiscono errori e ritentativi senza rallentare le richieste dell'API.

## Decisione

1. **Un'app OAuth per tenant, credenziali cifrate nelle impostazioni.** Come per l'SSO, l'amministratore registra l'applicazione presso il provider (Google Cloud, Entra ID, Slack) e inserisce `clientId` e `clientSecret` in Impostazioni → Integrazioni; il segreto è cifrato con la chiave per tenant (`TenantCipher`, HKDF dalla master key) e non è mai restituito dall'API. Microsoft Teams, in questa fase, usa un **incoming webhook** di canale (nessuna app da pubblicare). Gli endpoint dei provider sono sovrascrivibili nelle impostazioni (proxy aziendali, test).
2. **Connessioni personali per i calendari, connessione di workspace per Slack.** `connector_accounts` tiene per ogni utente il collegamento Google o Microsoft (token cifrati, scadenza, refresh) e per il tenant l'installazione Slack (bot token). Il flusso è authorization code con PKCE e uno *state* firmato (stessa `TokensService` dell'SSO); il callback è pubblico con rate limit e rimanda alla web app.
3. **L'API accoda, il worker consegna.** Le operazioni verso i provider non avvengono nella transazione della richiesta: la creazione, riprogrammazione o annullamento di un 1:1 scrive una riga in `calendar_event_links` per ogni partecipante collegato; una notifica con canale chat scrive in `chat_outbox`; i riconoscimenti con canale configurato pure. I job del worker `calendar-sync` e `chat-dispatch` eseguono le chiamate con ritentativi e backoff (come email e webhook), rinfrescano i token scaduti e registrano gli errori sull'account (`status: error`) così l'utente vede cosa ricollegare.
4. **Codice condiviso in `@wb/connectors`**, pacchetto node-only (cifratura, client dei provider, sync calendario, dispatch chat) usato da API e worker; nessun SDK dei vendor, solo `fetch` iniettabile (i test usano server HTTP locali).
5. **Mappatura utenti Slack per email**, risolta la prima volta che serve (`users.lookupByEmail`) e memorizzata in `connector_accounts`; nessuna mappatura manuale.

## Conseguenze

- INT-020 (scrittura eventi) e INT-021 (link Meet/Teams richiesto al provider) sono coperti; la lettura della disponibilità (slot con calendario esterno, INT-024) è un passo successivo che riusa gli stessi token.
- INT-010 è coperto per le notifiche personali in Slack (senza azioni rapide), INT-012 per Slack e Teams, INT-014 per la mappatura via email. Le notifiche personali in Teams richiedono un'app Teams con permessi Graph applicativi: rinviate.
- Il worker ha bisogno della master key (`NOTES_MASTER_KEY`) per decifrare i token: senza chiave i connettori restano disabilitati e le code segnalano l'errore.
- Limiti accettati: un'app OAuth per tenant (non una app «WorkingBetter» pubblicata sui marketplace), nessun comando slash, nessuna azione nei messaggi, nessuna firma dei webhook Teams (URL segreto).

## Alternative considerate

- **App OAuth di piattaforma** (una sola, di WorkingBetter): meno lavoro per il cliente ma richiede la verifica dell'app da parte di Google/Microsoft/Slack e la gestione dei segreti fuori dal tenant; possibile evoluzione senza cambiare il modello dati.
- **Chiamate sincrone dai servizi**: più immediate, ma legano la latenza dell'API ai provider e complicano i ritentativi; scartate.
- **SDK ufficiali** (googleapis, @microsoft/microsoft-graph-client, @slack/web-api): pesanti e con superfici enormi per le poche chiamate necessarie; scartati a favore di `fetch`.
