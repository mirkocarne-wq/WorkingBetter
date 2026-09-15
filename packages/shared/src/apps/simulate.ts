import type { AppAction, AppActor, AppDefinition, AppOutcome, AppStage } from './types.js';
import { afterStageDone, groupOf, initialStages, stageKeysOf, type StageRunLite } from './engine.js';

/**
 * Simulazione «nei panni di» (ADR-0014, APP-008): dato un attore relativo e, facoltativamente, gli esiti
 * delle approvazioni e le risposte usate dalle condizioni, percorre la definizione come farebbe il motore
 * e racconta cosa quell'attore fa, vede e riceve. Funzione pura: nessuna istanza, nessuna notifica.
 */
export type SimActor = 'subject' | 'manager' | 'manager_of_manager' | 'launcher' | 'hr';
export interface SimScenario {
  /** esito scelto per ogni approvazione (default: approvata) */
  decisions?: Record<string, 'approve' | 'reject'>;
  /** risposte simulate per le condizioni degli instradamenti (chiave campo → valore) */
  answers?: Record<string, unknown>;
  /** chi avvia il processo nella simulazione; default: l'attore simulato stesso se i permessi glielo consentono, altrimenti HR */
  launcherIs?: SimActor;
}
export type SimEventKind = 'do' | 'decide' | 'see' | 'notified' | 'action' | 'auto' | 'wait';
export interface SimEvent {
  step: number;
  stageKey: string;
  stageName: string;
  kind: SimEventKind;
  text: string;
  dueDays: number;
  /** giorno stimato dal lancio (somma delle scadenze del percorso) */
  day: number;
  outcome?: AppOutcome | 'rejected';
}
export interface SimResult { actor: SimActor; path: string[]; events: SimEvent[]; ended: 'end' | 'rejected' | 'loop'; totalDays: number; branches: string[] }

const isActor = (a: AppActor, me: SimActor, launcherIs: SimActor) => a === me || (a === 'launcher' && launcherIs === me) || (a === 'hr' && me === 'hr') || (a.startsWith('role:') && me === 'hr' && /^role:(hr_admin|hrbp|tenant_admin)$/.test(a));

function actionText(a: AppAction): string {
  switch (a.type) {
    case 'action_item': return `crea l'azione «${a.title}» per ${a.assignee}`;
    case 'person_field': return `aggiorna l'attributo ${a.field} della persona`;
    case 'webhook': return 'chiama un webhook esterno';
    case 'start_app': return `avvia l'app «${a.appKey}»`;
  }
}

/** L'attore può essere chi avvia? Dipende dai permessi di lancio dell'app (APP-033). */
export function canBeLauncher(def: AppDefinition, me: SimActor): boolean {
  const l = def.permissions?.launch ?? [];
  return me === 'hr' ? l.includes('hr') : me === 'manager' || me === 'manager_of_manager' ? l.includes('manager') : me === 'subject' ? l.includes('employee') : me === 'launcher';
}

