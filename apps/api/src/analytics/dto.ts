import { Dimensions } from '@wb/shared';
import { z } from 'zod';

const csvList = z.string().min(1).transform((s) => [...new Set(s.split(',').map((x) => x.trim()).filter(Boolean))]);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data in formato YYYY-MM-DD');

export const filtersDto = z.object({
  orgUnitId: z.string().uuid().optional(),
  managerId: z.string().uuid().optional(),
  cycleId: z.string().uuid().optional(),
});
export type Filters = z.infer<typeof filtersDto>;

export const queryDto = filtersDto.extend({
  metrics: csvList,
  dimension: z.enum(Dimensions).optional(),
  date: isoDate.optional(),
  format: z.enum(['json', 'csv']).default('json'),
});
export type QueryDto = z.infer<typeof queryDto>;

export const trendDto = filtersDto.extend({
  metric: z.string().min(1),
  days: z.coerce.number().int().min(2).max(366).default(30),
  to: isoDate.optional(),
});
export type TrendDto = z.infer<typeof trendDto>;

export const formatDto = z.object({ format: z.enum(['json', 'csv']).default('json') });
