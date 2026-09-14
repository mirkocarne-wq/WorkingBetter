'use client';
import { useRef, useState } from 'react';
import { fmtMetric, type MetricFormat } from '@/lib/format';

interface Point { date: string; value: number | null; size: number; suppressed: boolean }

/**
 * Serie giornaliera di una metrica: linea 2px, area al 10%, marker con anello di superficie,
 * mirino che aggancia la data più vicina e tooltip. Una sola serie: nessuna legenda, il titolo la nomina.
 */
export function TrendChart({ points, format, height = 200 }: { points: Point[]; format: MetricFormat; height?: number }) {
  const W = 640;
  const H = height;
  const pad = { l: 44, r: 16, t: 12, b: 28 };
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const valid = points.filter((p) => p.value != null);
  // 4 intervalli: per i conteggi il passo è un numero "tondo" così i tick restano interi e distinti
  const nice = format === 'percent' ? 1 : 4 * niceStep(Math.max(1, ...valid.map((p) => p.value ?? 0)) * 1.1 / 4);
  const n = points.length;
  const xs = points.map((_, i) => pad.l + (n === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (n - 1)));
  const ys = points.map((p) => (p.value == null ? null : pad.t + (H - pad.t - pad.b) * (1 - p.value / nice)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: nice * f, y: pad.t + (H - pad.t - pad.b) * (1 - f) }));
  if (!valid.length) return <div className="empty">Nessun dato nel periodo: gli snapshot del data mart iniziano dal primo aggiornamento.</div>;

  const path = points.map((p, i) => (ys[i] == null ? null : `${i === 0 || ys[i - 1] == null ? 'M' : 'L'}${xs[i]!.toFixed(1)},${ys[i]!.toFixed(1)}`)).filter(Boolean).join(' ');
  const firstIdx = points.findIndex((p) => p.value != null);
  const lastIdx = points.length - 1 - [...points].reverse().findIndex((p) => p.value != null);
  const area = firstIdx >= 0 ? `${path} L${xs[lastIdx]!.toFixed(1)},${(H - pad.b).toFixed(1)} L${xs[firstIdx]!.toFixed(1)},${(H - pad.b).toFixed(1)} Z` : '';
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = ref.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0;
    xs.forEach((px, i) => { if (Math.abs(px - x) < Math.abs(xs[best]! - x)) best = i; });
    setHover(best);
  };
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
  const labelIdx = new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]);
  const h = hover != null ? points[hover] : null;
  return (
    <div style={{ position: 'relative' }}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'none' }} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label="Andamento giornaliero">
        {ticks.map((t) => (
          <g key={t.v}>
            <line x1={pad.l} x2={W - pad.r} y1={t.y} y2={t.y} stroke="var(--grid)" strokeWidth={1} />
            <text x={pad.l - 8} y={t.y + 4} textAnchor="end" fontSize={11} fill="var(--muted)">{fmtMetric(format, t.v)}</text>
          </g>
        ))}
        {area && <path d={area} fill="var(--brand)" opacity={0.1} />}
        <path d={path} fill="none" stroke="var(--brand)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => ys[i] == null ? null : (
          <circle key={p.date} cx={xs[i]} cy={ys[i]!} r={hover === i ? 5 : 4} fill="var(--brand)" stroke="var(--surface)" strokeWidth={2} />
        ))}
        {points.map((p, i) => labelIdx.has(i) ? <text key={p.date} x={xs[i]} y={H - 8} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} fontSize={11} fill="var(--muted)">{fmtDate(p.date)}</text> : null)}
        {lastIdx >= 0 && ys[lastIdx] != null && hover == null && (
          <text x={xs[lastIdx]! - 8} y={ys[lastIdx]! - 10} textAnchor="end" fontSize={12} fontWeight={700} fill="var(--ink)">{fmtMetric(format, points[lastIdx]!.value)}</text>
        )}
        {hover != null && <line x1={xs[hover]} x2={xs[hover]} y1={pad.t} y2={H - pad.b} stroke="var(--line)" strokeWidth={1} />}
      </svg>
      {h && (
        <div style={{ position: 'absolute', left: `${(xs[hover!]! / W) * 100}%`, top: 0, transform: `translateX(${hover! > points.length / 2 ? '-105%' : '8px'})`, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: 'var(--shadow)', padding: '6px 10px', fontSize: 12, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{h.suppressed ? 'sotto soglia' : fmtMetric(format, h.value)}</div>
          <div style={{ color: 'var(--muted)' }}>{new Date(h.date).toLocaleDateString('it-IT', { dateStyle: 'medium' })} · {h.size} {h.size === 1 ? 'persona' : 'persone'}</div>
        </div>
      )}
      <details style={{ marginTop: 6 }}>
        <summary className="sup" style={{ cursor: 'pointer' }}>Vedi tabella</summary>
        <table style={{ marginTop: 6 }}><thead><tr><th>Data</th><th className="num">Valore</th><th className="num">Persone</th></tr></thead>
          <tbody>{points.map((p) => <tr key={p.date}><td>{fmtDate(p.date)}</td><td className="num">{p.suppressed ? 'sotto soglia' : fmtMetric(format, p.value)}</td><td className="num">{p.size}</td></tr>)}</tbody></table>
      </details>
    </div>
  );
}

function niceStep(v: number): number {
  if (v <= 1) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return n * p;
}
