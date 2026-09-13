import { sql } from 'drizzle-orm';
import { boolean, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { tenantScoped } from './core.js';

/** Modulo Sviluppo & Carriera (DEV): framework competenze, valutazioni, piani di sviluppo, 9-box. */

export const competencyKind = pgEnum('competency_kind', ['core', 'role', 'leadership']);
export const assessmentSource = pgEnum('assessment_source', ['self', 'manager', 'review', '360']);
export const devPlanStatus = pgEnum('dev_plan_status', ['draft', 'pending_approval', 'active', 'completed', 'archived']);
export const devActionStatus = pgEnum('dev_action_status', ['open', 'done', 'cancelled']);
export const devActionKind = pgEnum('dev_action_kind', ['training', 'mentoring', 'experience', 'reading', 'other']);

/** Competenza con livelli e descrittori (DEV-001). */
export const competencies = pgTable(
  'competencies',
  {
    ...tenantScoped,
    key: text('key').notNull(),
    name: text('name').notNull(),
    kind: competencyKind('kind').notNull().default('core'),
    description: text('description'),
    /** [{ level, label, descriptor }] */
    levels: jsonb('levels').notNull().default(sql`'[]'::jsonb`),
    active: boolean('active').notNull().default(true),
  },
  (t) => [uniqueIndex('competencies_key_uq').on(t.tenantId, t.key)],
);

/** Job profile: competenze e livelli attesi per un ruolo, con eventuale ruolo successivo (DEV-002, DEV-013). */
export const jobProfiles = pgTable(
  'job_profiles',
  {
    ...tenantScoped,
    title: text('title').notNull(),
    family: text('family'),
    level: text('level'),
    description: text('description'),
    /** [{ competencyKey, level }] */
    expected: jsonb('expected').notNull().default(sql`'[]'::jsonb`),
    nextProfileId: uuid('next_profile_id'),
    active: boolean('active').notNull().default(true),
  },
  (t) => [index('job_profiles_tenant_idx').on(t.tenantId, t.family)],
);

/** Valutazione di una competenza per persona e fonte (DEV-010/012). */
export const competencyAssessments = pgTable(
  'competency_assessments',
  {
    ...tenantScoped,
    personId: uuid('person_id').notNull(),
    competencyKey: text('competency_key').notNull(),
    source: assessmentSource('source').notNull(),
    level: integer('level').notNull(),
    note: text('note'),
    assessedByPersonId: uuid('assessed_by_person_id'),
    assessedAt: timestamp('assessed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('competency_assessments_person_idx').on(t.tenantId, t.personId, t.competencyKey, t.source)],
);

/** Piano di sviluppo individuale (DEV-020/024). */
export const developmentPlans = pgTable(
  'development_plans',
  {
    ...tenantScoped,
    personId: uuid('person_id').notNull(),
    title: text('title').notNull(),
    status: devPlanStatus('status').notNull().default('draft'),
    periodStart: date('period_start'),
    periodEnd: date('period_end'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedByPersonId: uuid('approved_by_person_id'),
    managerNote: text('manager_note'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [index('development_plans_person_idx').on(t.tenantId, t.personId, t.status)],
);

/** Azione di sviluppo (DEV-020/021/023). */
export const developmentActions = pgTable(
  'development_actions',
  {
    ...tenantScoped,
    planId: uuid('plan_id').notNull(),
    personId: uuid('person_id').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    kind: devActionKind('kind').notNull().default('other'),
    competencyKey: text('competency_key'),
    /** gap | review | one_on_one | manual */
    source: text('source').notNull().default('manual'),
    dueDate: date('due_date'),
    status: devActionStatus('status').notNull().default('open'),
    evidence: text('evidence'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdByPersonId: uuid('created_by_person_id'),
  },
  (t) => [index('development_actions_plan_idx').on(t.tenantId, t.planId), index('development_actions_person_idx').on(t.tenantId, t.personId, t.status, t.dueDate)],
);

/** Valutazione di potenziale per il 9-box (DEV-032): mai visibile al collaboratore. */
export const talentAssessments = pgTable(
  'talent_assessments',
  {
    ...tenantScoped,
    personId: uuid('person_id').notNull(),
    potential: integer('potential').notNull(),
    /** fascia di performance 1–3 al momento della valutazione (dall'ultima review) */
    performance: integer('performance'),
    note: text('note').notNull(),
    session: text('session'),
    assessedByPersonId: uuid('assessed_by_person_id').notNull(),
  },
  (t) => [index('talent_assessments_person_idx').on(t.tenantId, t.personId, t.createdAt)],
);
