import { describe, expect, it } from 'vitest';
import { formSchema } from '../forms/schema.js';
import { validateAnswers } from '../forms/engine.js';
import { buildSurveyForm, driverScores, enpsOf, heatmap, questionStats, scaleQuestions, SurveyTemplates, tenureBand, type ResultRow } from './index.js';

describe('survey library', () => {
  it('builds valid form-engine schemas for every template', () => {
    for (const t of SurveyTemplates) {
      const built = buildSurveyForm(t.kind, `Test ${t.kind}`);
      const parsed = formSchema.safeParse(built.schema);
      expect(parsed.success, `${t.kind}: ${JSON.stringify(parsed.success ? null : parsed.error.issues)}`).toBe(true);
      if (t.enps) expect(built.enpsField).toBe('enps');
    }
  });
  it('rotates pulse questions across the library', () => {
    const a = buildSurveyForm('pulse', 'P1', { rotation: 0 }).questionKeys;
    const b = buildSurveyForm('pulse', 'P2', { rotation: 1 }).questionKeys;
    const c = buildSurveyForm('pulse', 'P3', { rotation: 2 }).questionKeys;
    expect(a).toHaveLength(5);
    expect(new Set([...a, ...b, ...c]).size).toBe(14); // 15 slot su 14 domande: una si ripete, tutte coperte
  });
  it('the built form validates answers like any other form', () => {
    const built = buildSurveyForm('enps', 'E');
    const schema = formSchema.parse(built.schema);
    expect(validateAnswers(schema, {}, 'submit').map((e) => e.field)).toEqual(['enps']);
    expect(validateAnswers(schema, { enps: 9 }, 'submit')).toEqual([]);
  });
});

describe('survey results', () => {
  const built = buildSurveyForm('engagement', 'Eng');
  const schema = formSchema.parse(built.schema);
  const qs = scaleQuestions(schema, built.drivers, built.enpsField);
  const row = (segment: string, lead: number, ben: number, enps: number): ResultRow => ({ segment, answers: { q_lead_fiducia: lead, q_lead_manager: lead, q_ben_carico: ben, q_ben_equilibrio: ben, enps } });
  const rows: ResultRow[] = [
    ...Array.from({ length: 6 }, () => row('prodotto', 4, 2, 9)),
    ...Array.from({ length: 5 }, () => row('vendite', 5, 4, 7)),
    ...Array.from({ length: 2 }, () => row('direzione', 3, 3, 2)),
  ];
  it('computes driver scores normalized 0..1 and raw averages', () => {
    const d = driverScores(qs, rows);
    const lead = d.find((x) => x.key === 'leadership')!;
    expect(lead.n).toBe(26); // 13 risposte × 2 domande
    expect(lead.avg).toBeCloseTo((6 * 4 + 5 * 5 + 2 * 3) / 13);
    expect(lead.score).toBeCloseTo((lead.avg! - 1) / 4);
    expect(d.find((x) => x.key === 'crescita')!.score).toBeNull(); // nessuna risposta
  });
  it('computes question distribution and eNPS', () => {
    const s = questionStats(qs.find((q) => q.key === 'q_ben_carico')!, rows);
    expect(s.distribution).toMatchObject({ '2': 6, '4': 5, '3': 2 });
    const e = enpsOf([9, 9, 9, 9, 9, 9, 7, 7, 7, 7, 7, 2, 2]);
    expect(e).toMatchObject({ n: 13, promoters: 6, passives: 5, detractors: 2 });
    expect(e.score).toBe(Math.round(((6 - 2) / 13) * 100));
    expect(enpsOf([]).score).toBeNull();
  });
  it('suppresses segments below threshold and protects by difference', () => {
    const h = heatmap(qs, rows, built.enpsField, 5, (k) => k.toUpperCase());
    const by = Object.fromEntries(h.map((s) => [s.key, s]));
    expect(by.direzione!.suppressed).toBe(true); // 2 < 5
    expect(by.vendite!.suppressed).toBe(true); // complementare: unico altro soppresso → il più piccolo dei restanti
    expect(by.prodotto!.suppressed).toBe(false);
    expect(by.prodotto!.drivers.benessere).toBeCloseTo(0.25);
    expect(by.direzione!.drivers.leadership).toBeNull();
    expect(by.direzione!.enps).toBeNull();
    const h3 = heatmap(qs, rows, built.enpsField, 3, (k) => k);
    expect(h3.map((s) => [s.key, s.suppressed])).toEqual([['direzione', true], ['prodotto', false], ['vendite', true]]); // 2 < 3 → soppresso, e con esso il più piccolo dei restanti
    const h2 = heatmap(qs, rows, built.enpsField, 2, (k) => k);
    expect(h2.every((s) => !s.suppressed)).toBe(true);
  });
  it('tenure bands', () => {
    const asOf = new Date('2026-09-13');
    expect(tenureBand('2026-03-01', asOf)).toBe('<1 anno');
    expect(tenureBand('2024-01-01', asOf)).toBe('1–3 anni');
    expect(tenureBand('2019-01-01', asOf)).toBe('5+ anni');
    expect(tenureBand(null)).toBeNull();
  });
});
