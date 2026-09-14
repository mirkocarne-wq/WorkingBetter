import { describe, expect, it } from 'vitest';
import { formSchema } from '../forms/schema.js';
import { AppTemplates, afterStageDone, canLaunch, groupOf, initialStages, instanceProgress, rejectPlan, validateAppDefinition, type AppDefinition } from './index.js';

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
});
