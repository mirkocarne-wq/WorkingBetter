import Link from 'next/link';
import { apiFetch, confidenceLabel, initials, pct, qs, type Cycle, type GuideSummary, type Me, type Objective, type Person } from '@/lib/api';
import { dismissGuide } from '@/lib/actions';

export default async function Dashboard() {
  const me = await apiFetch<Me>('/me');
  const cycle = await apiFetch<Cycle | null>('/cycles/current');
  const cycleId = cycle?.id;
  const guide = await apiFetch<GuideSummary>('/guides/me/summary').catch(() => null);
  const [mine, team, people] = await Promise.all([
    apiFetch<Objective[]>(`/objectives${qs({ cycleId, mine: true })}`),
    me.permissions.includes('objectives:write:team') ? apiFetch<Objective[]>(`/objectives${qs({ cycleId, team: true })}`) : Promise.resolve([] as Objective[]),
    me.permissions.includes('people:read') ? apiFetch<{ items: Person[] }>('/people?limit=200').then((r) => r.items) : Promise.resolve([] as Person[]),
  ]);
  const byId = new Map(people.map((p) => [p.id, p]));
  const reports = me.person ? people.filter((p) => p.managerId === me.person!.id) : [];
  const atRisk = [...mine, ...team].filter((o) => o.confidence === 'off_track' || o.confidence === 'at_risk');
  const stale = [...mine, ...team].filter((o) => o.stale);
  const hour = new Date().getHours();
  const greet = hour < 13 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera';
  return (
    <>
      <div className="ph">
        <div>
          <h1>{greet}{me.person ? `, ${me.person.firstName}` : ''}</h1>
          <p>{cycle ? `${cycle.name} · ${cycle.startDate} – ${cycle.endDate}` : 'Nessun periodo attivo'}{reports.length ? ` · ${reports.length} persone nel team` : ''}</p>
        </div>
        <Link href="/objectives" className="btn p">Vai agli obiettivi</Link>
      </div>
      {guide && !guide.complete && !guide.dismissedAt && (
        <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', borderLeft: '4px solid var(--brand)' }}>
          <div style={{ flex: 1, minWidth: 220 }}><b>{guide.title}</b> · {guide.done} di {guide.total} passi fatti{guide.next ? <span style={{ color: 'var(--muted)' }}> · prossimo: {guide.next}</span> : ''}<div className="bar g" style={{ marginTop: 6, maxWidth: 320 }}><i style={{ width: `${guide.total ? Math.round((guide.done / guide.total) * 100) : 0}%` }} /></div></div>
          <Link href="/inizia" className="btn p sm">Apri la guida</Link>
          <form action={dismissGuide.bind(null, true)}><button className="btn sm" title="Puoi riattivarlo dalla pagina Guida">Nascondi</button></form>
        </div>
      )}
      <div className="grid kpis" style={{ marginBottom: 16 }}>
        <div className="card kpi"><div className="l">I miei obiettivi attivi</div><div className="v">{mine.filter((o) => o.status === 'active').length}</div><div className="d">progresso medio {pct(avg(mine))}</div></div>
        <div className="card kpi"><div className="l">Obiettivi a rischio</div><div className="v">{atRisk.length}</div><div className="d">miei e del team</div></div>
        <div className="card kpi"><div className="l">Check-in in ritardo</div><div className="v">{stale.length}</div><div className="d">oltre la cadenza del periodo</div></div>
        <div className="card kpi"><div className="l">Riporti diretti</div><div className="v">{reports.length}</div><div className="d">{team.length} obiettivi di team</div></div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: reports.length ? '1.6fr 1fr' : '1fr' }}>
        {reports.length > 0 && (
          <div className="card">
            <h3>Il tuo team <small>obiettivi del periodo</small></h3>
            <table>
              <thead><tr><th>Persona</th><th>Obiettivi</th><th>Progresso</th><th>Segnali</th></tr></thead>
              <tbody>
                {reports.map((p) => {
                  const objs = team.filter((o) => o.ownerPersonId === p.id);
                  const worst = objs.find((o) => o.confidence === 'off_track') ?? objs.find((o) => o.confidence === 'at_risk');
                  const st = objs.filter((o) => o.stale).length;
                  return (
                    <tr key={p.id}>
                      <td><div className="who"><span className="av s">{initials(p)}</span><div><div className="n">{p.firstName} {p.lastName}</div><div className="r">{p.jobTitle ?? ''}</div></div></div></td>
                      <td>{objs.length}</td>
                      <td><div className={`bar ${worst ? (worst.confidence === 'off_track' ? 'c' : 'w') : 'g'}`}><i style={{ width: `${Math.round((avg(objs) ?? 0) * 100)}%` }} /></div></td>
                      <td>
                        {worst ? <span className={`pill ${confidenceLabel[worst.confidence!].cls}`}><i />{worst.confidence === 'off_track' ? '1 obiettivo off track' : 'a rischio'}</span>
                          : st ? <span className="pill s"><i />{st} KR senza check-in</span>
                          : objs.length ? <span className="pill g"><i />Tutto ok</span> : <span className="pill n">Nessun obiettivo</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="card">
          <h3>I miei obiettivi <small>{mine.length}</small></h3>
          {mine.length === 0 ? <div className="empty">Nessun obiettivo nel periodo. <Link href="/objectives" style={{ color: 'var(--brand-2)' }}>Crea il primo</Link></div> : (
            <table><tbody>
              {mine.map((o) => (
                <tr key={o.id}>
                  <td><div style={{ fontWeight: 600 }}>{o.title}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>{o.keyResults.length} KR{byId.get(o.parentId ?? '') ? '' : ''}</div></td>
                  <td className="num">{pct(o.progress)}</td>
                  <td>{o.confidence ? <span className={`pill ${confidenceLabel[o.confidence].cls}`}><i />{confidenceLabel[o.confidence].text}</span> : <span className="pill n">—</span>}</td>
                </tr>
              ))}
            </tbody></table>
          )}
        </div>
      </div>
    </>
  );
}

function avg(objs: Objective[]): number | null {
  const v = objs.map((o) => o.progress).filter((p): p is number => p != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
