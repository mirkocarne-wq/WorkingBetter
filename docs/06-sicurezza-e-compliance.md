# 06 — Sicurezza e compliance

## Principi

- **Privacy by design e by default** (GDPR art. 25): visibilità minima necessaria, anonimato garantito a livello di schema, retention definita.
- **Isolamento tenant** su due livelli: filtro applicativo + Row-Level Security in PostgreSQL.
- **Minimo privilegio**: RBAC con perimetri; ruoli tecnici separati per app, job e migrazioni.
- **Tracciabilità**: audit log append-only per ogni scrittura e accesso a dati sensibili.
- **Residenza dati UE**; sub-processor documentati.

## Controlli

| Area | Controllo |
|---|---|
| Autenticazione | SSO OIDC per tenant (PKCE) e, in seguito, SAML; password con hashing scrypt (formato autodescrittivo, migrabile ad Argon2id) e policy minima; blocco temporaneo dopo 5 tentativi; link monouso con hash in database per inviti e reset; sessioni JWT emesse dall'API (ADR-0007); MFA opzionale (TOTP) e sessioni revocabili in Fase 2 |
| Autorizzazione | Policy centralizzata (ruolo × permesso × perimetro) valutata server-side; test automatici della matrice RBAC |
| Dati a riposo | Cifratura storage e DB; note private 1:1 cifrate a livello applicativo con chiave per tenant (KMS) |
| Dati in transito | TLS 1.2+; HSTS |
| Segreti | Gestiti da secret manager; mai in repository |
| Input | Validazione schema su ogni endpoint; protezione XSS/CSRF/SQLi; upload con scansione e limiti |
| Logging | Log strutturati senza dati personali in chiaro; correlazione per tenant e richiesta |
| Backup | Giornalieri cifrati, PITR, test di restore |
| Dipendenze | Scansione vulnerabilità in CI; aggiornamenti periodici |
| Sviluppo | Code review obbligatoria; test di sicurezza automatici; penetration test annuale |

## GDPR

| Diritto / obbligo | Come lo copriamo |
|---|---|
| Informativa | Testi configurabili per tenant mostrati al primo accesso |
| Accesso e portabilità (art. 15, 20) | Export dati persona in formato leggibile (CORE-052) |
| Rettifica | Modifica dati anagrafici da HR; campi self-service |
| Cancellazione (art. 17) | Job di anonimizzazione: i dati aggregati restano, gli identificativi vengono rimossi (CORE-053) |
| Limitazione | Stato "sospeso" per la persona |
| Retention | Policy per tenant per tipo di dato (es. review 5 anni dopo cessazione, survey aggregate senza limite, feedback 3 anni) |
| Registro trattamenti | Censimento tabelle con dati personali in `docs/04` |
| DPA e sub-processor | Documento contrattuale + elenco pubblico |
| DPIA | Prevista per: analisi AI dei commenti, indicatori di rischio persona |
| Data breach | Procedura con notifica entro 72 h |

## Anonimato: garanzie tecniche

- Survey anonime: nessuna relazione tra invito e risposta nel DB; i promemoria usano token cieco.
- Soglia minima (default 5 survey, 3 per categoria 360°) applicata in query e negli export.
- Protezione dalla ricostruzione per differenza: i segmenti derivabili per sottrazione vengono soppressi.
- Nessun ruolo, incluso Super Admin, ha un endpoint per risposte individuali anonime.

## AI (quando introdotta)

- Opt-in per tenant; informativa esplicita.
- Nessun addestramento sui dati dei clienti.
- Funzioni AI mai decisionali (suggeriscono, non valutano); output sempre modificabile dall'umano.
- DPIA e log delle chiamate.

## Certificazioni (roadmap)

ISO 27001 e SOC 2 Type II come obiettivi post-lancio; nel frattempo questionari di sicurezza standard (CAIQ) compilati.
