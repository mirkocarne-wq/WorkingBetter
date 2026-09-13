import { z } from 'zod';
import { Confidence, KeyResultTypes, ObjectiveLevels, Visibility } from '@wb/shared';

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato data AAAA-MM-GG');

export const createCycleDto = z
  .object({
    name: z.string().min(1).max(60),
    startDate: isoDate,
    endDate: isoDate,
    definitionOpensAt: isoDate.optional(),
    definitionClosesAt: isoDate.optional(),
    lockAt: isoDate.optional(),
    checkInCadenceDays: z.number().int().min(1).max(90).default(7),
  })
  .refine((c) => c.startDate < c.endDate, { message: 'La data di fine deve essere successiva a quella di inizio', path: ['endDate'] });
export const updateCycleDto = z.object({
  name: z.string().min(1).max(60).optional(),
  definitionOpensAt: isoDate.nullable().optional(),
  definitionClosesAt: isoDate.nullable().optional(),
  lockAt: isoDate.nullable().optional(),
  checkInCadenceDays: z.number().int().min(1).max(90).optional(),
  status: z.enum(['planned', 'open', 'closed']).optional(),
});

export const keyResultInput = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(KeyResultTypes).default('number'),
  unit: z.string().max(20).optional(),
  startValue: z.number().default(0),
  targetValue: z.number().default(1),
  weight: z.number().positive().max(100).optional(),
  ownerPersonId: uuid.optional(),
});
export type KeyResultInput = z.infer<typeof keyResultInput>;

export const createObjectiveDto = z.object({
  cycleId: uuid,
  title: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  level: z.enum(ObjectiveLevels),
  ownerPersonId: uuid.optional(),
  ownerOrgUnitId: uuid.optional(),
  parentId: uuid.nullable().optional(),
  visibility: z.enum(Visibility).default('public'),
  weight: z.number().positive().max(100).optional(),
  progressMode: z.enum(['auto', 'manual']).default('auto'),
  startDate: isoDate.optional(),
  dueDate: isoDate.optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  keyResults: z.array(keyResultInput).max(20).default([]),
  publish: z.boolean().default(false),
});
export type CreateObjectiveDto = z.infer<typeof createObjectiveDto>;

export const updateObjectiveDto = createObjectiveDto
  .omit({ cycleId: true, keyResults: true, publish: true, level: true })
  .partial()
  .extend({ manualProgress: z.number().min(0).max(1).nullable().optional() });
export type UpdateObjectiveDto = z.infer<typeof updateObjectiveDto>;

export const closeObjectiveDto = z.object({
  outcome: z.enum(['achieved', 'partially', 'not_achieved', 'cancelled']),
  finalScore: z.number().min(0).max(1).optional(),
  note: z.string().max(2000).optional(),
});

export const listObjectivesQuery = z.object({
  cycleId: uuid.optional(),
  level: z.enum(ObjectiveLevels).optional(),
  ownerPersonId: uuid.optional(),
  ownerOrgUnitId: uuid.optional(),
  parentId: uuid.optional(),
  status: z.enum(['draft', 'pending_approval', 'active', 'closed', 'cancelled']).optional(),
  confidence: z.enum(Confidence).optional(),
  mine: z.coerce.boolean().optional(),
  team: z.coerce.boolean().optional(),
  tree: z.coerce.boolean().optional(),
  stale: z.coerce.boolean().optional(),
});
export type ListObjectivesQuery = z.infer<typeof listObjectivesQuery>;

export const updateKeyResultDto = keyResultInput.partial();

export const checkInDto = z.object({
  value: z.number(),
  confidence: z.enum(Confidence),
  comment: z.string().max(2000).optional(),
});
export type CheckInDto = z.infer<typeof checkInDto>;
