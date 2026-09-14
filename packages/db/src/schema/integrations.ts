import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { tenantScoped } from './core.js';

/**
 * Connettori esterni (INT §3.2–3.3, ADR-0012): collegamenti OAuth personali (Google, Microsoft 365) e di workspace (Slack),
 * mappature utente Slack, code di sincronizzazione calendario e di consegna chat svuotate dal worker.
 */
export const connectorAccounts = pgTable(
  'connector_accounts',
  {
    ...tenantScoped,
    /** google | microsoft | slack (workspace, user_id null) | slack_user (mappatura utente → id Slack) */
    provider: text('provider').notNull(),
    userId: uuid('user_id'),
    personId: uuid('person_id'),
    /** email Google, id Microsoft, team id Slack, user id Slack */
    externalId: text('external_id'),
    displayName: text('display_name'),
    accessTokenEnc: text('access_token_enc'),
    refreshTokenEnc: text('refresh_token_enc'),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    scopes: text('scopes'),
    status: text('status').notNull().default('active'), // active | error | revoked
    lastError: text('last_error'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    meta: jsonb('meta').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => [uniqueIndex('connector_accounts_uq').on(t.tenantId, t.provider, sql`coalesce(${t.userId}, '00000000-0000-0000-0000-000000000000'::uuid)`)],
);

/** Evento del 1:1 nel calendario esterno di un partecipante: una riga per (incontro, account), con stato di sincronizzazione. */
export const calendarEventLinks = pgTable(
  'calendar_event_links',
  {
    ...tenantScoped,
    meetingId: uuid('meeting_id').notNull(),
    accountId: uuid('account_id').notNull(),
    provider: text('provider').notNull(),
    externalEventId: text('external_event_id'),
    joinUrl: text('join_url'),
    htmlLink: text('html_link'),
    op: text('op').notNull().default('upsert'), // upsert | delete
    status: text('status').notNull().default('pending'), // pending | synced | deleted | failed
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
    syncedAt: timestamp('synced_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('calendar_event_links_uq').on(t.meetingId, t.accountId), index('calendar_event_links_pending_idx').on(t.status, t.nextAttemptAt)],
);

/** Messaggi verso Slack (DM o canale) e Teams (webhook): accodati dall'API, consegnati dal worker con ritentativi. */
export const chatOutbox = pgTable(
  'chat_outbox',
  {
    ...tenantScoped,
    provider: text('provider').notNull(), // slack | teams
    /** slack: user:<userId> (DM, mappato per email) oppure channel:<id>; teams: webhook (URL nelle impostazioni) */
    target: text('target').notNull(),
    userId: uuid('user_id'),
    text: text('text').notNull(),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    notificationId: uuid('notification_id'),
    status: text('status').notNull().default('pending'), // pending | sent | failed | skipped
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    lastError: text('last_error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => [index('chat_outbox_pending_idx').on(t.status, t.nextAttemptAt)],
);
