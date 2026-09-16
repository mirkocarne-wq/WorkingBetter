import { describe, expect, it } from 'vitest';
import { isModuleEnabled, resolveNaming, validateCustomFields, visibleFieldDefs, type PersonFieldDef } from './index.js';

const defs: PersonFieldDef[] = [
  { key: 'contract', label: 'Contratto', type: 'single_choice', options: [{ value: 'perm', label: 'Indeterminato' }], required: true, visibility: 'all', position: 0 },
  { key: 'band', label: 'Fascia', type: 'number', options: [], required: false, visibility: 'hr', position: 1 },
  { key: 'start', label: 'Inizio', type: 'date', options: [], required: false, visibility: 'manager', position: 2 },
  { key: 'remote', label: 'Remoto', type: 'boolean', options: [], required: false, visibility: 'all', position: 3 },
  { key: 'notes', label: 'Note', type: 'text', options: [], required: false, visibility: 'hr', position: 4 },
];

describe('validateCustomFields', () => {
  it('normalizes values by type and flags unknown keys', () => {
    const r = validateCustomFields(defs, { contract: 'perm', band: '3,5', start: '2026-01-31', remote: 'no', notes: 'x'.repeat(600), ghost: 1 });
    expect(r.errors).toEqual({ ghost: 'campo non previsto dal catalogo' });
    expect(r.values).toEqual({ contract: 'perm', band: 3.5, start: '2026-01-31', remote: false, notes: 'x'.repeat(500) });
  });
  it('reports type errors per key', () => {
    const r = validateCustomFields(defs, { contract: 'temp', band: 'abc', start: '31/01/2026', remote: 'forse' });
    expect(r.errors).toEqual({ contract: 'opzione non valida', band: 'numero atteso', start: 'data AAAA-MM-GG attesa', remote: 'sì/no atteso' });
  });
  it('empty values are skipped unless requireAll asks for required ones', () => {
    expect(validateCustomFields(defs, { contract: '' }).errors).toEqual({});
    expect(validateCustomFields(defs, { band: 2 }, { requireAll: true }).errors).toEqual({ contract: 'obbligatorio' });
  });
});

describe('visibleFieldDefs', () => {
  it('filters by viewer', () => {
    expect(visibleFieldDefs(defs, 'hr').map((d) => d.key)).toEqual(['contract', 'band', 'start', 'remote', 'notes']);
    expect(visibleFieldDefs(defs, 'manager').map((d) => d.key)).toEqual(['contract', 'start', 'remote']);
    expect(visibleFieldDefs(defs, 'self').map((d) => d.key)).toEqual(['contract', 'remote']);
    expect(visibleFieldDefs(defs, 'other').map((d) => d.key)).toEqual(['contract', 'remote']);
  });
});

describe('resolveNaming', () => {
  it('falls back to defaults per locale and fills the missing half', () => {
    expect(resolveNaming('it', null).objective).toEqual({ singular: 'Obiettivo', plural: 'Obiettivi' });
    expect(resolveNaming('en-GB', {}).objective.plural).toBe('Objectives');
    expect(resolveNaming('xx', {}).review.singular).toBe('Review');
    const n = resolveNaming('it', { objective: { singular: 'Priorità' }, review: { singular: '  ', plural: '' } });
    expect(n.objective).toEqual({ singular: 'Priorità', plural: 'Obiettivi' });
    expect(n.review).toEqual({ singular: 'Review', plural: 'Review' });
  });
});

describe('isModuleEnabled', () => {
  it('treats missing settings as enabled', () => {
    expect(isModuleEnabled(null, 'okr')).toBe(true);
    expect(isModuleEnabled({}, 'okr')).toBe(true);
    expect(isModuleEnabled({ modules: { okr: false } }, 'okr')).toBe(false);
    expect(isModuleEnabled({ modules: { okr: false } }, 'reviews')).toBe(true);
  });
});
