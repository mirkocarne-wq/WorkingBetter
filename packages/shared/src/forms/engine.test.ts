import { describe, expect, it } from 'vitest';
import { computeDerived, computeScores, scoreToScale, validateAnswers, visibleFields } from './engine.js';
import { formSchema, type FormSchema } from './schema.js';

const schema: FormSchema = formSchema.parse({
  title: 'Review test',
  scoring: { enabled: true },
  sections: [
    {
      key: 'competenze',
      title: 'Competenze',
      weight: 2,
      fields: [
        { key: 'ownership', type: 'scale', label: 'Ownership', required: true, scale: { min: 1, max: 5 }, commentRequiredBelow: 2, commentKey: 'ownership_note' },
        { key: 'ownership_note', type: 'long_text', label: 'Commento', max: 500 },
        { key: 'comunicazione', type: 'scale', label: 'Comunicazione', scale: { min: 1, max: 5, allowNa: true }, weight: 2 },
      ],
    },
    {
      key: 'leadership',
      title: 'Leadership',
      showIf: { field: 'is_manager', equals: true },
      fields: [{ key: 'delega', type: 'scale', label: 'Delega', required: true, scale: { min: 1, max: 4 } }],
    },
    {
      key: 'altro',
      title: 'Altro',
      fields: [
        { key: 'is_manager', type: 'boolean', label: 'È manager?' },
        { key: 'potenziale', type: 'single_choice', label: 'Potenziale', options: [{ value: 'low', label: 'Basso', score: 1 }, { value: 'mid', label: 'Medio', score: 2 }, { value: 'high', label: 'Alto', score: 3 }] },
        { key: 'note', type: 'short_text', label: 'Note', min: 3 },
      ],
    },
  ],
});

describe('validateAnswers', () => {
  it('requires visible required fields only on submit', () => {
    expect(validateAnswers(schema, {}, 'draft')).toEqual([]);
    expect(validateAnswers(schema, {}, 'submit')).toEqual([{ field: 'ownership', message: 'Campo obbligatorio' }]);
  });
  it('hides conditional sections and skips their required fields', () => {
    expect(validateAnswers(schema, { ownership: 4 })).toEqual([]);
    expect(validateAnswers(schema, { ownership: 4, is_manager: true })).toEqual([{ field: 'delega', message: 'Campo obbligatorio' }]);
    expect(visibleFields(schema, { is_manager: true }).map((x) => x.field.key)).toContain('delega');
  });
  it('enforces scale bounds, N/A, choices, lengths and unknown keys', () => {
    const errors = validateAnswers(schema, { ownership: 7, comunicazione: 'na', potenziale: 'nope', note: 'ab', ghost: 1 });
    expect(errors.map((e) => e.field).sort()).toEqual(['ghost', 'note', 'ownership', 'potenziale']);
    expect(validateAnswers(schema, { ownership: 3, comunicazione: 'na' })).toEqual([]);
  });
  it('requires a comment below the threshold', () => {
    expect(validateAnswers(schema, { ownership: 2 })).toEqual([{ field: 'ownership_note', message: 'Commento obbligatorio per valutazioni ≤ 2' }]);
    expect(validateAnswers(schema, { ownership: 2, ownership_note: 'Va migliorata la presa in carico' })).toEqual([]);
  });
});

describe('computeScores', () => {
  it('normalizes scales and weights fields and sections', () => {
    const s = computeScores(schema, { ownership: 5, comunicazione: 3, potenziale: 'high' });
    const comp = s.sections.find((x) => x.section === 'competenze')!;
    // ownership 1.0 (w1) + comunicazione 0.5 (w2) → 2/3
    expect(comp.score).toBeCloseTo(0.6667, 3);
    const altro = s.sections.find((x) => x.section === 'altro')!;
    expect(altro.score).toBe(1);
    // sezioni: competenze w2 (0.6667) + altro w1 (1) → (1.3333+1)/3
    expect(s.total).toBeCloseTo(0.7778, 3);
    expect(s.sections.find((x) => x.section === 'leadership')).toBeUndefined();
  });
  it('ignores N/A and returns null when nothing is scored', () => {
    expect(computeScores(schema, { comunicazione: 'na' }).total).toBeNull();
  });
  it('maps 0..1 to a discrete scale', () => {
    expect(scoreToScale(0.7778, 1, 5)).toBe(4);
    expect(scoreToScale(0, 1, 5)).toBe(1);
    expect(scoreToScale(1, 1, 5)).toBe(5);
  });
});


