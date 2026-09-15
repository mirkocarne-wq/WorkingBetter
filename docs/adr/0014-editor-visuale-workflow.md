# ADR-0014 — Editor visuale del workflow e simulazione «nei panni di» senza libreria di canvas

| | |
|---|---|
| **Stato** | Proposto |
| **Data** | 2026-09-16 |
| **Decisori** | Team prodotto e tecnico |

## Contesto

L'App Studio (ADR-0011) descrive un processo come **sequenza di fasi** con gruppi paralleli, rimandi all'indietro (approvazioni) e instradamenti in avanti (condizioni sulle risposte o sull'esito). Fino allo sprint 24 l'editor era una lista di fasi con moduli strutturati (APP-027 «a lista»): funzionale ma poco leggibile per chi disegna un processo, perché rami, rimandi e fasi parallele non si vedono. La roadmap chiede un **editor visuale** (APP-027) e l'**anteprima nei panni di un attore** (APP-008), e più in generale la parte low-code/no-code deve essere «visibile» e usabile da HR senza formazione.

Le opzioni tipiche sono un canvas libero con drag & drop (React Flow, JointJS, tldraw) oppure un diagramma **auto-disposto** derivato dalla definizione. ADR-0002 vieta di introdurre framework senza una decisione esplicita.

## Decisione

1. **Diagramma auto-disposto, non canvas libero.** La definizione resta la fonte di verità; il diagramma è una *proiezione* calcolata (`layoutWorkflow` in `@wb/shared/apps`): una colonna per passo sequenziale, le fasi dello stesso gruppo parallelo impilate nella stessa colonna, un nodo terminale «Fine». Gli archi sono: sequenza (pieni), instradamenti condizionali con l'etichetta della condizione (in avanti, tratteggiati blu), rimandi delle approvazioni (all'indietro, tratteggiati rossi). Il rendering è **SVG inline** nella web app, senza dipendenze aggiuntive.
2. **Interazione per selezione, non per trascinamento.** Cliccare un nodo apre il pannello della fase (gli stessi moduli strutturati di prima, ora in un pannello laterale); i pulsanti «+» tra le colonne inseriscono una fase in quel punto; l'ordine si cambia con «sposta prima/dopo» nel pannello. Il drag & drop è rimandato: nel modello di ADR-0011 l'ordine è una lista, e spostare un nodo a mano introdurrebbe stati non rappresentabili (posizioni libere, incroci) senza aggiungere espressività.
3. **Simulazione «nei panni di» calcolata dalla definizione** (`simulateActor` in `@wb/shared/apps`): scelto un attore relativo (soggetto, manager, manager del manager, chi avvia, HR) e, facoltativamente, gli esiti delle approvazioni e i valori delle condizioni, la funzione produce la sequenza di ciò che quell'attore fa, vede e riceve (fasi da compilare o decidere, fasi precedenti visibili, notifiche, azioni automatiche che lo riguardano) e il percorso attraversato. Nessuna istanza viene creata: è una funzione pura, testabile, riusata anche dall'anteprima dei template.
4. **Form builder completo sullo stesso schema dichiarativo**: la logica condizionale (`showIf`) e i pesi già esistenti nel motore diventano modificabili dall'interfaccia; si aggiungono i **campi calcolati** (`type: computed`, con `compute: { op: sum | avg | weighted_avg | min | max | count, fields, decimals, scale? }`, valutati dal motore e mostrati in sola lettura) e le **scale riutilizzabili** del tenant (tabella `form_scales`; un campo scala può indicare `scaleKey`, che l'API **risolve e incorpora** alla pubblicazione così che istanze e versioni restino autocontenute, APP-007).

## Alternative considerate

| Alternativa | Pro | Contro |
|---|---|---|
| Canvas libero con React Flow (o simili) | drag & drop familiare, ecosistema ricco | nuova dipendenza pesante (ADR-0002), posizioni da persistere, incroci e layout manuale, non aggiunge espressività al modello sequenziale di ADR-0011 |
| Motore BPMN con editor bpmn-js | standard, potente | complessità sproporzionata per HR; richiederebbe di riscrivere il motore |
| Restare alla lista | nessun lavoro | rami e parallelismi invisibili; è il difetto segnalato |
| Anteprima con istanza «sandbox» reale | fedeltà assoluta | crea dati e notifiche di prova, richiede pulizia; la funzione pura copre il bisogno (capire chi fa cosa) |
| Scale come semplice copia nel form | nessuna tabella | nessun riuso né coerenza tra form; le scale dei tenant cambiano di rado ma devono essere uniformi |

## Conseguenze

- Positive: leggibilità immediata del processo, zero nuove dipendenze, layout deterministico e testabile, la simulazione documenta il processo per chi lo approva.
- Negative: nessuno spostamento libero dei nodi; processi molto lunghi richiedono scorrimento orizzontale (il diagramma va in un contenitore scorrevole).
- Da fare: `layoutWorkflow` e `simulateActor` con test; pagina editor con diagramma + pannello + simulazione; form builder con condizioni, calcolati e scale; API `form-scales`; validazione `formSchema` estesa (campi calcolati che puntano a campi numerici o scale esistenti); documentazione nel manuale operativo (capitolo HR).
- Se in futuro servirà un grafo libero (APP-036/037), la proiezione SVG resta valida come vista di lettura e si potrà valutare un canvas dedicato con una nuova ADR.
