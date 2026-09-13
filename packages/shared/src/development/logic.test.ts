import { describe, expect, it } from 'vitest';
import { computeGap, nineBoxLabel, performanceBand, planProgress, suggestActions, usedLevel } from './logic.js';
import { CompetencyPresets, SuggestedActions } from './presets.js';

describe('sviluppo: presets', () => {
  it('ogni competenza ha 4 livelli e almeno un’azione suggerita', () => {
    for (const c of CompetencyPresets) {
      expect(c.levels.map((l) => l.level)).toEqual([1, 2, 3, 4]);
      expect(SuggestedActions.some((a) => a.competencyKey === c.key)).toBe(true);
    }
    expect(new Set(CompetencyPresets.map((c) => c.key)).size).toBe(CompetencyPresets.length);
  });
});

describe('sviluppo: gap e suggerimenti', () => {
  const expected = [{ competencyKey: 'communication', level: 3 }, { competencyKey: 'ownership', level: 2 }, { competencyKey: 'planning', level: 3 }];
  const assessments = [
    { competencyKey: 'communication', source: 'self' as const, level: 3, assessedAt: '2026-09-01' },
    { competencyKey: 'communication', source: 'manager' as const, level: 2, assessedAt: '2026-09-02' },
    { competencyKey: 'communication', source: 'manager' as const, level: 1, assessedAt: '2026-01-02' }, // vecchia, ignorata
    { competencyKey: 'ownership', source: 'manager' as const, level: 3, assessedAt: '2026-09-02' },
    { competencyKey: 'decision_making', source: 'self' as const, level: 2, assessedAt: '2026-09-02' },
  ];
  it('usa l’ultima valutazione per fonte e la policy manager per default', () => {
    const gaps = computeGap(expected, assessments);
    const comm = gaps.find((g) => g.competencyKey === 'communication')!;
    expect(comm.bySource).toEqual({ self: 3, manager: 2 });
    expect(comm.assessed).toBe(2);
    expect(comm.gap).toBe(1);
    expect(gaps.find((g) => g.competencyKey === 'ownership')!.gap).toBe(-1);
    expect(gaps.find((g) => g.competencyKey === 'planning')!.gap).toBeNull();
    expect(gaps.find((g) => g.competencyKey === 'decision_making')!.expected).toBeNull();
    expect(gaps[0]!.competencyKey).toBe('communication'); // gap maggiore per primo
    expect(usedLevel({ self: 3, manager: 2 }, 'average')).toBe(2.5);
    expect(usedLevel({ self: 3 }, 'manager')).toBe(3);
  });
  it('suggerisce azioni solo per i gap positivi, vicine al livello atteso', () => {
    const acts = suggestActions(computeGap(expected, assessments));
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.every((a) => a.competencyKey === 'communication')).toBe(true);
    expect(acts[0]!.targetLevel).toBe(3);
  });
});

describe('sviluppo: piano e 9-box', () => {
  it('calcola avanzamento e scadute; mappa rating e potenziale nel 9-box', () => {
    expect(planProgress([{ status: 'done' }, { status: 'open', dueDate: '2026-01-01' }, { status: 'cancelled' }, { status: 'open', dueDate: '2030-01-01' }], '2026-09-13')).toEqual({ total: 3, done: 1, overdue: 1, percent: 33 });
    expect(performanceBand(5, { min: 1, max: 5 })).toBe(3);
    expect(performanceBand(3, { min: 1, max: 5 })).toBe(2);
    expect(performanceBand(1, { min: 1, max: 5 })).toBe(1);
    expect(performanceBand(null, { min: 1, max: 5 })).toBeNull();
    expect(nineBoxLabel(3, 3)).toBe('Stella');
    expect(nineBoxLabel(2, null)).toBeNull();
  });
});
