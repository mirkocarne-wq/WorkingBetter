import type { AppActor, AppCondition, AppDefinition, AppOutcome } from './types.js';

export interface StageRunLite { stageKey: string; status: 'pending' | 'active' | 'done' | 'rejected' | 'skipped' | 'superseded'; attempt: number }

const KEY = /^[a-z][a-z0-9_]{0,60}$/;
const isActor = (a: string) => ['subject', 'manager', 'manager_of_manager', 'launcher', 'hr'].includes(a) || /^person:[0-9a-f-]{36}$/.test(a) || /^role:[a-z_]+$/.test(a);

/** Validazione strutturale della definizione (chiavi, form, rimandi, instradamenti, gruppi paralleli). */
export function validateAppDefinition(def: AppDefinition, publishedFormKeys?: ReadonlySet<string>): string[] {
  const errors: string[] = [];
  if (!KEY.test(def.key)) errors.push('Chiave app non valida (snake_case)');
  if (!def.name?.trim()) errors.push('Nome mancante');
  if (!def.stages?.length) errors.push('Serve almeno una fase');
  const keys = new Set<string>();
  def.stages.forEach((s, i) => {
    if (!KEY.test(s.key)) errors.push(`Fase ${i + 1}: chiave non valida`);
    if (keys.has(s.key)) errors.push(`Fase «${s.key}» duplicata`);
    keys.add(s.key);
    if (!isActor(s.actor)) errors.push(`Fase «${s.key}»: attore non valido`);
    if (s.type === 'form' && !s.formKey) errors.push(`Fase «${s.key}»: manca il form`);
    if (s.type === 'form' && s.formKey && publishedFormKeys && !publishedFormKeys.has(s.formKey)) errors.push(`Fase «${s.key}»: il form «${s.formKey}» non è pubblicato`);
    if (s.type === 'notify' && !s.notify?.to?.length) errors.push(`Fase «${s.key}»: indica a chi notificare`);
    if (s.type === 'approval' && s.approval?.rejectTo) {
      const target = def.stages.findIndex((x) => x.key === s.approval!.rejectTo);
      if (target < 0) errors.push(`Fase «${s.key}»: il rimando punta a una fase inesistente`);
      else if (target >= i) errors.push(`Fase «${s.key}»: il rimando deve puntare a una fase precedente`);
    }
    for (const t of s.transitions ?? []) if (t.goto !== 'end' && !def.stages.some((x) => x.key === t.goto)) errors.push(`Fase «${s.key}»: instradamento verso «${t.goto}» inesistente`);
    if (s.parallelGroup && s.type === 'approval' && s.approval?.rejectTo) errors.push(`Fase «${s.key}»: un'approvazione in parallelo non può rimandare`);
  });
  // i gruppi paralleli devono essere fatti di fasi consecutive
  const seen = new Map<string, number>();
  def.stages.forEach((s, i) => {
    if (!s.parallelGroup) return;
    const last = seen.get(s.parallelGroup);
    if (last !== undefined && last !== i - 1) errors.push(`Gruppo parallelo «${s.parallelGroup}»: le fasi devono essere consecutive`);
    seen.set(s.parallelGroup, i);
  });
  if (!def.permissions?.launch?.length) errors.push('Indica chi può avviare l’app');
  return errors;
}

/** Indici delle fasi del gruppo che contiene la fase `index` (singleton se non parallela). */
export function groupOf(def: AppDefinition, index: number): number[] {
  const g = def.stages[index]?.parallelGroup;
  if (!g) return [index];
  let a = index; let b = index;
  while (a > 0 && def.stages[a - 1]!.parallelGroup === g) a--;
  while (b < def.stages.length - 1 && def.stages[b + 1]!.parallelGroup === g) b++;
  return Array.from({ length: b - a + 1 }, (_, k) => a + k);
}
export const stageKeysOf = (def: AppDefinition, indexes: number[]) => indexes.map((i) => def.stages[i]!.key);
export const initialStages = (def: AppDefinition) => stageKeysOf(def, groupOf(def, 0));

