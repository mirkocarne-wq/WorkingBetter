import Link from 'next/link';
import { apiFetch, fmtDate, initials, type Me, type Person, type Relation } from '@/lib/api';
import { createRelation } from '@/lib/actions';

export default async function OneOnOnesPage() {
  const [me, relations, people] = await Promise.all([apiFetch<Me>('/me'), apiFetch<Relation[]>('/one-on-ones'), apiFetch<{ items: Person[] }>('/people?limit=200').then((r) => r.items)]);
  const myId = me.person?.id;
  const known = new Set(relations.map((r) => r.other.id));
  const candidates = people.filter((p) => p.id !== myId && !known.has(p.id));
  const reports = people.filter((p) => p.managerId === myId);
  const nextWeek = new Date(Date.now() + 7 * 86400000);
  nextWeek.setMinutes(0, 0, 0);
  return (
    <>
      <div className="ph"><div><h1>1:1</h1><p>{relations.length} relazioni attive · {relations.filter((r) => r.overdue).length} in ritardo</p></div></div>
      <div className="grid" style={{ gridTemplateColumns: '1.6fr 1fr', alignItems: 'start' }}>
        <div className="card">
          {relations.length === 0 ? <div className="empty">Nessun 1:1 ancora. Crea la prima relazione dal pannello a destra.</div> : (
            <table>
              <thead><tr><th>Persona</th><th>Prossimo incontro</th><th>Ultimo</th><th>Agenda</th><th>Azioni aperte</th></tr></thead>
              <tbody>
                {relations.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/one-on-ones/${r.id}`} className="who"><span className="av s">{initials(r.other)}</span><div><div className="n">{r.other.firstName} {r.other.lastName}</div><div className="r">{r.kind === 'manager_report' ? (r.role === 'lead' ? 'Riporto' : 'Manager') : r.kind} · ogni {r.cadenceDays ?? '—'} gg</div></div></Link></td>
                    <td>{r.nextMeeting ? fmtDate(r.nextMeeting.scheduledAt) : <span className="pill n">Non pianificato</span>}</td>
                    <td>{r.daysSinceLast == null ? '—' : r.overdue ? <span className="pill w"><i />{r.daysSinceLast} gg fa</span> : `${r.daysSinceLast} gg fa`}</td>
                    <td>{r.pendingPoints} punti</td>
                    <td>{r.openActions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h3>Nuovo 1:1</h3>
          <form action={createRelation} style={{ display: 'grid', gap: 10 }}>
            <label>Con<br />
              <select name="otherPersonId" required style={{ width: '100%', padding: 8, border: '1px solid var(--line)', borderRadius: 8 }}>
                {reports.filter((p) => !known.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName} (riporto)</option>)}
                {candidates.filter((p) => p.managerId !== myId).map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}
              </select></label>
            <label>Tipo<br />
              <select name="kind" style={{ width: '100%', padding: 8, border: '1px solid var(--line)', borderRadius: 8 }}>
                <option value="manager_report">Manager – riporto</option><option value="mentoring">Mentoring</option><option value="skip_level">Skip-level</option><option value="peer">Pari</option>
              </select></label>
            <label>Cadenza (giorni)<br /><input name="cadenceDays" type="number" defaultValue={7} min={1} max={90} style={{ width: '100%', padding: 8, border: '1px solid var(--line)', borderRadius: 8 }} /></label>
            <label>Primo incontro<br /><input name="firstMeetingAt" type="datetime-local" defaultValue={nextWeek.toISOString().slice(0, 16)} required style={{ width: '100%', padding: 8, border: '1px solid var(--line)', borderRadius: 8 }} /></label>
            <button className="btn p">Crea</button>
          </form>
          <div className="suggest" style={{ marginTop: 12 }}>Il contenuto dei 1:1 è riservato ai due partecipanti. HR e leadership vedono solo metriche di adozione.</div>
        </div>
      </div>
    </>
  );
}
