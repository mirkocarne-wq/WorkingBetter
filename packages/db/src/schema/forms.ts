import { boolean, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenantScoped } from './core.js';

export const formStatus = pgEnum('form_status', ['draft', 'published', 'archived']);
export const responseStatus = pgEnum('form_response_status', ['draft', 'submitted']);

/** Definizione di form (APP-001…009). Lo schema JSON è validato con `formSchema` di @wb/shared. */
export const formDefinitions = pgTable(
  'form_definitions',
  {
    ...tenantScoped,
    key: text('key').notNull(), // stabile tra versioni, es. "review_annual"
    name: text('name').notNull(),
    kind: text('kind').notNull().default('generic'), // generic | review | survey | onboarding | request
    version: integer('version').notNull().default(1),
    status: formStatus('status').notNull().default('draft'),
    schema: jsonb('schema').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    parentId: uuid('parent_id'), // versione precedente
  },
  (t) => [uniqueIndex('form_definitions_key_version_uq').on(t.tenantId, t.key, t.version), index('form_definitions_status_idx').on(t.tenantId, t.status)],
);

/** Risposta a un form: legata alla versione pubblicata (APP-007). */
export const formResponses = pgTable(
  'form_responses',
  {
    ...tenantScoped,
    formDefinitionId: uuid('form_definition_id').notNull(),
    formKey: text('form_key').notNull(),
    formVersion: integer('form_version').notNull(),
    respondentPersonId: uuid('respondent_person_id'),
    subjectPersonId: uuid('subject_person_id'),
    contextType: text('context_type'), // review_stage | survey | onboarding_task | ...
    contextId: uuid('context_id'),
    status: responseStatus('status').notNull().default('draft'),
    answers: jsonb('answers').notNull().default(sql`'{}'::jsonb`),
    score: numeric('score', { precision: 6, scale: 4 }),
    sectionScores: jsonb('section_scores'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    dueDate: timestamp('due_date', { withTimezone: true }),
  },
  (t) => [
    index('form_responses_def_idx').on(t.tenantId, t.formDefinitionId, t.status),
    index('form_responses_respondent_idx').on(t.tenantId, t.respondentPersonId, t.status),
    index('form_responses_context_idx').on(t.tenantId, t.contextType, t.contextId),
  ],
);

/** Risposte normalizzate per l'analytics (una riga per campo, ADR-0004). */
export const formAnswers = pgTable(
  'form_answers',
  {
    ...tenantScoped,
    responseId: uuid('response_id').notNull(),
    formKey: text('form_key').notNull(),
    sectionKey: text('section_key').notNull(),
    fieldKey: text('field_key').notNull(),
    fieldType: text('field_type').notNull(),
    valueNumber: numeric('value_number', { precision: 18, scale: 4 }),
    valueText: text('value_text'),
    valueOptions: text('value_options').array(),
    subjectPersonId: uuid('subject_person_id'),
  },
  (t) => [index('form_answers_response_idx').on(t.tenantId, t.responseId), index('form_answers_field_idx').on(t.tenantId, t.formKey, t.fieldKey)],
);

/** Scale riutilizzabili del tenant (APP-005): un campo `scale` può indicare `scaleKey`; alla pubblicazione l'API incorpora la scala nel form. */
export const formScales = pgTable(
  'form_scales',
  {
    ...tenantScoped,
    key: text('key').notNull(), // es. likert_5, rating_4
    name: text('name').notNull(),
    min: integer('min').notNull().default(1),
    max: integer('max').notNull().default(5),
    labels: jsonb('labels').$type<Record<string, string>>().notNull().default({}),
    allowNa: boolean('allow_na').notNull().default(false),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('form_scales_key_uq').on(t.tenantId, t.key)],
);