describe('computeDerived (APP-004): campi calcolati', () => {
  const schema = formSchema.parse({
    title: 'Calcolati', scoring: { enabled: false }, sections: [{ key: 's', title: 'S', fields: [
      { key: 'a', type: 'scale', label: 'A', scale: { min: 1, max: 5 }, weight: 2 },
      { key: 'b', type: 'scale', label: 'B', scale: { min: 1, max: 5 } },
      { key: 'n', type: 'number', label: 'N', min: 0, max: 100 },
      { key: 'opt', type: 'single_choice', label: 'O', options: [{ value: 'x', label: 'X', score: 1 }, { value: 'y', label: 'Y', score: 3 }] },
      { key: 'gate', type: 'boolean', label: 'G' },
      { key: 'hidden', type: 'number', label: 'H', showIf: { field: 'gate', equals: true } },
      { key: 'media', type: 'computed', label: 'Media', compute: { op: 'avg', fields: ['a', 'b'], decimals: 2 } },
      { key: 'pesata', type: 'computed', label: 'Pesata', compute: { op: 'weighted_avg', fields: ['a', 'b'] } },
      { key: 'somma', type: 'computed', label: 'Somma', compute: { op: 'sum', fields: ['n', 'hidden', 'opt'] } },
      { key: 'rating', type: 'computed', label: 'Rating', compute: { op: 'avg', fields: ['a', 'b'], scale: { min: 1, max: 4 } } },
      { key: 'catena', type: 'computed', label: 'Catena', compute: { op: 'max', fields: ['media', 'n'] } },
      { key: 'quanti', type: 'computed', label: 'Quanti', compute: { op: 'count', fields: ['a', 'b', 'n'] } },
    ] }],
  });
  it('media, media pesata, somma con campi nascosti esclusi, mappatura su scala, catena e conteggio', () => {
    const d = computeDerived(schema, { a: 5, b: 2, n: 10, opt: 'y', gate: false, hidden: 99 });
    expect(d.media).toBe(3.5);
    expect(d.pesata).toBe(4); // (5*2 + 2*1) / 3
    expect(d.somma).toBe(13); // 10 + 3 (hidden escluso)
    expect(d.rating).toBe(3); // 3.5 su 1–5 → norm .625 → 1 + .625*3 = 2.9 → 3
    expect(d.catena).toBe(10);
    expect(d.quanti).toBe(3);
  });
  it('senza valori il calcolato è nullo; il conteggio è zero', () => {
    const d = computeDerived(schema, {});
    expect(d.media).toBeNull();
    expect(d.quanti).toBe(0);
  });
  it('i campi calcolati non sono obbligatori né validati, e lo schema rifiuta riferimenti errati', () => {
    expect(validateAnswers(schema, { a: 3, b: 3 }, 'submit').filter((e) => e.field === 'media')).toEqual([]);
    const bad = formSchema.safeParse({ title: 'x', sections: [{ key: 's', title: 'S', fields: [{ key: 't', type: 'short_text', label: 'T' }, { key: 'c', type: 'computed', label: 'C', compute: { op: 'sum', fields: ['t'] } }] }] });
    expect(bad.success).toBe(false);
    const missing = formSchema.safeParse({ title: 'x', sections: [{ key: 's', title: 'S', fields: [{ key: 'c', type: 'computed', label: 'C', compute: { op: 'sum', fields: ['zzz'] } }] }] });
    expect(missing.success).toBe(false);
    const req = formSchema.safeParse({ title: 'x', sections: [{ key: 's', title: 'S', fields: [{ key: 'n', type: 'number', label: 'N' }, { key: 'c', type: 'computed', label: 'C', required: true, compute: { op: 'sum', fields: ['n'] } }] }] });
    expect(req.success).toBe(false);
  });
  it('scaleKey è accettato dallo schema (risolto dall’API alla pubblicazione)', () => {
    const ok = formSchema.safeParse({ title: 'x', sections: [{ key: 's', title: 'S', fields: [{ key: 'q', type: 'scale', label: 'Q', scaleKey: 'likert_5' }] }] });
    expect(ok.success).toBe(true);
  });
});
