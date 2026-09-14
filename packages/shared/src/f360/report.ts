/**
 * Costruzione del report 360° (F360-020/021): funzione pura, testata su dataset sintetici.
 * Regole (spec §6): self e manager mai anonimi; le categorie anonime sotto soglia confluiscono in "Altri";
 * se anche "Altri" è sotto soglia, punteggi e commenti di quelle risposte non vengono mostrati; i commenti
 * anonimi non sono mai attribuiti e l'ordine è rimescolato; "altri" (media dei non-self) usa solo le
 * risposte visibili, così la differenza con il manager non rivela mai un gruppo sotto soglia.
 */
import { F360CategoryLabels, type F360Category, type F360CategoryConfig, type F360ResponseInput } from './types.js';

export const MERGED_CATEGORY = 'others_merged';
export const MERGED_LABEL = 'Altri';

export interface F360CategoryStat {
  /** categoria oppure `others_merged` per il gruppo accorpato */
  key: string;
  label: string;
  invited: number;
  responded: number;
  /** false = nascosta (sotto soglia anche dopo l'accorpamento) */
  shown: boolean;
  /** categorie originarie accorpate (solo per `others_merged`) */
  merged: F360Category[];
  anonymous: boolean;
}

export interface F360CompetencyResult {
  competencyKey: string;
  self: number | null;
  /** media per categoria visibile (chiave categoria o `others_merged`) */
  byCategory: Record<string, { n: number; avg: number }>;
  /** media di tutte le risposte non-self visibili */
  others: number | null;
  othersN: number;
  /** self − others (positivo = la persona si vede meglio di come la vedono gli altri) */
  gap: number | null;
  /** commenti: attribuiti solo per le categorie non anonime */
  comments: { category: string; text: string }[];
}

export interface F360Report {
  generatedAt: string;
  threshold: number;
  categories: F360CategoryStat[];
  competencies: F360CompetencyResult[];
  overall: { self: number | null; others: number | null; manager: number | null };
  strengths: string[];
  developmentAreas: string[];
  /** risposte alle domande aperte per chiave, rimescolate, senza attribuzione per le categorie anonime */
  openAnswers: Record<string, { category: string; text: string }[]>;
  responses: number;
}

