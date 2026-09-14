import { describe, expect, it } from 'vitest';
import { getMetric } from './catalog.js';
import { compareRows, formatDelta, nextRunAt, reportCsv } from './reports.js';

describe('report salvati', () => {
  it('nextRunAt: settimanale il lunedì alle 7 locali, mensile il giorno scelto, giornaliero domani se l’ora è passata', () => {
    const from = new Date('2026-09-16T10:00:00Z'); // mercoledì 12:00 Europe/Rome (UTC+2)
    expect(nextRunAt({ frequency: 'weekly', weekday: 1, hour: 7, recipients: 'owner' }, from, 120).toISOString()).toBe('2026-09-21T05:00:00.000Z');
    expect(nextRunAt({ frequency: 'monthly', dayOfMonth: 1, hour: 8, recipients: 'owner' }, from, 120).toISOString()).toBe('2026-10-01T06:00:00.000Z');
    expect(nextRunAt({ frequency: 'daily', hour: 7, recipients: 'owner' }, from, 120).toISOString()).toBe('2026-09-17T05:00:00.000Z');
    expect(nextRunAt({ frequency: 'daily', hour: 18, recipients: 'owner' }, from, 120).toISOString()).toBe('2026-09-16T16:00:00.000Z');
  });

  it('compareRows calcola la variazione e rispetta la soppressione', () => {
    const m = getMetric('people_with_objectives_share')!;
    const cur = [{ key: 'u1', label: 'Prodotto', persons: 6, cells: { [m.key]: { value: 0.8, size: 6, suppressed: false } } }, { key: 'u2', label: 'Piccola', persons: 2, cells: { [m.key]: { value: null, size: 2, suppressed: true } } }];
    const prev = [{ key: 'u1', label: 'Prodotto', persons: 6, cells: { [m.key]: { value: 0.65, size: 6, suppressed: false } } }];
    const out = compareRows([m], cur, prev);
    expect(out[0]!.compared[m.key]).toEqual({ value: 0.8, previous: 0.65, delta: 0.15, suppressed: false });
    expect(out[1]!.compared[m.key]!.delta).toBeNull();
    expect(formatDelta(m, 0.15)).toBe('+15 pt');
    expect(formatDelta(getMetric('headcount')!, -3)).toBe('−3');
  });

  it('reportCsv aggiunge la colonna variazione quando c’è il confronto', () => {
    const m = getMetric('headcount')!;
    const rows = [{ key: 'u1', label: 'Prodotto', persons: 6, cells: { headcount: { value: 6, size: 6, suppressed: false } } }];
    const csv = reportCsv({ dimensionLabel: 'Unità', metrics: [m], rows, total: null, compared: compareRows([m], rows, [{ ...rows[0]!, cells: { headcount: { value: 5, size: 5, suppressed: false } } }]) });
    expect(csv).toContain('Unità;Persone;Persone attive;Persone attive · variazione');
    expect(csv).toContain('Prodotto;6;6;+1');
  });
});
