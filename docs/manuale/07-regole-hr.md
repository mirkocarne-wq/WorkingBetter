# 7 · Regole HR applicate dal software

Questo capitolo elenca le **garanzie** che la piattaforma impone da sola. Per ciascuna: cosa garantisce, dove si applica, se e come si configura, dove sta nel codice. È il materiale da usare per comunicare alle persone come funziona il sistema e per rispondere a un audit interno o a una richiesta del DPO.

Legenda: **fissa** = non modificabile dall'interfaccia; **impostazione** = parametro configurabile con il valore predefinito indicato.

## 7.1 Isolamento dei dati e accesso

| Regola | Dove | Parametro | Riferimento |
|---|---|---|---|
| Ogni riga di ogni tabella appartiene a un tenant; il database rifiuta letture e scritture fuori dal tenant della sessione (Row Level Security), anche in caso di errore applicativo | tutto | fissa | `packages/db/src/tenant.ts`, migrazioni `*_rls*.sql`, test `packages/db/src/rls.test.ts` |
| Ogni endpoint richiede un permesso esplicito; i permessi derivano dai ruoli cumulativi | tutto | ruoli assegnati da `hr_admin`/`tenant_admin` | `packages/shared/src/auth/roles.ts` |
| La visibilità «di team» vale per i **riporti diretti** in anagrafica | obiettivi, feedback, review, sviluppo, onboarding, report, survey | manager della persona | vari servizi (`managerId`) |
| Blocco dell'account per 15 minuti dopo 5 tentativi errati; limiti per IP su login e recupero | accesso | fissa | `apps/api/src/auth/auth.service.ts` |
| Verifica in due passaggi TOTP con codici di recupero monouso; obbligo per ruolo | accesso | impostazione (`mfaRequiredRoles`) | `apps/api/src/auth/mfa.service.ts` |
| SSO OIDC con PKCE, provisioning automatico opzionale, domini ammessi | accesso | impostazione tenant | `apps/api/src/auth/auth.service.ts` |
| Revoca di tutte le sessioni al cambio/reset password, alla disattivazione, su richiesta | accesso | fissa | `users.sessions_revoked_at` |
| Inviti monouso validi 7 giorni; reset password valido 60 minuti | accesso | fissa | `apps/api/src/core/users.service.ts` |

## 7.2 Tracciabilità

| Regola | Dove | Parametro | Riferimento |
|---|---|---|---|
| Ogni scrittura rilevante produce una riga di audit append-only (chi, cosa, prima/dopo, IP, richiesta) nella stessa transazione | tutti i moduli | fissa | `apps/api/src/audit/audit.service.ts` |
| Ogni modifica di rating (correzione HR o calibrazione) richiede una motivazione e resta nello storico della review | review | fissa | `review_rating_changes` |
| Ogni decisione di un processo (approvazione, rifiuto, azione automatica, webhook) è nel log dell'istanza | processi, review, onboarding | fissa | `app_instance_events` |
| Export CSV/PDF tracciati con chi e quando | report, review, 360° | fissa | audit `analytics.export`, `review.export_pdf`, `f360.export_pdf` |
| **Non ancora disponibile**: consultazione dell'audit dall'interfaccia, retention configurabile, export dei dati personali su richiesta, anonimizzazione automatica | — | roadmap CORE-051/052/053 | [`docs/06`](../06-sicurezza-e-compliance.md) |

## 7.3 Riservatezza dei contenuti

| Regola | Dove | Parametro | Riferimento |
|---|---|---|---|
| Le note private dei 1:1 sono cifrate (AES-256-GCM, chiave derivata per tenant) e leggibili solo dall'autore | 1:1 | fissa (richiede `NOTES_MASTER_KEY`) | `packages/connectors/src/cipher.ts`, `one-on-one.service.ts` |
| Segreti SSO, segreti dei connettori e token OAuth cifrati con la stessa chiave; mai restituiti dall'API | impostazioni, integrazioni | fissa | idem |
| HR vede dei 1:1 solo aggregati (copertura), mai agenda o note | 1:1 | fissa | `one-on-one.service.ts` (metriche) |
| Il potenziale (talento) non è mai restituito alla persona; il self non può impostarlo | sviluppo, calibrazione | fissa | `development.service.ts` |
| La nota di debrief del 360° non arriva mai al soggetto | 360° | fissa | `f360.service.ts` |
| Il feedback è visibile al manager solo se chi lo riceve lo condivide o lo mette in fascicolo (eccetto risposte a richieste del manager) | feedback | scelta della persona | `feedback.service.ts` |

## 7.4 Anonimato e soppressione statistica