export function simulateActor(def: AppDefinition, me: SimActor, scenario: SimScenario = {}): SimResult {
  const launcherIs: SimActor = scenario.launcherIs ?? (canBeLauncher(def, me) ? me : 'hr');
  const decisions = scenario.decisions ?? {};
  const answers = scenario.answers ?? {};
  const events: SimEvent[] = [];
  const path: string[] = [];
  const branches: string[] = [];
  const runs: StageRunLite[] = [];
  const attempts = new Map<string, number>();
  let active = initialStages(def);
  let step = 0; let day = 0; let guard = 0;
  let ended: SimResult['ended'] = 'end';
  const seenPrev: string[] = [];
  const stage = (k: string) => def.stages.find((s) => s.key === k)!;

  while (active.length && guard++ < 200) {
    step++;
    const groupDue = Math.max(...active.map((k) => stage(k).dueDays));
    // le fasi attive del gruppo si concludono «insieme»: raccontiamo ciascuna, poi avanziamo
    let next: ReturnType<typeof afterStageDone> = { kind: 'wait' };
    let rejectedTo: string | null = null;
    for (const key of active) {
      const s: AppStage = stage(key);
      path.push(key);
      const attempt = (attempts.get(key) ?? 0) + 1; attempts.set(key, attempt);
      const mine = isActor(s.actor, me, launcherIs);
      const again = attempt > 1 ? ' (di nuovo, dopo il rimando)' : '';
      let outcome: AppOutcome | 'rejected' = 'submitted';
      if (s.type === 'form') { outcome = 'submitted'; if (mine) events.push({ step, stageKey: key, stageName: s.name, kind: 'do', text: `Compili «${s.name}»${s.formKey ? ` (form ${s.formKey})` : ''}${again}`, dueDays: s.dueDays, day: day + s.dueDays, outcome }); }
      else if (s.type === 'approval') {
        const d = decisions[key] ?? 'approve';
        outcome = d === 'approve' ? 'approved' : 'rejected';
        if (mine) events.push({ step, stageKey: key, stageName: s.name, kind: 'decide', text: `Decidi «${s.name}»: ${d === 'approve' ? 'approvi' : s.approval?.rejectTo ? `rimandi a «${stage(s.approval.rejectTo).name}»` : 'respingi e chiudi'}${s.approval?.requireComment && d === 'reject' ? ' con un commento obbligatorio' : ''}${again}`, dueDays: s.dueDays, day: day + s.dueDays, outcome });
        if (d === 'reject') { rejectedTo = s.approval?.rejectTo ?? null; }
      } else if (s.type === 'notify') {
        outcome = 'notified';
        if ((s.notify?.to ?? []).some((a) => isActor(a, me, launcherIs))) events.push({ step, stageKey: key, stageName: s.name, kind: 'notified', text: `Ricevi la notifica «${s.notify?.message ?? s.name}»`, dueDays: 0, day, outcome });
      } else if (s.type === 'action') {
        outcome = 'executed';
        for (const a of s.actions ?? []) {
          const concernsMe = (a.type === 'action_item' && isActor(a.assignee, me, launcherIs)) || (a.type === 'person_field' && me === 'subject');
          events.push({ step, stageKey: key, stageName: s.name, kind: concernsMe ? 'action' : 'auto', text: `${concernsMe ? 'Ti riguarda: ' : 'Il sistema '}${actionText(a)}`, dueDays: 0, day, outcome });
        }
      }
      if (!mine && s.type !== 'notify' && s.type !== 'action') {
        const who = s.actor;
        if (s.seePrevious && seenPrev.length && isActor(s.actor, me, launcherIs)) { /* già coperto da mine */ }
        events.push({ step, stageKey: key, stageName: s.name, kind: 'wait', text: `Aspetti che ${who === 'subject' ? 'il soggetto' : who === 'manager' ? 'il manager' : who === 'manager_of_manager' ? 'il manager del manager' : who === 'launcher' ? 'chi ha avviato' : who === 'hr' ? 'l’HR' : who} concluda «${s.name}»`, dueDays: s.dueDays, day: day + s.dueDays, outcome });
      }
      if (mine && s.seePrevious && seenPrev.length) events.push({ step, stageKey: key, stageName: s.name, kind: 'see', text: `Vedi le risposte delle fasi precedenti: ${seenPrev.map((k) => `«${stage(k).name}»`).join(', ')}`, dueDays: 0, day });
      if (s.type === 'form') seenPrev.push(key);
      runs.push({ stageKey: key, status: outcome === 'rejected' ? 'rejected' : 'done', attempt });
      if (outcome !== 'rejected') {
        const r = afterStageDone(def, key, { answers, outcome: outcome as AppOutcome }, runs);
        if (r.kind === 'activate' && (s.transitions ?? []).length) {
          const target = r.stageKeys[0]!;
          const idx = def.stages.findIndex((x) => x.key === key);
          const tIdx = def.stages.findIndex((x) => x.key === target);
          if (tIdx !== groupOf(def, idx)[groupOf(def, idx).length - 1]! + 1) branches.push(`da «${s.name}» si salta a «${stage(target).name}»`);
        } else if (r.kind === 'end' && (s.transitions ?? []).some((t) => t.goto === 'end')) branches.push(`da «${s.name}» il processo si chiude`);
        if (r.kind !== 'wait') next = r;
      }
    }
    day += groupDue;
    if (rejectedTo) {
      const idx = def.stages.findIndex((x) => x.key === rejectedTo);
      branches.push(`rimando: si riapre «${stage(rejectedTo).name}»`);
      // una sola ripetizione: la seconda volta l'approvazione passa (evita cicli infiniti nella simulazione)
      for (const k of Object.keys(decisions)) if (decisions[k] === 'reject' && (attempts.get(k) ?? 0) >= 1) decisions[k] = 'approve';
      active = stageKeysOf(def, groupOf(def, idx));
      continue;
    }
    if (rejectedTo === null && active.some((k) => (decisions[k] ?? 'approve') === 'reject' && stage(k).type === 'approval' && !stage(k).approval?.rejectTo)) { ended = 'rejected'; break; }
    if (next.kind === 'end') { active = []; break; }
    if (next.kind === 'activate') { active = next.stageKeys; continue; }
    active = []; // wait senza altro: fine anomala
  }
  if (guard >= 200) ended = 'loop';
  return { actor: me, path, events, ended, totalDays: day, branches };
}