export interface BuildF360Input {
  competencyKeys: readonly string[];
  categories: readonly F360CategoryConfig[];
  responses: readonly F360ResponseInput[];
  /** invitati per categoria (per il tasso di risposta) */
  invited: Partial<Record<F360Category, number>>;
  threshold: number;
  /** seme del rimescolamento dei commenti (deterministico nei test; nel prodotto un numero casuale) */
  seed?: number;
  now?: Date;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const avg = (vals: number[]) => (vals.length ? round2(vals.reduce((a, b) => a + b, 0) / vals.length) : null);

/** PRNG deterministico (mulberry32) per rimescolare i commenti in modo riproducibile nei test. */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Decide, per ogni categoria, se è mostrata da sola, accorpata in "Altri" o nascosta. */
export function resolveCategories(categories: readonly F360CategoryConfig[], counts: Partial<Record<F360Category, number>>, invited: Partial<Record<F360Category, number>>, threshold: number): { stats: F360CategoryStat[]; bucketOf: Map<F360Category, string | null> } {
  const stats: F360CategoryStat[] = [];
  const bucketOf = new Map<F360Category, string | null>();
  const merged: F360Category[] = [];
  let mergedN = 0;
  let mergedInvited = 0;
  for (const c of categories) {
    if (!c.enabled) continue;
    const n = counts[c.key] ?? 0;
    const inv = invited[c.key] ?? 0;
    if (c.anonymous && n === 0 && inv === 0) continue; // categoria attiva ma senza nomine: non compare
    if (!c.anonymous) {
      stats.push({ key: c.key, label: F360CategoryLabels[c.key], invited: inv, responded: n, shown: n > 0, merged: [], anonymous: false });
      bucketOf.set(c.key, n > 0 ? c.key : null);
    } else if (n >= threshold) {
      stats.push({ key: c.key, label: F360CategoryLabels[c.key], invited: inv, responded: n, shown: true, merged: [], anonymous: true });
      bucketOf.set(c.key, c.key);
    } else {
      merged.push(c.key);
      mergedN += n;
      mergedInvited += inv;
    }
  }
  if (merged.length) {
    const shown = mergedN >= threshold;
    stats.push({ key: MERGED_CATEGORY, label: MERGED_LABEL, invited: mergedInvited, responded: mergedN, shown, merged, anonymous: true });
    for (const k of merged) bucketOf.set(k, shown ? MERGED_CATEGORY : null);
  }
  return { stats, bucketOf };
}

export function buildF360Report(input: BuildF360Input): F360Report {
  const threshold = Math.max(1, input.threshold);
  const counts: Partial<Record<F360Category, number>> = {};
  for (const r of input.responses) counts[r.category] = (counts[r.category] ?? 0) + 1;
  const { stats, bucketOf } = resolveCategories(input.categories, counts, input.invited, threshold);
  const seed = input.seed ?? Math.floor(Math.random() * 2 ** 31);
  const labelOf = (bucket: string) => stats.find((s) => s.key === bucket)?.label ?? bucket;

  const competencies: F360CompetencyResult[] = input.competencyKeys.map((key, idx) => {
    const perBucket = new Map<string, number[]>();
    const othersVals: number[] = [];
    let self: number | null = null;
    const comments: { category: string; text: string }[] = [];
    const anonComments: { category: string; text: string }[] = [];
    for (const r of input.responses) {
      const v = r.ratings[key];
      const bucket = bucketOf.get(r.category) ?? null;
      if (r.category === 'self') {
        if (typeof v === 'number') self = v;
        continue;
      }
      if (!bucket) continue; // nascosta
      if (typeof v === 'number') {
        perBucket.set(bucket, [...(perBucket.get(bucket) ?? []), v]);
        othersVals.push(v);
      }
      const text = (r.comments[key] ?? '').trim();
      if (text) (bucket === r.category && !input.categories.find((c) => c.key === r.category)?.anonymous ? comments : anonComments).push({ category: labelOf(bucket), text });
    }
    const byCategory: Record<string, { n: number; avg: number }> = {};
    for (const [bucket, vals] of perBucket) byCategory[bucket] = { n: vals.length, avg: avg(vals)! };
    const others = avg(othersVals);
    return { competencyKey: key, self, byCategory, others, othersN: othersVals.length, gap: self != null && others != null ? round2(self - others) : null, comments: [...comments, ...shuffle(anonComments, seed + idx)] };
  });

  const rated = competencies.filter((c) => c.others != null);
  const sorted = [...rated].sort((a, b) => b.others! - a.others! || a.competencyKey.localeCompare(b.competencyKey));
  const strengths = sorted.slice(0, 3).map((c) => c.competencyKey);
  const developmentAreas = [...sorted].reverse().slice(0, 3).filter((c) => !strengths.includes(c.competencyKey) || rated.length > 3).map((c) => c.competencyKey);

  const openAnswers: Record<string, { category: string; text: string }[]> = {};
  const openKeys = [...new Set(input.responses.flatMap((r) => Object.keys(r.openAnswers)))];
  openKeys.forEach((k, idx) => {
    const attributed: { category: string; text: string }[] = [];
    const anon: { category: string; text: string }[] = [];
    for (const r of input.responses) {
      const text = (r.openAnswers[k] ?? '').trim();
      if (!text) continue;
      const bucket = r.category === 'self' ? 'self' : (bucketOf.get(r.category) ?? null);
      if (!bucket) continue;
      const anonymous = r.category !== 'self' && !!input.categories.find((c) => c.key === r.category)?.anonymous;
      (anonymous ? anon : attributed).push({ category: r.category === 'self' ? F360CategoryLabels.self : labelOf(bucket), text });
    }
    openAnswers[k] = [...attributed, ...shuffle(anon, seed + 1000 + idx)];
  });

  const selfVals = competencies.map((c) => c.self).filter((v): v is number => v != null);
  const managerVals = competencies.map((c) => c.byCategory.manager?.avg).filter((v): v is number => v != null);
  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    threshold,
    categories: stats,
    competencies,
    overall: { self: avg(selfVals), others: avg(rated.map((c) => c.others!)), manager: avg(managerVals) },
    strengths,
    developmentAreas,
    openAnswers,
    responses: input.responses.length,
  };
}

/** Heatmap aggregata per gruppo (F360-023): media dei punteggi "altri" dei soggetti; gruppi con meno di `threshold` soggetti sono soppressi. */
export interface F360HeatmapRow { key: string; label: string; subjects: number; suppressed: boolean; cells: Record<string, number | null> }
export function heatmapF360(items: readonly { groupKey: string; groupLabel: string; report: Pick<F360Report, 'competencies'> }[], competencyKeys: readonly string[], threshold: number): F360HeatmapRow[] {
  const groups = new Map<string, { label: string; reports: Pick<F360Report, 'competencies'>[] }>();
  for (const it of items) {
    const g = groups.get(it.groupKey) ?? { label: it.groupLabel, reports: [] };
    g.reports.push(it.report);
    groups.set(it.groupKey, g);
  }
  return [...groups.entries()]
    .map(([key, g]) => {
      const suppressed = g.reports.length < threshold;
      const cells: Record<string, number | null> = {};
      for (const ck of competencyKeys) {
        const vals = suppressed ? [] : g.reports.map((r) => r.competencies.find((c) => c.competencyKey === ck)?.others ?? null).filter((v): v is number => v != null);
        cells[ck] = avg(vals);
      }
      return { key, label: g.label, subjects: g.reports.length, suppressed, cells };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}
