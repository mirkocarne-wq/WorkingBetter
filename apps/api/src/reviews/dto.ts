import { z } from 'zod';
const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const formKey = z.string().regex(/^[a-z][a-z0-9_]{0,60}$/);

export const ratingScaleDto = z.object({ min: z.number().int(), max: z.number().int(), labels: z.record(z.string()).default({}) }).refine((s) => s.max > s.min, 'max deve essere > min');

export const createTemplateDto = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  selfFormKey: formKey.nullable().optional(),
  managerFormKey: formKey,
  selfDueDays: z.number().int().min(1).max(365).default(14),
  managerDueDays: z.number().int().min(1).max(365).default(21),
  managerSeesSelf: z.enum(['immediately', 'after_submit', 'never']).default('after_submit'),
  requireSignature: z.boolean().default(true),
  includeObjectives: z.boolean().default(true),
  ratingScale: ratingScaleDto.optional(),
  overallRatingField: z.string().max(60).nullable().optional(),
});
export const updateTemplateDto = createTemplateDto.partial().extend({ archived: z.boolean().optional() });

export const populationDto = z.object({
  orgUnitIds: z.array(uuid).optional(),
  personIds: z.array(uuid).optional(),
  excludeHiredAfter: isoDate.optional(),
  excludePersonIds: z.array(uuid).optional(),
});
export type PopulationDto = z.infer<typeof populationDto>;

export const createCycleDto = z
  .object({
    templateId: uuid,
    name: z.string().min(1).max(200),
    periodStart: isoDate,
    periodEnd: isoDate,
    okrCycleId: uuid.optional(),
    population: populationDto.default({}),
  })
  .refine((c) => c.periodStart <= c.periodEnd, { message: 'Periodo non valido', path: ['periodEnd'] });
export const updateCycleDto = z.object({ name: z.string().min(1).max(200).optional(), population: populationDto.optional(), okrCycleId: uuid.nullable().optional(), selfDueAt: isoDate.optional(), managerDueAt: isoDate.optional() });
export const launchDto = z.object({ launchDate: isoDate.optional() });

export const listReviewsQuery = z.object({ box: z.enum(['mine', 'team', 'all']).default('mine'), cycleId: uuid.optional(), status: z.string().optional() });
export const signDto = z.object({ comment: z.string().max(2000).optional(), disagree: z.boolean().default(false) });
export const conversationDto = z.object({ at: z.string().datetime().optional(), notes: z.string().max(4000).optional() });
export const overrideRatingDto = z.object({ rating: z.number().int(), note: z.string().min(3).max(1000) });
export const reopenDto = z.object({ stage: z.enum(['self', 'manager']) });
