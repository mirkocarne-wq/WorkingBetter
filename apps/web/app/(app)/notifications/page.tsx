import { apiFetch, fmtDate, type Notification, type NotificationPreference } from '@/lib/api';
import { markAllNotificationsRead, markNotificationRead, savePreferences } from '@/lib/actions';

const typeLabel: Record<string, string> = {
  'feedback.received': 'Feedback ricevuto', 'feedback.request.received': 'Richiesta di feedback', 'recognition.received': 'Riconoscimento',
  'one_on_one.scheduled': 'Nuovo 1:1', 'one_on_one.reminder': 'Promemoria 1:1', 'action_item.assigned': 'Azione assegnata', 'action_item.overdue': 'Azione scaduta',
  'objective.check_in_due': 'Check-in in ritardo', 'objective.off_track': 'Obiettivo off track', 'person.invited': 'Invito', 'people.import.completed': 'Import completato', 'form.assigned': 'Form da compilare', system: 'Sistema',
};

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = 'inbox' } = await searchParams;
  const [{ items }, prefs, integrations] = await Promise.all([apiFetch<{ items: Notification[] }>('/notifications?limit=50'), apiFetch<NotificationPreference[]>('/notification-preferences'), apiFetch<{ chatEnabled: boolean }>('/integrations').catch(() => ({ chatEnabled: false }))]);
  const chatEnabled = integrations.chatEnabled;
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <>
      <div className="ph"><div><h1>Notifiche</h1><p>{unread} da leggere · {items.length} recenti</p></div>{unread > 0 && <form action={markAllNotificationsRead}><button className="btn">Segna tutte come lette</button></form>}</div>
      <div className="tabs"><a href="/notifications" className={tab === 'inbox' ? 'on' : ''}>In arrivo</a><a href="/notifications?tab=prefs" className={tab === 'prefs' ? 'on' : ''}>Preferenze</a></div>
      {tab === 'inbox' ? (
        <div className="card">
          {items.length === 0 ? <div className="empty">Nessuna notifica.</div> : items.map((n) => (
            <form key={n.id} action={markNotificationRead.bind(null, n.id, n.link)} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--grid)', alignItems: 'flex-start' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: n.readAt ? 'var(--grid)' : 'var(--brand)', marginTop: 6, flex: 'none' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: n.readAt ? 500 : 700 }}>{n.title}</div>
                <div style={{ color: 'var(--ink2)' }}>{n.body}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{typeLabel[n.type] ?? n.type} · {fmtDate(n.createdAt)}</div>
              </div>
              <button className="btn sm">{n.link ? 'Apri' : 'Segna letta'}</button>
            </form>
          ))}
        </div>
      ) : (
        <div className="card">
          <h3>Canali per tipo di notifica <small>le email partono dal worker; le in-app compaiono qui{chatEnabled ? '; Slack come messaggio diretto' : ''}</small></h3>
          <form action={savePreferences}>
            <input type="hidden" name="hasChat" value={chatEnabled ? '1' : '0'} />
            <table><thead><tr><th>Tipo</th><th>In-app</th><th>Email</th>{chatEnabled && <th>Slack</th>}</tr></thead>
              <tbody>{prefs.map((p) => (
                <tr key={p.type}><td>{typeLabel[p.type] ?? p.type}<input type="hidden" name="type" value={p.type} />{p.isDefault && <span className="pill n" style={{ marginLeft: 8 }}>default</span>}</td>
                  <td><input type="checkbox" name={`inApp:${p.type}`} defaultChecked={p.inApp} /></td><td><input type="checkbox" name={`email:${p.type}`} defaultChecked={p.email} /></td>{chatEnabled && <td><input type="checkbox" name={`chat:${p.type}`} defaultChecked={p.chat} /></td>}</tr>
              ))}</tbody></table>
            <div style={{ marginTop: 12 }}><button className="btn p">Salva preferenze</button></div>
          </form>
        </div>
      )}
    </>
  );
}
