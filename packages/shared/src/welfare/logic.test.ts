import { describe, expect, it } from 'vitest';
import { checkThreshold, computeBalance, rolloverAmount, simulatePremium, thresholdPresetsFor, usedByCategory, WelfareCategoryPresets } from './index.js';

describe('welfare ledger', () => {
  it('computes balance and available from movements', () => {
    const b = computeBalance([
      { kind: 'credit', amount: 1000 },
      { kind: 'reserve', amount: 200 },
      { kind: 'release', amount: 200 },
      { kind: 'spend', amount: 200 },
      { kind: 'reserve', amount: 150 },
      { kind: 'adjust', amount: 50 },
      { kind: 'expire', amount: 100 },
      { kind: 'refund', amount: 20 },
    ]);
    expect(b).toEqual({ credited: 1000, spent: 180, reserved: 150, expired: 100, adjusted: 50, balance: 770, available: 620 });
  });
  it('tracks yearly usage per category including pending reservations', () => {
    const used = usedByCategory([
      { kind: 'spend', amount: 100, categoryKey: 'fringe', year: 2026 },
      { kind: 'reserve', amount: 50, categoryKey: 'fringe', year: 2026 },
      { kind: 'spend', amount: 300, categoryKey: 'fringe', year: 2025 },
      { kind: 'spend', amount: 80, categoryKey: 'istruzione', year: 2026 },
    ], 2026);
    expect(used).toEqual({ fringe: 150, istruzione: 80 });
  });
});

describe('thresholds', () => {
  it('splits exempt and taxable portions', () => {
    expect(checkThreshold('exempt', null, 5000, 200)).toMatchObject({ exemptPortion: 200, taxablePortion: 0 });
    expect(checkThreshold('taxable', null, 0, 200)).toMatchObject({ exemptPortion: 0, taxablePortion: 200 });
    expect(checkThreshold('threshold', 1000, 900, 300)).toMatchObject({ exemptPortion: 100, taxablePortion: 200, cumulative: 1200, nearThreshold: true });
    expect(checkThreshold('threshold', 1000, 100, 300)).toMatchObject({ exemptPortion: 300, taxablePortion: 0, nearThreshold: false });
    expect(checkThreshold('threshold', 1000, 700, 150).nearThreshold).toBe(true);
  });
  it('presets: stable categories plus the temporary fringe regime', () => {
    expect(WelfareCategoryPresets.map((c) => c.key)).toContain('fringe');
    const p2026 = thresholdPresetsFor(2026);
    expect(p2026.find((t) => t.categoryKey === 'fringe' && t.condition === null)!.amount).toBe(1000);
    expect(p2026.find((t) => t.categoryKey === 'fringe' && t.condition === 'children')!.amount).toBe(2000);
    expect(thresholdPresetsFor(2030).find((t) => t.categoryKey === 'fringe')!.amount).toBe(258.23);
    expect(p2026.find((t) => t.categoryKey === 'previdenza')!.amount).toBe(5164.57);
  });
});

describe('premium simulator and rollover', () => {
  it('estimates cash vs welfare', () => {
    const s = simulatePremium(2000, 50, { taxRate: 0.1, employeeContributionRate: 0.0919, employerContributionRate: 0.3 });
    expect(s.welfareCredit).toBe(1000);
    expect(s.cashGross).toBe(1000);
    expect(s.cashNet).toBeCloseTo(1000 * (1 - 0.0919) * 0.9, 2);
    expect(s.employeeGain).toBeCloseTo(1000 - 1000 * (1 - 0.0919) * 0.9, 2);
    expect(s.employerSaving).toBe(300);
  });
  it('applies rollover rules', () => {
    expect(rolloverAmount(300, 'none')).toBe(0);
    expect(rolloverAmount(300, 'total')).toBe(300);
    expect(rolloverAmount(300, 'partial', 50)).toBe(150);
    expect(rolloverAmount(-5, 'total')).toBe(0);
  });
});
