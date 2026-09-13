import { boolean, date, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { tenantScoped } from './core.js';

/**
 * Welfare aziendale (WEL, ADR-0008): piani, fonti di budget, registro movimenti append-only,
 * categorie e soglie fiscali per anno, catalogo interno, richieste, lotti payroll, dichiarazioni, iniziative.
 */
export const welfarePlanStatus = pgEnum('welfare_plan_status', ['draft', 'active', 'closed']);
export const welfareRequestStatus = pgEnum('welfare_request_status', ['submitted', 'in_review', 'needs_docs', 'approved', 'in_payroll', 'paid', 'fulfilled', 'rejected', 'cancelled']);
export const welfareMovementKind = pgEnum('welfare_movement_kind', ['credit', 'reserve', 'release', 'spend', 'refund', 'expire', 'adjust']);

export const welfareCategories = pgTable(
  'welfare_categories',
  {
    ...tenantScoped,
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    regime: text('regime').notNull().default('exempt'), // exempt | threshold | taxable
    beneficiaries: jsonb('beneficiaries').notNull().default(sql`'["self"]'::jsonb`),
    requiredDocs: text('required_docs'),
    note: text('note'),
    active: boolean('active').notNull().default(true),
  },
  (t) => [uniqueIndex('welfare_categories_key_uq').on(t.tenantId, t.key)],
);

export const welfareThresholds = pgTable(
  'welfare_thresholds',
  {
    ...tenantScoped,
    year: integer('year').notNull(),
    categoryKey: text('category_key').notNull(),
    /** variante di soglia (es. "children" = figli a carico); null = base */
    condition: text('condition'),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
  },
  (t) => [index('welfare_thresholds_year_idx').on(t.tenantId, t.year, t.categoryKey)],
);

export const welfarePlans = pgTable(
  'welfare_plans',
  {
    ...tenantScoped,
    name: text('name').notNull(),
    year: integer('year').notNull(),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    population: jsonb('population').notNull().default(sql`'{}'::jsonb`),
    regulation: text('regulation'),
    rolloverRule: text('rollover_rule').notNull().default('none'), // none | total | partial
    rolloverPercent: integer('rollover_percent').notNull().default(0),
    enabledCategories: jsonb('enabled_categories').notNull().default(sql`'[]'::jsonb`),
    /** conversione premio di risultato (WEL-003): { enabled, amount, windowFrom, windowTo, allowedPercents, taxRate, employeeContributionRate, employerContributionRate } */
    premium: jsonb('premium').notNull().default(sql`'{"enabled":false}'::jsonb`),
    status: welfarePlanStatus('status').notNull().default('draft'),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
  },
  (t) => [index('welfare_plans_tenant_idx').on(t.tenantId, t.year, t.status)],
);

export const welfareBudgetSources = pgTable(
  'welfare_budget_sources',
  {
    ...tenantScoped,
    planId: uuid('plan_id').notNull(),
    name: text('name').notNull(),
    kind: text('kind').notNull().default('on_top'), // on_top | ccnl | premium_conversion | points | manual
    amountPerPerson: numeric('amount_per_person', { precision: 12, scale: 2 }).notNull().default('0'),
    creditAt: date('credit_at').notNull(),
    expiresAt: date('expires_at'),
    creditedAt: timestamp('credited_at', { withTimezone: true }),
  },
  (t) => [index('welfare_sources_plan_idx').on(t.tenantId, t.planId)],
);

/** Registro append-only: mai aggiornato né cancellato. */
export const welfareMovements = pgTable(
  'welfare_movements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by'),
    planId: uuid('plan_id').notNull(),
    personId: uuid('person_id').notNull(),
    kind: welfareMovementKind('kind').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    year: integer('year').notNull(),
    categoryKey: text('category_key'),
    sourceId: uuid('source_id'),
    requestId: uuid('request_id'),
    expiresAt: date('expires_at'),
    note: text('note'),
  },
  (t) => [index('welfare_movements_person_idx').on(t.tenantId, t.personId, t.year), index('welfare_movements_plan_idx').on(t.tenantId, t.planId)],
);

