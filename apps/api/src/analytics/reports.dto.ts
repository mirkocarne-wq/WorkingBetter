import { Dimensions, ReportVisualizations, ScheduleFrequencies } from '@wb/shared';
import { z } from 'zod';

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data in formato YYYY-MM-DD');

export const reportDefinitionDto = z.object({
  metrics: z.array(z.string().min(1)).min(1).max(12),
  dimension: z.enum(Dimensions).nullable().optional(),
  filters: z.object({ orgUnitId: uuid.nullable().optional(), managerId: uuid.nullable().optional(), cycleId: uuid.nullable().optional() }).default({}),
  compareDays: z.number().int().min(1).max(366).nullable().optional(),
  visualization: z.enum(ReportVisualizations).default('table'),
  trendMetric: z.string().nullable().optional(),
  trendDays: z.number().int().min(7).max(366).nullable().optional(),
});
export const reportScheduleDto = z.object({
  frequency: z.enum(ScheduleFrequencies),
  weekday: z.number().int().min(1).max(7).nullable().optional(),
  dayOfMonth: z.number().int().min(1).max(28).nullable().optional(),
  hour: z.number().int().min(0).max(23).nullable().optional(),
  recipients: z.enum(['owner', 'shared']).default('owner'),
});
export const reportSharingDto = z.object({ roles: z.array(z.string()).default([]), userIds: z.array(uuid).default([]) });

export const createReportDto = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).nullable().optional(),
  folder: z.string().max(80).nullable().optional(),
  definition: reportDefinitionDto,
  sharing: reportSharingDto.default({ roles: [], userIds: [] }),
  schedule: reportScheduleDto.nullable().optional(),
});
export const updateReportDto = createReportDto.partial();

export const runReportQuery = z.object({
  date: isoDate.optional(),
  orgUnitId: uuid.optional(),
  managerId: uuid.optional(),
  cycleId: uuid.optional(),
  format: z.enum(['json', 'csv']).default('json'),
});
export type RunReportQuery = z.infer<typeof runReportQuery>;
