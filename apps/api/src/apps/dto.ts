import { z } from 'zod';
import { AppStageTypes } from '@wb/shared';

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato data AAAA-MM-GG');
const key = z.string().min(1).max(60).regex(/^[a-z][a-z0-9_]{0,60}$/, 'Chiave in snake_case');
const actor = z.string().min(1).max(80);

export const conditionDto = z.object({ source: z.enum(['answer', 'outcome']), field: z.string().max(60).optional(), op: z.enum(['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'in', 'not_empty']), value: z.unknown().optional() });
export const stageDto = z.object({
  key,
  name: z.string().min(1).max(200),
  type: z.enum(AppStageTypes),
  actor,
  description: z.string().max(2000).nullable().optional(),
  formKey: z.string().max(60).nullable().optional(),
  dueDays: z.number().int().min(0).max(365).default(7),
  parallelGroup: z.string().max(40).nullable().optional(),
  seePrevious: z.boolean().default(true),
  approval: z.object({ rejectTo: z.string().max(60).nullable().optional(), requireComment: z.boolean().optional() }).nullable().optional(),
  notify: z.object({ to: z.array(actor).min(1).max(6), message: z.string().min(1).max(2000) }).nullable().optional(),
  transitions: z.array(z.object({ when: conditionDto, goto: z.string().max(60) })).max(10).nullable().optional(),
});
export const definitionDto = z.object({
  key,
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  icon: z.string().max(8).nullable().optional(),
  naming: z.object({ instanceLabel: z.string().min(1).max(60), launchVerb: z.string().min(1).max(80), subjectLabel: z.string().min(1).max(60) }),
  permissions: z.object({ launch: z.array(z.enum(['hr', 'manager', 'employee'])).min(1), launchForSelfOnly: z.boolean().optional(), viewInstances: z.array(z.enum(['hr', 'manager', 'subject', 'launcher', 'actors'])).min(1) }),
  stages: z.array(stageDto).min(1).max(30),
});
export const createAppDto = definitionDto;
export const updateAppDto = definitionDto.partial();
export const duplicateDto = z.object({ key, name: z.string().min(1).max(200) });
export const importDto = z.object({ app: definitionDto, forms: z.array(z.object({ key, name: z.string().min(1).max(200), schema: z.unknown().refine((v) => v !== undefined, 'schema richiesto') }).transform((f) => ({ ...f, schema: f.schema as unknown }))).max(20).default([]) });
export const installDto = z.object({ key: z.string().min(1).max(60) });
export const listAppsQuery = z.object({ scope: z.enum(['launchable', 'all']).default('launchable') });

export const launchDto = z.object({ appKey: key.optional(), appId: uuid.optional(), subjectPersonId: uuid.optional(), title: z.string().max(200).optional() }).refine((v) => v.appKey || v.appId, 'Indica l’app');
export const listInstancesQuery = z.object({ box: z.enum(['todo', 'mine', 'launched', 'team', 'all']).default('todo'), appKey: key.optional(), status: z.enum(['running', 'completed', 'cancelled', 'all']).default('all'), format: z.enum(['json', 'csv']).default('json') });
export const decideDto = z.object({ decision: z.enum(['approve', 'reject']), comment: z.string().max(2000).optional() });
export const reassignDto = z.object({ actorPersonId: uuid });
export const extendDto = z.object({ dueDate: isoDate });
export const cancelDto = z.object({ reason: z.string().max(500).optional() });
