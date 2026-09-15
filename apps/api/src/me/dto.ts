import { z } from 'zod';

export const todoItem = z.object({
  kind: z.enum(['action', 'check_in', 'review', 'approval', 'onboarding', 'process', 'survey', 'f360']),
  kicker: z.string(),
  title: z.string(),
  detail: z.string().nullable(),
  href: z.string(),
  dueDate: z.string().nullable(),
  overdue: z.boolean(),
  daysDelta: z.number().int().nullable(),
  action: z.string(),
});

export const todoResponse = z.object({
  items: z.array(todoItem),
  nextOneOnOne: z.object({
    meetingId: z.string().uuid(), relationId: z.string().uuid(), scheduledAt: z.string(), durationMin: z.number().int().nullable(), meetingUrl: z.string().nullable(), cadenceDays: z.number().int().nullable(),
    other: z.object({ id: z.string().uuid(), firstName: z.string(), lastName: z.string(), jobTitle: z.string().nullable() }),
    agenda: z.array(z.string()), agendaCount: z.number().int(),
  }).nullable(),
  generatedAt: z.string(),
});
