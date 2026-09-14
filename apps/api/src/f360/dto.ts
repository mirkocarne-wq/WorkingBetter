import { z } from 'zod';
import { F360Categories } from '@wb/shared';

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato data AAAA-MM-GG');
const key = z.string().min(1).max(60).regex(/^[a-z0-9_]+$/, 'Chiave in snake_case');
const category = z.enum(F360Categories);

export const categoryConfigDto = z.object({ key: category, enabled: z.boolean().default(true), min: z.number().int().min(0).max(20).default(0), max: z.number().int().min(1).max(20).default(6), anonymous: z.boolean().default(true) }).refine((c) => c.max >= c.min, 'max deve essere ≥ min');
export const scaleDto = z.object({ min: z.number().int().min(0).max(10), max: z.number().int().min(1).max(10), labels: z.record(z.string().max(60)).default({}) }).refine((s) => s.max > s.min, 'max deve essere > min');
export const openQuestionDto = z.object({ key, label: z.string().min(1).max(200) });
export const populationDto = z.object({ orgUnitIds: z.array(uuid).optional(), personIds: z.array(uuid).optional(), excludePersonIds: z.array(uuid).optional() });

export const createCampaignDto = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  competencyKeys: z.array(key).min(1).max(20),
  scale: scaleDto.optional(),
  openQuestions: z.array(openQuestionDto).max(10).optional(),
  categories: z.array(categoryConfigDto).max(6).optional(),
  nominationBy: z.enum(['subject', 'manager', 'hr']).default('subject'),
  requireApproval: z.boolean().default(true),
  releaseRule: z.enum(['immediately', 'manager', 'after_debrief']).default('after_debrief'),
  managerSeesReport: z.boolean().default(true),
  anonymityThreshold: z.number().int().min(2).max(10).default(3),
  population: populationDto.default({}),
  nominationDueAt: isoDate.nullable().optional(),
  collectionDueAt: isoDate.nullable().optional(),
});
export const updateCampaignDto = createCampaignDto.partial();
export type PopulationDto = z.infer<typeof populationDto>;

export const listSubjectsQuery = z.object({ box: z.enum(['mine', 'team', 'all']).default('mine'), campaignId: uuid.optional() });
export const listRequestsQuery = z.object({ status: z.enum(['open', 'done', 'all']).default('open') });
export const aggregateQuery = z.object({ groupBy: z.enum(['org_unit', 'manager']).default('org_unit'), format: z.enum(['json', 'csv']).default('json') });

export const nominateDto = z
  .object({ category: category, personId: uuid.optional(), externalEmail: z.string().email().max(200).optional(), externalName: z.string().min(1).max(120).optional() })
  .refine((n) => (n.category === 'external' ? !!n.externalEmail && !!n.externalName : !!n.personId), 'Indica la persona (interni) oppure email e nome (esterni)');
export const approveDto = z.object({ rejectIds: z.array(uuid).max(50).default([]) });
export const answersDto = z.object({
  ratings: z.record(z.number().int().nullable()).default({}),
  comments: z.record(z.string().max(2000)).default({}),
  openAnswers: z.record(z.string().max(4000)).default({}),
});
export const declineDto = z.object({ reason: z.string().max(500).optional() });
export const debriefDto = z.object({ at: z.string().datetime().optional(), note: z.string().max(4000).optional() });
export const devActionDto = z.object({
  competencyKey: key,
  title: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  kind: z.enum(['training', 'mentoring', 'experience', 'reading', 'other']).default('other'),
  dueDate: isoDate.nullable().optional(),
});
