import { sql } from 'drizzle-orm';
import { boolean, date, index, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { tenantScoped } from './core.js';

/** Onboarding (ONB): template di percorso, istanze per persona, task e mini-survey nominali. */
export const onboardingKind = pgEnum('onboarding_kind', ['onboarding', 'role_change', 'offboarding']);
export const onboardingJourneyStatus = pgEnum('onboarding_journey_status', ['active', 'completed', 'cancelled']);
export const onboardingTaskStatus = pgEnum('onboarding_task_status', ['open', 'done', 'skipped']);
export const onboardingTaskRole = pgEnum('onboarding_task_role', ['newcomer', 'manager', 'hr', 'buddy', 'it']);
export const onboardingTaskKind = pgEnum('onboarding_task_kind', ['todo', 'read', 'sign', 'form', 'meeting', 'objective', 'survey']);

/** Template (ONB-001/002/003): fasi e task in JSON (chiavi stabili), regole di assegnazione automatica. */
export const onboardingTemplates = pgTable(
  'onboarding_templates',
  {
    ...tenantScoped,
    name: text('name').notNull(),
    kind: onboardingKind('kind').notNull().default('onboarding'),
    description: text('description'),
    /** [{ key, label, fromDay, toDay }] */
    phases: jsonb('phases').notNull().default(sql`'[]'::jsonb`),
    /** [{ key, phase, title, description, role, kind, dueDay, link, formKey, surveyKey, required }] */
    tasks: jsonb('tasks').notNull().default(sql`'[]'::jsonb`),
    /** { orgUnitIds?, locations?, jobTitleKeywords? } */
    rules: jsonb('rules').notNull().default(sql`'{}'::jsonb`),
    isDefault: boolean('is_default').notNull().default(false),
    active: boolean('active').notNull().default(true),
  },
  (t) => [index('onboarding_templates_tenant_idx').on(t.tenantId, t.kind)],
);

/** Istanza del percorso per una persona (ONB-010/012). */
export const onboardingJourneys = pgTable(
  'onboarding_journeys',
  {
    ...tenantScoped,
    templateId: uuid('template_id'),
    personId: uuid('person_id').notNull(),
    kind: onboardingKind('kind').notNull().default('onboarding'),
    managerPersonId: uuid('manager_person_id'),
    buddyPersonId: uuid('buddy_person_id'),
    hrPersonId: uuid('hr_person_id'),
    itPersonId: uuid('it_person_id'),
    /** data di riferimento: ingresso, cambio ruolo o ultimo giorno */
    anchorDate: date('anchor_date').notNull(),
    status: onboardingJourneyStatus('status').notNull().default('active'),
    templateName: text('template_name').notNull(),
    /** istanza del motore dei processi che rispecchia il percorso (ADR-0011); null per i percorsi precedenti */
    appInstanceId: uuid('app_instance_id'),
    /** pre-boarding con identità esterna (ONB-011): email e hash del magic link della persona senza account */
    externalEmail: text('external_email'),
    externalTokenHash: text('external_token_hash'),
    externalTokenExpiresAt: timestamp('external_token_expires_at', { withTimezone: true }),
    /** snapshot delle fasi del template */
    phases: jsonb('phases').notNull().default(sql`'[]'::jsonb`),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    /** traguardi già notificati (25/50/75/100) */
    milestones: jsonb('milestones').notNull().default(sql`'[]'::jsonb`),
  },
  (t) => [index('onboarding_journeys_person_idx').on(t.tenantId, t.personId, t.status), index('onboarding_journeys_manager_idx').on(t.tenantId, t.managerPersonId), index('onboarding_journeys_buddy_idx').on(t.tenantId, t.buddyPersonId)],
);

/** Task del percorso (ONB-001/014/015): assegnatario risolto, scadenza assoluta, completamento tracciato. */
export const onboardingTasks = pgTable(
  'onboarding_tasks',
  {
    ...tenantScoped,
    journeyId: uuid('journey_id').notNull(),
    personId: uuid('person_id').notNull(),
    key: text('key').notNull(),
    phase: text('phase').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    role: onboardingTaskRole('role').notNull(),
    kind: onboardingTaskKind('kind').notNull().default('todo'),
    assigneePersonId: uuid('assignee_person_id'),
    dueDate: date('due_date'),
    link: text('link'),
    formKey: text('form_key'),
    surveyKey: text('survey_key'),
    /** chiave della fase corrispondente nell'istanza del motore (null per i task ad hoc) */
    stageKey: text('stage_key'),
    required: boolean('required').notNull().default(true),
    status: onboardingTaskStatus('status').notNull().default('open'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedByPersonId: uuid('completed_by_person_id'),
    /** nota o dichiarazione di presa visione */
    note: text('note'),
  },
  (t) => [
    uniqueIndex('onboarding_tasks_journey_key_uq').on(t.journeyId, t.key),
    index('onboarding_tasks_assignee_idx').on(t.tenantId, t.assigneePersonId, t.status, t.dueDate),
    index('onboarding_tasks_journey_idx').on(t.tenantId, t.journeyId),
  ],
);

/** Risposta alla mini-survey di onboarding (ONB-017): nominale per consentire l'intervento. */
export const onboardingSurveyResponses = pgTable(
  'onboarding_survey_responses',
  {
    ...tenantScoped,
    journeyId: uuid('journey_id').notNull(),
    personId: uuid('person_id').notNull(),
    surveyKey: text('survey_key').notNull(),
    /** { chiave domanda: 1..5 } */
    answers: jsonb('answers').notNull().default(sql`'{}'::jsonb`),
    comment: text('comment'),
    score: numeric('score', { precision: 4, scale: 2 }),
    low: boolean('low').notNull().default(false),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('onboarding_survey_uq').on(t.journeyId, t.surveyKey), index('onboarding_survey_person_idx').on(t.tenantId, t.personId)],
);
