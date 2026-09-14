import { describe, expect, it } from 'vitest';
import { formSchema } from '../forms/schema.js';
import { AppTemplates, afterStageDone, canLaunch, groupOf, initialStages, instanceProgress, onboardingAppKey, onboardingJourneyToApp, rejectPlan, reviewTemplateToApp, stageKeyForTask, validateAppDefinition, type AppDefinition } from './index.js';

const training = AppTemplates.find((t) => t.key === 'training_request')!.app;
const project = AppTemplates.find((t) => t.key === 'project_review')!.app;

describe('app studio: motore di workflow', () => {
  it('i template sono validi e i loro form rispettano lo schema del form engine', () => {
    for (const t of AppTemplates) {
      expect(validateAppDefinition(t.app, new Set(t.forms.map((f) => f.key))), t.key).toEqual([]);
      for (const f of t.forms) expect(formSchema.safeParse(f.schema).success, `${t.key}/${f.key}`).toBe(true);
    }
  });
  it('la validazione intercetta chiavi duplicate, form mancanti, rimandi in avanti e gruppi non consecutivi', () => {
    const bad: AppDefinition = { ...training, stages: [
      { key: 'a', name: 'A', type: 'form', actor: 'subject', dueDays: 1, seePrevious: false, parallelGroup: 'g' },
      { key: 'b', name: 'B', type: 'approval', actor: 'manager', dueDays: 1, seePrevious: true, approval: { rejectTo: 'c' } },
      { key: 'a', name: 'A2', type: 'notify', actor: 'hr', dueDays: 0, seePrevious: false, parallelGroup: 'g' },
      { key: 'c', name: 'C', type: 'form', actor: 'subject', formKey: 'nope', dueDays: 1, seePrevious: false, transitions: [{ when: { source: 'outcome', op: 'eq', value: 'approved' }, goto: 'zzz' }] },
    ] };
    const errors = validateAppDefinition(bad, new Set(['app_training_request']));
    expect(errors.join(' | ')).toContain('manca il form');
    expect(errors.join(' | ')).toContain('duplicata');
    expect(errors.join(' | ')).toContain('fase precedente');
    expect(errors.join(' | ')).toContain('non è pubblicato');
    expect(errors.join(' | ')).toContain('consecutive');
    expect(errors.join(' | ')).toContain('inesistente');
  });
  it('fasi sequenziali: la prima è attiva; al completamento si passa alla successiva; l’ultima chiude', () => {
    expect(initialStages(training)).toEqual(['request']);
    const runs = [{ stageKey: 'request', status: 'done' as const, attempt: 1 }];
    expect(afterStageDone(training, 'request', { answers: { cost: 350 } }, runs)).toEqual({ kind: 'activate', stageKeys: ['manager_ok'] });
    expect(afterStageDone(training, 'done', { outcome: 'notified' }, [...runs, { stageKey: 'manager_ok', status: 'done', attempt: 1 }, { stageKey: 'hr_ok', status: 'done', attempt: 1 }, { stageKey: 'done', status: 'done', attempt: 1 }])).toEqual({ kind: 'end' });
  });
  it('instradamento condizionale: costo zero salta direttamente all’approvazione del manager (che è comunque la successiva) e le condizioni numeriche funzionano anche su stringhe', () => {
    expect(afterStageDone(training, 'request', { answers: { cost: '0' } }, [{ stageKey: 'request', status: 'done', attempt: 1 }])).toEqual({ kind: 'activate', stageKeys: ['manager_ok'] });
    const withSkip: AppDefinition = { ...training, stages: training.stages.map((s) => (s.key === 'request' ? { ...s, transitions: [{ when: { source: 'answer', field: 'cost', op: 'lte', value: 100 }, goto: 'done' }] } : s)) };
    expect(afterStageDone(withSkip, 'request', { answers: { cost: 50 } }, [{ stageKey: 'request', status: 'done', attempt: 1 }])).toEqual({ kind: 'activate', stageKeys: ['done'] });
  });
  it('fasi parallele: attive insieme, si avanza solo quando tutte sono concluse', () => {
    expect(initialStages(project)).toEqual(['self', 'lead']);
    expect(groupOf(project, 1)).toEqual([0, 1]);
    const one = [{ stageKey: 'self', status: 'done' as const, attempt: 1 }, { stageKey: 'lead', status: 'active' as const, attempt: 1 }];
    expect(afterStageDone(project, 'self', { outcome: 'submitted' }, one)).toEqual({ kind: 'wait' });
    const both = [{ stageKey: 'self', status: 'done' as const, attempt: 1 }, { stageKey: 'lead', status: 'done' as const, attempt: 1 }];
    expect(afterStageDone(project, 'lead', { outcome: 'submitted' }, both)).toEqual({ kind: 'activate', stageKeys: ['share'] });
    expect(instanceProgress(project, both)).toEqual({ total: 4, done: 2, active: 0, percent: 50 });
  });
  it('rimando: riapre la fase indicata e supera quelle intermedie', () => {
    expect(rejectPlan(training, 'hr_ok', 'request')).toEqual({ reopen: ['request'], supersede: ['manager_ok', 'hr_ok'] });
    expect(rejectPlan(training, 'manager_ok', 'request')).toEqual({ reopen: ['request'], supersede: ['manager_ok'] });
  });
  it('permessi di lancio: dipendente solo per sé, manager per i riporti, HR sempre', () => {
    const me = { personId: 'p1', isHr: false, isManager: false };
    expect(canLaunch(training, me, { id: 'p1', managerId: 'm' })).toBe(true);
    expect(canLaunch(training, me, { id: 'p2', managerId: 'm' })).toBe(false);
    expect(canLaunch(training, { personId: 'm', isHr: false, isManager: true }, { id: 'p2', managerId: 'm' })).toBe(true);
    expect(canLaunch(project, me, { id: 'p1', managerId: 'm' })).toBe(false);
    expect(canLaunch(project, { personId: 'h', isHr: true, isManager: false }, { id: 'p1', managerId: 'm' })).toBe(true);
  });

  it('fasi azione: validate (titolo e assegnatario, attributo ammesso, URL, app diversa da sé) e concluse come le notifiche', () => {
    const def: AppDefinition = { ...training, key: 'auto', stages: [
      { key: 'a', name: 'A', type: 'form', actor: 'subject', formKey: 'app_training_request', dueDays: 1, seePrevious: false },
      { key: 'x', name: 'X', type: 'action', actor: 'hr', dueDays: 0, seePrevious: true, actions: [{ type: 'action_item', title: 'Iscrivere al corso', assignee: 'manager', dueDays: 10 }, { type: 'person_field', field: 'custom:training_budget_used', value: 'yes' }, { type: 'webhook', url: 'https://example.test/hook' }, { type: 'start_app', appKey: 'hr_ticket' }] },
    ] };
    expect(validateAppDefinition(def, new Set(['app_training_request']))).toEqual([]);
    const bad: AppDefinition = { ...def, stages: [def.stages[0]!, { ...def.stages[1]!, actions: [{ type: 'person_field', field: 'salary' as never, value: '1' }, { type: 'webhook', url: 'ftp://x' }, { type: 'start_app', appKey: 'auto' }, { type: 'action_item', title: '', assignee: 'manager' }] }] };
    expect(validateAppDefinition(bad, new Set(['app_training_request']))).toHaveLength(4);
    expect(afterStageDone(def, 'x', { outcome: 'executed' }, [{ stageKey: 'a', status: 'done', attempt: 1 }, { stageKey: 'x', status: 'done', attempt: 1 }])).toEqual({ kind: 'end' });
  });
  it('un template di review diventa un’app con self e manager in parallelo, condivisione e presa visione', () => {
    const def = reviewTemplateToApp({ name: 'Annuale', selfFormKey: 'review_self', managerFormKey: 'review_manager', selfDueDays: 7, managerDueDays: 14, managerSeesSelf: 'after_submit', requireSignature: true }, { id: '0b1c2d3e-0000-4000-8000-000000000001', name: 'Review 2026' });
    expect(def.key).toBe('review_0b1c2d3e000040008000000000000001');
    expect(validateAppDefinition(def, new Set(['review_self', 'review_manager']))).toEqual([]);
    expect(initialStages(def)).toEqual(['self', 'manager']);
    expect(def.stages.map((s) => s.key)).toEqual(['self', 'manager', 'share', 'sign']);
    expect(def.silent).toBe(true);
    const noSelf = reviewTemplateToApp({ name: 'Light', selfFormKey: null, managerFormKey: 'review_manager', selfDueDays: 7, managerDueDays: 14, managerSeesSelf: 'never', requireSignature: false }, { id: 'c'.repeat(8) + '-1111-4111-8111-' + 'd'.repeat(12), name: 'Light' });
    expect(noSelf.stages.map((s) => s.key)).toEqual(['manager', 'share']);
    expect(initialStages(noSelf)).toEqual(['manager']);
  });

  it('convergenza onboarding: ogni task è una fase di un unico gruppo parallelo, form per i task form, attori dal ruolo o dall’assegnatario', () => {
    const j = { id: '0b1c2d3e-0000-4000-8000-000000000002', templateName: 'Onboarding generico', kind: 'onboarding' as const, anchorDate: '2026-10-01' };
    const tasks = [
      { id: 't1', key: 'contract', title: 'Firma il contratto', kind: 'sign', role: 'newcomer', phase: 'pre', dueDate: '2026-09-25' },
      { id: 't2', key: 'laptop', title: 'Prepara il laptop', kind: 'todo', role: 'it', assigneePersonId: '11111111-2222-4333-8444-555555555555', phase: 'pre', dueDate: '2026-09-30' },
      { id: 't3', key: 'personal-data', title: 'Dati personali', kind: 'form', role: 'newcomer', formKey: 'onb_personal_data', phase: 'w1', dueDate: '2026-10-03' },
      { id: 't4', key: 'welcome', title: 'Benvenuto', kind: 'meeting', role: 'manager', phase: 'w1', dueDate: null },
    ];
    const def = onboardingJourneyToApp(j, tasks, '2026-09-20');
    expect(def.key).toBe(onboardingAppKey(j.id));
    expect(def.silent).toBe(true);
    expect(def.stages.map((s) => s.key)).toEqual(['t1_contract', 't2_laptop', 't3_personal_data', 't4_welcome']);
    expect(def.stages.map((s) => s.type)).toEqual(['approval', 'approval', 'form', 'approval']);
    expect(def.stages.map((s) => s.actor)).toEqual(['subject', 'person:11111111-2222-4333-8444-555555555555', 'subject', 'manager']);
    expect(def.stages.map((s) => s.dueDays)).toEqual([5, 10, 13, 30]);
    expect(def.stages.every((s) => s.parallelGroup === 'journey')).toBe(true);
    expect(validateAppDefinition(def, new Set(['onb_personal_data']))).toEqual([]);
    expect(stageKeyForTask({ key: '1-Strano Key!' }, 4)).toBe('t5_k_1_strano_key');
    // tutte le fasi partono insieme e il percorso finisce quando l'ultima è conclusa o saltata
    expect(initialStages(def)).toEqual(def.stages.map((s) => s.key));
    const runs = def.stages.map((s) => ({ stageKey: s.key, status: 'done' as const, attempt: 1 }));
    runs[1] = { stageKey: 't2_laptop', status: 'skipped', attempt: 1 };
    expect(afterStageDone(def, 't4_welcome', { outcome: 'approved' }, runs)).toEqual({ kind: 'end' });
    expect(afterStageDone(def, 't4_welcome', { outcome: 'approved' }, runs.map((r, i) => (i === 0 ? { ...r, status: 'active' as const } : r)))).toEqual({ kind: 'wait' });
  });
});
