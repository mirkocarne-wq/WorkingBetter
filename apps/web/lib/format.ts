/** Formattazione dei valori del catalogo metriche (usabile anche nei componenti client). */
export type MetricFormat = 'count' | 'percent' | 'avg' | 'score';
export function fmtMetric(format: MetricFormat, value: number | null): string {
  if (value == null) return '—';
  if (format === 'percent') return `${Math.round(value * 100)}%`;
  if (format === 'avg') return value.toLocaleString('it-IT', { maximumFractionDigits: 1 });
  if (format === 'score') return value.toLocaleString('it-IT', { maximumFractionDigits: 2 });
  return String(Math.round(value));
}

/** Variazione fra due valori della stessa metrica: in punti per le percentuali, altrimenti nel formato della metrica. */
export function fmtDelta(format: MetricFormat, delta: number | null): string {
  if (delta == null) return '';
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
  const abs = Math.abs(delta);
  return format === 'percent' ? `${sign}${(abs * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 })} pt` : `${sign}${abs.toLocaleString('it-IT', { maximumFractionDigits: format === 'count' ? 0 : 2 })}`;
}
