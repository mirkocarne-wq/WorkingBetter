import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, apiFetch, fmtDate, type ProcessGroup, type ProcessReport, type ProcessStage } from '@/lib/api';

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);

function Stage({ name, s }: { name: string; s: ProcessStage }) {
  const p = pct(s.done, s.total);
  return (
    <div className="stage">
      <div><div style={{ fontWeight: 600 }}>{name}</div><div className="sup">{s.avgDays != null ? `in media ${s.avgDays} gg dal lancio` : 'nessun invio'}</div></div>
      <div className="bar" title={`${s.done} su ${s.total}`}><i style={{ width: `${p}%` }} /></div>
      <div className="num"><b>{p}%</b> <span className="sup">{s.done}/{s.total}</span>{s.overdue > 0 && <div><span className="pill w">{s.overdue} in ritardo</span></div>}</div>
    </div>
  );
}
function GroupTable({ title, rows }: { title: string; rows: ProcessGroup[] }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      <table>
        <thead><tr><th>{title}</th><th className="num">Review</th><th className="num">Self</th><th className="num">Manager</th><th className="num">Condivise</th><th className="num">Firmate</th><th className="num">In ritardo</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id ?? 'none'}><td>{r.name}</td><td className="num">{r.total}</td><td className="num">{r.selfDone}</td><td className="num">{r.managerDone}</td><td className="num">{r.shared}</td><td className="num">{r.signed}</td><td className="num">{r.overdue ? <span className="pill w">{r.overdue}</span> : '0'}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

export default async function ProcessPage({ params }: { params: Promise<{ cycleId: string }> }) {
  const { cycleId } = await params;
  let r: ProcessReport;
  try { r = await apiFetch<ProcessReport>(`/analytics/process/${cycleId}`); } catch (e) { if (e instanceof ApiError && e.status === 404) notFound(); throw e; }
  const c = r.cycle;
  const maxRating = Math.max(1, ...(r.ratingDistribution ?? []).map((x) => x.count));
  return (
    <>
      <div className="ph">
        <div><h1>Processo · {c.name}</h1><p>{c.periodStart} → {c.periodEnd} · lanciato il {fmtDate(c.launchedAt)} · self entro {fmtDate(c.selfDueAt)} · manager entro {fmtDate(c.managerDueAt)} · perimetro: {r.scope === 'all' ? 'tutta l’azienda' : 'il tuo team'}</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/analytics" className="btn">Report</Link>
          <Link href={`/reviews/cycles/${c.id}`} className="btn">Gestisci ciclo</Link>
          <a href={`/api/export?report=process&cycleId=${c.id}`} className="btn p">Esporta CSV</a>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1.2fr 1fr', alignItems: 'start', marginBottom: 16 }}>
        <div className="card">
          <h3>Completamento per fase <small>{r.stages.manager.total} review</small></h3>
          {r.stages.self && <Stage name="Self-review" s={r.stages.self} />}
          <Stage name="Manager review" s={r.stages.manager} />
          <Stage name="Condivisione" s={r.stages.share} />
          <Stage name="Firma" s={r.stages.sign} />
        </div>
        <div className="card">
          <h3>In ritardo <small>{r.late.length}</small></h3>
          {r.late.length === 0 ? <div className="empty">Nessuna fase scaduta.</div> : (
            <table><thead><tr><th>Persona</th><th>Fase</th><th>Manager</th><th className="num">Giorni</th></tr></thead>
              <tbody>{r.late.slice(0, 12).map((l) => <tr key={l.reviewId}><td><Link href={`/reviews/${l.reviewId}`}>{l.personName}</Link></td><td><span className="pill w">{l.stage === 'self' ? 'self-review' : 'manager review'}</span></td><td>{l.managerName ?? '—'}</td><td className="num">{l.daysLate}</td></tr>)}</tbody></table>
          )}
          {r.late.length > 12 && <div className="sup" style={{ marginTop: 6 }}>e altre {r.late.length - 12} (vedi export)</div>}
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'start', marginBottom: 16 }}>
        <GroupTable title="Unità" rows={r.byOrgUnit} />
        <GroupTable title="Manager" rows={r.byManager} />
      </div>
      {(r.ratingDistribution || r.ratingSuppressed) && (
        <div className="card" style={{ maxWidth: 560 }}>
          <h3>Distribuzione dei rating <small>review condivise</small></h3>
          {r.ratingSuppressed ? <div className="empty">Meno di 5 review valutate: distribuzione non mostrata (soglia di anonimato).</div> : r.ratingDistribution!.map((x) => (
            <div className="stage" key={x.label}><div>{x.label}</div><div className="bar" title={`${x.count}`}><i style={{ width: `${(x.count / maxRating) * 100}%` }} /></div><div className="num"><b>{x.count}</b></div></div>
          ))}
        </div>
      )}
    </>
  );
}
