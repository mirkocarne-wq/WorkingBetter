import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenantScoped } from './core.js';

export const emailStatus = pgEnum('email_status', ['pending', 'sent', 'failed', 'skipped']);

/** Notifica in-app (INT-001). */
export const notifications = pgTable(
  'notifications',
  {
    ...tenantScoped,
    userId: uuid('user_id').notNull(),
    personId: uuid('person_id'),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    link: text('link'),
    data: jsonb('data').notNull().default(sql`'{}'::jsonb`),
    dedupeKey: text('dedupe_key'),
    readAt: timestamp('read_at', { withTimezone: true }),
    emailQueued: boolean('email_queued').notNull().default(false),
  },
  (t) => [
    index('notifications_user_idx').on(t.tenantId, t.userId, t.createdAt),
    uniqueIndex('notifications_dedupe_uq').on(t.tenantId, t.dedupeKey).where(sql`dedupe_key IS NOT NULL`),
  ],
);

/** Preferenze per tipo (INT-003). Assenza di riga = default del tipo. */
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    ...tenantScoped,
    userId: uuid('user_id').notNull(),
    type: text('type').notNull(),
    inApp: boolean('in_app').notNull().default(true),
    email: boolean('email').notNull().default(true),
  },
  (t) => [uniqueIndex('notification_preferences_uq').on(t.tenantId, t.userId, t.type)],
);

/** Coda email (INT-002): il worker la svuota; in dev il trasporto può essere "log". */
export const emailOutbox = pgTable(
  'email_outbox',
  {
    ...tenantScoped,
    notificationId: uuid('notification_id'),
    toEmail: text('to_email').notNull(),
    toName: text('to_name'),
    subject: text('subject').notNull(),
    text: text('text').notNull(),
    html: text('html'),
    /** allegati: [{ filename, contentType, content, method? }] — content testuale (es. .ics) o base64 */
    attachments: jsonb('attachments'),
    status: emailStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('email_outbox_status_idx').on(t.status, t.scheduledFor)],
);

/** Esecuzioni dei job del worker (idempotenza dei promemoria, osservabilità). */
export const jobRuns = pgTable(
  'job_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    job: text('job').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    ok: boolean('ok'),
    summary: jsonb('summary'),
    error: text('error'),
  },
  (t) => [index('job_runs_job_idx').on(t.job, t.startedAt)],
);
