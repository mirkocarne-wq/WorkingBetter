import { describe, expect, it } from 'vitest';
import { MetricCatalog, evaluate, factsFor, formatMetricValue, getMetric, validateCatalog, type FactGroup } from './index.js';

describe('metric catalog', () => {
  it('is internally consistent', () => {
    expect(validateCatalog()).toEqual([]);
    expect(MetricCatalog.length).toBeGreaterThanOrEqual(24);
  });
  it('rejects broken definitions', () => {
    const errs = validateCatalog([
      { key: 'Bad Key', name: 'x', description: 'x', formula: 'x', module: 'core', format: 'percent', calc: { type: 'sum', fact: 'headcount' }, dimensions: ['person'], teamVisible: true, sensitive: true, minGroupSize: 1 },
    ]);
    expect(errs.join('\n')).toMatch(/chiave non valida/);
    expect(errs.join('\n')).toMatch(/soglia/);
    expect(errs.join('\n')).toMatch(/grana persona/);
    expect(errs.join('\n')).toMatch(/somma deve avere formato count/);
  });
  it('lists the facts needed by a set of metrics', () => {
    expect(factsFor([getMetric('one_on_one_coverage_30d')!, getMetric('headcount')!]).sort()).toEqual(['has_manager', 'has_one_on_one_30d', 'headcount']);
  });
});

describe('query engine evaluation', () => {
  const rating = getMetric('review_rating_avg')!; // ratio, sensibile, soglia 5 sul denominatore
  const coverage = getMetric('one_on_one_coverage_30d')!; // ratio, soglia 3
  const headcount = getMetric('headcount')!; // somma, nessuna soglia
  const groups: FactGroup[] = [
    { key: 'a', label: 'Prodotto', persons: 8, facts: { headcount: 8, has_manager: 8, has_one_on_one_30d: 6, reviews_rated: 6, review_rating_sum: 24 } },
    { key: 'b', label: 'Vendite', persons: 4, facts: { headcount: 4, has_manager: 4, has_one_on_one_30d: 1, reviews_rated: 4, review_rating_sum: 20 } },
    { key: 'c', label: 'Direzione', persons: 2, facts: { headcount: 2, has_manager: 1, has_one_on_one_30d: 1, reviews_rated: 0 } },
  ];
  it('computes sums and ratios', () => {
    const rows = evaluate([headcount, coverage], groups);
    expect(rows[0]!.cells.headcount!.value).toBe(8);
    expect(rows[0]!.cells.one_on_one_coverage_30d!.value).toBeCloseTo(0.75);
    expect(rows[2]!.cells.one_on_one_coverage_30d).toMatchObject({ value: null, suppressed: true, size: 2 }); // 2 persone < soglia 3
  });
  it('suppresses sensitive metrics below the group threshold', () => {
    const rows = evaluate([rating], groups);
    expect(rows[0]!.cells.review_rating_avg!.value).toBe(4);
    expect(rows[1]!.cells.review_rating_avg).toMatchObject({ value: null, suppressed: true, size: 4 });
    expect(rows[2]!.cells.review_rating_avg).toMatchObject({ value: null, suppressed: false, size: 0 }); // non calcolabile, non "soppresso"
  });
  it('applies complementary suppression when a total is shown', () => {
    const g: FactGroup[] = [
      { key: 'a', label: 'A', persons: 10, facts: { reviews_rated: 10, review_rating_sum: 40 } },
      { key: 'b', label: 'B', persons: 6, facts: { reviews_rated: 6, review_rating_sum: 24 } },
      { key: 'c', label: 'C', persons: 3, facts: { reviews_rated: 3, review_rating_sum: 15 } },
    ];
    const rows = evaluate([rating], g, { withTotal: true });
    expect(rows.map((r) => r.cells.review_rating_avg!.suppressed)).toEqual([false, true, true]); // C sotto soglia → anche B (il più piccolo) per impedire il calcolo per differenza
    const noTotal = evaluate([rating], g);
    expect(noTotal.map((r) => r.cells.review_rating_avg!.suppressed)).toEqual([false, false, true]);
  });
  it('formats values per metric format', () => {
    expect(formatMetricValue(coverage, 0.756)).toBe('76%');
    expect(formatMetricValue(headcount, 12)).toBe('12');
    expect(formatMetricValue(rating, 3.456)).toBe('3,46');
    expect(formatMetricValue(rating, null)).toBe('—');
  });
});
