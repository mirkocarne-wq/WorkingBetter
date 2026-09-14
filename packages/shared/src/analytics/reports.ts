import type { Dimension, MetricDef } from './catalog.js';
import { formatMetricValue } from './engine.js';
import type { MetricRow } from './engine.js';
import { toCsv } from './csv.js';

/**
 * Report salvati sul semantic layer (ANA-050…054, ANA-060): definizione dichiarativa, confronto con il
 * periodo precedente, pianificazione dell'invio. Logica pura condivisa tra API, worker e web.
 */

export const ReportVisualizations = ['table', 'bars', 'trend'] as const;
export type ReportVisualization = (typeof ReportVisualizations)[number];

export interface ReportFilters {
  orgUnitId?: string | null;
  managerId?: string | null;
  cycleId?: string | null;
}

export interface ReportDefinition {
  metrics: string[];
  dimension?: Dimension | null;
  filters?: ReportFilters;
  /** Confronto con lo snapshot di N giorni prima (ANA-054). */
  compareDays?: number | null;
  visualization?: ReportVisualization;
  /** Per la visualizzazione "trend": metrica e finestra. */
  trendMetric?: string | null;
  trendDays?: number | null;
}

export const ScheduleFrequencies = ['daily', 'weekly', 'monthly'] as const;
export type ScheduleFrequency = (typeof ScheduleFrequencies)[number];

export interface ReportSchedule {
  frequency: ScheduleFrequency;
  /** 1 = lunedì … 7 = domenica (weekly). */
  weekday?: number | null;
  /** 1–28 (monthly). */
  dayOfMonth?: number | null;
  /** Ora locale del tenant (0–23) in cui inviare. */
  hour?: number | null;
  /** owner: solo il proprietario; shared: proprietario + destinatari della condivisione. */
  recipients: 'owner' | 'shared';
}

export interface ReportSharing {
  roles: string[];
  userIds: string[];
}

const DAY = 86400000;

/**
 * Prossimo invio dopo `from` (istante), in UTC con l'ora locale approssimata da `tzOffsetMin`.
 * Deterministica: usata dal worker per riprogrammare e dall'API per mostrare "prossimo invio".
 */
export function nextRunAt(s: ReportSchedule, from: Date, tzOffsetMin = 0): Date {
  const hour = s.hour ?? 7;
  const local = from.getTime() + tzOffsetMin * 60000;
  const startOfDay = Math.floor(local / DAY) * DAY;
  for (let d = 0; d < 62; d++) {
    const day = startOfDay + d * DAY;
    const at = day + hour * 3600000;
    if (at <= local) continue;
    const date = new Date(day);
    const weekday = ((date.getUTCDay() + 6) % 7) + 1; // 1 = lunedì
    const ok = s.frequency === 'daily' || (s.frequency === 'weekly' && weekday === (s.weekday ?? 1)) || (s.frequency === 'monthly' && date.getUTCDate() === Math.min(28, s.dayOfMonth ?? 1));
    if (ok) return new Date(at - tzOffsetMin * 60000);
  }
  return new Date(local + 31 * DAY - tzOffsetMin * 60000);
}

export interface ComparedCell {
  value: number | null;
  previous: number | null;
  /** value − previous (in punti per le percentuali), null se uno dei due manca o è soppresso. */
  delta: number | null;
  suppressed: boolean;
}

/** Affianca alle righe correnti quelle dello snapshot precedente (per chiave) e calcola la variazione. */
export function compareRows(metrics: readonly MetricDef[], current: MetricRow[], previous: MetricRow[]): Array<MetricRow & { compared: Record<string, ComparedCell> }> {
  const prev = new Map(previous.map((r) => [r.key, r]));
  return current.map((r) => {
    const p = prev.get(r.key);
    const compared: Record<string, ComparedCell> = {};
    for (const m of metrics) {
      const c = r.cells[m.key];
      const pc = p?.cells[m.key];
      const value = c && !c.suppressed ? c.value : null;
      const previousValue = pc && !pc.suppressed ? pc.value : null;
      compared[m.key] = { value, previous: previousValue, delta: value != null && previousValue != null ? Math.round((value - previousValue) * 10000) / 10000 : null, suppressed: !!c?.suppressed };
    }
    return { ...r, compared };
  });
}

/** Testo della variazione nell'unità della metrica (punti percentuali per le percentuali). */
export function formatDelta(m: MetricDef, delta: number | null): string {
  if (delta == null) return '';
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
  const abs = Math.abs(delta);
  if (m.format === 'percent') return `${sign}${(abs * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 })} pt`;
  return `${sign}${abs.toLocaleString('it-IT', { maximumFractionDigits: 2 })}`;
}

/** CSV di un report: etichetta, persone, una colonna per metrica (e la variazione, se confrontato). */
export function reportCsv(opts: { dimensionLabel: string; metrics: readonly MetricDef[]; rows: MetricRow[]; total: MetricRow | null; compared?: Array<MetricRow & { compared: Record<string, ComparedCell> }> | null }): string {
  const withDelta = !!opts.compared;
  const header = [opts.dimensionLabel, 'Persone', ...opts.metrics.flatMap((m) => (withDelta ? [m.name, `${m.name} · variazione`] : [m.name]))];
  const line = (row: MetricRow, cmp?: Record<string, ComparedCell>) => [
    row.label,
    row.persons,
    ...opts.metrics.flatMap((m) => {
      const c = row.cells[m.key];
      const v = c?.suppressed ? `n<${m.minGroupSize}` : formatMetricValue(m, c?.value ?? null);
      return withDelta ? [v, cmp ? formatDelta(m, cmp[m.key]?.delta ?? null) : ''] : [v];
    }),
  ];
  const cmpByKey = new Map((opts.compared ?? []).map((r) => [r.key, r.compared]));
  const rows = [...opts.rows.map((r) => line(r, cmpByKey.get(r.key))), ...(opts.total ? [line({ ...opts.total, label: 'Totale' }, cmpByKey.get(opts.total.key))] : [])];
  return toCsv(header, rows);
}
