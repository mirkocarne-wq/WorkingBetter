import { confidenceLabel, pct, type Objective, type Person } from '@/lib/api';
import { Avatar, Pill } from './ui';
import { Icon } from './icons';
import { CheckInForm } from './check-in-form';

const levelLabel: Record<Objective['level'], string> = { company: 'Azienda', unit: 'Unità', team: 'Team', individual: 'Individuale' };

export function ObjectiveCard({ o, people, canCheckIn, meId, open }: { o: Objective; people: Map<string, Person>; canCheckIn: boolean; meId?: string | null; open?: boolean }) {
  const owner = o.ownerPersonId ? people.get(o.ownerPersonId) : undefined;
  const conf = o.confidence ? confidenceLabel[o.confidence] : null;
  const barCls = o.confidence === 'off_track' ? 'c' : o.confidence === 'at_risk' ? 'w' : o.confidence === 'on_track' ? 'g' : '';
  const mine = !!meId && o.ownerPersonId === meId;
  return (
    <div className="obj">
      <div style={{ minWidth: 0 }}>
        <div className="lvl">{levelLabel[o.level]}{mine && <Pill tone="b">tuo</Pill>}{o.visibility !== 'public' && <Pill>{o.visibility === 'private' ? 'privato' : 'team'}</Pill>}</div>
        <div className="t">{o.title}</div>
        <div className="s">
          {owner ? <span className="row" style={{ gap: 6 }}><Avatar person={owner} small />{owner.firstName} {owner.lastName}</span> : <span>{o.level === 'company' ? 'Azienda' : '—'}</span>}
          {o.stale && <Pill tone="c" dot>Check-in in ritardo</Pill>}
        </div>
        {o.keyResults.length > 0 && (
          <details style={{ marginTop: 8 }} open={open || (mine && o.status === 'active')}>
            <summary><span className="row" style={{ gap: 4, display: 'inline-flex' }}><Icon name="chev" size={12} stroke={2.2} />{o.keyResults.length} key result</span></summary>
            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
              {o.keyResults.map((k) => (
                <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg)', border: '1px solid var(--grid)', borderRadius: 10, padding: '9px 12px', flexWrap: 'wrap' }}>
                  <span className="lvl" style={{ letterSpacing: '.05em' }}>KR</span>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ fontWeight: 500, fontSize: 13.5 }}>{k.title}</div>
                    <div className="sup">da {k.startValue}{k.unit ? ` ${k.unit}` : ''} a {k.targetValue}{k.unit ? ` ${k.unit}` : ''} · ora {k.currentValue}{k.unit ? ` ${k.unit}` : ''}{k.lastCheckInAt ? ` · ultimo check-in ${k.lastCheckInAt}` : ' · nessun check-in'}</div>
                  </div>
                  <div className="row" style={{ flexWrap: 'nowrap', gap: 10 }}>
                    <div className={`bar ${barCls}`} style={{ width: 120 }}><i style={{ width: `${Math.round((k.progress ?? 0) * 100)}%` }} /></div>
                    <span className="pct" style={{ width: 40 }}>{pct(k.progress)}</span>
                  </div>
                  {canCheckIn && o.status === 'active' ? <CheckInForm kr={k} /> : null}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
      <div><div className={`bar ${barCls}`}><i style={{ width: `${Math.round((o.progress ?? 0) * 100)}%` }} /></div></div>
      <div className="pct">{pct(o.progress)}</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>{conf ? <Pill tone={conf.cls as 'g' | 'w' | 'c'} dot>{conf.text}</Pill> : <Pill>{o.status === 'draft' ? 'Bozza' : o.status === 'closed' ? 'Chiuso' : 'Nessun check-in'}</Pill>}</div>
    </div>
  );
}
