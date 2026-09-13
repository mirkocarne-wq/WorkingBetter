import { z } from 'zod';
const uuid = z.string().uuid();

export const populationDto = z.object({
  orgUnitIds: z.array(uuid).optional(),
  personIds: z.array(uuid).optional(),
  excludePersonIds: z.array(uuid).optional(),
});
export type SurveyPopulation = z.infer<typeof populationDto>;

export const createSurveyDto = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    /** template della libreria oppure form pubblicato (kind survey) */
    template: z.enum(['engagement', 'pulse', 'enps', 'wellbeing']).optional(),
    formKey: z.string().regex(/^[a-z][a-z0-9_]{0,60}$/).optional(),
    drivers: z.record(z.string()).optional(),
    enpsField: z.string().max(60).nullable().optional(),
    anonymous: z.boolean().default(true),
    anonymityThreshold: z.number().int().min(3).max(50).default(5),
    population: populationDto.default({}),
    closesAt: z.string().datetime().optional(),
    rotation: z.number().int().min(0).optional(),
  })
  .refine((d) => d.template || d.formKey, { message: 'Indica un template o la chiave di un form pubblicato', path: ['template'] });
export type CreateSurveyDto = z.infer<typeof createSurveyDto>;

export const updateSurveyDto = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  anonymous: z.boolean().optional(),
  anonymityThreshold: z.number().int().min(3).max(50).optional(),
  population: populationDto.optional(),
  closesAt: z.string().datetime().nullable().optional(),
});

export const launchDto = z.object({ closesAt: z.string().datetime().optional() });
export const extendDto = z.object({ closesAt: z.string().datetime() });
export const shareDto = z.object({ summary: z.string().min(1).max(5000) });
export const respondDto = z.object({ answers: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.null()])) });
export const resultsQuery = z.object({ segment: z.enum(['org_unit', 'manager', 'tenure']).default('org_unit') });
export const listQuery = z.object({ box: z.enum(['mine', 'all']).optional() });