export const welfareCatalogItems = pgTable(
  'welfare_catalog_items',
  {
    ...tenantScoped,
    planId: uuid('plan_id'), // null = tutti i piani
    name: text('name').notNull(),
    description: text('description'),
    categoryKey: text('category_key').notNull(),
    kind: text('kind').notNull().default('reimbursement'), // voucher | service | reimbursement
    price: numeric('price', { precision: 12, scale: 2 }), // null = importo libero
    minAmount: numeric('min_amount', { precision: 12, scale: 2 }),
    maxAmount: numeric('max_amount', { precision: 12, scale: 2 }),
    provider: text('provider').notNull().default('internal'),
    instructions: text('instructions'),
    available: boolean('available').notNull().default(true),
  },
  (t) => [index('welfare_catalog_tenant_idx').on(t.tenantId, t.available)],
);

export const welfareRequests = pgTable(
  'welfare_requests',
  {
    ...tenantScoped,
    planId: uuid('plan_id').notNull(),
    personId: uuid('person_id').notNull(),
    itemId: uuid('item_id'),
    kind: text('kind').notNull().default('reimbursement'), // voucher | service | reimbursement
    categoryKey: text('category_key').notNull(),
    amount: numeric('amount', { precision: 12, scale: 2 }).notNull(),
    beneficiary: text('beneficiary').notNull().default('self'), // self | family
    beneficiaryName: text('beneficiary_name'),
    expenseDate: date('expense_date'),
    attachmentName: text('attachment_name'),
    declarationAccepted: boolean('declaration_accepted').notNull().default(false),
    note: text('note'),
    status: welfareRequestStatus('status').notNull().default('submitted'),
    taxablePortion: numeric('taxable_portion', { precision: 12, scale: 2 }).notNull().default('0'),
    reviewerUserId: uuid('reviewer_user_id'),
    reviewNote: text('review_note'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    payrollBatchId: uuid('payroll_batch_id'),
    voucherCode: text('voucher_code'),
    fulfilledAt: timestamp('fulfilled_at', { withTimezone: true }),
  },
  (t) => [index('welfare_requests_person_idx').on(t.tenantId, t.personId), index('welfare_requests_status_idx').on(t.tenantId, t.status)],
);

export const welfarePayrollBatches = pgTable(
  'welfare_payroll_batches',
  {
    ...tenantScoped,
    period: text('period').notNull(), // es. 2026-09
    status: text('status').notNull().default('exported'), // exported | confirmed
    itemsCount: integer('items_count').notNull().default(0),
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull().default('0'),
    exportedAt: timestamp('exported_at', { withTimezone: true }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  },
  (t) => [index('welfare_payroll_tenant_idx').on(t.tenantId, t.status)],
);

export const welfareDeclarations = pgTable(
  'welfare_declarations',
  {
    ...tenantScoped,
    personId: uuid('person_id').notNull(),
    year: integer('year').notNull(),
    key: text('key').notNull(), // children | ...
    value: boolean('value').notNull(),
    declaredAt: timestamp('declared_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('welfare_declarations_uq').on(t.tenantId, t.personId, t.year, t.key)],
);

export const welfareInitiatives = pgTable(
  'welfare_initiatives',
  {
    ...tenantScoped,
    name: text('name').notNull(),
    description: text('description'),
    conditions: text('conditions'),
    howTo: text('how_to'),
    kind: text('kind').notNull().default('convention'), // convention | program | event
    capacity: integer('capacity'),
    active: boolean('active').notNull().default(true),
  },
  (t) => [index('welfare_initiatives_tenant_idx').on(t.tenantId, t.active)],
);

export const welfareInitiativeMembers = pgTable(
  'welfare_initiative_members',
  {
    ...tenantScoped,
    initiativeId: uuid('initiative_id').notNull(),
    personId: uuid('person_id').notNull(),
  },
  (t) => [uniqueIndex('welfare_initiative_members_uq').on(t.initiativeId, t.personId)],
);
