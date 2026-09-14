import type { GapRow } from '@/lib/api';

/** Radar atteso vs valutato (DEV-010): SVG puro, server-safe. Le serie usano i token --brand e --s3. */
export function CompetencyRadar({ gaps, names, max = 4, size = 380 }: { gaps: GapRow[]; names: Record<string, string>; max?: number; size?: number }) {
  const rows = gaps.filter((g) => g.expected != null || g.assessed != null);
  if (rows.length < 3) return <div className="sup">Servono almeno tre competenze valutate o attese per il radar.</div>;
  const c = size / 2;
  const r = c - 96;
  const n = rows.length;
  const pt = (i: number, v: number) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    const rr = (Math.max(0, Math.min(max, v)) / max) * r;
    return [c + rr * Math.cos(a), c + rr * Math.sin(a)] as const;
  };
  const poly = (vals: (number | null)[]) => vals.map((v, i) => pt(i, v ?? 0)).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width="100%" style={{ maxWidth: size, display: 'block', margin: '0 auto' }} role="img" aria-label="Radar delle competenze: livello atteso e valutato">
      {Array.from({ length: max }, (_, k) => k + 1).map((lvl) => <polygon key={lvl} points={poly(rows.map(() => lvl))} fill="none" stroke="var(--grid)" strokeWidth={1} />)}
      {rows.map((_, i) => { const [x, y] = pt(i, max); return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="var(--grid)" />; })}
      <polygon points={poly(rows.map((g) => g.expected))} fill="var(--brand)" fillOpacity={0.12} stroke="var(--brand)" strokeWidth={2} strokeDasharray="4 3" />
      <polygon points={poly(rows.map((g) => g.assessed))} fill="var(--s3)" fillOpacity={0.18} stroke="var(--s3)" strokeWidth={2} />
      {rows.map((g, i) => { const [x, y] = pt(i, g.assessed ?? 0); return g.assessed != null ? <circle key={g.competencyKey} cx={x} cy={y} r={4} fill="#fff" stroke="var(--s3)" strokeWidth={2} /> : null; })}
      {rows.map((g, i) => { const [x, y] = pt(i, max + 0.45); const anchor = Math.abs(x - c) < 8 ? 'middle' : x > c ? 'start' : 'end'; return <text key={g.competencyKey} x={x} y={y + 4} textAnchor={anchor} fontSize={11} fill="var(--ink2)">{names[g.competencyKey] ?? g.competencyKey}</text>; })}
      <g fontSize={11} fill="var(--ink2)"><line x1={12} y1={size - 10} x2={32} y2={size - 10} stroke="var(--brand)" strokeWidth={2} strokeDasharray="4 3" /><text x={36} y={size - 6}>atteso</text><line x1={92} y1={size - 10} x2={112} y2={size - 10} stroke="var(--s3)" strokeWidth={2} /><text x={116} y={size - 6}>valutato</text></g>
    </svg>
  );
}
