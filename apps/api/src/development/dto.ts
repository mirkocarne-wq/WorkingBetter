import { z } from 'zod';

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato data AAAA-MM-GG');
const key = z.string().min(1).max(60).regex(/^[a-z0-9_]+$/, 'Chiave in snake_case');

export const competencyDto = z.object({
  key,
  name: z.string().min(1).max(120),
  kind: z.enum(['core', 'role', 'leadership']).default('core'),
  description: z.string().max(1000).nullable().optional(),
  levels: z.array(z.object({ level: z.number().int().min(1).max(6), label: z.string().max(60), descriptor: z.string().max(600) })).min(2).max(6),
  active: z.boolean().default(true),
});
export const jobProfileDto = z.object({
  title: z.string().min(1).max(120),
  family: z.string().max(80).nullable().optional(),
  level: z.string().max(40).nullable().optional(),
  description: z.string().max(1000).nullable().optional(),
  expected: z.array(z.object({ competencyKey: key, level: z.number().int().min(1).max(6) })).default([]),
  nextProfileId: uuid.nullable().optional(),
  active: z.boolean().optional(),
});
export const updateJobProfileDto = jobProfileDto.partial();
export const assignProfileDto = z.object({ profileId: uuid.nullable() });

export const assessDto = z.object({
  source: z.enum(['self', 'manager']),
  items: z.array(z.object({ competencyKey: key, level: z.number().int().min(1).max(6), note: z.string().max(500).nullable().optional() })).min(1).max(50),
});
export const profileQuery = z.object({ policy: z.enum(['manager', 'average', '360']).default('manager') });

export const createPlanDto = z.object({
  personId: uuid.optional(),
  title: z.string().min(1).max(160),
  periodStart: isoDate.nullable().optional(),
  periodEnd: isoDate.nullable().optional(),
});
export const updatePlanDto = z.object({
  title: z.string().min(1).max(160).optional(),
  status: z.enum(['draft', 'pending_approval', 'active', 'completed', 'archived']).optional(),
  managerNote: z.string().max(1000).nullable().optional(),
  periodStart: isoDate.nullable().optional(),
  periodEnd: isoDate.nullable().optional(),
});
export const createActionDto = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  kind: z.enum(['training', 'mentoring', 'experience', 'reading', 'other']).default('other'),
  competencyKey: key.nullable().optional(),
  dueDate: isoDate.nullable().optional(),
  source: z.enum(['gap', 'review', 'one_on_one', 'manual']).default('manual'),
});
export const updateActionDto = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  status: z.enum(['open', 'done', 'cancelled']).optional(),
  evidence: z.string().max(1000).nullable().optional(),
  dueDate: isoDate.nullable().optional(),
});
export const talentDto = z.object({ potential: z.number().int().min(1).max(3), note: z.string().min(3).max(1000), session: z.string().max(40).nullable().optional() });
