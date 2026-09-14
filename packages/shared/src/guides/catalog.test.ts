import { describe, expect, it } from 'vitest';
import { GuideCatalog, GuideProfileOrder, guideProfileForRoles, guideProfilesAvailable, guideSteps } from './catalog.js';

/** Rotte dell'app web a cui i passi possono puntare (senza query string). */
const KNOWN_ROUTES = ['/dashboard', '/inizia', '/settings', '/people', '/people/import', '/people/users', '/objectives', '/objectives/new', '/one-on-ones', '/feedback', '/reviews', '/surveys', '/welfare', '/welfare/admin', '/development', '/development/admin', '/f360', '/onboarding', '/onboarding/templates', '/apps', '/forms', '/forms/new', '/analytics', '/notifications'];

describe('catalogo avviamento guidato (AVV-006)', () => {
  it('ha chiavi uniche, testi completi e link verso rotte note', () => {
    const keys = new Set<string>();
    for (const profile of GuideProfileOrder) {
      const def = GuideCatalog[profile];
      expect(def.steps.length).toBeGreaterThanOrEqual(5);
      for (const s of def.steps) {
        expect(keys.has(s.key), `chiave duplicata ${s.key}`).toBe(false);
        keys.add(s.key);
        expect(s.why.length).toBeGreaterThan(40);
        expect(s.how.length).toBeGreaterThanOrEqual(2);
        expect(KNOWN_ROUTES).toContain(s.href.split('?')[0]);
        expect(s.manual).toMatch(/^0[1-8]-[a-z-]+\.md(#[a-z-]+)?$/);
      }
    }
  });
  it('ogni profilo ha almeno un passo con controllo automatico e i facoltativi non superano un terzo', () => {
    for (const profile of GuideProfileOrder) {
      const steps = guideSteps(profile);
      expect(steps.some((s) => s.check)).toBe(true);
      expect(steps.filter((s) => s.optional).length).toBeLessThanOrEqual(Math.ceil(steps.length / 3));
    }
  });
  it('mappa i ruoli sul profilo più alto e sui profili consultabili', () => {
    expect(guideProfileForRoles(['employee'])).toBe('employee');
    expect(guideProfileForRoles(['manager', 'employee'])).toBe('manager');
    expect(guideProfileForRoles(['hrbp'])).toBe('hr');
    expect(guideProfileForRoles(['hr_admin', 'manager'])).toBe('hr');
    expect(guideProfileForRoles(['tenant_admin'])).toBe('admin');
    expect(guideProfilesAvailable(['manager'])).toEqual(['manager', 'employee']);
    expect(guideProfilesAvailable(['tenant_admin'])).toEqual(['admin', 'hr', 'manager', 'employee']);
  });
});
