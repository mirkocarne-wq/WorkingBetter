import { relations } from 'drizzle-orm';
import { boolean, date, index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenantScoped } from './core.js';

export const feedbackKind = pgEnum('feedback_kind', ['praise', 'suggestion', 'observation']);
export const feedbackVisibility = pgEnum('feedback_visibility', ['private', 'manager']);
export const requestRecipientStatus = pgEnum('feedback_request_recipient_status', ['pending', 'answered', 'declined']);

/** Valori aziendali configurabili (FBK-022). */
export const companyValues = pgTable(
  'company_values',
  {
    ...tenantScoped,
    name: text('name').notNull(),
    description: text('description'),
    icon: text('icon'),
    position: integer('position').notNull().default(0),
    active: boolean('active').notNull().default(true),
  },
  (t) => [index('company_values_tenant_idx').on(t.tenantId, t.position)],
);

/** Richiesta di feedback a uno o più colleghi (FBK-002/003). aboutPersonId = soggetto (sé stesso o un riporto). */
export const feedbackRequests = pgTable(
  'feedback_requests',
  {
    ...tenantScoped,
    requesterPersonId: uuid('requester_person_id').notNull(),
    aboutPersonId: uuid('about_person_id').notNull(),
    question: text('question').notNull(),
    dueDate: date('due_date'),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [index('feedback_requests_about_idx').on(t.tenantId, t.aboutPersonId)],
);

export const feedbackRequestRecipients = pgTable(
  'feedback_request_recipients',
  {
    ...tenantScoped,
    requestId: uuid('request_id').notNull(),
    personId: uuid('person_id').notNull(),
    status: requestRecipientStatus('status').notNull().default('pending'),
    feedbackId: uuid('feedback_id'),
    declineReason: text('decline_reason'),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
  },
  (t) => [index('feedback_request_recipients_person_idx').on(t.tenantId, t.personId, t.status), index('feedback_request_recipients_request_idx').on(t.tenantId, t.requestId)],
);

/** Feedback da persona a persona (FBK-001). */
export const feedback = pgTable(
  'feedback',
  {
    ...tenantScoped,
    fromPersonId: uuid('from_person_id').notNull(),
    toPersonId: uuid('to_person_id').notNull(),
    kind: feedbackKind('kind').notNull().default('praise'),
    body: text('body').notNull(),
    visibility: feedbackVisibility('visibility').notNull().default('private'),
    valueId: uuid('value_id'),
    objectiveId: uuid('objective_id'),
    requestRecipientId: uuid('request_recipient_id'),
    sharedWithManagerAt: timestamp('shared_with_manager_at', { withTimezone: true }),
    inRecordAt: timestamp('in_record_at', { withTimezone: true }), // "parte del fascicolo": visibile ai manager successivi
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    helpful: boolean('helpful'),
  },
  (t) => [index('feedback_to_idx').on(t.tenantId, t.toPersonId, t.createdAt), index('feedback_from_idx').on(t.tenantId, t.fromPersonId)],
);

/** Riconoscimento pubblico (FBK-020). */
export const recognitions = pgTable(
  'recognitions',
  {
    ...tenantScoped,
    fromPersonId: uuid('from_person_id').notNull(),
    message: text('message').notNull(),
    hiddenAt: timestamp('hidden_at', { withTimezone: true }),
    hiddenByUserId: uuid('hidden_by_user_id'),
  },
  (t) => [index('recognitions_tenant_created_idx').on(t.tenantId, t.createdAt)],
);
export const recognitionRecipients = pgTable(
  'recognition_recipients',
  {
    ...tenantScoped,
    recognitionId: uuid('recognition_id').notNull(),
    personId: uuid('person_id').notNull(),
  },
  (t) => [index('recognition_recipients_person_idx').on(t.tenantId, t.personId), index('recognition_recipients_rec_idx').on(t.tenantId, t.recognitionId)],
);
export const recognitionValues = pgTable(
  'recognition_values',
  {
    ...tenantScoped,
    recognitionId: uuid('recognition_id').notNull(),
    valueId: uuid('value_id').notNull(),
  },
  (t) => [index('recognition_values_rec_idx').on(t.tenantId, t.recognitionId)],
);
export const recognitionReactions = pgTable(
  'recognition_reactions',
  {
    ...tenantScoped,
    recognitionId: uuid('recognition_id').notNull(),
    personId: uuid('person_id').notNull(),
    emoji: text('emoji').notNull().default('👏'),
  },
  (t) => [index('recognition_reactions_rec_idx').on(t.tenantId, t.recognitionId)],
);

export const recognitionsRelations = relations(recognitions, ({ many }) => ({
  recipients: many(recognitionRecipients),
  values: many(recognitionValues),
  reactions: many(recognitionReactions),
}));
export const recognitionRecipientsRelations = relations(recognitionRecipients, ({ one }) => ({
  recognition: one(recognitions, { fields: [recognitionRecipients.recognitionId], references: [recognitions.id] }),
}));
export const recognitionValuesRelations = relations(recognitionValues, ({ one }) => ({
  recognition: one(recognitions, { fields: [recognitionValues.recognitionId], references: [recognitions.id] }),
  value: one(companyValues, { fields: [recognitionValues.valueId], references: [companyValues.id] }),
}));
export const recognitionReactionsRelations = relations(recognitionReactions, ({ one }) => ({
  recognition: one(recognitions, { fields: [recognitionReactions.recognitionId], references: [recognitions.id] }),
}));
export const feedbackRequestsRelations = relations(feedbackRequests, ({ many }) => ({ recipients: many(feedbackRequestRecipients) }));
export const feedbackRequestRecipientsRelations = relations(feedbackRequestRecipients, ({ one }) => ({
  request: one(feedbackRequests, { fields: [feedbackRequestRecipients.requestId], references: [feedbackRequests.id] }),
}));
