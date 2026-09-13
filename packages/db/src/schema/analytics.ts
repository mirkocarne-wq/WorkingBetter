import { date, index, numeric, pgTable, text, uuid } from 'drizzle-orm/pg-core';

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
