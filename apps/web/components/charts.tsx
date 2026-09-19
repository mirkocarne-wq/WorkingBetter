'use client';
import { useState, type ReactNode } from 'react';
import { fmtDelta, fmtMetric, type MetricFormat } from '@/lib/format';

/**
 * Kit grafici del design system (docs/07 «Grafici»): SVG inline, nessuna libreria.
 * Regole: una sola scala per grafico, marcatori sottili (barre ≤ 24 px, linee 2 px, punti ≥ 8 px con anello
 * di superficie), 2 px di superficie tra riempimenti adiacenti, etichette in inchiostro (mai nel colore della serie),
 * tooltip al passaggio del mouse per ogni marcatore, vista tabella gemella dove la lettura puntuale conta.
 * I colori di stato (--good/--warn/--crit) restano riservati agli stati; le serie usano --s1…--s6 in ordine fisso.
 */

export interface TrendPoint { date: string; value: number | null; size?: number; suppressed?: boolean }

const fmtDay = (d: string) => new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
const fmtDayLong = (d: string) => new Date(d).toLocaleDateString('it-IT', { dateStyle: 'medium' });

/** Verso «buono» di una metrica dalla sua chiave: per ritardi, rischi e mancanze il calo è positivo. */
export function goodWhen(key: string): 'up' | 'down' {
  return /overdue|at_risk|stale|without|no_manager|disagreement/.test(key) ? 'down' : 'up';
}

/** Tono della variazione: verde se va nel verso buono, ambra se va nel verso cattivo, neutro se ferma. */
export function deltaTone(key: string, delta: number | null): 'g' | 'w' | 'n' {
  if (delta == null || delta === 0) return 'n';
  return (delta > 0) === (goodWhen(key) === 'up') ? 'g' : 'w';
}

