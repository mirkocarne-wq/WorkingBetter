import { sql } from 'drizzle-orm';
import { date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { tenantScoped } from './core.js';

/** App Studio (APP, L2): app custom = definizione versionata; istanze con run per fase e log. */
export const appStatus = pgEnum('app_status', ['draft', 'published', 'archived']);
export const appInstanceStatus = pgEnum('app_instance_status', ['running', 'completed', 'cancelled']);
export const appStageRunStatus = pgEnum('app_stage_run_status', ['pending', 'active', 'done', 'rejected', 'skipped', 'superseded']);

/** Definizione dell'app (JSON validato da `validateAppDefinition`), versionata come i form (APP-007). */
export const apps = pgTable(
  'apps',
  {
    ...tenantScoped,
    key: text('key').notNull(),
    name: text('name').notNull(),
    version: integer('version').notNull().default(1),
    status: appStatus('status').notNull().default('draft'),
    /** AppDefinition */
    definition: jsonb('definition').notNull(),
    /** chiave del template da cui è stata installata (APP-030) */
    templateKey: text('template_key'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    parentId: uuid('parent_id'),
  },
  (t) => [uniqueIndex('apps_key_version_uq').on(t.tenantId, t.key, t.version), index('apps_status_idx').on(t.tenantId, t.status)],
);

/** Istanza: esecuzione dell'app per un soggetto, con snapshot della definizione e attori risolti. */
export const appInstances = pgTable(
  'app_instances',
  {
    ...tenantScoped,
    appId: uuid('app_id').notNull(),
    appKey: text('app_key').notNull(),
    appVersion: integer('app_version').notNull(),
    /** AppDefinition al lancio */
    definition: jsonb('definition').notNull(),
    subjectPersonId: uuid('subject_person_id').notNull(),
    launcherPersonId: uuid('launcher_person_id'),
    /** attori risolti: { subject, manager, manager_of_manager, launcher, hr } */
    actors: jsonb('actors').notNull().default(sql`'{}'::jsonb`),
    status: appInstanceStatus('status').notNull().default('running'),
    /** chiavi delle fasi attive */
    currentStages: jsonb('current_stages').notNull().default(sql`'[]'::jsonb`),
    title: text('title'),
    outcome: text('outcome'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  },
  (t) => [index('app_instances_app_idx').on(t.tenantId, t.appKey, t.status), index('app_instances_subject_idx').on(t.tenantId, t.subjectPersonId), index('app_instances_launcher_idx').on(t.tenantId, t.launcherPersonId)],
);

/** Run di una fase per un'istanza (un tentativo per riapertura). */
export const appStageRuns = pgTable(
  'app_stage_runs',
  {
    ...tenantScoped,
    instanceId: uuid('instance_id').notNull(),
    stageKey: text('stage_key').notNull(),
    attempt: integer('attempt').notNull().default(1),
    type: text('type').notNull(),
    actorPersonId: uuid('actor_person_id'),
    status: appStageRunStatus('status').notNull().default('pending'),
    formResponseId: uuid('form_response_id'),
    /** submitted | approved | rejected | notified */
    outcome: text('outcome'),
    comment: text('comment'),
    /** risposte del form al completamento (snapshot per la visibilità delle fasi precedenti) */
    answers: jsonb('answers'),
    dueDate: date('due_date'),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedByPersonId: uuid('completed_by_person_id'),
  },
  (t) => [uniqueIndex('app_stage_runs_uq').on(t.instanceId, t.stageKey, t.attempt), index('app_stage_runs_actor_idx').on(t.tenantId, t.actorPersonId, t.status, t.dueDate)],
);

/** Log per istanza (APP-026): chi ha fatto cosa e quando. */
export const appInstanceEvents = pgTable(
  'app_instance_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    instanceId: uuid('instance_id').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    actorPersonId: uuid('actor_person_id'),
    type: text('type').notNull(),
    stageKey: text('stage_key'),
    data: jsonb('data').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [index('app_instance_events_idx').on(t.tenantId, t.instanceId, t.at)],
);
