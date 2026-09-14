import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Operatori della console di piattaforma (ADR-0013): fuori dai tenant, un solo ruolo (`platform_admin`).
 * Stessa policy password e stesso blocco degli utenti tenant; revoca delle sessioni per cambio password.
 */
export const platformUsers = pgTable('platform_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  email: text('email').notNull().unique(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  passwordHash: text('password_hash').notNull(),
  /** true finché non cambia la password iniziale (PLT-002/003) */
  mustChangePassword: integer('must_change_password').notNull().default(1),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  failedLogins: integer('failed_logins').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  sessionsRevokedAt: timestamp('sessions_revoked_at', { withTimezone: true }),
  createdBy: uuid('created_by'),
});

/**
 * Eventi della console (append-only): chi ha fatto cosa, su quale tenant o utente, da quale IP (PLT-033).
 * `tenant_id` è facoltativo (eventi di piattaforma); la tabella è letta solo con `withPlatform`.
 */
export const platformEvents = pgTable(
  'platform_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid('actor_id'),
    actorEmail: text('actor_email'),
    action: text('action').notNull(), // es. tenant.create, user.reset_password
    tenantId: uuid('tenant_id'),
    targetType: text('target_type'), // tenant | user | platform_user | system
    targetId: uuid('target_id'),
    targetLabel: text('target_label'),
    details: jsonb('details').notNull().default(sql`'{}'::jsonb`),
    ip: text('ip'),
  },
  (t) => [index('platform_events_at_idx').on(t.at), index('platform_events_tenant_idx').on(t.tenantId, t.at)],
);