const num = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : null);
export function matches(c: AppCondition, payload: { answers?: Record<string, unknown> | null; outcome?: AppOutcome | null }): boolean {
  const v = c.source === 'outcome' ? payload.outcome : payload.answers?.[c.field ?? ''];
  switch (c.op) {
    case 'eq': return v === c.value || (num(v) != null && num(v) === num(c.value));
    case 'ne': return !(v === c.value || (num(v) != null && num(v) === num(c.value)));
    case 'lt': return num(v) != null && num(c.value) != null && num(v)! < num(c.value)!;
    case 'lte': return num(v) != null && num(c.value) != null && num(v)! <= num(c.value)!;
    case 'gt': return num(v) != null && num(c.value) != null && num(v)! > num(c.value)!;
    case 'gte': return num(v) != null && num(c.value) != null && num(v)! >= num(c.value)!;
    case 'in': return Array.isArray(c.value) && (c.value as unknown[]).some((x) => x === v || (num(v) != null && num(x) === num(v)));
    case 'not_empty': return v != null && v !== '' && !(Array.isArray(v) && v.length === 0);
  }
}

export type NextStep = { kind: 'activate'; stageKeys: string[] } | { kind: 'wait' } | { kind: 'end' };

/** Cosa succede quando una fase è conclusa: instradamento esplicito, attesa del gruppo parallelo, fase successiva o fine. */
export function afterStageDone(def: AppDefinition, stageKey: string, payload: { answers?: Record<string, unknown> | null; outcome?: AppOutcome | null }, runs: readonly StageRunLite[]): NextStep {
  const index = def.stages.findIndex((s) => s.key === stageKey);
  if (index < 0) return { kind: 'end' };
  const stage = def.stages[index]!;
  for (const t of stage.transitions ?? []) {
    if (!matches(t.when, payload)) continue;
    if (t.goto === 'end') return { kind: 'end' };
    const target = def.stages.findIndex((s) => s.key === t.goto);
    return { kind: 'activate', stageKeys: stageKeysOf(def, groupOf(def, target)) };
  }
  const group = groupOf(def, index);
  const latest = (key: string) => runs.filter((r) => r.stageKey === key).sort((a, b) => b.attempt - a.attempt)[0];
  if (group.some((i) => { const r = latest(def.stages[i]!.key); return !r || (r.status !== 'done' && r.status !== 'skipped'); })) return { kind: 'wait' };
  const next = group[group.length - 1]! + 1;
  if (next >= def.stages.length) return { kind: 'end' };
  return { kind: 'activate', stageKeys: stageKeysOf(def, groupOf(def, next)) };
}

/** Fasi da riaprire e run da superare quando un'approvazione rimanda a una fase precedente (APP-022). */
export function rejectPlan(def: AppDefinition, fromStageKey: string, rejectTo: string): { reopen: string[]; supersede: string[] } {
  const target = def.stages.findIndex((s) => s.key === rejectTo);
  const from = def.stages.findIndex((s) => s.key === fromStageKey);
  if (target < 0 || from < 0) return { reopen: [], supersede: [] };
  const reopen = stageKeysOf(def, groupOf(def, target));
  const supersede = def.stages.slice(target, from + 1).map((s) => s.key).filter((k) => !reopen.includes(k));
  return { reopen, supersede };
}

export interface AppInstanceProgress { total: number; done: number; active: number; percent: number }
export function instanceProgress(def: AppDefinition, runs: readonly StageRunLite[]): AppInstanceProgress {
  const latest = new Map<string, StageRunLite>();
  for (const r of runs) { const cur = latest.get(r.stageKey); if (!cur || r.attempt > cur.attempt) latest.set(r.stageKey, r); }
  const total = def.stages.length;
  const done = def.stages.filter((s) => ['done', 'skipped'].includes(latest.get(s.key)?.status ?? '')).length;
  const active = def.stages.filter((s) => latest.get(s.key)?.status === 'active').length;
  return { total, done, active, percent: total ? Math.round((done / total) * 100) : 0 };
}

export const actorLabel = (a: AppActor, names?: { role?: (r: string) => string }) => a === 'subject' ? 'Soggetto' : a === 'manager' ? 'Manager del soggetto' : a === 'manager_of_manager' ? 'Manager del manager' : a === 'launcher' ? 'Chi ha avviato' : a === 'hr' ? 'HR' : a.startsWith('role:') ? (names?.role?.(a.slice(5)) ?? `Ruolo ${a.slice(5)}`) : 'Persona specifica';

/** Chi può avviare l'app per un dato soggetto (APP-033). */
export function canLaunch(def: AppDefinition, viewer: { personId: string | null; isHr: boolean; isManager: boolean }, subject: { id: string; managerId: string | null }): boolean {
  const p = def.permissions;
  if (viewer.isHr && p.launch.includes('hr')) return true;
  if (viewer.isManager && p.launch.includes('manager') && subject.managerId && subject.managerId === viewer.personId) return true;
  if (p.launch.includes('employee') && viewer.personId && (subject.id === viewer.personId || !p.launchForSelfOnly)) return true;
  return false;
}
