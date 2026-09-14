import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenantScoped } from './core.js';

/**
 * Stato dell'avviamento guidato per utente e profilo (AVV): passi manuali segnati fatti e
 * promemoria nascosto in Home. I passi con controllo automatico non si salvano: si ricalcolano dai dati.
 */
export const guideStates = pgTable(
  'guide_states',
  {
    ...tenantScoped,
    userId: uuid('user_id').notNull(),
    profile: text('profile').notNull(), // admin | hr | manager | employee
    doneSteps: jsonb('done_steps').notNull().default(sql`'[]'::jsonb`),
    dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('guide_states_uq').on(t.tenantId, t.userId, t.profile), index('guide_states_user_idx').on(t.tenantId, t.userId)],
);
