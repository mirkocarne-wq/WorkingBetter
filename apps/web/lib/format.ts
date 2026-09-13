/** Formattazione dei valori del catalogo metriche (usabile anche nei componenti client). */
export type MetricFormat = 'count' | 'percent' | 'avg' | 'score';
export function fmtMetric(format: MetricFormat, value: number | null): string {
  if (value == null) return '—';
  if (format === 'percent') return `${Math.round(value * 100)}%`;
  if (format === 'avg') return value.toLocaleString('it-IT', { maximumFractionDigits: 1 });
  if (format === 'score') return value.toLocaleString('it-IT', { maximumFractionDigits: 2 });
  return String(Math.round(value));
}
