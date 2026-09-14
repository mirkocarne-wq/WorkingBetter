import { sql } from 'drizzle-orm';
import { boolean, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { tenantScoped } from './core.js';

/**
 * Feedback 360° (F360). Anonimato architetturale come nelle survey (ADR-0008): le richieste (chi deve rispondere)
 * e le risposte (cosa è stato risposto) sono tabelle separate; il legame `request_id` esiste solo per le
 * categorie non anonime (self, manager).
 */
export const f360CampaignStatus = pgEnum('f360_campaign_status', ['draft', 'nomination', 'collection', 'closed']);
export const f360SubjectStatus = pgEnum('f360_subject_status', ['nominating', 'pending_approval', 'approved', 'collecting', 'ready', 'released']);
export const f360RaterCategory = pgEnum('f360_rater_category', ['self', 'manager', 'peer', 'report', 'other', 'external']);
export const f360RequestStatus = pgEnum('f360_request_status', ['proposed', 'rejected', 'pending', 'submitted', 'declined', 'expired']);

/** Campagna (F360-001…005): template inline (competenze, scala, domande aperte), categorie, regole di nomina e rilascio, fasi. */
export const f360Campaigns = pgTable(
  'f360_campaigns',
  {
    ...tenantScoped,
    name: text('name').notNull(),
    description: text('description'),
    status: f360CampaignStatus('status').notNull().default('draft'),
    /** chiavi delle competenze del framework DEV valutate */
    competencyKeys: jsonb('competency_keys').notNull().default(sql`'[]'::jsonb`),
    /** { min, max, labels } */
    scale: jsonb('scale').notNull().default(sql`'{"min":1,"max":5,"labels":{}}'::jsonb`),
    /** [{ key, label }] */
    openQuestions: jsonb('open_questions').notNull().default(sql`'[]'::jsonb`),
    /** [{ key, enabled, min, max, anonymous }] */
    categories: jsonb('categories').notNull().default(sql`'[]'::jsonb`),
    /** subject | manager | hr */
    nominationBy: text('nomination_by').notNull().default('subject'),
    requireApproval: boolean('require_approval').notNull().default(true),
    /** immediately | manager | after_debrief (F360-025) */
    releaseRule: text('release_rule').notNull().default('after_debrief'),
    managerSeesReport: boolean('manager_sees_report').notNull().default(true),
    anonymityThreshold: integer('anonymity_threshold').notNull().default(3),
    population: jsonb('population').notNull().default(sql`'{}'::jsonb`),
    nominationDueAt: date('nomination_due_at'),
    collectionDueAt: date('collection_due_at'),
    launchedAt: timestamp('launched_at', { withTimezone: true }),
    collectionStartedAt: timestamp('collection_started_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [index('f360_campaigns_tenant_idx').on(t.tenantId, t.status)],
);

/** Soggetto valutato in una campagna, con stato delle nomine, report generato alla chiusura e rilascio. */
export const f360Subjects = pgTable(
  'f360_subjects',
  {
    ...tenantScoped,
    campaignId: uuid('campaign_id').notNull(),
    personId: uuid('person_id').notNull(),
    managerPersonId: uuid('manager_person_id'),
    /** unità al lancio (per l'aggregato F360-023) */
    orgUnitId: uuid('org_unit_id'),
    status: f360SubjectStatus('status').notNull().default('nominating'),
    nominationSubmittedAt: timestamp('nomination_submitted_at', { withTimezone: true }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    approvedByPersonId: uuid('approved_by_person_id'),
    /** snapshot del report (shared buildF360Report) */
    report: jsonb('report'),
    reportGeneratedAt: timestamp('report_generated_at', { withTimezone: true }),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    releasedByPersonId: uuid('released_by_person_id'),
    debriefAt: timestamp('debrief_at', { withTimezone: true }),
    debriefNote: text('debrief_note'),
  },
  (t) => [uniqueIndex('f360_subjects_uq').on(t.campaignId, t.personId), index('f360_subjects_person_idx').on(t.tenantId, t.personId), index('f360_subjects_manager_idx').on(t.tenantId, t.managerPersonId)],
);

/** Richiesta a un valutatore (nomina → invito → risposta/declino). Gli esterni hanno email e token (hash). */
export const f360Requests = pgTable(
  'f360_requests',
  {
    ...tenantScoped,
    campaignId: uuid('campaign_id').notNull(),
    subjectId: uuid('subject_id').notNull(),
    category: f360RaterCategory('category').notNull(),
    raterPersonId: uuid('rater_person_id'),
    externalEmail: text('external_email'),
    externalName: text('external_name'),
    /** sha256 del token del magic link (F360-011); il token in chiaro è solo nell'email */
    tokenHash: text('token_hash'),
    status: f360RequestStatus('status').notNull().default('proposed'),
    nominatedByPersonId: uuid('nominated_by_person_id'),
    declineReason: text('decline_reason'),
    /** bozza della compilazione (F360-013): cancellata all'invio */
    draft: jsonb('draft'),
    invitedAt: timestamp('invited_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    remindedAt: timestamp('reminded_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [
    index('f360_requests_subject_idx').on(t.tenantId, t.subjectId, t.category),
    index('f360_requests_rater_idx').on(t.tenantId, t.raterPersonId, t.status),
    uniqueIndex('f360_requests_token_uq').on(t.tokenHash).where(sql`token_hash IS NOT NULL`),
  ],
);

/** Risposta: contenuto e categoria. `request_id` è valorizzato solo per le categorie non anonime. */
export const f360Responses = pgTable(
  'f360_responses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    campaignId: uuid('campaign_id').notNull(),
    subjectId: uuid('subject_id').notNull(),
    category: f360RaterCategory('category').notNull(),
    requestId: uuid('request_id'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
    /** { competencyKey: livello | null } */
    ratings: jsonb('ratings').notNull().default(sql`'{}'::jsonb`),
    /** { competencyKey: testo } */
    comments: jsonb('comments').notNull().default(sql`'{}'::jsonb`),
    /** { chiave domanda: testo } */
    openAnswers: jsonb('open_answers').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [index('f360_responses_subject_idx').on(t.tenantId, t.subjectId, t.category)],
);
