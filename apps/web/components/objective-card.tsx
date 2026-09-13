import { confidenceLabel, pct, type Objective, type Person } from '@/lib/api';
import { CheckInForm } from './check-in-form';

const levelLabel: Record<Objective['level'], string> = { company: 'Azienda', unit: 'Unità', team: 'Team', individual: 'Individuale' };

export function ObjectiveCard({ o, people, canCheckIn }: { o: Objective; people: Map<string, Person>; canCheckIn: boolean }) {
  const owner = o.ownerPersonId ? people.get(o.ownerPersonId) : undefined;
  const conf = o.confidence ? confidenceLabel[o.confidence] : null;
  const barCls = o.confidence === 'off_track' ? 'c' : o.confidence === 'at_risk' ? 'w' : o.confidence === 'on_track' ? 'g' : '';
  return (
    <div className="obj">
      <div>
        <div className="lvl">{levelLabel[o.level]}{o.visibility !== 'public' && <span className="pill n" style={{ marginLeft: 8 }}>{o.visibility === 'private' ? 'Privato' : 'Team'}</span>}</div>
        <div className="t">{o.title}</div>
        <div className="s">{owner ? `${owner.firstName} ${owner.lastName}` : '—'}{o.stale && <span className="pill s" style={{ marginLeft: 8 }}>Check-in in ritardo</span>}</div>
        {o.keyResults.length > 0 && (
          <details style={{ marginTop: 6 }}>
            <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--brand-2)' }}>{o.keyResults.length} key result</summary>
            <table style={{ marginTop: 6 }}>
              <tbody>
                {o.keyResults.map((k) => (
                  <tr key={k.id}>
                    <td>{k.title}</td>
                    <td className="num">{k.currentValue}{k.unit ? ` ${k.unit}` : ''} <span style={{ color: 'var(--muted)' }}>→ {k.targetValue}{k.unit ? ` ${k.unit}` : ''}</span></td>
                    <td className="num">{pct(k.progress)}</td>
                    <td>{canCheckIn && o.status === 'active' ? <CheckInForm kr={k} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </div>
      <div><div className={`bar ${barCls}`}><i style={{ width: `${Math.round((o.progress ?? 0) * 100)}%` }} /></div></div>
      <div className="pct">{pct(o.progress)}</div>
      <div>{conf ? <span className={`pill ${conf.cls}`}><i />{conf.text}</span> : <span className="pill n">{o.status === 'draft' ? 'Bozza' : o.status === 'closed' ? 'Chiuso' : 'Nessun check-in'}</span>}</div>
    </div>
  );
}
