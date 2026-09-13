import { Injectable } from '@nestjs/common';
import { auditLog } from '@wb/db';
import { ctx, tx } from '../common/context.js';

export interface AuditEntry {
  action: string; // es. objective.create
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
}

/** Scrive nell'audit log append-only, nella stessa transazione dell'operazione (CORE-050). */
@Injectable()
export class AuditService {
  async log(entry: AuditEntry): Promise<void> {
    const c = ctx();
    if (!c.principal) return;
    await tx().insert(auditLog).values({
      tenantId: c.principal.tenantId,
      actorUserId: c.principal.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      ip: c.ip,
      userAgent: c.userAgent,
      requestId: c.requestId,
    });
  }
}
