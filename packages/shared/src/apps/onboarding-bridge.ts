import type { AppActor, AppDefinition, AppStage } from './types.js';

/**
 * Convergenza ONB → motore (ADR-0011): un percorso di onboarding diventa un'app «silenziosa» per percorso e ogni task
 * una fase di un unico gruppo parallelo (tutti i task sono aperti dall'avvio, ognuno con la propria scadenza).
 * I task `form` sono fasi form (la compilazione nasce nel form engine dal motore); gli altri sono approvazioni
 * «fatto/da fare» concluse dal modulo onboarding, che mantiene ruoli, buddy, survey, traguardi e notifiche.
 */
export interface OnboardingJourneyLike { id: string; templateName: string; kind: 'onboarding' | 'role_change' | 'offboarding'; anchorDate: string }
export interface OnboardingTaskLike { id: string; key: string; title: string; description?: string | null; kind: string; role: string; formKey?: string | null; assigneePersonId?: string | null; dueDate?: string | null; phase: string }

export const onboardingAppKey = (journeyId: string) => `onboarding_${journeyId.replace(/-/g, '')}`;
const KIND_LABEL: Record<string, string> = { onboarding: 'Onboarding', role_change: 'Cambio ruolo', offboarding: 'Offboarding' };

/** Chiave di fase stabile e unica per un task (snake_case, con indice per evitare collisioni). */
export function stageKeyForTask(task: { key: string }, index: number): string {
  const base = task.key.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'task';
  return `t${index + 1}_${/^[a-z]/.test(base) ? base : `k_${base}`}`;
}

export function onboardingTaskActor(task: OnboardingTaskLike): AppActor {
  if (task.role === 'newcomer') return 'subject';
  if (task.assigneePersonId) return `person:${task.assigneePersonId}`;
  return task.role === 'manager' ? 'manager' : 'hr';
}

const daysUntil = (due: string | null | undefined, today: string) => (due ? Math.max(0, Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)) : 30);

export function onboardingJourneyToApp(j: OnboardingJourneyLike, tasks: readonly OnboardingTaskLike[], today: string): AppDefinition {
  const stages: AppStage[] = tasks.map((t, i) => ({
    key: stageKeyForTask(t, i),
    name: t.title,
    type: t.kind === 'form' && t.formKey ? 'form' : 'approval',
    actor: onboardingTaskActor(t),
    formKey: t.kind === 'form' && t.formKey ? t.formKey : null,
    description: t.description ?? null,
    dueDays: daysUntil(t.dueDate, today),
    parallelGroup: 'journey',
    seePrevious: false,
    approval: t.kind === 'form' && t.formKey ? null : { rejectTo: null, requireComment: false },
    notify: null,
    transitions: null,
  }));
  return {
    key: onboardingAppKey(j.id),
    name: `${KIND_LABEL[j.kind] ?? 'Percorso'} · ${j.templateName}`,
    description: `Percorso «${j.templateName}» (data di riferimento ${j.anchorDate}) eseguito dal motore dei processi.`,
    icon: j.kind === 'offboarding' ? '👋' : '🧭',
    naming: { instanceLabel: 'Percorso', launchVerb: 'Avvia', subjectLabel: 'Persona' },
    permissions: { launch: ['hr', 'manager'], launchForSelfOnly: false, viewInstances: ['hr', 'subject', 'actors', 'manager'] },
    stages,
    silent: true,
  };
}
