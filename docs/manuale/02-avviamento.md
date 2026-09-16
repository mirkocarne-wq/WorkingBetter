# 2 · Avviamento

L'ordine conta: le persone devono trovare un ambiente già sensato al primo accesso. Il percorso qui sotto è lo stesso della pagina **Guida** dentro l'app, che spunta i passi da sola quando rileva i dati (per esempio «Persone caricate» diventa fatto dopo l'import). La guida si apre dal menu (**Guida**) e dal promemoria in Home.

## Fase A — Amministratore (mezza giornata)

| # | Passo | Perché | Fatto quando |
|---|---|---|---|
| 1 | Nome, lingua, fuso, **marchio** | logo e colore compaiono in email, PDF e pagine esterne | Impostazioni → Aspetto salvato |
| 1b | **Moduli attivi** e, se serve, **glossario** | il menu mostra solo ciò che l'azienda usa, con i nomi di casa | Impostazioni → Personalizzazione |
| 2 | **Unità organizzative** | perimetri di review, calibrazione, survey e report | almeno 2 unità |
| 3 | **Persone** da CSV (con `manager_email`, `org_unit`, `hire_date`; **campi persona** definiti prima, se ne servono) | l'anagrafica guida tutto | almeno 3 persone attive |
| 4 | **Manager** per tutti tranne il vertice | è la regola di visibilità | ≥ 80% con manager |
| 5 | **Referenti HR** (`hr_admin`, `hrbp`) | separare amministrazione tecnica e dati HR | almeno un referente |
| 6 | **Inviti** | crea gli account | almeno una persona ha fatto accesso |
| 7 | **SSO** o **verifica in due passaggi** (e obbligo per ruoli HR/admin) | dati sensibili | SSO attivo o MFA sul tuo utente |
| 8 | Integrazioni calendario/chat (facoltativo) | inviti direttamente nei calendari, riconoscimenti su Slack/Teams | almeno un connettore |
| 9 | **Backup** provato | un backup non provato non è un backup | passo manuale |

Dettagli in [03 · Amministratore](03-amministratore.md).

## Fase B — HR (una o due giornate, poi in continuo)

| # | Passo | Perché | Fatto quando |
|---|---|---|---|
| 1 | **Valori aziendali** | i riconoscimenti si collegano ai valori | almeno un valore attivo |
| 2 | **Periodo obiettivi** con cadenza check-in | gli obiettivi vivono in un periodo | un periodo che comprende oggi |
| 3 | **Questionari di review** pubblicati (manager e, se previsto, self) | i questionari pubblicati sono immutabili: review confrontabili | almeno un form review pubblicato |
| 4 | **Template di review** (visibilità della self-review, firma, scala, catena di approvazione) | fissa le regole HR del processo | almeno un template |
| 5 | **Ciclo di review** lanciato | congela le regole e crea le review | almeno un ciclo lanciato |
| 6 | **Survey** | ascolto anonimo con soglia | almeno una survey lanciata |
| 7 | **Competenze e job profile** | valutazioni confrontabili, 360°, piani | almeno una competenza e un profilo |
| 8 | **Percorso di onboarding** | compiti distribuiti e survey d7/d30 | almeno un template attivo |
| 9 | **Piano welfare** (facoltativo) | soglie fiscali e payroll | almeno un piano |
| 10 | **Processi** (facoltativo) | richieste con approvazioni | almeno un'app pubblicata |
| 11 | **Comunicazione delle regole** alle persone | la fiducia dipende dalla chiarezza | passo manuale |

Dettagli in [04 · HR](04-hr.md); per la comunicazione usa [07 · Regole HR applicate](07-regole-hr.md).

## Fase C — Manager (prima settimana)

1. Verifica il team in Persone (sei tu il manager di chi ti aspetti?).
2. Obiettivi del team: uno per persona, allineati.
3. Relazione **1:1** con ogni riporto, cadenza e durata.
4. Primo incontro concluso nell'app.
5. Primo feedback o riconoscimento.
6. Quando arriva il ciclo: review, approvazioni, calibrazione.

Dettagli in [05 · Manager](05-manager.md).

## Fase D — Collaboratori (prime due settimane)

1. Controlla la tua scheda (manager, unità, ruolo).
2. Primo obiettivo pubblicato e primo check-in.
3. Punti in agenda per il 1:1.
4. Un riconoscimento a un collega; una richiesta di feedback.
5. Preferenze notifiche; verifica in due passaggi.

Dettagli in [06 · Collaboratore](06-collaboratore.md).

## Cosa NON fare all'avvio

- **Non invitare tutti prima di aver caricato manager e unità**: le persone entrerebbero in una piattaforma vuota e i cicli salterebbero chi non ha manager.
- **Non pubblicare un questionario di review «per provare»**: la versione pubblicata è immutabile; usa una bozza e pubblicala solo quando è quella definitiva (una nuova versione è sempre possibile, ma i cicli già lanciati restano sulla vecchia).
- **Non lanciare una survey anonima su un gruppo sotto soglia**: il sistema la rifiuta, ma è meglio saperlo prima di comunicare le date.
- **Non dare `tenant_admin` a chi deve solo gestire le review**: bastano `hrbp` o `hr_admin`.

## Ambiente di prova

L'ambiente dimostrativo (azienda «Acme S.p.A.», che chi gestisce la piattaforma può attivare seguendo [`docs/12`](../12-ambiente-test-docker.md)) contiene tutti i moduli popolati e le utenze `anna.colombo` (tenant admin), `chiara.moretti` (HR admin), `giulia.ferri` e `paolo.neri` (manager), `luca.bianchi` e altri (collaboratori), password `Password!2026`. È il modo più rapido per fare formazione prima di caricare i dati reali.
