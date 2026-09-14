import { fmtDate, calendarKindLabel, type CalendarFeed } from '@/lib/api';
import { disableCalendarFeed, rotateCalendarFeed } from '@/lib/actions';
import { Button, Pill } from '@/components/ui';

/** Feed iCalendar personale (INT-022): URL segreto da sottoscrivere in Google Calendar, Outlook o Apple Calendar. */
export function CalendarCard({ feed }: { feed: CalendarFeed }) {
  return (
    <div className="card">
      <h3>Calendario <small>{feed.enabled ? 'feed attivo' : 'feed non attivo'}</small></h3>
      <p className="sup" style={{ marginTop: -6 }}>Un indirizzo iCalendar personale, in sola lettura, con i tuoi 1:1, le scadenze delle review, la chiusura delle survey e le azioni in scadenza. Contiene solo titoli e date: niente note né contenuti. I 1:1 arrivano comunque anche come invito via email.</p>
      {feed.enabled && feed.url ? (
        <div className="stack">
          <label className="field"><span className="lab">Indirizzo del feed (segreto: non condividerlo)</span><input readOnly value={feed.url} className="input" onFocus={undefined} /></label>
          <details><summary className="sup" style={{ cursor: 'pointer' }}>Come sottoscriverlo</summary>
            <ul style={{ fontSize: 13, margin: '6px 0 0', paddingLeft: 18 }}>
              <li><b>Google Calendar</b>: Altri calendari → ＋ → <i>Da URL</i> → incolla l’indirizzo.</li>
              <li><b>Outlook / Microsoft 365</b>: Aggiungi calendario → <i>Sottoscrivi dal Web</i>.</li>
              <li><b>Apple Calendar</b>: File → <i>Nuova sottoscrizione calendario</i>.</li>
              <li>I client aggiornano il feed ogni 1–24 ore: le modifiche non sono istantanee.</li>
            </ul>
          </details>
          <div className="row">
            <form action={rotateCalendarFeed}><Button size="sm">Rigenera indirizzo</Button></form>
            <form action={disableCalendarFeed}><Button size="sm" variant="danger">Disattiva</Button></form>
          </div>
        </div>
      ) : (
        <form action={rotateCalendarFeed}><Button variant="primary">Attiva il feed del calendario</Button></form>
      )}
      <h4 style={{ margin: '16px 0 6px', fontSize: 13 }}>Prossimi eventi <span className="sup">({feed.upcoming.length})</span></h4>
      {feed.upcoming.length === 0 ? <div className="sup">Nessun evento nei prossimi mesi.</div> : (
        <div>
          {feed.upcoming.slice(0, 8).map((e) => (
            <div key={e.uid} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--grid)', fontSize: 13 }}>
              <Pill tone={e.kind === 'meeting' ? 'b' : e.kind === 'action_due' ? 'w' : 'n'}>{calendarKindLabel[e.kind]}</Pill>
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.url ? <a href={e.url} style={{ color: 'inherit' }}>{e.title}</a> : e.title}</span>
              <span className="sup" style={{ whiteSpace: 'nowrap' }}>{e.allDay ? fmtDate(e.start.slice(0, 10)) : fmtDate(e.start)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
