import { z } from 'zod';

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato data AAAA-MM-GG');
/** Ricerca nell'audit (CORE-051): filtri combinabili, paginazione all'indietro per data. */
export const auditSearchQuery = z.object({
  action: z.string().max(80).optional(), // prefisso, es. review. oppure review.share
  entityType: z.string().max(60).optional(),
  entityId: uuid.optional(),
  actorUserId: uuid.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().max(100).optional(),
  beforeAt: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type AuditSearchQuery = z.infer<typeof auditSearchQuery>;
export const auditExportQuery = auditSearchQuery.omit({ beforeAt: true, limit: true });
