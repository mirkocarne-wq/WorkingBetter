import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch, fmtDate, fmtMetric, type AlertsResult, type Me, type MetricLite, type QueryResult, type TrendResult } from '@/lib/api';
import { refreshAnalytics } from '@/lib/actions';
import { TrendChart } from '@/components/trend-chart';

const KPI_ALL = ['headcount', 'people_with_objectives_share', 'objective_progress_avg', 'objectives_at_risk_share', 'one_on_one_coverage_30d', 'feedback_per_person_30d', 'review_completion'];
const TABLE_ALL = ['headcount', 'people_with_objectives_share', 'objective_progress_avg', 'objectives_at_risk_share', 'one_on_one_coverage_30d', 'feedback_received_30d', 'reviews_overdue'];
const TABLE_PERSON = ['objectives_active', 'objective_progress_avg', 'objectives_at_risk', 'one_on_ones_done_30d', 'feedback_given_30d', 'recognitions_received_30d', 'actions_overdue'];
const TREND_DEFAULT = 'one_on_one_coverage_30d';

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ dimension?: string; trend?: string; days?: string }> }) {
  const sp = await searchParams;
  const me = await apiFetch<Me>('/me');
  const isHr = me.permissions.includes('analytics:query');
  if (!isHr && !me.permissions.includes('analytics:query:team')) redirect('/dashboard');
  const dimension = sp.dimension === 'manager' || sp.dimension === 'person' ? sp.dimension : 'org_unit';
  const days = sp.days === '90' ? 90 : sp.days === '14' ? 14 : 30;
  const catalog = await apiFetch<MetricLite[]>('/analytics/metrics');
  const has = (k: string) => catalog.some((m) => m.key === k);
  const trendKey = sp.trend && has(sp.trend) ? sp.trend : TREND_DEFAULT;
  const tableMetrics = (dimension === 'person' ? TABLE_PERSON : TABLE_ALL).filter((k) => has(k) && catalog.find((m) => m.key === k)!.dimensions.includes(dimension));
  const [kpis, table, trend, alerts, cycles] = await Promise.all([
    apiFetch<QueryResult>(`/analytics/query?metrics=${KPI_ALL.filter(has).join(',')}`),
    apiFetch<QueryResult>(`/analytics/query?metrics=${tableMetrics.join(',')}&dimension=${dimension}`),
    apiFetch<TrendResult>(`/analytics/trend?metric=${trendKey}&days=${days}`),
    apiFetch<AlertsResult>('/analytics/alerts'),
    apiFetch<{ id: string; name: string; status: string; periodStart: string; periodEnd: string }[]>('/analytics/process'),
  ]);
  const metricName = (k: string) => catalog.find((m) => m.key === k)?.name ?? k;
  const cell = (row: { cells: Record<string, { value: number | null; suppressed: boolean }> } | null, m: MetricLite) => {
    const c = row?.cells[m.key];
    if (!c) return <span className="sup">—</span>;
    if (c.suppressed) return <span className="sup" title={`Gruppo sotto la soglia di ${m.minGroupSize}`}>n&lt;{m.minGroupSize}</span>;
    return fmtMetric(m.format, c.value);
  };
  const trendable = catalog.filter((m) => m.format !== 'count' || m.key.endsWith('_30d') || m.key === 'headcount');
  const qs = (over: Record<string, string | number>) => `/analytics?${new URLSearchParams({ dimension, trend: trendKey, days: String(days), ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, String(v)])) }).toString()}`;
  return (
    <>
      <div className="ph">
        <div><h1>Report</h1><p>{kpis.snapshotDate ? `Dati al ${fmtDate(kpis.snapshotDate)}` : 'Nessuno snapshot ancora calcolato'} · perimetro: {isHr ? 'tutta l’azienda' : 'il tuo team'} · le soglie di anonimato sono applicate dal server</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href={`/api/export?report=query&metrics=${tableMetrics.join(',')}&dimension=${dimension}`} className="btn">Esporta CSV</a>
          {isHr && <form action={refreshAnalytics}><button className="btn p">Aggiorna dati</button></form>}
        </div>
      </div>

      <div className="grid kpis" style={{ marginBottom: 16 }}>
        {kpis.metrics.map((m) => (
          <div className="card kpi" key={m.key}>
            <div className="l">{m.name}</div>
            <div className="v">{cell(kpis.total, m)}</div>
            <div className="d">{m.formula}</div>
          </div>
        ))}
      </div>

      <div className="filters">
        <span className="sup">Dettaglio per</span>
        <span className="seg">
          <Link href={qs({ dimension: 'org_unit' })} className={dimension === 'org_unit' ? 'on' : ''}>Unità</Link>
          <Link href={qs({ dimension: 'manager' })} className={dimension === 'manager' ? 'on' : ''}>Manager</Link>
          <Link href={qs({ dimension: 'person' })} className={dimension === 'person' ? 'on' : ''}>Persona</Link>
        </span>
        <span className="sup" style={{ marginLeft: 12 }}>Andamento</span>
        <form action="/analytics" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <input type="hidden" name="dimension" value={dimension} /><input type="hidden" name="days" value={days} />
          <select name="trend" defaultValue={trendKey}>{trendable.map((m) => <option key={m.key} value={m.key}>{m.name}</option>)}</select>
          <button className="btn sm">Applica</button>
        </form>
        <span className="seg">
          {[14, 30, 90].map((d) => <Link key={d} href={qs({ days: d })} className={days === d ? 'on' : ''}>{d} gg</Link>)}
        </span>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', alignItems: 'start', marginBottom: 16 }}>
        <div className="card">
          <h3>{trend.metric.name} <small>{fmtDate(trend.from)} → {fmtDate(trend.to)} · ultimo valore evidenziato</small></h3>
          <TrendChart points={trend.points} format={trend.metric.format} />
          <div className="sup" style={{ marginTop: 8 }}>{trend.metric.description}</div>
        </div>
        <div className="card">
          <h3>Segnali <small>{alerts.snapshotDate ? `al ${fmtDate(alerts.snapshotDate)}` : ''}</small></h3>
          {alerts.alerts.every((a) => a.count === 0) ? <div className="empty">Nessun segnale aperto.</div> : alerts.alerts.filter((a) => a.count > 0).map((a) => (
            <details key={a.key} style={{ padding: '8px 0', borderBottom: '1px solid var(--grid)' }}>
              <summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span>{a.label}</span><span className={`pill ${a.count > 3 ? 'w' : 'n'}`}>{a.count}</span></summary>
              <div style={{ paddingTop: 6, fontSize: 13 }}>
                {a.people.slice(0, 8).map((p) => <div key={p.personId} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}><span>{p.name} <span className="sup">{p.jobTitle ?? ''}{p.managerName ? ` · manager ${p.managerName}` : ''}</span></span>{p.value > 1 && <b>{p.value}</b>}</div>)}
                {a.people.length > 8 && <div className="sup">e altre {a.people.length - 8} persone (vedi export)</div>}
              </div>
            </details>
          ))}
          <div style={{ marginTop: 10 }}><a href="/api/export?report=alerts" className="btn sm">Esporta segnali</a></div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Per {table.dimensionLabel.toLowerCase()} <small>{table.rows.length} gruppi · valori sotto soglia non mostrati</small></h3>
        {table.rows.length === 0 ? <div className="empty">Nessun dato: chiedi all’HR di aggiornare i dati.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead><tr><th>{table.dimensionLabel}</th><th className="num">Persone</th>{table.metrics.map((m) => <th key={m.key} className="num" title={m.description}>{m.name}</th>)}</tr></thead>
              <tbody>
                {table.rows.map((r) => <tr key={r.key}><td>{r.label}</td><td className="num">{r.persons}</td>{table.metrics.map((m) => <td key={m.key} className="num">{cell(r, m)}</td>)}</tr>)}
                {table.total && <tr style={{ fontWeight: 700 }}><td>Totale</td><td className="num">{table.total.persons}</td>{table.metrics.map((m) => <td key={m.key} className="num">{cell(table.total, m)}</td>)}</tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'start' }}>
        <div className="card">
          <h3>Report di processo <small>cicli di review</small></h3>
          {cycles.length === 0 ? <div className="empty">Nessun ciclo di review lanciato.</div> : cycles.map((c) => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--grid)' }}>
              <div><div style={{ fontWeight: 600 }}>{c.name}</div><div className="sup">{c.periodStart} → {c.periodEnd} · {c.status === 'active' ? 'attivo' : 'chiuso'}</div></div>
              <Link href={`/analytics/process/${c.id}`} className="btn sm">Apri report</Link>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Dizionario delle metriche <small>{catalog.length} metriche</small></h3>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {catalog.map((m) => (
              <details key={m.key} style={{ padding: '6px 0', borderBottom: '1px solid var(--grid)' }}>
                <summary style={{ cursor: 'pointer' }}>{m.name} {m.sensitive && <span className="pill n" style={{ marginLeft: 6 }}>sensibile · min {m.minGroupSize}</span>}</summary>
                <div style={{ fontSize: 13, color: 'var(--ink2)', paddingTop: 4 }}>{m.description}<div className="sup" style={{ marginTop: 2 }}>Formula: {m.formula} · chiave <code>{m.key}</code></div></div>
              </details>
            ))}
          </div>
          <div className="sup" style={{ marginTop: 8 }}>Le metriche sono definite una volta nel catalogo e usate identiche in dashboard, report ed export. {metricName('review_rating_avg') !== 'review_rating_avg' && 'Le metriche sensibili non sono mai disponibili a livello persona.'}</div>
        </div>
      </div>
    </>
  );
}
