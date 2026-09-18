import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, ilike, inArray, lt, lte, or, sql, type SQL } from 'drizzle-orm';
import { auditLog, persons, users } from '@wb/db';
import { tx } from '../common/context.js';
import { AuditService } from './audit.service.js';
import type { AuditSearchQuery } from './dto.js';

export interface AuditRowView {
  id: string; at: Date; action: string; entityType: string; entityId: string | null;
  actorUserId: string | null; actorEmail: string | null; actorName: string | null; ip: string | null; requestId: string | null;
  /** chiavi cambiate tra before e after (o presenti in after): mai i valori */
  changedFields: string[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** Elenco delle chiavi cambiate, senza valori: l'audit resta consultabile senza esporre contenuti (CORE-051). */
export function changedFields(before: unknown, after: unknown): string[] {
  if (isObj(before) && isObj(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...keys].filter((k) => !['updatedAt', 'createdAt'].includes(k) && JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null)).slice(0, 30);
  }
  if (isObj(after)) return Object.keys(after).filter((k) => !['updatedAt', 'createdAt', 'tenantId'].includes(k)).slice(0, 30);
  return [];
}

@Injectable()
export class AuditSearchService {
  constructor(private readonly audit: AuditService) {}

  private conds(q: Omit<AuditSearchQuery, 'limit' | 'beforeAt'> & { beforeAt?: string }): SQL[] {
    const c: SQL[] = [];
    if (q.action) c.push(ilike(auditLog.action, `${q.action}%`));
    if (q.entityType) c.push(eq(auditLog.entityType, q.entityType));
    if (q.entityId) c.push(eq(auditLog.entityId, q.entityId));
    if (q.actorUserId) c.push(eq(auditLog.actorUserId, q.actorUserId));
    if (q.from) c.push(gte(auditLog.at, new Date(`${q.from}T00:00:00.000Z`)));
    if (q.to) c.push(lte(auditLog.at, new Date(`${q.to}T23:59:59.999Z`)));
    if (q.q) c.push(or(ilike(auditLog.action, `%${q.q}%`), ilike(auditLog.entityType, `%${q.q}%`), sql`${auditLog.entityId}::text ilike ${`%${q.q}%`}`)!);
    if (q.beforeAt) c.push(lt(auditLog.at, new Date(q.beforeAt)));
    return c;
  }

  private async decorate(rows: (typeof auditLog.$inferSelect)[]): Promise<AuditRowView[]> {
    const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter((x): x is string => !!x))];
    const actors = actorIds.length
      ? await tx().select({ id: users.id, email: users.email, first: persons.firstName, last: persons.lastName }).from(users).leftJoin(persons, eq(persons.id, users.personId)).where(inArray(users.id, actorIds))
      : [];
    const am = new Map(actors.map((a) => [a.id, a]));
    return rows.map((r) => {
      const a = r.actorUserId ? am.get(r.actorUserId) : undefined;
      return { id: r.id, at: r.at, action: r.action, entityType: r.entityType, entityId: r.entityId, actorUserId: r.actorUserId, actorEmail: a?.email ?? null, actorName: a?.first ? `${a.first} ${a.last ?? ''}`.trim() : null, ip: r.ip, requestId: r.requestId, changedFields: changedFields(r.before, r.after) };
    });
  }

  async search(q: AuditSearchQuery) {
    const conds = this.conds(q);
    const rows = await tx().select().from(auditLog).where(conds.length ? and(...conds) : undefined).orderBy(desc(auditLog.at), desc(auditLog.id)).limit(q.limit + 1);
    const page = rows.slice(0, q.limit);
    const items = await this.decorate(page);
    return { items, nextBeforeAt: rows.length > q.limit ? page[page.length - 1]!.at.toISOString() : null };
  }

  async actions(): Promise<string[]> {
    const rows = await tx().selectDistinct({ action: auditLog.action }).from(auditLog).orderBy(auditLog.action).limit(500);
    return rows.map((r) => r.action);
  }

  async exportCsv(q: Omit<AuditSearchQuery, 'limit' | 'beforeAt'>): Promise<string> {
    const conds = this.conds(q);
    const rows = await tx().select().from(auditLog).where(conds.length ? and(...conds) : undefined).orderBy(desc(auditLog.at)).limit(10_000);
    const items = await this.decorate(rows);
    await this.audit.log({ action: 'audit.export', entityType: 'audit_log', after: { rows: items.length, filters: q } });
    const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = ['at', 'action', 'entity_type', 'entity_id', 'actor_email', 'actor_name', 'ip', 'changed_fields', 'request_id'];
    return [head.join(';'), ...items.map((r) => [r.at.toISOString(), r.action, r.entityType, r.entityId ?? '', r.actorEmail ?? '', r.actorName ?? '', r.ip ?? '', r.changedFields.join(' '), r.requestId ?? ''].map(esc).join(';'))].join('\n') + '\n';
  }
}
