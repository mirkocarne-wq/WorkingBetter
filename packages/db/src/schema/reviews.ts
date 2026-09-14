import { boolean, date, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenantScoped } from './core.js';

export const reviewCycleStatus = pgEnum('review_cycle_status', ['draft', 'active', 'closed']);
export const reviewStatus = pgEnum('review_status', ['pending_self', 'pending_manager', 'pending_approval', 'pending_share', 'shared', 'signed', 'closed', 'cancelled']);
export const calibrationSessionStatus = pgEnum('calibration_session_status', ['open', 'locked']);
export const selfVisibility = pgEnum('review_self_visibility', ['immediately', 'after_submit', 'never']);

/**
 * Template di review (REV-001…011): combina i form del form engine (chiavi) con fasi, scadenze relative e regole.
 * stages: quali fasi sono attive; le scadenze sono giorni dal lancio.
 */
export const reviewTemplates = pgTable(
  'review_templates',
  {
    ...tenantScoped,
    name: text('name').notNull(),
    description: text('description'),
    selfFormKey: text('self_form_key'), // null = nessuna self-review
    managerFormKey: text('manager_form_key').notNull(),
    selfDueDays: integer('self_due_days').notNull().default(14),
    managerDueDays: integer('manager_due_days').notNull().default(21),
    managerSeesSelf: selfVisibility('manager_sees_self').notNull().default('after_submit'),
    requireSignature: boolean('require_signature').notNull().default(true),
    includeObjectives: boolean('include_objectives').notNull().default(true),
    /** scala del rating finale: mappa il punteggio 0..1 del form manager (REV-006) */
    ratingScale: jsonb('rating_scale').notNull().default(sql`'{"min":1,"max":5,"labels":{"1":"Non soddisfa","2":"Parzialmente","3":"Soddisfa","4":"Supera","5":"Eccezionale"}}'::jsonb`),
    /** chiave del campo del form manager da usare come rating complessivo (alternativa al punteggio calcolato) */
    overallRatingField: text('overall_rating_field'),
    /** catena di approvazione (REV-050): approvatori in ordine tra manager_of_manager | hrbp | hr */
    approvalChain: jsonb('approval_chain').notNull().default(sql`'[]'::jsonb`),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [index('review_templates_tenant_idx').on(t.tenantId)],
);

export const reviewCycles = pgTable(
  'review_cycles',
  {
    ...tenantScoped,
    templateId: uuid('template_id').notNull(),
    name: text('name').notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    okrCycleId: uuid('okr_cycle_id'), // periodo obiettivi da mostrare nel contesto
    status: reviewCycleStatus('status').notNull().default('draft'),
    population: jsonb('population').notNull().default(sql`'{}'::jsonb`), // { orgUnitIds?: [], personIds?: [], excludeHiredAfter?: 'YYYY-MM-DD' }
    launchedAt: timestamp('launched_at', { withTimezone: true }),
    selfDueAt: date('self_due_at'),
    managerDueAt: date('manager_due_at'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    /** snapshot fisso delle fasi/regole del template al lancio (REV-010) */
    templateSnapshot: jsonb('template_snapshot'),
  },
  (t) => [index('review_cycles_tenant_idx').on(t.tenantId, t.status)],
);

export const reviews = pgTable(
  'reviews',
  {
    ...tenantScoped,
    cycleId: uuid('cycle_id').notNull(),
    subjectPersonId: uuid('subject_person_id').notNull(),
    managerPersonId: uuid('manager_person_id'),
    status: reviewStatus('status').notNull().default('pending_self'),
    selfResponseId: uuid('self_response_id'),
    managerResponseId: uuid('manager_response_id'),
    selfSubmittedAt: timestamp('self_submitted_at', { withTimezone: true }),
    managerSubmittedAt: timestamp('manager_submitted_at', { withTimezone: true }),
    sharedAt: timestamp('shared_at', { withTimezone: true }),
    sharedByPersonId: uuid('shared_by_person_id'),
    conversationAt: timestamp('conversation_at', { withTimezone: true }),
    signedAt: timestamp('signed_at', { withTimezone: true }),
    signComment: text('sign_comment'),
    disagreed: boolean('disagreed').notNull().default(false),
    finalScore: numeric('final_score', { precision: 6, scale: 4 }), // 0..1
    finalRating: integer('final_rating'), // sulla scala del template
    finalRatingLabel: text('final_rating_label'),
    /** rating derivato dalla manager review, prima di calibrazione e correzioni (REV-041) */
    proposedRating: integer('proposed_rating'),
    /** potenziale 1..3 impostato in calibrazione (REV-042) */
    potential: integer('potential'),
    calibratedAt: timestamp('calibrated_at', { withTimezone: true }),
    calibrationSessionId: uuid('calibration_session_id'),
    ratingOverriddenBy: uuid('rating_overridden_by'),
    ratingOverrideNote: text('rating_override_note'),
    objectivesSnapshot: jsonb('objectives_snapshot'), // progresso obiettivi al momento della condivisione
    closedAt: timestamp('closed_at', { withTimezone: true }),
    /** istanza del motore dei processi che esegue il workflow della review (ADR-0011) */
    appInstanceId: uuid('app_instance_id'),
  },
  (t) => [
    index('reviews_cycle_idx').on(t.tenantId, t.cycleId, t.status),
    index('reviews_subject_idx').on(t.tenantId, t.subjectPersonId),
    index('reviews_manager_idx').on(t.tenantId, t.managerPersonId, t.status),
  ],
);

/** Sessione di calibrazione (REV-040): perimetro per unità, partecipanti, facilitatore, distribuzione attesa, blocco. */
export const calibrationSessions = pgTable(
  'calibration_sessions',
  {
    ...tenantScoped,
    cycleId: uuid('cycle_id').notNull(),
    name: text('name').notNull(),
    orgUnitIds: jsonb('org_unit_ids').notNull().default(sql`'[]'::jsonb`),
    participantPersonIds: jsonb('participant_person_ids').notNull().default(sql`'[]'::jsonb`),
    facilitatorPersonId: uuid('facilitator_person_id'),
    /** distribuzione attesa per rating in percentuale, es. {"1":5,"2":20,"3":50,"4":20,"5":5} */
    expectedDistribution: jsonb('expected_distribution'),
    notes: text('notes'),
    status: calibrationSessionStatus('status').notNull().default('open'),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedByPersonId: uuid('locked_by_person_id'),
  },
  (t) => [index('calibration_sessions_cycle_idx').on(t.tenantId, t.cycleId)],
);

/** Storico delle modifiche del rating (REV-043): in calibrazione o per correzione HR, sempre con motivazione. */
export const reviewRatingChanges = pgTable(
  'review_rating_changes',
  {
    ...tenantScoped,
    reviewId: uuid('review_id').notNull(),
    sessionId: uuid('session_id'),
    fromRating: integer('from_rating'),
    toRating: integer('to_rating'),
    fromPotential: integer('from_potential'),
    toPotential: integer('to_potential'),
    note: text('note').notNull(),
    byPersonId: uuid('by_person_id'),
  },
  (t) => [index('review_rating_changes_review_idx').on(t.tenantId, t.reviewId)],
);
