# 07 — UX e design system

## Principi UX

1. **Poche cose, chiare**: ogni ruolo atterra su una dashboard con "cosa devo fare" in cima.
2. **Azioni in 3 clic**: dare feedback, fare un check-in, aggiungere un punto al 1:1 non richiedono di navigare.
3. **Contesto sempre visibile**: durante review e 1:1 il pannello laterale mostra obiettivi, feedback, storico.
4. **Trasparenza sulla visibilità**: ogni contenuto mostra chi lo vede (badge "Solo tu", "Tu e il tuo manager", "Team", "Azienda").
5. **Mobile-first per collaboratori e manager**; le configurazioni HR sono ottimizzate per desktop.
6. **Linguaggio del tenant**: i nomi personalizzati compaiono ovunque.
7. **Stati vuoti che insegnano**: ogni sezione vuota spiega cosa fare e offre un template.
8. **Accessibilità WCAG 2.1 AA**: contrasto, tastiera, screen reader, focus visibile.

## Navigazione (proposta)

```
Home (dashboard di ruolo)
├── Obiettivi        (miei / team / azienda / albero)
├── 1:1              (prossimi / relazioni / azioni)
├── Feedback         (dai / chiedi / ricevuti / riconoscimenti feed)
├── Review           (le mie / da compilare / storico)
├── Sviluppo         (competenze / piano / carriera)
├── Survey           (da compilare / risultati se autorizzato)
├── Persone          (org chart / profili)
└── Amministrazione  (HR: processi, App Studio, analytics, impostazioni, integrazioni)
```

## Componenti chiave

| Componente | Uso |
|---|---|
| Card persona | Foto, nome, ruolo, segnali (obiettivi a rischio, 1:1 in ritardo) |
| Barra progresso con confidenza | KR e obiettivi |
| Albero obiettivi | Vista allineamento |
| Form runner | Rendering dei form dell'App Studio con salvataggio automatico |
| Pannello contesto | Sidebar in review e 1:1 |
| Timeline | Storico persona, onboarding |
| Heatmap | Survey, competenze |
| Radar | 360°, competenze |
| 9-box | Talent review |
| Feed | Riconoscimenti |
| Badge visibilità | Ovunque ci sia contenuto |

## Design system

- Token (colore, tipografia, spaziatura, raggi, ombre) con tema chiaro/scuro e colore primario del tenant.
- Libreria componenti accessibile (base: Radix/Headless + stile proprio) documentata in Storybook.
- Iconografia coerente; illustrazioni per stati vuoti.
- Micro-copy in italiano e inglese, tono diretto e gentile.

## Prototipazione

Prima del codice: wireframe dei flussi P0 (dashboard, obiettivi, check-in, 1:1, compilazione review, feedback) validati con 3–5 utenti target.
