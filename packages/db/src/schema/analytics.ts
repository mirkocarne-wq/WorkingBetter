import { sql } from 'drizzle-orm';
import { date, index, jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenantScoped } from './core.js';

/**
 * Data mart v1 (ADR-0006): fatti giornalieri a grana persona.
 * Ogni snapshot fotografa, per ogni persona attiva, manager e unità VALIDI QUEL GIORNO (dimensioni "alla data")
 * e il valore di ciascun fatto del catalogo (`FactKeys` in @wb/shared). Le metriche sono somme o rapporti di fatti.
 * Le righe di un giorno vengono riscritte per intero a ogni refresh (idempotente).
 */
export const martPersonFacts = pgTable(
  'mart_person_facts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    snapshotDate: date('snapshot_date').notNull(),
    personId: uuid('person_id').notNull(),
    managerId: uuid('manager_id'),
    orgUnitId: uuid('org_unit_id'),
    orgPath: text('org_path').notNull().default(''),
    /** solo per i fatti di review: ciclo di riferimento */
    cycleId: uuid('cycle_id'),
    factKey: text('fact_key').notNull(),
    value: numeric('value', { precision: 18, scale: 4 }).notNull(),
  },
  (t) => [
    index('mart_person_facts_day_idx').on(t.tenantId, t.snapshotDate, t.factKey),
    index('mart_person_facts_person_idx').on(t.tenantId, t.personId, t.snapshotDate),
  ],
);

/**
 * Report salvati (ANA-050…054, ANA-060): definizione dichiarativa sul semantic layer, condivisione per ruolo/persona,
 * pianificazione dell'invio. L'esecuzione applica sempre il perimetro e le soglie di CHI apre o riceve il report.
 */
export const savedReports = pgTable(
  'saved_reports',
  {
    ...tenantScoped,
    ownerUserId: uuid('owner_user_id').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    folder: text('folder'),
    /** ReportDefinition (@wb/shared): metrics, dimension, filters, compareDays, visualization, trendMetric, trendDays */
    definition: jsonb('definition').notNull(),
    /** ReportSharing: { roles: string[], userIds: string[] } */
    sharing: jsonb('sharing').notNull().default(sql`'{"roles":[],"userIds":[]}'::jsonb`),
    /** ReportSchedule | null */
    schedule: jsonb('schedule'),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
  },
  (t) => [index('saved_reports_owner_idx').on(t.tenantId, t.ownerUserId), index('saved_reports_next_run_idx').on(t.nextRunAt)],
);