/** Linea breve senza assi (contratto della «stat tile»): 2 px, ultimo punto marcato. */
export function Sparkline({ points, width = 96, height = 28, label }: { points: TrendPoint[]; width?: number; height?: number; label?: string }) {
  const valid = points.filter((p) => p.value != null && !p.suppressed);
  if (valid.length < 2) return <svg width={width} height={height} aria-hidden style={{ flex: 'none' }} />;
  const vals = valid.map((p) => p.value as number);
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const pad = 4;
  const xs = valid.map((_, i) => pad + (i * (width - pad * 2)) / (valid.length - 1));
  const ys = vals.map((v) => pad + (height - pad * 2) * (1 - (v - min) / span));
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i]!.toFixed(1)}`).join(' ');
  const li = valid.length - 1;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} style={{ flex: 'none', overflow: 'visible' }}>
      <path d={d} fill="none" stroke="var(--s1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xs[li]} cy={ys[li]} r={4} fill="var(--s1)" stroke="var(--surface)" strokeWidth={2} />
    </svg>
  );
}

/** Indicatore con etichetta, valore in evidenza, variazione e sparkline (una sola serie: nessuna legenda). */
export function StatTile({ metricKey, label, value, format, delta, points, hint, href, small }: { metricKey: string; label: ReactNode; value: number | null; format: MetricFormat; delta: number | null; points: TrendPoint[]; hint?: ReactNode; href?: string; small?: boolean }) {
  const tone = deltaTone(metricKey, delta);
  const body = (
    <>
      <div className="l">{label}</div>
      <div className="row2">
        <div className={`v${small ? ' sm' : ''}`}>{fmtMetric(format, value)}</div>
        <Sparkline points={points} label={`andamento di ${typeof label === 'string' ? label : 'metrica'}`} />
      </div>
      <div className="d">
        {delta != null && delta !== 0 ? <span className={`pill ${tone}`}>{fmtDelta(format, delta)}</span> : delta === 0 ? <span className="pill n">stabile</span> : <span className="sup">—</span>}
        {hint && <span className="sup" style={{ marginLeft: 8 }}>{hint}</span>}
      </div>
    </>
  );
  return href ? <a href={href} className="stat link">{body}</a> : <div className="stat">{body}</div>;
}

/** Barre orizzontali ordinate (magnitudine per categoria): una tonalità, valore in inchiostro a destra, tooltip per barra. */
export function BarList({ rows, format, max, empty = 'Nessun dato.', color = 'var(--s1)' }: { rows: { key: string; label: ReactNode; value: number | null; hint?: string; suppressed?: boolean; href?: string }[]; format: MetricFormat; max?: number; empty?: ReactNode; color?: string }) {
  const [hover, setHover] = useState<string | null>(null);
  if (!rows.length) return <div className="empty">{empty}</div>;
  const top = max ?? Math.max(1e-9, ...rows.map((r) => r.value ?? 0));
  const fmt = (v: number | null) => fmtMetric(format, v);
  return (
    <div className="barlist" role="table">
      {rows.map((r) => {
        const w = r.value == null || r.suppressed ? 0 : Math.max(0, Math.min(100, (r.value / top) * 100));
        return (
          <div className={`r${hover === r.key ? ' on' : ''}`} key={r.key} role="row" onPointerEnter={() => setHover(r.key)} onPointerLeave={() => setHover(null)}>
            <div className="lb" role="cell" title={typeof r.label === 'string' ? r.label : undefined}>{r.href ? <a href={r.href}>{r.label}</a> : r.label}</div>
            <div className="t" role="cell" title={r.hint ? `${fmt(r.value)} · ${r.hint}` : undefined}><i style={{ width: `${w}%`, background: color, minWidth: w > 0 ? 4 : 0 }} /></div>
            <div className="num" role="cell">{r.suppressed ? <span className="sup" title="Gruppo sotto la soglia di anonimato">n&lt;</span> : fmt(r.value)}</div>
            {hover === r.key && r.hint && <div className="chart-tip" style={{ right: 0, top: -4, transform: 'translateY(-100%)' }}><b>{fmt(r.value)}</b> <span style={{ color: 'var(--muted)' }}>· {r.hint}</span></div>}
          </div>
        );
      })}
    </div>
  );
}

/** Parte-sul-tutto in una barra: segmenti con 2 px di superficie tra loro, legenda con conteggi (mai il solo colore). */
export function Distribution({ segments, total, height = 10, legend = true, unit = '' }: { segments: { key: string; label: string; value: number; color: string }[]; total?: number; height?: number; legend?: boolean; unit?: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const sum = segments.reduce((a, s) => a + s.value, 0);
  const all = Math.max(total ?? sum, sum, 1);
  const rest = all - sum;
  const pctOf = (v: number) => `${Math.round((v / all) * 100)}%`;
  const h = segments.find((s) => s.key === hover);
  return (
    <div style={{ position: 'relative' }}>
      <div className="dist" style={{ height }} role="img" aria-label={segments.map((s) => `${s.label}: ${s.value}`).join(', ')}>
        {segments.filter((s) => s.value > 0).map((s) => <i key={s.key} style={{ width: `${(s.value / all) * 100}%`, background: s.color }} onPointerEnter={() => setHover(s.key)} onPointerLeave={() => setHover(null)} />)}
        {rest > 0 && <i style={{ width: `${(rest / all) * 100}%`, background: 'var(--surface-2)' }} />}
      </div>
      {h && <div className="chart-tip" style={{ left: 0, top: -6, transform: 'translateY(-100%)' }}><b>{h.value}{unit}</b> <span style={{ color: 'var(--muted)' }}>· {h.label} · {pctOf(h.value)}</span></div>}
      {legend && (
        <div className="legend">
          {segments.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label} <b>{s.value}</b></span>)}
          {rest > 0 && total != null && <span><i style={{ background: 'var(--surface-2)', border: '1px solid var(--line)' }} />altro <b>{rest}</b></span>}
        </div>
      )}
    </div>
  );
}

/** Colonne per categorie ordinate (distribuzioni: rating, risposte a scala): ≤ 24 px, 2 px di gap, etichetta solo sul massimo, tooltip per colonna, tabella gemella. */
export function Columns({ bars, height = 140, color = 'var(--s1)', unit = '', caption }: { bars: { key: string; label: string; value: number; hint?: string }[]; height?: number; color?: string; unit?: string; caption?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!bars.length) return <div className="empty">Nessun dato.</div>;
  const max = Math.max(1, ...bars.map((b) => b.value));
  const W = 320, padB = 22, padT = 16;
  const slot = W / bars.length;
  const bw = Math.min(24, slot - 2);
  const h = hover != null ? bars[hover]! : null;
  const maxIdx = bars.findIndex((b) => b.value === max);
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={caption ?? 'Distribuzione'} onPointerLeave={() => setHover(null)}>
        <line x1={0} x2={W} y1={height - padB} y2={height - padB} stroke="var(--line)" strokeWidth={1} />
        {bars.map((b, i) => {
          const bh = ((height - padB - padT) * b.value) / max;
          const x = i * slot + (slot - bw) / 2;
          const y = height - padB - bh;
          return (
            <g key={b.key} onPointerEnter={() => setHover(i)}>
              <rect x={i * slot} y={0} width={slot} height={height} fill="transparent" />
              {b.value > 0 && <path d={`M${x},${height - padB} V${y + 4} a4,4 0 0 1 4,-4 h${bw - 8} a4,4 0 0 1 4,4 V${height - padB} Z`} fill={color} opacity={hover == null || hover === i ? 1 : 0.55} />}
              {(i === maxIdx || hover === i) && <text x={x + bw / 2} y={y - 5} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--ink)">{b.value}{unit}</text>}
              <text x={x + bw / 2} y={height - 7} textAnchor="middle" fontSize={11} fill="var(--muted)">{b.label.length > 8 ? `${b.label.slice(0, 7)}…` : b.label}</text>
            </g>
          );
        })}
      </svg>
      {h && <div className="chart-tip" style={{ left: `${((hover! + 0.5) * slot / W) * 100}%`, top: 0, transform: `translateX(${hover! > bars.length / 2 ? '-105%' : '6px'})` }}><b>{h.value}{unit}</b> <span style={{ color: 'var(--muted)' }}>· {h.label}{h.hint ? ` · ${h.hint}` : ''}</span></div>}
      <details style={{ marginTop: 4 }}>
        <summary className="sup" style={{ cursor: 'pointer' }}>Vedi tabella</summary>
        <table style={{ marginTop: 6 }}><thead><tr><th>Categoria</th><th className="num">Valore</th></tr></thead><tbody>{bars.map((b) => <tr key={b.key}><td>{b.label}</td><td className="num">{b.value}{unit}</td></tr>)}</tbody></table>
      </details>
    </div>
  );
}

/** Pannello di una serie breve con titolo, ultimo valore e variazione: usato in griglia come «piccoli multipli» (mai due scale nello stesso grafico). */
export function MiniTrend({ metricKey, title, points, format, value, delta, href }: { metricKey: string; title: string; points: TrendPoint[]; format: MetricFormat; value: number | null; delta: number | null; href?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const valid = points.filter((p) => p.value != null && !p.suppressed);
  const W = 220, H = 64, pad = 6;
  const vals = valid.map((p) => p.value as number);
  const min = Math.min(...vals, format === 'percent' ? 0 : Infinity), max = Math.max(...vals, format === 'percent' ? 1 : -Infinity);
  const flat = max === min;
  const span = max - min || 1;
  const xs = valid.map((_, i) => pad + (i * (W - pad * 2)) / Math.max(1, valid.length - 1));
  // serie costante: linea a metà altezza invece che schiacciata sul bordo
  const ys = vals.map((v) => (flat ? H / 2 : pad + (H - pad * 2) * (1 - (v - min) / span)));
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i]!.toFixed(1)}`).join(' ');
  const hp = hover != null ? valid[hover] : null;
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    xs.forEach((px, i) => { if (Math.abs(px - x) < Math.abs(xs[best]! - x)) best = i; });
    setHover(best);
  };
  const tone = deltaTone(metricKey, delta);
  return (
    <div className="m" style={{ position: 'relative' }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <div className="l" style={{ fontSize: 'var(--fs-md)', color: 'var(--ink2)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{href ? <a href={href}>{title}</a> : title}</div>
        <b style={{ fontSize: 'var(--fs-lg)' }}>{fmtMetric(format, hp ? hp.value : value)}</b>
      </div>
      {valid.length < 2 ? <div className="sup" style={{ height: H, display: 'flex', alignItems: 'center' }}>Serie troppo corta: servono almeno due snapshot.</div> : (
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', touchAction: 'none' }} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label={`Andamento di ${title}`}>
          <path d={`${d} L${xs[xs.length - 1]!.toFixed(1)},${H - pad} L${xs[0]!.toFixed(1)},${H - pad} Z`} fill="var(--s1)" opacity={0.08} />
          <path d={d} fill="none" stroke="var(--s1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {hover != null && <line x1={xs[hover]} x2={xs[hover]} y1={pad} y2={H - pad} stroke="var(--line)" strokeWidth={1} />}
          <circle cx={xs[hover ?? xs.length - 1]} cy={ys[hover ?? ys.length - 1]} r={4} fill="var(--s1)" stroke="var(--surface)" strokeWidth={2} />
        </svg>
      )}
      <div className="sup" style={{ marginTop: 4, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span>{hp ? fmtDayLong(hp.date) : valid.length ? `${fmtDay(valid[0]!.date)} → ${fmtDay(valid[valid.length - 1]!.date)}` : ''}</span>
        {delta != null && delta !== 0 && !hp && <span className={`pill ${tone}`}>{fmtDelta(format, delta)}</span>}
      </div>
    </div>
  );
}
