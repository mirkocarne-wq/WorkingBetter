import type { SurveyResults } from '@/lib/api';
import { Distribution } from './charts';

/** Barre orizzontali per driver (0–100%), una sola tonalità: la magnitudine è il messaggio. */
export function DriverBars({ drivers, previous }: { drivers: SurveyResults['drivers']; previous?: Record<string, number | null> | null }) {
  const rows = drivers.filter((d) => d.score != null);
  if (!rows.length) return <div className="empty">Nessuna domanda a scala in questa survey.</div>;
  return (
    <div>
      {rows.map((d) => {
        const pct = Math.round((d.score ?? 0) * 100);
        const prev = previous?.[d.key];
        const delta = prev == null || d.score == null ? null : Math.round((d.score - prev) * 100);
        return (
          <div key={d.key} className="stage" style={{ gridTemplateColumns: '140px 1fr 110px' }}>
            <div style={{ fontWeight: 600 }}>{d.label}</div>
            <div className="bar" title={`media ${d.avg?.toFixed(2)} · ${d.n} risposte`}><i style={{ width: `${pct}%` }} /></div>
            <div className="num"><b>{pct}%</b> {delta != null && <span className={`pill ${delta > 0 ? 'g' : delta < 0 ? 'w' : 'n'}`} style={{ marginLeft: 4 }}>{delta > 0 ? '+' : ''}{delta}</span>}<div className="sup">media {d.avg?.toLocaleString('it-IT', { maximumFractionDigits: 2 })} su 5</div></div>
          </div>
        );
      })}
    </div>
  );
}

export function EnpsTile({ enps, previous }: { enps: NonNullable<SurveyResults['enps']>; previous?: number | null }) {
  return (
    <div className="card kpi">
      <div className="l">eNPS <span className="sup">promotori − detrattori</span></div>
      <div className="v" style={{ fontVariantNumeric: 'normal' }}>{enps.score == null ? '—' : `${enps.score > 0 ? '+' : ''}${enps.score}`}{previous != null && enps.score != null && <span className={`pill ${enps.score - previous > 0 ? 'g' : enps.score - previous < 0 ? 'w' : 'n'}`} style={{ marginLeft: 8, verticalAlign: 'middle' }}>{enps.score - previous > 0 ? '+' : ''}{enps.score - previous} vs precedente</span>}</div>
      <div style={{ margin: '6px 0' }}>
        <Distribution segments={[
          { key: 'det', label: 'Detrattori (0–6)', value: enps.detractors, color: 'var(--crit)' },
          { key: 'pas', label: 'Passivi (7–8)', value: enps.passives, color: 'var(--line)' },
          { key: 'pro', label: 'Promotori (9–10)', value: enps.promoters, color: 'var(--good)' },
        ]} total={enps.n} />
      </div>
      <div className="d">{enps.n} risposte</div>
    </div>
  );
}
