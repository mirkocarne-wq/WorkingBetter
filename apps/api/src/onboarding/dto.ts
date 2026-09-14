import { z } from 'zod';
import { OnboardingRoles, OnboardingSurveyKeys, OnboardingTaskKinds } from '@wb/shared';

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato data AAAA-MM-GG');
const key = z.string().min(1).max(60).regex(/^[a-z0-9_]+$/, 'Chiave in snake_case');
const kind = z.enum(['onboarding', 'role_change', 'offboarding']);

export const phaseDto = z.object({ key, label: z.string().min(1).max(80), fromDay: z.number().int().min(-365).max(730), toDay: z.number().int().min(-365).max(730) }).refine((p) => p.toDay >= p.fromDay, 'toDay deve essere ≥ fromDay');
export const taskDefDto = z.object({
  key,
  phase: key,
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  role: z.enum(OnboardingRoles).default('newcomer'),
  kind: z.enum(OnboardingTaskKinds).default('todo'),
  dueDay: z.number().int().min(-365).max(730),
  link: z.string().max(500).nullable().optional(),
  formKey: z.string().max(60).nullable().optional(),
  surveyKey: z.enum(OnboardingSurveyKeys).nullable().optional(),
  required: z.boolean().default(true),
});
export const rulesDto = z.object({ orgUnitIds: z.array(uuid).optional(), locations: z.array(z.string().max(60)).optional(), jobTitleKeywords: z.array(z.string().max(60)).optional() });
export const createTemplateDto = z.object({
  name: z.string().min(1).max(200),
  kind: kind.default('onboarding'),
  description: z.string().max(2000).nullable().optional(),
  phases: z.array(phaseDto).min(1).max(12),
  tasks: z.array(taskDefDto).max(80).default([]),
  rules: rulesDto.default({}),
  isDefault: z.boolean().default(false),
  active: z.boolean().default(true),
}).refine((t) => t.tasks.every((x) => t.phases.some((p) => p.key === x.phase)), 'Ogni task deve appartenere a una fase esistente').refine((t) => new Set(t.tasks.map((x) => x.key)).size === t.tasks.length, 'Chiavi dei task duplicate');
export const updateTemplateDto = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  phases: z.array(phaseDto).min(1).max(12).optional(),
  tasks: z.array(taskDefDto).max(80).optional(),
  rules: rulesDto.optional(),
  isDefault: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const startJourneyDto = z.object({ personId: uuid, templateId: uuid.optional(), kind: kind.optional(), anchorDate: isoDate.optional(), buddyPersonId: uuid.nullable().optional() });
export const updateJourneyDto = z.object({ buddyPersonId: uuid.nullable().optional(), anchorDate: isoDate.optional(), status: z.enum(['active', 'completed', 'cancelled']).optional(), itPersonId: uuid.nullable().optional(), hrPersonId: uuid.nullable().optional() });
export const listJourneysQuery = z.object({ box: z.enum(['mine', 'team', 'all']).default('mine'), status: z.enum(['active', 'completed', 'cancelled', 'all']).default('active') });
export const listTasksQuery = z.object({ box: z.enum(['open', 'done', 'all']).default('open') });
export const addTaskDto = taskDefDto.omit({ key: true, dueDay: true }).extend({ dueDate: isoDate.nullable().optional(), assigneePersonId: uuid.nullable().optional() });
export const updateTaskDto = z.object({ status: z.enum(['open', 'done', 'skipped']).optional(), note: z.string().max(1000).nullable().optional(), acknowledged: z.boolean().optional(), dueDate: isoDate.nullable().optional(), assigneePersonId: uuid.nullable().optional() });
export const surveyDto = z.object({ answers: z.record(z.number().int().min(1).max(5)), comment: z.string().max(2000).nullable().optional() });
export const autoStartDto = z.object({ sinceDays: z.number().int().min(0).max(365).default(30) });
