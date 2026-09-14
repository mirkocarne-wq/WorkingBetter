/**
 * Logica pura del query engine (ADR-0006): calcolo delle metriche dai fatti aggregati
 * e applicazione delle soglie di anonimato con protezione per differenza (ANA-090).
 */
import type { FactKey, MetricDef } from './catalog.js';

/** Somme dei fatti per un gruppo (chiave della dimensione) + numero di persone distinte nel gruppo. */
export interface FactGroup {
  key: string;
  label: string;
  persons: number;
  facts: Partial<Record<FactKey, number>>;
}

export interface MetricCell {
  /** valore calcolato; null se non calcolabile (denominatore 0) o soppresso */
  value: number | null;
  /** dimensione del gruppo usata per la soglia */
  size: number;
  suppressed: boolean;
}

export interface MetricRow {
  key: string;
  label: string;
  persons: number;
  cells: Record<string, MetricCell>;
}

/** Calcola il valore grezzo di una metrica da un gruppo di fatti (senza soglie). */
export function computeMetric(m: MetricDef, g: FactGroup): { value: number | null; size: number } {
  const f = (k: FactKey) => g.facts[k] ?? 0;
  if (m.calc.type === 'sum') return { value: f(m.calc.fact), size: g.persons };
  const den = f(m.calc.den);
  if (den <= 0) return { value: null, size: 0 };
  // la soglia si misura sulle persone del gruppo; per le metriche sensibili sul denominatore (es. review valutate)
  return { value: f(m.calc.num) / den, size: m.sensitive ? den : g.persons };
}

/**
 * Applica il catalogo ai gruppi: calcolo + soppressione sotto soglia.
 * Protezione per differenza (solo metriche sensibili): se, tra i gruppi mostrati insieme a un totale, esattamente uno
 * è soppresso, viene soppresso anche il gruppo più piccolo tra i rimanenti (altrimenti totale − visibili = soppresso).
 */
/**
 * `personLevel`: i gruppi sono singole persone dentro un perimetro lecito (es. il manager sul proprio team):
 * le soglie di gruppo non si applicano alle metriche non sensibili (quelle sensibili non arrivano mai a questa grana).
 */
export function evaluate(metrics: readonly MetricDef[], groups: readonly FactGroup[], opts: { withTotal?: boolean; personLevel?: boolean } = {}): MetricRow[] {
  const rows: MetricRow[] = groups.map((g) => ({ key: g.key, label: g.label, persons: g.persons, cells: {} }));
  for (const m of metrics) {
    const raw = groups.map((g) => computeMetric(m, g));
    const threshold = opts.personLevel && !m.sensitive ? 0 : m.minGroupSize;
    const suppressed = raw.map((r) => threshold > 0 && r.size < threshold && r.value != null);
    if (opts.withTotal && m.sensitive && threshold > 0) {
      const idx = suppressed.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
      if (idx.length === 1) {
        let smallest = -1;
        raw.forEach((r, i) => {
          if (suppressed[i] || r.value == null) return;
          if (smallest < 0 || r.size < raw[smallest]!.size) smallest = i;
        });
        if (smallest >= 0) suppressed[smallest] = true;
      }
    }
    rows.forEach((row, i) => {
      const r = raw[i]!;
      row.cells[m.key] = { value: suppressed[i] ? null : r.value, size: r.size, suppressed: suppressed[i]! };
    });
  }
  return rows;
}

/** Formattazione coerente per UI ed export (locale it-IT). */
export function formatMetricValue(m: MetricDef, value: number | null): string {
  if (value == null) return '—';
  switch (m.format) {
    case 'percent':
      return `${Math.round(value * 100)}%`;
    case 'avg':
      return value.toLocaleString('it-IT', { maximumFractionDigits: 1 });
    case 'score':
      return value.toLocaleString('it-IT', { maximumFractionDigits: 2 });
    default:
      return String(Math.round(value));
  }
}
