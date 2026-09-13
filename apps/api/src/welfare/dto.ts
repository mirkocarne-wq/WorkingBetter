import { z } from 'zod';
const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato data AAAA-MM-GG');
const money = z.number().min(0).max(1_000_000);

export const categoryDto = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,40}$/),
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional(),
  regime: z.enum(['exempt', 'threshold', 'taxable']).default('exempt'),
  beneficiaries: z.array(z.enum(['self', 'family'])).min(1).default(['self']),
  requiredDocs: z.string().max(500).optional(),
  note: z.string().max(1000).optional(),
  active: z.boolean().default(true),
});
export const thresholdDto = z.object({ year: z.number().int().min(2020).max(2100), categoryKey: z.string(), condition: z.string().max(40).nullable().default(null), amount: money });
export const thresholdsPutDto = z.object({ year: z.number().int().min(2020).max(2100), items: z.array(thresholdDto.omit({ year: true })).max(100) });

export const populationDto = z.object({ orgUnitIds: z.array(uuid).optional(), personIds: z.array(uuid).optional(), excludePersonIds: z.array(uuid).optional() });
export const premiumDto = z.object({
  enabled: z.boolean().default(false),
  amount: money.default(0),
  windowFrom: isoDate.optional(),
  windowTo: isoDate.optional(),
  allowedPercents: z.array(z.number().int().min(0).max(100)).max(12).default([0, 25, 50, 75, 100]),
  taxRate: z.number().min(0).max(1).default(0.23),
  employeeContributionRate: z.number().min(0).max(1).default(0.0919),
  employerContributionRate: z.number().min(0).max(1).default(0.3),
});
export const createPlanDto = z.object({
  name: z.string().min(1).max(200),
  year: z.number().int().min(2020).max(2100),
  periodStart: isoDate,
  periodEnd: isoDate,
  population: populationDto.default({}),
  regulation: z.string().max(20000).optional(),
  rolloverRule: z.enum(['none', 'total', 'partial']).default('none'),
  rolloverPercent: z.number().int().min(0).max(100).default(0),
  enabledCategories: z.array(z.string()).default([]),
  premium: premiumDto.default({ enabled: false }),
});
export const updatePlanDto = createPlanDto.partial();
export const sourceDto = z.object({ name: z.string().min(1).max(120), kind: z.enum(['on_top', 'ccnl', 'premium_conversion', 'points', 'manual']).default('on_top'), amountPerPerson: money, creditAt: isoDate, expiresAt: isoDate.nullable().optional() });
export const adjustDto = z.object({ planId: uuid, personId: uuid, amount: z.number().min(-1_000_000).max(1_000_000), note: z.string().min(3).max(500) });

export const catalogItemDto = z.object({
  planId: uuid.nullable().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  categoryKey: z.string(),
  kind: z.enum(['voucher', 'service', 'reimbursement']).default('reimbursement'),
  price: money.nullable().optional(),
  minAmount: money.nullable().optional(),
  maxAmount: money.nullable().optional(),
  instructions: z.string().max(2000).optional(),
  available: z.boolean().default(true),
});

export const createRequestDto = z.object({
  planId: uuid,
  itemId: uuid.optional(),
  categoryKey: z.string().optional(),
  kind: z.enum(['voucher', 'service', 'reimbursement']).optional(),
  amount: z.number().positive().max(1_000_000),
  beneficiary: z.enum(['self', 'family']).default('self'),
  beneficiaryName: z.string().max(120).optional(),
  expenseDate: isoDate.optional(),
  attachmentName: z.string().max(200).optional(),
  declarationAccepted: z.boolean().default(false),
  note: z.string().max(1000).optional(),
});
export const decideDto = z.object({ decision: z.enum(['approve', 'reject', 'needs_docs']), note: z.string().max(1000).optional(), voucherCode: z.string().max(120).optional() });
export const declarationDto = z.object({ year: z.number().int().min(2020).max(2100), key: z.enum(['children']), value: z.boolean() });
export const premiumChoiceDto = z.object({ planId: uuid, percent: z.number().int().min(0).max(100), acceptRegulation: z.literal(true) });
export const simulateQuery = z.object({ planId: uuid, percent: z.coerce.number().int().min(0).max(100) });
export const initiativeDto = z.object({ name: z.string().min(1).max(200), description: z.string().max(2000).optional(), conditions: z.string().max(2000).optional(), howTo: z.string().max(2000).optional(), kind: z.enum(['convention', 'program', 'event']).default('convention'), capacity: z.number().int().positive().nullable().optional(), active: z.boolean().default(true) });
export const requestsQuery = z.object({ status: z.string().optional(), planId: uuid.optional() });
export const batchDto = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) });
