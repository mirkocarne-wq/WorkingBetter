import { z } from 'zod';
const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const createRelationDto = z.object({
  otherPersonId: uuid,
  kind: z.enum(['manager_report', 'mentoring', 'skip_level', 'peer']).default('manager_report'),
  cadenceDays: z.number().int().min(1).max(90).nullable().optional(),
  durationMin: z.number().int().min(10).max(240).default(30),
  firstMeetingAt: z.string().datetime().optional(),
  meetingUrl: z.string().url().max(500).nullable().optional(),
});
export const updateRelationDto = z.object({
  cadenceDays: z.number().int().min(1).max(90).nullable().optional(),
  durationMin: z.number().int().min(10).max(240).optional(),
  meetingUrl: z.string().url().max(500).nullable().optional(),
  archived: z.boolean().optional(),
});
export const createMeetingDto = z.object({ scheduledAt: z.string().datetime(), durationMin: z.number().int().min(10).max(240).optional() });
export const updateMeetingDto = z.object({
  scheduledAt: z.string().datetime().optional(),
  durationMin: z.number().int().min(10).max(240).optional(),
  status: z.enum(['skipped', 'cancelled', 'scheduled']).optional(),
});
export const completeMeetingDto = z.object({ scheduleNext: z.boolean().default(true), nextAt: z.string().datetime().optional() });
export const createTalkingPointDto = z.object({
  text: z.string().min(1).max(500),
  source: z.enum(['manual', 'objective', 'feedback', 'action_item', 'check_in', 'template']).default('manual'),
  refType: z.string().max(40).optional(),
  refId: uuid.optional(),
});
export const updateTalkingPointDto = z.object({ text: z.string().min(1).max(500).optional(), discussed: z.boolean().optional(), position: z.number().int().min(0).optional() });
export const upsertNoteDto = z.object({ body: z.string().max(20000) });
export const createActionItemDto = z.object({ title: z.string().min(1).max(300), ownerPersonId: uuid.optional(), dueDate: isoDate.nullable().optional() });
export const updateActionItemDto = z.object({ title: z.string().min(1).max(300).optional(), dueDate: isoDate.nullable().optional(), status: z.enum(['open', 'done', 'cancelled']).optional() });
export const listActionItemsQuery = z.object({ mine: z.coerce.boolean().optional(), relationId: uuid.optional(), status: z.enum(['open', 'done', 'cancelled']).optional() });
export const metricsQuery = z.object({ days: z.coerce.number().int().min(7).max(365).default(30) });
