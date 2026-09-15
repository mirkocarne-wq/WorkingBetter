import { describe, expect, it } from 'vitest';
import { AppTemplates, layoutWorkflow, simulateActor, transitionLabel, type AppDefinition } from './index.js';

const training = AppTemplates.find((t) => t.key === 'training_request')!.app;
const project = AppTemplates.find((t) => t.key === 'project_review')!.app;

describe('app studio: diagramma auto-disposto (ADR-0014)', () => {
  it('una colonna per passo, le fasi parallele impilate, nodo finale e archi di sequenza', () => {
    const l = layoutWorkflow(project);
    const parallel = project.stages.filter((s) => s.parallelGroup);
    const cols = new Set(parallel.map((s) => l.nodes.find((n) => n.key === s.key)!.col));
    expect(cols.size).toBe(1); // stesso gruppo → stessa colonna
    expect(l.nodes.at(-1)!.kind).toBe('end');
    expect(l.columns).toBe(new Set(l.nodes.map((n) => n.col)).size);
    const first = l.nodes[0]!;
    expect(l.edges.some((e) => e.from === first.key && e.kind === 'next')).toBe(true);
    expect(l.width).toBeGreaterThan(l.columns * l.node.w);
    for (const n of l.nodes) { expect(n.x).toBeGreaterThanOrEqual(0); expect(n.y).toBeGreaterThanOrEqual(0); }
  });
  it('gli instradamenti e i rimandi diventano archi etichettati', () => {
    const l = layoutWorkflow(training);
    const t = l.edges.find((e) => e.kind === 'transition');
    expect(t).toBeTruthy();
    expect(t!.label).toContain('cost');
    const r = l.edges.find((e) => e.kind === 'reject');
    expect(r).toBeTruthy();
    expect(transitionLabel({ when: { source: 'outcome', op: 'eq', value: 'approved' }, goto: 'end' })).toBe('esito = approved');
    expect(transitionLabel({ when: { source: 'answer', field: 'x', op: 'not_empty' }, goto: 'end' })).toBe('x non vuoto');
  });
});

describe('app studio: simulazione «nei panni di» (APP-008)', () => {
  it('chi avvia è dedotto dai permessi di lancio: nella proposta di promozione il manager fa la proposta', () => {
    const promo = AppTemplates.find((t) => t.key === 'promotion_proposal')!.app;
    const mgr = simulateActor(promo, 'manager');
    expect(mgr.events.some((e) => e.kind === 'do')).toBe(true);
    const asHrLaunches = simulateActor(promo, 'manager', { launcherIs: 'hr' });
    expect(asHrLaunches.events.some((e) => e.kind === 'do')).toBe(false);
  });
  it('il soggetto compila, aspetta le approvazioni e riceve la notifica finale', () => {
    const r = simulateActor(training, 'subject', { answers: { cost: 800 } });
    expect(r.ended).toBe('end');
    expect(r.events.some((e) => e.kind === 'do' && e.stageKey === training.stages[0]!.key)).toBe(true);
    expect(r.events.some((e) => e.kind === 'wait')).toBe(true);
    expect(r.events.some((e) => e.kind === 'notified')).toBe(true);
    expect(r.path[0]).toBe(training.stages[0]!.key);
    expect(r.totalDays).toBeGreaterThan(0);
  });
  it('il manager decide; con un rimando la fase del soggetto si riapre una volta e poi si conclude', () => {
    const approval = training.stages.find((s) => s.type === 'approval' && s.approval?.rejectTo)!;
    const r = simulateActor(training, 'manager', { decisions: { [approval.key]: 'reject' }, answers: { cost: 800 } });
    expect(r.events.filter((e) => e.kind === 'decide').length).toBeGreaterThanOrEqual(2);
    expect(r.branches.some((b) => b.startsWith('rimando'))).toBe(true);
    expect(r.ended).toBe('end');
  });
  it('gli instradamenti condizionali seguono le risposte simulate', () => {
    const def: AppDefinition = { ...training, stages: training.stages.map((s) => (s.key === 'request' ? { ...s, transitions: [{ when: { source: 'answer', field: 'cost', op: 'lte', value: 0 }, goto: 'done' }] } : s)) };
    const cheap = simulateActor(def, 'hr', { answers: { cost: 0 } });
    const pricey = simulateActor(def, 'hr', { answers: { cost: 5000 } });
    expect(cheap.path).toEqual(['request', 'done']);
    expect(pricey.path).toEqual(['request', 'manager_ok', 'hr_ok', 'done']);
    expect(cheap.branches.some((b) => b.includes('salta'))).toBe(true);
  });
  it('un respingimento senza rimando chiude il processo', () => {
    const def: AppDefinition = { ...training, stages: [
      { key: 'ask', name: 'Richiesta', type: 'form', actor: 'subject', formKey: 'f', dueDays: 3, seePrevious: false },
      { key: 'ok', name: 'Approvazione', type: 'approval', actor: 'manager', dueDays: 5, seePrevious: true, approval: { rejectTo: null, requireComment: true } },
      { key: 'done', name: 'Esito', type: 'notify', actor: 'subject', dueDays: 0, seePrevious: false, notify: { to: ['subject'], message: 'Fatto' } },
    ] };
    const r = simulateActor(def, 'subject', { decisions: { ok: 'reject' } });
    expect(r.ended).toBe('rejected');
    expect(r.events.some((e) => e.kind === 'notified')).toBe(false);
  });
});
