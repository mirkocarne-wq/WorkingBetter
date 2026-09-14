import { OnboardingSurveys } from './presets.js';
import type { OnboardingSurveyKey, OnboardingTaskDef, OnboardingTemplateRules } from './types.js';

const DAY = 86400000;
/** Data di scadenza assoluta (AAAA-MM-GG) da una data di riferimento e un offset in giorni. */
export function dueDateFrom(anchor: string, dueDay: number): string {
  return new Date(new Date(`${anchor}T00:00:00Z`).getTime() + dueDay * DAY).toISOString().slice(0, 10);
}
/** Giorno relativo di oggi rispetto alla data di riferimento (0 = primo giorno). */
export function dayIndex(anchor: string, today: string): number {
  return Math.round((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${anchor}T00:00:00Z`).getTime()) / DAY);
}

export interface OnboardingProgress { total: number; done: number; skipped: number; overdue: number; requiredOpen: number; percent: number }
export function journeyProgress(tasks: readonly { status: string; dueDate?: string | null; required: boolean }[], today: string): OnboardingProgress {
  const total = tasks.length;
  const done = tasks.filter((x) => x.status === 'done').length;
  const skipped = tasks.filter((x) => x.status === 'skipped').length;
  const overdue = tasks.filter((x) => x.status === 'open' && x.dueDate && x.dueDate < today).length;
  const requiredOpen = tasks.filter((x) => x.status === 'open' && x.required).length;
  const denominator = total - skipped;
  return { total, done, skipped, overdue, requiredOpen, percent: denominator ? Math.round((done / denominator) * 100) : 100 };
}

/** Il percorso è concluso quando nessun task obbligatorio è aperto (ONB §6). */
export const journeyComplete = (tasks: readonly { status: string; required: boolean }[]) => tasks.length > 0 && tasks.every((x) => x.status !== 'open' || !x.required);

/** Regole di assegnazione (ONB-003): vince il template con più condizioni soddisfatte; a parità il primo; senza match il default. */
export function matchTemplate<T extends { rules?: OnboardingTemplateRules | null; isDefault?: boolean | null; kind: string }>(templates: readonly T[], person: { orgUnitPath?: string | null; orgUnitId?: string | null; location?: string | null; jobTitle?: string | null }, kind = 'onboarding'): T | null {
  let best: { t: T; score: number } | null = null;
  for (const t of templates) {
    if (t.kind !== kind) continue;
    const r = t.rules ?? {};
    let score = 0;
    let ok = true;
    if (r.orgUnitIds?.length) { const hit = !!person.orgUnitId && (r.orgUnitIds.includes(person.orgUnitId) || r.orgUnitIds.some((u) => person.orgUnitPath?.includes(`/${u}/`))); if (!hit) ok = false; else score++; }
    if (r.locations?.length) { const loc = (person.location ?? '').toLowerCase(); const hit = r.locations.some((l) => loc.includes(l.toLowerCase())); if (!hit) ok = false; else score++; }
    if (r.jobTitleKeywords?.length) { const jt = (person.jobTitle ?? '').toLowerCase(); const hit = r.jobTitleKeywords.some((k) => jt.includes(k.toLowerCase())); if (!hit) ok = false; else score++; }
    if (!ok || score === 0) continue;
    if (!best || score > best.score) best = { t, score };
  }
  return best?.t ?? templates.find((t) => t.kind === kind && t.isDefault) ?? templates.find((t) => t.kind === kind) ?? null;
}

/** Suggerimenti buddy (ONB-013): stesso manager o stessa unità, non il manager, anzianità ≥ 6 mesi, con meno buddy attivi. */
export interface BuddyCandidate { id: string; managerId?: string | null; orgUnitId?: string | null; hireDate?: string | null; activeBuddies?: number }
export function suggestBuddies<T extends BuddyCandidate>(candidates: readonly T[], person: { id: string; managerId?: string | null; orgUnitId?: string | null }, today: string, max = 5): (T & { reason: string })[] {
  const sixMonthsAgo = dueDateFrom(today, -182);
  return candidates
    .filter((c) => c.id !== person.id && c.id !== person.managerId && (!c.hireDate || c.hireDate <= sixMonthsAgo))
    .map((c) => ({ c, score: (c.managerId && c.managerId === person.managerId ? 2 : 0) + (c.orgUnitId && c.orgUnitId === person.orgUnitId ? 1 : 0) - (c.activeBuddies ?? 0) * 0.5 }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ c }) => ({ ...c, reason: c.managerId && c.managerId === person.managerId ? 'stesso team' : 'stessa unità' }));
}

/** Punteggio della mini-survey (media 1–5) e regola di alert (ONB-017): media < 3 oppure una risposta ≤ 2. */
export function onboardingSurveyScore(key: OnboardingSurveyKey, answers: Record<string, number | null | undefined>): { score: number | null; low: boolean; answered: number } {
  const def = OnboardingSurveys[key];
  const vals = def.questions.map((q) => answers[q.key]).filter((v): v is number => typeof v === 'number' && v >= 1 && v <= 5);
  if (!vals.length) return { score: null, low: false, answered: 0 };
  const score = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100;
  return { score, low: score < 3 || vals.some((v) => v <= 2), answered: vals.length };
}

/** Task del template applicabili a una persona: i task "buddy" senza buddy vengono riassegnati al manager. */
export function resolveAssignee(task: Pick<OnboardingTaskDef, 'role'>, ctx: { personId: string; managerId: string | null; buddyId: string | null; hrId: string | null; itId: string | null }): string | null {
  switch (task.role) {
    case 'newcomer': return ctx.personId;
    case 'manager': return ctx.managerId ?? ctx.hrId;
    case 'buddy': return ctx.buddyId ?? ctx.managerId ?? ctx.hrId;
    case 'hr': return ctx.hrId ?? ctx.managerId;
    case 'it': return ctx.itId ?? ctx.hrId ?? ctx.managerId;
  }
}
