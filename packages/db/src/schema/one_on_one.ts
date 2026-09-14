import { relations } from 'drizzle-orm';
import { boolean, date, index, integer, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenantScoped } from './core.js';

export const relationKind = pgEnum('one_on_one_kind', ['manager_report', 'mentoring', 'skip_level', 'peer']);
export const meetingStatus = pgEnum('meeting_status', ['scheduled', 'done', 'skipped', 'cancelled']);
export const talkingPointSource = pgEnum('talking_point_source', ['manual', 'carry_over', 'objective', 'feedback', 'action_item', 'check_in', 'template']);
export const noteVisibility = pgEnum('note_visibility', ['shared', 'private']);
export const actionItemStatus = pgEnum('action_item_status', ['open', 'done', 'cancelled']);

/** Relazione 1:1 tra due persone (ONE-001). personA = chi guida (manager/mentor), personB = riporto/mentee; per i pari è indifferente. */
export const oneOnOneRelations = pgTable(
  'one_on_one_relations',
  {
    ...tenantScoped,
    personAId: uuid('person_a_id').notNull(),
    personBId: uuid('person_b_id').notNull(),
    kind: relationKind('kind').notNull().default('manager_report'),
    cadenceDays: integer('cadence_days'),
    durationMin: integer('duration_min').notNull().default(30),
    /** link videocall della relazione (INT-025), incluso negli inviti e nel feed */
    meetingUrl: text('meeting_url'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (t) => [index('one_on_one_relations_a_idx').on(t.tenantId, t.personAId), index('one_on_one_relations_b_idx').on(t.tenantId, t.personBId)],
);

export const meetings = pgTable(
  'meetings',
  {
    ...tenantScoped,
    relationId: uuid('relation_id').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    durationMin: integer('duration_min').notNull().default(30),
    status: meetingStatus('status').notNull().default('scheduled'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    completedByPersonId: uuid('completed_by_person_id'),
    /** SEQUENCE iCalendar (INT-023): cresce a ogni riprogrammazione/annullamento */
    icalSequence: integer('ical_sequence').notNull().default(0),
  },
  (t) => [index('meetings_relation_idx').on(t.tenantId, t.relationId, t.scheduledAt)],
);

export const talkingPoints = pgTable(
  'talking_points',
  {
    ...tenantScoped,
    meetingId: uuid('meeting_id').notNull(),
    relationId: uuid('relation_id').notNull(),
    authorPersonId: uuid('author_person_id'),
    text: text('text').notNull(),
    source: talkingPointSource('source').notNull().default('manual'),
    refType: text('ref_type'),
    refId: uuid('ref_id'),
    discussed: boolean('discussed').notNull().default(false),
    position: integer('position').notNull().default(0),
    carriedFromMeetingId: uuid('carried_from_meeting_id'),
  },
  (t) => [index('talking_points_meeting_idx').on(t.tenantId, t.meetingId)],
);

/** Note: le condivise sono visibili a entrambi; le private solo all'autore e sono cifrate a livello applicativo (docs/04). */
export const meetingNotes = pgTable(
  'meeting_notes',
  {
    ...tenantScoped,
    meetingId: uuid('meeting_id').notNull(),
    relationId: uuid('relation_id').notNull(),
    authorPersonId: uuid('author_person_id').notNull(),
    visibility: noteVisibility('visibility').notNull(),
    body: text('body').notNull().default(''),
    encrypted: boolean('encrypted').notNull().default(false),
  },
  (t) => [index('meeting_notes_meeting_idx').on(t.tenantId, t.meetingId, t.visibility)],
);

export const actionItems = pgTable(
  'action_items',
  {
    ...tenantScoped,
    relationId: uuid('relation_id'),
    meetingId: uuid('meeting_id'),
    ownerPersonId: uuid('owner_person_id').notNull(),
    title: text('title').notNull(),
    dueDate: date('due_date'),
    status: actionItemStatus('status').notNull().default('open'),
    doneAt: timestamp('done_at', { withTimezone: true }),
    source: text('source').notNull().default('one_on_one'), // one_on_one | review | development | survey
  },
  (t) => [index('action_items_owner_idx').on(t.tenantId, t.ownerPersonId, t.status), index('action_items_relation_idx').on(t.tenantId, t.relationId)],
);

export const oneOnOneRelationsRelations = relations(oneOnOneRelations, ({ many }) => ({
  meetings: many(meetings),
  actionItems: many(actionItems),
}));
export const meetingsRelations = relations(meetings, ({ one, many }) => ({
  relation: one(oneOnOneRelations, { fields: [meetings.relationId], references: [oneOnOneRelations.id] }),
  talkingPoints: many(talkingPoints),
  notes: many(meetingNotes),
}));
export const talkingPointsRelations = relations(talkingPoints, ({ one }) => ({
  meeting: one(meetings, { fields: [talkingPoints.meetingId], references: [meetings.id] }),
}));
export const meetingNotesRelations = relations(meetingNotes, ({ one }) => ({
  meeting: one(meetings, { fields: [meetingNotes.meetingId], references: [meetings.id] }),
}));
