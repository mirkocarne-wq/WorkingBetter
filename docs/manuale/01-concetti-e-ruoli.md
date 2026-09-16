# 1 · Concetti e ruoli

## Tenant, persone, utenti

- Il **tenant** è l'azienda. Ogni dato vive dentro un tenant e il database impedisce fisicamente di leggere dati di un altro tenant (isolamento a livello di riga, vedi [Regole HR §7.1](07-regole-hr.md#71-isolamento-dei-dati)).
- La **persona** è la scheda anagrafica: nome, email, ruolo, unità organizzativa, **manager**, data di assunzione, stato (`active`, `invited`, `leaving`, `suspended`, `terminated`). Le persone entrano nei cicli di review, nelle survey, nell'onboarding anche senza aver mai fatto login.
- L'**utente** è l'account che accede: è collegato a una persona e porta i **ruoli**. Una persona senza utente esiste ma non può compilare nulla; l'invito crea l'utente ([Amministratore §3.4](03-amministratore.md#inviti)).
- L'**unità organizzativa** è un nodo dell'organigramma (direzione, area, team) con eventuale codice; le unità hanno una gerarchia e i perimetri «con sotto-unità» la seguono.

## La linea gerarchica è la regola di visibilità

Quasi tutte le regole «chi vede cosa» derivano dal campo **manager** della persona:

| Chi | Vede | Non vede |
|---|---|---|
| **Manager** | obiettivi, review, valutazioni di sviluppo, onboarding e feedback *condivisi* dei **riporti diretti** | i riporti dei propri riporti (salvo dove indicato: skip-level nei 1:1, approvazioni come «manager del manager») |
| **HR** (HR admin, HRBP) | tutto il tenant nei moduli che amministra, incluse le valutazioni di potenziale | risposte individuali delle survey anonime, note private dei 1:1 |
| **Collaboratore** | i propri dati, gli obiettivi pubblici, i riconoscimenti pubblici, la review del manager **solo dopo la condivisione** | valutazioni di potenziale, storico delle calibrazioni, feedback che altri non hanno condiviso |

Chi non ha manager (tipicamente il vertice) viene **saltato dai cicli di review** e segnalato in anteprima: l'amministratore deve tenere la linea gerarchica completa.

## Ruoli e permessi

I ruoli sono cumulativi: ogni ruolo include tutto quello del precedente. I permessi derivano dai ruoli assegnati in **Persone → Utenti e accessi** e guidano menu e pulsanti.

| Ruolo | In più rispetto al precedente | Chi dovrebbe averlo |
|---|---|---|
| **employee** (collaboratore) | leggere persone e organigramma; obiettivi propri; 1:1; feedback; notifiche; compilare form, review, survey; welfare; sviluppo; 360°; onboarding; avviare processi per sé | tutti |
| **manager** | obiettivi del team; metriche 1:1; feedback condivisi dei riporti; report del team; risultati survey dei riporti (aggregati); sviluppo, 360° e onboarding del team | chi ha riporti diretti |
| **hrbp** | anagrafica e organigramma in scrittura; obiettivi di chiunque; report su tutto il tenant; import CSV; **gestione review** (cicli, calibrazione, correzioni) | HR business partner |
| **hr_admin** | periodi obiettivi; obiettivi aziendali; ruoli e inviti; moderazione feedback; valori aziendali; form; survey; welfare e payroll; sviluppo; 360°; onboarding; processi | chi governa i processi HR |
| **tenant_admin** | impostazioni del tenant: marchio, SSO, politiche di sicurezza, integrazioni | pochissime persone (IT / responsabile piattaforma) |
| **observer** / **analyst** | sola lettura di persone, organigramma, obiettivi e report; metriche 1:1 | direzione, controllo di gestione |

Regola pratica: **HRBP** vede e fa quasi tutto sulle persone, ma non cambia le regole del gioco (template, form, valori, ruoli): quelle sono di **HR admin**. `tenant_admin` è separato apposta: chi gestisce SSO e integrazioni non ha bisogno di leggere le review, e viceversa. Nel codice «HR» significa chi ha il permesso `reviews:manage` (hrbp, hr_admin, tenant_admin), definito in `packages/shared/src/auth/roles.ts`.

I ruoli predefiniti sono il punto di partenza: l'amministratore può **ritoccare i permessi di ciascuno per modulo** e definire **ruoli custom** sopra un ruolo base (vedi [03 · Amministratore](03-amministratore.md#ruoli)).

## I moduli in una frase

| Modulo | Serve a | Chi lo governa |
|---|---|---|
| Obiettivi (OKR) | dichiarare risultati misurabili per periodo e aggiornarli con check-in | HR crea i periodi; manager e persone gli obiettivi |
| 1:1 | incontri ricorrenti manager–persona con agenda, note, azioni | manager e persona |
| Feedback e riconoscimenti | feedback privato «a scelta di chi lo riceve» e riconoscimenti pubblici legati ai valori | tutti; HR modera |
| Review | valutazione periodica: self-review, manager review, approvazioni, calibrazione, condivisione, firma | HR lancia; manager scrive; persona firma |
| Survey e pulse | ascolto anonimo con soglia minima per gruppo | HR |
| Feedback 360° | raccolta strutturata da più fonti con anonimato per categoria | HR lancia; persona nomina; manager approva |
| Sviluppo e carriera | competenze, job profile, gap, piani di sviluppo, potenziale e 9-box | HR imposta; manager valuta |
| Onboarding | percorsi con compiti per HR, manager, buddy, IT e per la persona; pre-boarding esterno | HR |
| Welfare | piani, budget per persona, catalogo, rimborsi, soglie fiscali, export payroll | HR admin e payroll |
| Processi (App Studio) | richieste e workflow senza codice: form, approvazioni, azioni automatiche | HR admin crea; tutti avviano se abilitati |
| Report | metriche aggregate con soppressione dei gruppi piccoli, report salvati e programmati | HR e analisti; manager sul proprio team |
| Integrazioni | calendario Google/Microsoft, Slack/Teams, feed calendario ICS, email | tenant_admin configura; ognuno collega il proprio account |

## Un anno tipo

Il calendario è una scelta organizzativa; questo è un esempio coerente con i vincoli del prodotto (la review usa gli obiettivi del periodo scelto; la calibrazione precede la condivisione).

| Quando | Cosa | Dove |
|---|---|---|
| Inizio anno / trimestre | HR apre il **periodo obiettivi** con la cadenza dei check-in; direzione pubblica gli obiettivi aziendali; team e persone allineano i propri | Obiettivi |
| Sempre | 1:1 ogni 1–2 settimane; feedback e riconoscimenti | 1:1, Feedback |
| Metà periodo | **pulse** breve (5 domande a rotazione + eNPS) | Survey |
| Fine periodo | HR lancia il **ciclo di review**: self-review (14 giorni), manager review (21 giorni), eventuali **approvazioni**, **calibrazione** per unità, condivisione, colloquio, firma | Review |
| Dopo la review | piani di sviluppo aggiornati sui gap; 9-box per HR e direzione | Sviluppo |
| Una o due volte l'anno | **survey di engagement** (14 domande, 7 driver) e, per ruoli chiave, **360°** | Survey, Feedback 360° |
| Anno fiscale | piano **welfare**: budget, finestra di conversione del premio, export payroll mensile | Welfare |
| A ogni ingresso | percorso di **onboarding** (pre-boarding, prima settimana, primo mese, 60/90 giorni) | Onboarding |
