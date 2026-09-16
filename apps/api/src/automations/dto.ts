import { z } from 'zod';
import { AutomationEvents, AutomationLimits } from '@wb/shared';

const actor = z.string().regex(/^(subject|manager|manager_of_manager|hr|person:[0-9a-f-]{36}|role:[a-z][a-z0-9_]{1,40})$/, 'Destinatario non valido');
export const automationConditionDto = z.object({
  field: z.string().min(1).max(80),
  op: z.enum(['eq', 'ne', 'lt', 'lte', 'gt', 'gte', 'in', 'not_empty']),
  value: z.union([z.string().max(200), z.number(), z.boolean(), z.array(z.string().max(100)).max(20)]).nullable().optional(),
});
export const automationActionDto = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start_app'), appKey: z.string().regex(/^[a-z][a-z0-9_]{0,60}$/) }),
  z.object({ type: z.literal('action_item'), title: z.string().min(1).max(200), assignee: actor, dueDays: z.number().int().min(0).max(365).nullable().optional() }),
  z.object({ type: z.literal('person_field'), field: z.string().regex(/^(jobTitle|jobLevel|location|custom:[a-z][a-z0-9_]{0,40})$/, 'Campo non valido'), value: z.string().max(500).nullable() }),
  z.object({ type: z.literal('webhook'), url: z.string().url().max(500) }),
  z.object({ type: z.literal('notify'), to: z.array(actor).min(1).max(5), message: z.string().min(1).max(500) }),
]);
export const automationTriggerDto = z.object({
  event: z.enum(AutomationEvents),
  days: z.number().int().min(0).max(3650).nullable().optional(),
  appKey: z.string().regex(/^[a-z][a-z0-9_]{0,60}$/).nullable().optional(),
});
export const createAutomationDto = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullable().optional(),
  enabled: z.boolean().default(true),
  trigger: automationTriggerDto,
  conditions: z.array(automationConditionDto).max(AutomationLimits.conditionsPerRule).default([]),
  actions: z.array(automationActionDto).min(1).max(AutomationLimits.actionsPerRule),
});
export type CreateAutomationDto = z.infer<typeof createAutomationDto>;
export const updateAutomationDto = createAutomationDto.partial().extend({ archived: z.boolean().optional() });
export type UpdateAutomationDto = z.infer<typeof updateAutomationDto>;
export const listAutomationsQuery = z.object({ includeArchived: z.enum(['true', 'false']).optional() });
export const runsQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(50) });
export const tickDto = z.object({ today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
