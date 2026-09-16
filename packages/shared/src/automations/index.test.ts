import { describe, expect, it } from 'vitest';
import { automationDedupeKey, describeAction, describeTrigger, evaluateConditions, matchTrigger, type AutomationEventPayload } from './index.js';

const ev: AutomationEventPayload = { type: 'review.completed', subjectPersonId: 'p1', sourceId: 'r1', data: { rating: 2, score: 0.4, cycleName: 'Q3' } };
const person = { jobLevel: 'Senior', location: 'Milano', customFields: { contract_type: 'perm', remote_days: 2 } };

describe('evaluateConditions', () => {
  it('compares numbers and strings, reads person and custom fields', () => {
    expect(evaluateConditions([{ field: 'rating', op: 'lt', value: '3' }], ev, person)).toBe(true);
    expect(evaluateConditions([{ field: 'rating', op: 'gte', value: 3 }], ev, person)).toBe(false);
    expect(evaluateConditions([{ field: 'person.location', op: 'eq', value: 'milano' }], ev, person)).toBe(true);
    expect(evaluateConditions([{ field: 'person.custom.contract_type', op: 'in', value: 'perm, fixed' }], ev, person)).toBe(true);
    expect(evaluateConditions([{ field: 'person.custom.remote_days', op: 'gt', value: 1 }, { field: 'cycleName', op: 'not_empty' }], ev, person)).toBe(true);
    expect(evaluateConditions([{ field: 'person.jobLevel', op: 'ne', value: 'Senior' }], ev, person)).toBe(false);
    expect(evaluateConditions([{ field: 'missing', op: 'not_empty' }], ev, person)).toBe(false);
    expect(evaluateConditions([{ field: 'missing', op: 'lt', value: 3 }], ev, person)).toBe(false);
    expect(evaluateConditions([], ev, null)).toBe(true);
  });
});

describe('matchTrigger', () => {
  it('matches type, days for timed triggers and appKey for app.completed', () => {
    expect(matchTrigger({ event: 'review.completed' }, ev)).toBe(true);
    expect(matchTrigger({ event: 'review.shared' }, ev)).toBe(false);
    const tenure: AutomationEventPayload = { type: 'person.tenure', subjectPersonId: 'p1', sourceId: '2026-09-16', data: { days: 90 } };
    expect(matchTrigger({ event: 'person.tenure', days: 90 }, tenure)).toBe(true);
    expect(matchTrigger({ event: 'person.tenure', days: 30 }, tenure)).toBe(false);
    const app: AutomationEventPayload = { type: 'app.completed', subjectPersonId: 'p1', sourceId: 'i1', data: { appKey: 'training_request', outcome: 'approved' } };
    expect(matchTrigger({ event: 'app.completed', appKey: 'training_request' }, app)).toBe(true);
    expect(matchTrigger({ event: 'app.completed', appKey: 'other' }, app)).toBe(false);
    expect(matchTrigger({ event: 'app.completed' }, app)).toBe(true);
  });
});

describe('descriptions and dedupe key', () => {
  it('renders readable summaries', () => {
    expect(describeTrigger({ event: 'person.tenure', days: 90 })).toBe('Una persona compie 90 giorni in azienda');
    expect(describeTrigger({ event: 'app.completed', appKey: 'x' })).toContain('(x)');
    expect(describeAction({ type: 'action_item', title: 'Colloquio', assignee: 'manager' })).toBe('azione «Colloquio» per Il suo manager');
    expect(automationDedupeKey('r', ev)).toBe('r:review.completed:p1:r1');
  });
});
