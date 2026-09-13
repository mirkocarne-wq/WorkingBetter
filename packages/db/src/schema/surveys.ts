import { boolean, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenantScoped } from './core.js';

export const surveyStatus = pgEnum('survey_status', ['draft', 'open', 'closed', 'shared']);

/**
 * Survey (ENG): questionario del form engine inviato a una popolazione con finestra di risposta.
 * L'anonimato è architetturale: gli inviti (chi deve rispondere) e le risposte (cosa è stato risposto)
 * sono tabelle separate senza chiave comune quando `anonymous` è vero.
 */
export const surveys = pgTable(
  'surveys',
  {
    ...tenantScoped,
    title: text('title').notNull(),
    description: text('description'),
    kind: text('kind').notNull().default('engagement'), // engagement | pulse | enps | wellbeing | adhoc
    formDefinitionId: uuid('form_definition_id').notNull(),
    anonymous: boolean('anonymous').notNull().default(true),
    anonymityThreshold: integer('anonymity_threshold').notNull().default(5),
    population: jsonb('population').notNull().default(sql`'{}'::jsonb`),
    status: surveyStatus('status').notNull().default('draft'),
    closesAt: timestamp('closes_at', { withTimezone: true }),
    launchedAt: timestamp('launched_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    sharedAt: timestamp('shared_at', { withTimezone: true }),
    /** chiave domanda → driver (ENG-021) */
    drivers: jsonb('drivers').notNull().default(sql`'{}'::jsonb`),
    enpsField: text('enps_field'),
    /** sintesi pubblicata ai rispondenti (ENG-027) */
    summary: text('summary'),
    /** per le pulse: indice di rotazione delle domande (ENG-004) */
    rotation: integer('rotation').notNull().default(0),
  },
  (t) => [index('surveys_tenant_status_idx').on(t.tenantId, t.status)],
);

/** Chi è invitato e se ha risposto: mai collegato alla riga di risposta nelle survey anonime. */
export const surveyInvitations = pgTable(
  'survey_invitations',
  {
    ...tenantScoped,
    surveyId: uuid('survey_id').notNull(),
    personId: uuid('person_id').notNull(),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    remindedAt: timestamp('reminded_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('survey_invitations_uq').on(t.surveyId, t.personId), index('survey_invitations_person_idx').on(t.tenantId, t.personId)],
);

/** Risposta: solo contenuto e attributi di segmento fotografati al momento dell'invio. */
export const surveyResponses = pgTable(
  'survey_responses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    surveyId: uuid('survey_id').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    answers: jsonb('answers').notNull().default(sql`'{}'::jsonb`),
    /** valorizzato solo nelle survey nominali */
    personId: uuid('person_id'),
    orgUnitId: uuid('org_unit_id'),
    orgPath: text('org_path').notNull().default(''),
    managerId: uuid('manager_id'),
    tenureBand: text('tenure_band'),
    score: numeric('score', { precision: 6, scale: 4 }),
  },
  (t) => [index('survey_responses_survey_idx').on(t.tenantId, t.surveyId)],
);
