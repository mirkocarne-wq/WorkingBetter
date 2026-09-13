import { relations } from 'drizzle-orm';
import { date, index, integer, numeric, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { tenantScoped } from './core.js';

export const objectiveLevel = pgEnum('objective_level', ['company', 'unit', 'team', 'individual']);
export const objectiveStatus = pgEnum('objective_status', ['draft', 'pending_approval', 'active', 'closed', 'cancelled']);
export const objectiveVisibility = pgEnum('objective_visibility', ['public', 'team', 'private']);
export const progressMode = pgEnum('progress_mode', ['auto', 'manual']);
export const krType = pgEnum('kr_type', ['number', 'percent', 'currency', 'boolean', 'milestone']);
export const krDirection = pgEnum('kr_direction', ['increase', 'decrease']);
export const confidence = pgEnum('confidence', ['on_track', 'at_risk', 'off_track']);
export const objectiveOutcome = pgEnum('objective_outcome', ['achieved', 'partially', 'not_achieved', 'cancelled']);

export const cycles = pgTable(
  'cycles',
  {
    ...tenantScoped,
    name: text('name').notNull(), // es. "Q3 2026"
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    definitionOpensAt: date('definition_opens_at'),
    definitionClosesAt: date('definition_closes_at'),
    lockAt: date('lock_at'),
    checkInCadenceDays: integer('check_in_cadence_days').notNull().default(7),
    status: text('status').notNull().default('open'), // planned | open | closed
  },
  (t) => [index('cycles_tenant_idx').on(t.tenantId, t.startDate)],
);

export const objectives = pgTable(
  'objectives',
  {
    ...tenantScoped,
    cycleId: uuid('cycle_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    level: objectiveLevel('level').notNull(),
    ownerPersonId: uuid('owner_person_id'),
    ownerOrgUnitId: uuid('owner_org_unit_id'),
    parentId: uuid('parent_id'),
    status: objectiveStatus('status').notNull().default('draft'),
    visibility: objectiveVisibility('visibility').notNull().default('public'),
    weight: numeric('weight', { precision: 6, scale: 3 }),
    progressMode: progressMode('progress_mode').notNull().default('auto'),
    progress: numeric('progress', { precision: 6, scale: 4 }), // 0..1 (null = nessun dato)
    manualProgress: numeric('manual_progress', { precision: 6, scale: 4 }),
    confidence: confidence('confidence'),
    startDate: date('start_date'),
    dueDate: date('due_date'),
    tags: text('tags').array(),
    outcome: objectiveOutcome('outcome'),
    finalScore: numeric('final_score', { precision: 6, scale: 4 }),
    closedNote: text('closed_note'),
    isDevelopment: text('is_development'),
  },
  (t) => [
    index('objectives_tenant_cycle_idx').on(t.tenantId, t.cycleId),
    index('objectives_tenant_owner_idx').on(t.tenantId, t.ownerPersonId),
    index('objectives_tenant_parent_idx').on(t.tenantId, t.parentId),
  ],
);

export const keyResults = pgTable(
  'key_results',
  {
    ...tenantScoped,
    objectiveId: uuid('objective_id').notNull(),
    title: text('title').notNull(),
    type: krType('type').notNull().default('number'),
    direction: krDirection('direction').notNull().default('increase'),
    unit: text('unit'),
    startValue: numeric('start_value', { precision: 18, scale: 4 }).notNull().default('0'),
    targetValue: numeric('target_value', { precision: 18, scale: 4 }).notNull().default('1'),
    currentValue: numeric('current_value', { precision: 18, scale: 4 }).notNull().default('0'),
    weight: numeric('weight', { precision: 6, scale: 3 }),
    ownerPersonId: uuid('owner_person_id'),
    progress: numeric('progress', { precision: 6, scale: 4 }).notNull().default('0'),
    confidence: confidence('confidence'),
    lastCheckInAt: date('last_check_in_at'),
    position: integer('position').notNull().default(0),
  },
  (t) => [index('key_results_objective_idx').on(t.tenantId, t.objectiveId)],
);

export const checkIns = pgTable(
  'check_ins',
  {
    ...tenantScoped,
    keyResultId: uuid('key_result_id').notNull(),
    authorPersonId: uuid('author_person_id'),
    value: numeric('value', { precision: 18, scale: 4 }).notNull(),
    confidence: confidence('confidence').notNull(),
    comment: text('comment'),
  },
  (t) => [index('check_ins_kr_idx').on(t.tenantId, t.keyResultId, t.createdAt)],
);

export const objectiveContributors = pgTable(
  'objective_contributors',
  {
    ...tenantScoped,
    objectiveId: uuid('objective_id').notNull(),
    personId: uuid('person_id').notNull(),
  },
  (t) => [index('objective_contributors_idx').on(t.tenantId, t.objectiveId)],
);

export const objectivesRelations = relations(objectives, ({ one, many }) => ({
  cycle: one(cycles, { fields: [objectives.cycleId], references: [cycles.id] }),
  parent: one(objectives, { fields: [objectives.parentId], references: [objectives.id], relationName: 'alignment' }),
  children: many(objectives, { relationName: 'alignment' }),
  keyResults: many(keyResults),
}));
export const keyResultsRelations = relations(keyResults, ({ one, many }) => ({
  objective: one(objectives, { fields: [keyResults.objectiveId], references: [objectives.id] }),
  checkIns: many(checkIns),
}));
export const checkInsRelations = relations(checkIns, ({ one }) => ({
  keyResult: one(keyResults, { fields: [checkIns.keyResultId], references: [keyResults.id] }),
}));
