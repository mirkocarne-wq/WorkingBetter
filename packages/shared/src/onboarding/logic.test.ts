import { describe, expect, it } from 'vitest';
import { OnboardingPresets, dayIndex, dueDateFrom, journeyComplete, journeyProgress, matchTemplate, onboardingSurveyScore, resolveAssignee, suggestBuddies } from './index.js';

describe('onboarding: date, avanzamento e regole', () => {
  it('scadenze relative e giorno relativo', () => {
    expect(dueDateFrom('2026-09-01', -7)).toBe('2026-08-25');
    expect(dueDateFrom('2026-09-01', 30)).toBe('2026-10-01');
    expect(dayIndex('2026-09-01', '2026-09-08')).toBe(7);
  });
  it('avanzamento: gli skippati escono dal denominatore, gli scaduti si contano solo se aperti', () => {
    const p = journeyProgress([
      { status: 'done', dueDate: '2026-01-01', required: true },
      { status: 'open', dueDate: '2026-01-01', required: true },
      { status: 'open', dueDate: '2099-01-01', required: false },
      { status: 'skipped', dueDate: '2026-01-01', required: false },
    ], '2026-06-01');
    expect(p).toEqual({ total: 4, done: 1, skipped: 1, overdue: 1, requiredOpen: 1, percent: 33 });
    expect(journeyComplete([{ status: 'done', required: true }, { status: 'open', required: false }])).toBe(true);
    expect(journeyComplete([{ status: 'open', required: true }])).toBe(false);
  });
  it('assegnazione automatica del template: parole chiave del ruolo, sede, unità; altrimenti il default', () => {
    const presets = OnboardingPresets;
    expect(matchTemplate(presets, { jobTitle: 'Engineering Manager' })!.name).toBe('Onboarding manager');
    expect(matchTemplate(presets, { jobTitle: 'Developer', location: 'Remoto' })!.name).toBe('Onboarding da remoto');
    expect(matchTemplate(presets, { jobTitle: 'Developer', location: 'Milano' })!.name).toBe('Onboarding generico');
    expect(matchTemplate(presets, { jobTitle: 'Developer' }, 'offboarding')!.name).toBe('Offboarding');
    const withUnit = [{ kind: 'onboarding', rules: { orgUnitIds: ['u1'] }, name: 'Unità' }, { kind: 'onboarding', isDefault: true, name: 'Default' }];
    expect(matchTemplate(withUnit, { orgUnitId: 'u2', orgUnitPath: '/root/u1/u2/' })!.name).toBe('Unità');
    expect(matchTemplate(withUnit, { orgUnitId: 'u3', orgUnitPath: '/root/u3/' })!.name).toBe('Default');
  });
  it('suggerimenti buddy: stesso team prima, esclusi manager, neoassunti recenti e chi ha già buddy', () => {
    const s = suggestBuddies([
      { id: 'mgr', managerId: null, orgUnitId: 'u', hireDate: '2020-01-01' },
      { id: 'a', managerId: 'mgr', orgUnitId: 'u', hireDate: '2021-01-01' },
      { id: 'b', managerId: 'mgr', orgUnitId: 'u', hireDate: '2026-08-01' },
      { id: 'c', managerId: 'other', orgUnitId: 'u', hireDate: '2019-01-01', activeBuddies: 1 },
      { id: 'd', managerId: 'other', orgUnitId: 'z', hireDate: '2019-01-01' },
    ], { id: 'new', managerId: 'mgr', orgUnitId: 'u' }, '2026-09-14');
    expect(s.map((x) => x.id)).toEqual(['a', 'c']);
    expect(s[0]!.reason).toBe('stesso team');
  });
  it('survey: media e alert su punteggio basso', () => {
    expect(onboardingSurveyScore('d7', { welcome: 5, tools: 4, clarity: 4, support: 5 })).toEqual({ score: 4.5, low: false, answered: 4 });
    expect(onboardingSurveyScore('d7', { welcome: 4, tools: 2, clarity: 4, support: 4 }).low).toBe(true);
    expect(onboardingSurveyScore('d30', {}).score).toBeNull();
  });
  it('assegnatario per ruolo con i fallback', () => {
    const ctx = { personId: 'p', managerId: 'm', buddyId: null, hrId: 'h', itId: null };
    expect(resolveAssignee({ role: 'buddy' }, ctx)).toBe('m');
    expect(resolveAssignee({ role: 'it' }, ctx)).toBe('h');
    expect(resolveAssignee({ role: 'manager' }, { ...ctx, managerId: null })).toBe('h');
  });
  it('i preset hanno chiavi uniche e fasi coerenti', () => {
    for (const p of OnboardingPresets) {
      const keys = p.tasks.map((x) => x.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const x of p.tasks) expect(p.phases.some((ph) => ph.key === x.phase), `${p.name}: fase ${x.phase}`).toBe(true);
    }
  });
});
