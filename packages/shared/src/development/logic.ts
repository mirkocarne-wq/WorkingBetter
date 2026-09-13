import { SuggestedActions, type SuggestedAction } from './presets.js';

/** Logica pura del modulo Sviluppo (DEV-010/011/013, DEV-032). */

export type AssessmentSource = 'self' | 'manager' | 'review' | '360';
export interface Assessment {
  competencyKey: string;
  source: AssessmentSource;
  level: number;
  assessedAt: string;
}
export interface ExpectedLevel {
  competencyKey: string;
  level: number;
}
/** Quale fonte usare per il gap (DEV §6): manager, media delle fonti, o 360 se disponibile. */
export type GapPolicy = 'manager' | 'average' | '360';

export interface GapRow {
  competencyKey: string;
  expected: number | null;
  bySource: Partial<Record<AssessmentSource, number>>;
  /** livello usato per il gap secondo la policy; null se nessuna fonte disponibile */
  assessed: number | null;
  /** expected − assessed (positivo = manca); null se manca uno dei due */
  gap: number | null;
}

/** Ultima valutazione per (competenza, fonte). */
export function latestBySource(assessments: readonly Assessment[]): Map<string, Partial<Record<AssessmentSource, number>>> {
  const out = new Map<string, Partial<Record<AssessmentSource, number>>>();
  const seen = new Map<string, string>();
  for (const a of [...assessments].sort((x, y) => x.assessedAt.localeCompare(y.assessedAt))) {
    const k = `${a.competencyKey}|${a.source}`;
    if (seen.has(k) && seen.get(k)! > a.assessedAt) continue;
    seen.set(k, a.assessedAt);
    out.set(a.competencyKey, { ...(out.get(a.competencyKey) ?? {}), [a.source]: a.level });
  }
  return out;
}

export function usedLevel(bySource: Partial<Record<AssessmentSource, number>>, policy: GapPolicy): number | null {
  if (policy === '360' && bySource['360'] != null) return bySource['360'];
  if (policy === 'average') {
    const vals = Object.values(bySource).filter((v): v is number => v != null);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  }
  return bySource.manager ?? bySource['360'] ?? bySource.review ?? bySource.self ?? null;
}

/** Gap per competenza rispetto a un profilo atteso (DEV-010/013). Include anche le competenze valutate ma non attese. */
export function computeGap(expected: readonly ExpectedLevel[], assessments: readonly Assessment[], policy: GapPolicy = 'manager'): GapRow[] {
  const latest = latestBySource(assessments);
  const keys = [...new Set([...expected.map((e) => e.competencyKey), ...latest.keys()])];
  return keys
    .map((competencyKey) => {
      const exp = expected.find((e) => e.competencyKey === competencyKey)?.level ?? null;
      const bySource = latest.get(competencyKey) ?? {};
      const assessed = usedLevel(bySource, policy);
      return { competencyKey, expected: exp, bySource, assessed, gap: exp != null && assessed != null ? Math.round((exp - assessed) * 10) / 10 : null };
    })
    .sort((a, b) => (b.gap ?? -99) - (a.gap ?? -99));
}

/** Azioni suggerite per le competenze con gap positivo, le più vicine al livello mancante per prime (DEV-011). */
export function suggestActions(gaps: readonly GapRow[], library: readonly SuggestedAction[] = SuggestedActions, max = 6): SuggestedAction[] {
  const out: SuggestedAction[] = [];
  for (const g of gaps.filter((x) => (x.gap ?? 0) > 0)) {
    const target = g.expected ?? 0;
    const acts = library.filter((a) => a.competencyKey === g.competencyKey).sort((a, b) => Math.abs((a.targetLevel ?? target) - target) - Math.abs((b.targetLevel ?? target) - target));
    out.push(...acts.slice(0, 2));
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}

export interface PlanProgress {
  total: number;
  done: number;
  overdue: number;
  percent: number;
}
export function planProgress(actions: readonly { status: string; dueDate?: string | null }[], today = new Date().toISOString().slice(0, 10)): PlanProgress {
  const live = actions.filter((a) => a.status !== 'cancelled');
  const done = live.filter((a) => a.status === 'done').length;
  const overdue = live.filter((a) => a.status === 'open' && a.dueDate && a.dueDate < today).length;
  return { total: live.length, done, overdue, percent: live.length ? Math.round((done / live.length) * 100) : 0 };
}

/** 9-box (DEV-032): performance e potenziale su 3 livelli → cella e etichetta. */
export const NineBoxLabels: Record<string, string> = {
  '3-3': 'Stella', '3-2': 'Alto performer in crescita', '3-1': 'Esperto affidabile',
  '2-3': 'Alto potenziale', '2-2': 'Core solido', '2-1': 'Contributore stabile',
  '1-3': 'Potenziale da sbloccare', '1-2': 'Da sviluppare', '1-1': 'Da affrontare',
};
export function nineBoxLabel(performance: number | null, potential: number | null): string | null {
  if (!performance || !potential) return null;
  return NineBoxLabels[`${performance}-${potential}`] ?? null;
}

/** Normalizza il rating finale di una review (scala min..max del template) su 3 fasce di performance. */
export function performanceBand(rating: number | null | undefined, scale: { min: number; max: number }): number | null {
  if (rating == null) return null;
  const span = scale.max - scale.min;
  if (span <= 0) return 2;
  const r = (rating - scale.min) / span; // 0..1
  return r < 0.34 ? 1 : r < 0.75 ? 2 : 3;
}
