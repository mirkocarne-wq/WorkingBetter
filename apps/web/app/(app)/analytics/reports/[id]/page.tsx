import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, apiFetch, deltaLabel, fmtDate, fmtMetric, scheduleLabel, type Me, type MetricLite, type MetricRow, type Person, type ReportRun } from '@/lib/api';
import { deleteReport, duplicateReport, sendReportNow } from '@/lib/actions';
import { Button, PageHeader, Pill, TableWrap } from '@/components/ui';
import { ReportBuilder } from '@/components/report-builder';
import { TrendChart } from '@/components/trend-chart';

export default async function ReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string; date?: string; orgUnitId?: string; managerId?: string; sent?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await apiFetch<Me>('/me');
  const canShare = me.permissions.includes('analytics:query');
  const q = new URLSearchParams(); if (sp.date) q.set('date', sp.date); if (sp.orgUnitId) q.set('orgUnitId', sp.orgUnitId); if (sp.managerId) q.set('managerId', sp.managerId);
  let run: ReportRun;
  try { run = await apiFetch<ReportRun>(`/analytics/reports/${id}/run${q.toString() ? `?${q}` : ''}`); } catch (e) { if (e instanceof ApiError && e.status === 404) notFound(); throw e; }
  const r = run.report;
  const [catalog, units, people, cycles] = sp.edit ? await Promise.all([
    apiFetch<MetricLite[]>('/analytics/metrics'),
    apiFetch<{ id: string; name: string }[]>('/org-units').catch(() => []),
    apiFetch<{ items: Person[] }>('/people?limit=200').then((x) => x.items).catch(() => [] as Person[]),
    apiFetch<{ id: string; name: string }[]>('/analytics/process').catch(() => []),
  ]) : [[], [], [], []];
  const managerIds = new Set(people.map((p) => p.managerId).filter(Boolean));
  const managers = people.filter((p) => managerIds.has(p.id)).map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}` }));
  const cmp = new Map((run.compared ?? []).map((x) => [x.key, x.compared]));
  const cell = (row: MetricRow | null, m: MetricLite) => {
    const c = row?.cells[m.key];
    if (!c) return <span className="sup">—</span>;
    if (c.suppressed) return <span className="sup" title={`Gruppo sotto la soglia di ${m.minGroupSize}`}>n&lt;{m.minGroupSize}</span>;
    const d = row ? cmp.get(row.key)?.[m.key]?.delta ?? null : null;
    return <>{fmtMetric(m.format, c.value)}{run.compared && <span className={`sup`} style={{ marginLeft: 6, color: d == null ? undefined : d > 0 ? 'var(--good-text)' : d < 0 ? 'var(--crit-text)' : undefined }}>{d == null ? '' : deltaLabel(m.format, d)}</span>}</>;
  };
  const first = run.metrics[0];
  const maxVal = first ? Math.max(0, ...run.rows.map((x) => x.cells[first.key]?.value ?? 0)) : 0;
  const viz = r.definition.visualization ?? 'table';
  const unitsForFilter = sp.edit ? units : await apiFetch<{ id: string; name: string }[]>('/org-units').catch(() => []);
  return (
    <>
      <PageHeader
        title={r.name}
        subtitle={<>{r.description ? `${r.description} · ` : ''}{run.snapshotDate ? `dati al ${fmtDate(run.snapshotDate)}` : 'nessuno snapshot'}{run.previousSnapshot ? ` · confronto con il ${fmtDate(run.previousSnapshot)}` : ''} · perimetro: {run.scope === 'all' ? 'tutta l’azienda' : 'il tuo team'}{r.isOwner ? '' : ' · condiviso con te'}</>}
        actions={<>
          <Button href="/analytics/reports">Tutti i report</Button>
          <a href={`/api/export?report=saved&reportId=${r.id}${q.toString() ? `&${q}` : ''}`} className="btn">Esporta CSV</a>
          <form action={sendReportNow.bind(null, r.id)}><Button title="Ti arriva via email con il CSV allegato">Inviami via email</Button></form>
          <form action={duplicateReport.bind(null, r.id)}><Button>Duplica</Button></form>
          {r.isOwner && <Button href={`/analytics/reports/${r.id}?edit=1`} variant="primary">Modifica</Button>}
        </>}
      />
      {sp.edit && r.isOwner && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Modifica report <small><Link href={`/analytics/reports/${r.id}`}>chiudi</Link></small></h3>
          <ReportBuilder catalog={catalog} report={r} canShare={canShare} units={units} managers={managers} cycles={cycles} />
          <form action={deleteReport.bind(null, r.id)} style={{ marginTop: 12 }}><Button variant="danger" size="sm">Elimina report</Button></form>
        </div>
      )}
      <div className="filters">
        <span className="sup">Filtri dinamici</span>
        <form action={`/analytics/reports/${r.id}`} className="row">
          <input type="date" name="date" defaultValue={sp.date ?? ''} className="input" style={{ width: 'auto' }} aria-label="Dati alla data" />
          <select name="orgUnitId" defaultValue={sp.orgUnitId ?? ''} className="select" style={{ width: 'auto' }}><option value="">{r.definition.filters?.orgUnitId ? 'Unità del report' : 'Tutte le unità'}</option>{unitsForFilter.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          <button className="btn sm">Applica</button>
          {(sp.date || sp.orgUnitId || sp.managerId) && <Link href={`/analytics/reports/${r.id}`} className="btn sm ghost">Azzera</Link>}
        </form>
        <span style={{ marginLeft: 'auto' }}><Pill tone={r.schedule ? 'b' : 'n'}>{scheduleLabel(r.schedule)}</Pill></span>
      </div>

      {viz === 'trend' && run.trend && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>{run.trend.metric.name} <small>{fmtDate(run.trend.from)} → {fmtDate(run.trend.to)}</small></h3>
          <TrendChart points={run.trend.points} format={run.trend.metric.format} />
        </div>
      )}
      {viz === 'bars' && first && run.rows.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>{first.name} <small>per {run.dimensionLabel.toLowerCase()}</small></h3>
          {run.rows.map((row) => { const c = row.cells[first.key]; const v = c?.suppressed ? null : c?.value ?? null; return (
            <div key={row.key} style={{ display: 'grid', gridTemplateColumns: '180px 1fr 90px', gap: 10, alignItems: 'center', padding: '5px 0' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
              <div className="bar" style={{ height: 10 }}><i style={{ width: `${maxVal > 0 && v != null ? Math.round((v / maxVal) * 100) : 0}%` }} /></div>
              <span className="num">{cell(row, first)}</span>
            </div>
          ); })}
        </div>
      )}
      <div className="card">
        <h3>{run.dimension ? `Per ${run.dimensionLabel.toLowerCase()}` : 'Totale'} <small>{run.rows.length} gruppi · valori sotto soglia non mostrati{run.compared ? ' · variazione accanto al valore' : ''}</small></h3>
        {!run.snapshotDate ? <div className="empty">Nessun dato: chiedi all’HR di aggiornare i dati.</div> : (
          <TableWrap>
            <table>
              <thead><tr><th>{run.dimensionLabel}</th><th className="num">Persone</th>{run.metrics.map((m) => <th key={m.key} className="num" title={m.description}>{m.name}</th>)}</tr></thead>
              <tbody>
                {run.rows.map((row) => <tr key={row.key}><td>{row.label}</td><td className="num">{row.persons}</td>{run.metrics.map((m) => <td key={m.key} className="num">{cell(row, m)}</td>)}</tr>)}
                {run.total && <tr style={{ fontWeight: 700 }}><td>Totale</td><td className="num">{run.total.persons}</td>{run.metrics.map((m) => <td key={m.key} className="num">{cell(run.total, m)}</td>)}</tr>}
              </tbody>
            </table>
          </TableWrap>
        )}
        <div className="sup" style={{ marginTop: 8 }}>{run.metrics.map((m) => <div key={m.key}><b>{m.name}</b>: {m.description} <i>({m.formula})</i></div>)}</div>
      </div>
    </>
  );
}
