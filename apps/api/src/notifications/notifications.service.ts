import { Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { notificationPreferences, notifications, notify, type NotifyInput } from '@wb/db';
import { NotificationDefaults, NotificationTypes, type NotificationType } from '@wb/shared';
import { principal, tx } from '../common/context.js';
import { notFound } from '../common/errors.js';
import { decodeCursor, toPage } from '../common/pagination.js';

/** Facciata sul helper `notify` di @wb/db: usa la transazione della richiesta corrente. */
@Injectable()
export class NotificationsService {
  async send(input: Omit<NotifyInput, 'tenantId'>) {
    return notify(tx(), { ...input, tenantId: principal().tenantId });
  }

  async list(q: { unread?: boolean; limit: number; cursor?: string }) {
    const p = principal();
    const conds = [eq(notifications.userId, p.userId)];
    if (q.unread) conds.push(isNull(notifications.readAt));
    const c = decodeCursor(q.cursor);
    if (c) conds.push(or(lt(notifications.createdAt, c.createdAt), and(eq(notifications.createdAt, c.createdAt), lt(notifications.id, c.id)))!);
    const rows = await tx().select().from(notifications).where(and(...conds)).orderBy(desc(notifications.createdAt), desc(notifications.id)).limit(q.limit + 1);
    return toPage(rows, q.limit);
  }

  async unreadCount(): Promise<number> {
    const [r] = await tx().select({ n: sql<number>`count(*)::int` }).from(notifications).where(and(eq(notifications.userId, principal().userId), isNull(notifications.readAt)));
    return r?.n ?? 0;
  }

  async markRead(id: string) {
    const [row] = await tx().update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, principal().userId), isNull(notifications.readAt))).returning();
    if (!row) {
      const [exists] = await tx().select({ id: notifications.id }).from(notifications).where(and(eq(notifications.id, id), eq(notifications.userId, principal().userId)));
      if (!exists) throw notFound('Notifica', id);
    }
    return { ok: true };
  }

  async markAllRead() {
    await tx().update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, principal().userId), isNull(notifications.readAt)));
    return { ok: true };
  }

  async preferences() {
    const p = principal();
    const rows = await tx().select().from(notificationPreferences).where(eq(notificationPreferences.userId, p.userId));
    return NotificationTypes.map((type) => {
      const r = rows.find((x) => x.type === type);
      return { type, inApp: r?.inApp ?? NotificationDefaults[type].inApp, email: r?.email ?? NotificationDefaults[type].email, isDefault: !r };
    });
  }

  async updatePreferences(items: Array<{ type: NotificationType; inApp: boolean; email: boolean }>) {
    const p = principal();
    for (const it of items) {
      const [existing] = await tx().select().from(notificationPreferences).where(and(eq(notificationPreferences.userId, p.userId), eq(notificationPreferences.type, it.type)));
      if (existing) await tx().update(notificationPreferences).set({ inApp: it.inApp, email: it.email, updatedAt: new Date() }).where(eq(notificationPreferences.id, existing.id));
      else await tx().insert(notificationPreferences).values({ tenantId: p.tenantId, createdBy: p.userId, userId: p.userId, type: it.type, inApp: it.inApp, email: it.email });
    }
    return this.preferences();
  }
}
