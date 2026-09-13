import { describe, expect, it } from 'vitest';
import { computeScores, scoreToScale, validateAnswers, visibleFields } from './engine.js';
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
