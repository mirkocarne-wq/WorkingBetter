import type { AppDefinition, AppStage } from './types.js';

/**
 * Convergenza REV → motore (ADR-0011): un template di review diventa una definizione di app per il ciclo.
 * Self e manager review sono fasi parallele (entrambe compilabili dal lancio, come oggi); poi la condivisione
 * (approvazione del manager) e, se richiesta, la presa visione (approvazione del soggetto). Le notifiche restano
 * al modulo review (`silent`), che mantiene rating, contesto, visibilità della self e firma con dissenso.
 */
export interface ReviewTemplateLike { name: string; selfFormKey: string | null; managerFormKey: string; selfDueDays: number; managerDueDays: number; managerSeesSelf: 'immediately' | 'after_submit' | 'never'; requireSignature: boolean }
export const reviewAppKey = (cycleId: string) => `review_${cycleId.replace(/-/g, '')}`;

export function reviewTemplateToApp(t: ReviewTemplateLike, cycle: { id: string; name: string }): AppDefinition {
  const stages: AppStage[] = [];
  if (t.selfFormKey) stages.push({ key: 'self', name: 'Self-review', type: 'form', actor: 'subject', formKey: t.selfFormKey, dueDays: t.selfDueDays, parallelGroup: 'eval', seePrevious: false, description: null, approval: null, notify: null, transitions: null });
  stages.push({ key: 'manager', name: 'Manager review', type: 'form', actor: 'manager', formKey: t.managerFormKey, dueDays: t.managerDueDays, parallelGroup: t.selfFormKey ? 'eval' : null, seePrevious: t.managerSeesSelf === 'immediately', description: null, approval: null, notify: null, transitions: null });
  stages.push({ key: 'share', name: 'Condivisione', type: 'approval', actor: 'manager', dueDays: 7, seePrevious: true, approval: { rejectTo: null, requireComment: false }, description: 'Il manager condivide la review con la persona.', notify: null, transitions: null });
  if (t.requireSignature) stages.push({ key: 'sign', name: 'Presa visione', type: 'approval', actor: 'subject', dueDays: 7, seePrevious: true, approval: { rejectTo: null, requireComment: false }, description: 'La persona conferma di aver letto la review (può esprimere dissenso).', notify: null, transitions: null });
  return {
    key: reviewAppKey(cycle.id),
    name: `Review · ${cycle.name}`,
    description: `Ciclo di review «${cycle.name}» (template ${t.name}) eseguito dal motore dei processi.`,
    icon: '📝',
    naming: { instanceLabel: 'Review', launchVerb: 'Lancia', subjectLabel: 'Persona valutata' },
    permissions: { launch: ['hr'], launchForSelfOnly: false, viewInstances: ['hr', 'subject', 'actors', 'manager'] },
    stages,
    silent: true,
  };
}
