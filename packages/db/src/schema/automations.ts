import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { tenantScoped } from './core.js';

/** Regole «quando → se → allora» (APP-037/038, ADR-0015). */
export const automationRules = pgTable(
  'automation_rules',
  {
    ...tenantScoped,
    name: text('name').notNull(),
    description: text('description'),
    enabled: boolean('enabled').notNull().default(true),
    trigger: jsonb('trigger').$type<{ event: string; days?: number | null; appKey?: string | null }>().notNull(),
    conditions: jsonb('conditions').$type<unknown[]>().notNull().default([]),
    actions: jsonb('actions').$type<unknown[]>().notNull().default([]),
    runsCount: integer('runs_count').notNull().default(0),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [index('automation_rules_tenant_idx').on(t.tenantId, t.enabled)],
);

/** Esecuzioni delle regole: una per regola, evento e soggetto (chiave di idempotenza). */
export const automationRuns = pgTable(
  'automation_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    ruleId: uuid('rule_id').notNull(),
    event: text('event').notNull(),
    subjectPersonId: uuid('subject_person_id'),
    dedupeKey: text('dedupe_key').notNull(),
    ok: boolean('ok').notNull().default(true),
    results: jsonb('results').$type<{ type: string; ok: boolean; detail?: string }[]>().notNull().default([]),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('automation_runs_dedupe_uq').on(t.tenantId, t.dedupeKey), index('automation_runs_rule_idx').on(t.tenantId, t.ruleId, t.at)],
);
