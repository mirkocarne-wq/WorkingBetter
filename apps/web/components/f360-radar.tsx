import type { F360CompetencyDef } from '@/lib/api';

export interface RadarSeries { key: string; label: string; color: string; dashed?: boolean; values: Record<string, number | null> }

/** Radar a più serie (F360-020): autovalutazione, manager, altri. SVG puro, server-safe; colori dai token del design system. */
export function F360Radar({ competencies, series, min = 1, max = 5, size = 460 }: { competencies: Pick<F360CompetencyDef, 'key' | 'name'>[]; series: RadarSeries[]; min?: number; max?: number; size?: number }) {
  const rows = competencies;
  if (rows.length < 3) return <div className="sup">Servono almeno tre competenze per il radar.</div>;
  const c = size / 2;
  const r = c - 130;
  const n = rows.length;
  const span = Math.max(1, max - min);
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const rr = (Math.max(0, Math.min(1, (v - min) / span)) ) * r;
    return [c + rr * Math.cos(a), c + rr * Math.sin(a)] as const;
  };
  const poly = (vals: (number | null)[]) => vals.map((v, i) => pt(i, v ?? min)).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const rings = Array.from({ length: span }, (_, k) => min + k + 1);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size, display: 'block', margin: '0 auto' }} role="img" aria-label={`Radar 360°: ${series.map((s) => s.label).join(', ')}`}>
      {rings.map((lvl) => <polygon key={lvl} points={poly(rows.map(() => lvl))} fill="none" stroke="var(--grid)" strokeWidth={1} />)}
      {rows.map((_, i) => { const [x, y] = pt(i, max); return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--grid)" />; })}
      {series.filter((s) => rows.some((row) => s.values[row.key] != null)).map((s) => (
        <g key={s.key}>
          <polygon points={poly(rows.map((row) => s.values[row.key] ?? null))} fill={s.color} fillOpacity={0.1} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '4 3' : undefined} />
          {rows.map((row, i) => { const v = s.values[row.key]; if (v == null) return null; const [x, y] = pt(i, v); return <circle key={row.key} cx={x} cy={y} r={4} fill="#fff" stroke={s.color} strokeWidth={2} />; })}
        </g>
      ))}
      {rows.map((row, i) => { const [x, y] = pt(i, max + span * 0.1); const anchor = Math.abs(x - c) < 8 ? 'middle' : x > c ? 'start' : 'end'; const words = row.name.split(' '); const lines = words.length > 2 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [row.name]; return <text key={row.key} x={x} y={y + 4 - (lines.length - 1) * 6} textAnchor={anchor} fontSize={11} fill="var(--ink2)">{lines.map((l, li) => <tspan key={li} x={x} dy={li === 0 ? 0 : 12}>{l}</tspan>)}</text>; })}
      <g fontSize={11} fill="var(--ink2)">
        {series.map((s, i) => <g key={s.key} transform={`translate(${12 + i * 110}, ${size - 10})`}><line x1={0} y1={0} x2={20} y2={0} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '4 3' : undefined} /><text x={24} y={4}>{s.label}</text></g>)}
      </g>
    </svg>
  );
}
