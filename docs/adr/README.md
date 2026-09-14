# Architecture Decision Records

Indice delle ADR con lo stato. Le ADR *Proposte* sono implementate nel codice ma attendono la validazione esplicita del prodotto (regola 3 di `CLAUDE.md`); la tabella di `docs/14 §1` riassume cosa cambierebbe se venissero rifiutate.

| ADR | Titolo | Stato |
|---|---|---|
| [0001](0001-adozione-adr.md) | Adozione degli Architecture Decision Records | Accettato |
| [0002](0002-stack-tecnologico.md) | Stack tecnologico | Accettato |
| [0003](0003-multi-tenancy.md) | Strategia multi-tenant | Accettato |
| [0004](0004-architettura-reportistica.md) | Architettura della reportistica | Accettato |
| [0005](0005-strategia-api.md) | Strategia API per web, mobile e connettori | Accettato |
| [0006](0006-semantic-layer-v1.md) | Semantic layer v1: catalogo metriche dichiarativo e fatti giornalieri a grana persona | Proposto |
| [0007](0007-autenticazione.md) | Autenticazione: l'API emette le sessioni; password locale e SSO OIDC per tenant | Proposto |
| [0008](0008-welfare-conto-ledger.md) | Welfare: conto come registro contabile append-only, soglie fiscali configurate per anno, payroll a lotti | Proposto |
| [0009](0009-contratto-openapi-e-client-generato.md) | Contratto OpenAPI derivato dagli schemi Zod e client generato | Proposto |
| [0010](0010-calendario-ics-prima-di-oauth.md) | Calendario: feed iCalendar e inviti .ics prima dei connettori OAuth | Proposto |
| [0011](0011-workflow-engine-dichiarativo.md) | Workflow engine dichiarativo per le app custom (App Studio L2) | Proposto |
| [0012](0012-connettori-esterni.md) | Connettori esterni: OAuth per calendari (Google, Microsoft 365) e chat (Slack, Teams) | Proposto |
| [0013](0013-console-di-piattaforma.md) | Console di piattaforma: app separata su porta 8443, identità di piattaforma distinta dai tenant | Proposto |

Per validarne una: cambiare lo stato in **Accettato** nell'intestazione, aggiungere la data e, se serve, una nota «Conseguenze osservate». Per rifiutarla: stato **Rifiutato** con la decisione sostitutiva in una nuova ADR.
