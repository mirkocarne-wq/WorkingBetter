import { describe, expect, it } from 'vitest';
import { keyResultProgress, objectiveProgress } from './progress.js';

describe('keyResultProgress', () => {
  it('numeric increasing: 100→150 with 125 is 50%', () => {
    expect(keyResultProgress({ type: 'number', startValue: 100, targetValue: 150, currentValue: 125 })).toBe(0.5);
  });
  it('numeric decreasing: 10→5 with 7 is 60%', () => {
    expect(keyResultProgress({ type: 'number', startValue: 10, targetValue: 5, currentValue: 7 })).toBeCloseTo(0.6);
  });
  it('caps at 100% unless overachievement is enabled', () => {
    const base = { type: 'percent' as const, startValue: 0, targetValue: 100, currentValue: 130 };
    expect(keyResultProgress(base)).toBe(1);
    expect(keyResultProgress({ ...base, allowOverachievement: true })).toBeCloseTo(1.3);
  });
  it('never goes below 0', () => {
    expect(keyResultProgress({ type: 'number', startValue: 10, targetValue: 20, currentValue: 3 })).toBe(0);
  });
  it('boolean and milestone', () => {
    expect(keyResultProgress({ type: 'boolean', startValue: 0, targetValue: 1, currentValue: 1 })).toBe(1);
    expect(keyResultProgress({ type: 'boolean', startValue: 0, targetValue: 1, currentValue: 0 })).toBe(0);
    expect(keyResultProgress({ type: 'milestone', startValue: 0, targetValue: 4, currentValue: 3 })).toBe(0.75);
  });
  it('degenerate span', () => {
    expect(keyResultProgress({ type: 'number', startValue: 5, targetValue: 5, currentValue: 5 })).toBe(1);
    expect(keyResultProgress({ type: 'number', startValue: 5, targetValue: 5, currentValue: 4 })).toBe(0);
  });
});

describe('objectiveProgress', () => {
  it('returns null without key results', () => {
    expect(objectiveProgress([])).toBeNull();
  });
  it('simple average when no weights', () => {
    expect(objectiveProgress([{ progress: 1 }, { progress: 0.5 }, { progress: 0 }])).toBe(0.5);
  });
  it('weighted average when weights are present; missing weights count as 0', () => {
    expect(objectiveProgress([{ progress: 1, weight: 3 }, { progress: 0, weight: 1 }, { progress: 1 }])).toBe(0.75);
  });
});
