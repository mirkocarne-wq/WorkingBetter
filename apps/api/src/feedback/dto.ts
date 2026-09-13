import { z } from 'zod';
const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const createValueDto = z.object({ name: z.string().min(1).max(60), description: z.string().max(400).optional(), icon: z.string().max(8).optional(), position: z.number().int().min(0).optional() });
export const updateValueDto = createValueDto.partial().extend({ active: z.boolean().optional() });

export const giveFeedbackDto = z.object({
  toPersonId: uuid,
  kind: z.enum(['praise', 'suggestion', 'observation']).default('praise'),
  body: z.string().min(3).max(4000),
  visibility: z.enum(['private', 'manager']).default('private'),
  valueId: uuid.optional(),
  objectiveId: uuid.optional(),
  requestRecipientId: uuid.optional(),
});
export const listFeedbackQuery = z.object({
  box: z.enum(['received', 'given', 'about']).default('received'),
  aboutPersonId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});
export const acknowledgeDto = z.object({ helpful: z.boolean().optional() });

export const createRequestDto = z.object({
  aboutPersonId: uuid.optional(),
  recipientPersonIds: z.array(uuid).min(1).max(20),
  question: z.string().min(3).max(1000),
  dueDate: isoDate.optional(),
});
export const listRequestsQuery = z.object({ box: z.enum(['inbox', 'sent']).default('inbox'), status: z.enum(['pending', 'answered', 'declined']).optional() });
export const declineDto = z.object({ reason: z.string().max(400).optional() });

export const giveRecognitionDto = z.object({
  recipientPersonIds: z.array(uuid).min(1).max(20),
  message: z.string().min(3).max(1000),
  valueIds: z.array(uuid).max(5).default([]),
});
export const listRecognitionsQuery = z.object({
  scope: z.enum(['company', 'unit', 'team', 'mine']).default('company'),
  personId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().optional(),
});
export const reactDto = z.object({ emoji: z.string().min(1).max(8).default('👏') });