| Regola | Dove | Parametro | Riferimento |
|---|---|---|---|
| Survey anonime: inviti e risposte in tabelle separate; la risposta non ha identità, solo il segmento; nessun audit sulla risposta | survey | fissa | `survey_invitations`, `survey_responses` |
| Soglia di anonimato per survey; lancio rifiutato sotto soglia; risultati e heatmap soppressi per gruppo sotto soglia; protezione per differenza | survey | impostazione **5** (3–50), non modificabile dopo il lancio | `apps/api/src/surveys/dto.ts`, `packages/shared/src/surveys/results.ts` |
| I manager vedono solo l'aggregato dei riporti diretti, senza commenti né confronto storico | survey | fissa | `surveys.service.ts` |
| 360°: categorie anonime sotto soglia accorpate in «Altri» e, se ancora sotto, nascoste; commenti rimescolati; risposte anonime salvate senza collegamento alla richiesta | 360° | impostazione **3** (2–10) | `apps/api/src/f360/`, `packages/shared/src/f360/report.ts` |
| Report: gruppi sotto 3 persone soppressi; metriche sensibili (rating medio, dissensi) sotto 5 e mai a grana persona; protezione per differenza; celle rese come `n<3` negli export | report | fissa nel catalogo | `packages/shared/src/analytics/engine.ts` |
| Survey di onboarding **nominali** (7/30/90 giorni, uscita): servono a intervenire, non a misurare il clima | onboarding | fissa | `onboardingSurveyScore` |

## 7.5 Processo di review

| Regola | Dove | Parametro | Riferimento |
|---|---|---|---|
| La persona vede la manager review **solo dopo la condivisione**; prima non vede testo, rating né storico | review | fissa | `reviews.service.ts` (`flags`) |
| Il manager vede la self-review secondo la regola del template | review | impostazione: dopo l'invio (predefinita), subito, mai | template `managerSeesSelf` |
| Al lancio le regole del template sono congelate nel ciclo | review | fissa | `templateSnapshot` |
| Chi non ha manager non entra nel ciclo ed è segnalato in anteprima | review | fissa | `previewPopulation` |
| Questionari pubblicati immutabili; nuova versione per cambiare | form | fissa | `forms.service.ts` |
| Solleciti manuali al massimo uno al giorno per review; promemoria automatici a 2 giorni e alla scadenza | review | fissa | `dedupeKey` con data |
| Catena di approvazione: fino a 4 passi; rimando con commento obbligatorio; riparte dal primo passo; HR può decidere al posto dell'approvatore | review | impostazione nel template | `approve()` |
| Calibrazione: entrano solo review con manager review inviata; niente condivisione a sessione aperta; motivazione obbligatoria per ogni modifica; outlier a ±0,75 punti; blocco da HR o facilitatore, riapertura solo HR | review | impostazione: perimetro, partecipanti, distribuzione attesa | `calibration.service.ts` |
| Firma = presa visione, con possibilità di dissenso e commento; il dissenso è notificato al manager e resta agli atti | review | impostazione: firma richiesta (predefinita sì) | `sign()` |
| La riapertura di una fase azzera condivisione, firma e rating, ma conserva le risposte come bozza | review | fissa | `reopen()` |
| PDF filtrato dalla visibilità di chi lo chiede | review, 360° | fissa | `pdf()` |

## 7.6 Obiettivi, 1:1, feedback

| Regola | Dove | Parametro | Riferimento |
|---|---|---|---|
| Progresso = media dei risultati chiave (pesata se ci sono pesi); confidenza = la peggiore | obiettivi | fissa | `packages/shared/src/okr/progress.ts` |
| Obiettivo «in ritardo» oltre la cadenza dei check-in del periodo; notifica al manager su off track (una al giorno) | obiettivi | impostazione: cadenza (predefinita 7 giorni) | `cycles.checkInCadenceDays` |
| Solo le bozze si eliminano; il resto si chiude con esito | obiettivi | fissa | `objectives.service.ts` |
| Relazione manager–riporto solo con linea gerarchica diretta; punti non discussi riportati al prossimo incontro; incontro in ritardo oltre 1,5 volte la cadenza | 1:1 | impostazione: cadenza, durata | `one-on-one.service.ts` |
| Riconoscimenti pubblici, moderabili da HR con audit; feedback mai anonimo | feedback | fissa | `feedback.service.ts` |

## 7.7 Welfare

| Regola | Dove | Parametro | Riferimento |
|---|---|---|---|
| Conto append-only; disponibile = saldo − impegnato; pro-rata all'ingresso | welfare | fissa | `packages/shared/src/welfare/logic.ts` |
| Categorie fiscali con soglie per anno; eccedenza segnalata come imponibile; avviso all'80% | welfare | impostazione: soglie per anno (**valori precaricati indicativi, da verificare**) | `welfare_thresholds`, `presets.ts` |
| Approvazione delle richieste da HR (`welfare:manage`); il manager non vede il welfare dei riporti | welfare | fissa | `welfare.service.ts` |
| Conversione del premio: scelta unica nella finestra, presa visione del regolamento obbligatoria | welfare | impostazione: finestra, percentuali | `welfare/dto.ts` |
| Export payroll con permesso dedicato; conferma del lotto rende le richieste «pagate» | welfare | fissa | `welfare:payroll` |

## 7.8 Cosa resta una scelta organizzativa

Il software non decide al posto vostro: calendario dei cicli, scala di rating e sue etichette, distribuzione attesa in calibrazione, chi partecipa alle sessioni, soglia di anonimato (entro i limiti), regola di visibilità della self-review, catena di approvazione, cadenza di 1:1 e check-in, valori aziendali, categorie welfare abilitate. Il capitolo [4 · HR](04-hr.md) indica per ciascuna il predefinito e il punto in cui si cambia; la guida in app ricorda di **comunicare le regole scelte** alle persone prima del primo ciclo.
