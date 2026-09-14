/**
 * Calcolo dei risultati survey (ENG-020/021/025): punteggi per driver e domanda, eNPS, heatmap per segmento
 * con soglia di anonimato e protezione per differenza. Funzioni pure, testate su dataset sintetici.
 */
import type { Answers, FormSchema } from '../forms/schema.js';
import { driverLabel } from './library.js';

export interface ResultRow { answers: Answers; segment?: string | null }
export interface ScaleQuestion { key: string; label: string; driver: string | null; min: number; max: number }
export interface QuestionStat { key: string; label: string; driver: string | null; n: number; avg: number | null; score: number | null; distribution: Record<string, number> }
export interface DriverScore { key: string; label: string; n: number; score: number | null; avg: number | null }
export interface Enps { n: number; promoters: number; passives: number; detractors: number; score: number | null }
export interface HeatmapSegment { key: string; label: string; n: number; suppressed: boolean; drivers: Record<string, number | null>; enps: number | null }

/** Domande a scala del form (escluso l'eNPS) con il driver associato. */
export function scaleQuestions(schema: FormSchema, drivers: Record<string, string>, enpsField: string | null): ScaleQuestion[] {
  const out: ScaleQuestion[] = [];
  for (const s of schema.sections) for (const f of s.fields) if (f.type === 'scale' && f.key !== enpsField) out.push({ key: f.key, label: f.label, driver: drivers[f.key] ?? null, min: f.scale?.min ?? 1, max: f.scale?.max ?? 5 });
  return out;
}
export function textQuestions(schema: FormSchema): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  for (const s of schema.sections) for (const f of s.fields) if (f.type === 'long_text' || f.type === 'short_text') out.push({ key: f.key, label: f.label });
  return out;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const norm = (v: number, q: ScaleQuestion) => (q.max > q.min ? (v - q.min) / (q.max - q.min) : 0);

export function questionStats(q: ScaleQuestion, rows: readonly ResultRow[]): QuestionStat {
  const vals = rows.map((r) => num(r.answers[q.key])).filter((v): v is number => v != null);
  const distribution: Record<string, number> = {};
  for (let v = q.min; v <= q.max; v++) distribution[String(v)] = 0;
  for (const v of vals) distribution[String(v)] = (distribution[String(v)] ?? 0) + 1;
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  return { key: q.key, label: q.label, driver: q.driver, n: vals.length, avg, score: avg == null ? null : norm(avg, q), distribution };
}

export function driverScores(questions: readonly ScaleQuestion[], rows: readonly ResultRow[]): DriverScore[] {
  const byDriver = new Map<string, { sumScore: number; sumAvg: number; n: number }>();
  for (const q of questions) {
    if (!q.driver) continue;
    for (const r of rows) {
      const v = num(r.answers[q.key]);
      if (v == null) continue;
      const d = byDriver.get(q.driver) ?? { sumScore: 0, sumAvg: 0, n: 0 };
      d.sumScore += norm(v, q);
      d.sumAvg += v;
      d.n++;
      byDriver.set(q.driver, d);
    }
  }
  const keys = [...new Set(questions.map((q) => q.driver).filter((d): d is string => !!d))];
  return keys.map((key) => {
    const d = byDriver.get(key);
    return { key, label: driverLabel(key), n: d?.n ?? 0, score: d && d.n ? d.sumScore / d.n : null, avg: d && d.n ? d.sumAvg / d.n : null };
  });
}

/** eNPS = % promotori (9–10) − % detrattori (0–6), arrotondato all'intero. */
export function enpsOf(values: readonly number[]): Enps {
  const n = values.length;
  const promoters = values.filter((v) => v >= 9).length;
  const detractors = values.filter((v) => v <= 6).length;
  const passives = n - promoters - detractors;
  return { n, promoters, passives, detractors, score: n ? Math.round(((promoters - detractors) / n) * 100) : null };
}
export const enpsValues = (rows: readonly ResultRow[], enpsField: string | null): number[] => (enpsField ? rows.map((r) => num(r.answers[enpsField])).filter((v): v is number => v != null) : []);

/**
 * Heatmap segmenti × driver (ENG-021) con soglia: un segmento con meno di `threshold` risposte è soppresso;
 * se, tra i segmenti, esattamente uno è soppresso e il totale è visibile, viene soppresso anche il più piccolo
 * dei rimanenti (protezione per differenza, ENG §6).
 */
export function heatmap(questions: readonly ScaleQuestion[], rows: readonly ResultRow[], enpsField: string | null, threshold: number, labelOf: (key: string) => string): HeatmapSegment[] {
  const groups = new Map<string, ResultRow[]>();
  for (const r of rows) {
    const k = r.segment ?? '';
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const segs: HeatmapSegment[] = [...groups.entries()].map(([key, list]) => ({
    key,
    label: key ? labelOf(key) : 'Non assegnato',
    n: list.length,
    suppressed: list.length < threshold,
    drivers: Object.fromEntries(driverScores(questions, list).map((d) => [d.key, d.score])),
    enps: enpsOf(enpsValues(list, enpsField)).score,
  }));
  const suppressedIdx = segs.map((s, i) => (s.suppressed ? i : -1)).filter((i) => i >= 0);
  if (suppressedIdx.length === 1 && segs.length > 1) {
    let smallest = -1;
    segs.forEach((s, i) => {
      if (s.suppressed) return;
      if (smallest < 0 || s.n < segs[smallest]!.n) smallest = i;
    });
    if (smallest >= 0) segs[smallest]!.suppressed = true;
  }
  for (const s of segs) if (s.suppressed) {
    for (const k of Object.keys(s.drivers)) s.drivers[k] = null;
    s.enps = null;
  }
  return segs.sort((a, b) => a.label.localeCompare(b.label, 'it'));
}

/** Fascia di anzianità dalla data di assunzione (segmento "tenure"). */
export function tenureBand(hireDate: string | null | undefined, asOf = new Date()): string | null {
  if (!hireDate) return null;
  const years = (asOf.getTime() - new Date(hireDate).getTime()) / (365.25 * 86400000);
  return years < 1 ? '<1 anno' : years < 3 ? '1–3 anni' : years < 5 ? '3–5 anni' : '5+ anni';
}
