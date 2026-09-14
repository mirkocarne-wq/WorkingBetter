import { and, eq } from 'drizzle-orm';
import { NotificationDefaults, renderNotification, type NotificationType } from '@wb/shared';
import { chatOutbox, connectorAccounts, emailOutbox, notificationPreferences, notifications, persons, users } from './schema/index.js';
import { and as andOp, isNull } from 'drizzle-orm';
import type { TenantTx } from './tenant.js';

export interface NotifyInput {
  tenantId: string;
  /** destinatario: persona (risolta al suo utente) oppure utente diretto */
  personId?: string | null;
  userId?: string | null;
  type: NotificationType;
  data?: Record<string, string | number | null | undefined>;
  link?: string | null;
  /** se presente, la stessa notifica non viene creata due volte (es. promemoria giornalieri) */
  dedupeKey?: string | null;
  /** forza i canali (es. inviti) ignorando le preferenze */
  force?: { email?: boolean; inApp?: boolean; chat?: boolean };
}

export interface NotifyResult {
  created: boolean;
  notificationId: string | null;
  emailQueued: boolean;
  chatQueued: boolean;
}

/**
 * Crea la notifica in-app e accoda l'email secondo le preferenze dell'utente (INT-001/002/003).
 * Va chiamata dentro la transazione tenant: se l'operazione principale fallisce, non parte nulla.
 * Nota: nessun contenuto riservato nel testo (INT §4): i template ricevono solo anteprime/nomi.
 */
export async function notify(tx: TenantTx, input: NotifyInput): Promise<NotifyResult> {
  let user: { id: string; email: string; personId: string | null } | undefined;
  if (input.userId) {
    [user] = await tx.select({ id: users.id, email: users.email, personId: users.personId }).from(users).where(eq(users.id, input.userId));
  } else if (input.personId) {
    [user] = await tx.select({ id: users.id, email: users.email, personId: users.personId }).from(users).where(eq(users.personId, input.personId));
  }
  if (!user) return { created: false, notificationId: null, emailQueued: false, chatQueued: false };

  const defaults = NotificationDefaults[input.type];
  const [pref] = await tx
    .select()
    .from(notificationPreferences)
    .where(and(eq(notificationPreferences.userId, user.id), eq(notificationPreferences.type, input.type)));
  const inApp = input.force?.inApp ?? pref?.inApp ?? defaults.inApp;
  const email = input.force?.email ?? pref?.email ?? defaults.email;
  // canale chat (Slack DM, INT-010): preferenza dell'utente (default come l'email) e workspace collegato
  const chatPref = input.force?.chat ?? pref?.chat ?? defaults.email;
  const [slack] = chatPref ? await tx.select({ id: connectorAccounts.id }).from(connectorAccounts).where(andOp(eq(connectorAccounts.provider, 'slack'), isNull(connectorAccounts.userId), eq(connectorAccounts.status, 'active'))).limit(1) : [];
  const chat = chatPref && !!slack;
  if (!inApp && !email && !chat) return { created: false, notificationId: null, emailQueued: false, chatQueued: false };

  const rendered = renderNotification(input.type, input.data ?? {});
  const inserted = await tx
    .insert(notifications)
    .values({
      tenantId: input.tenantId,
      userId: user.id,
      personId: user.personId,
      type: input.type,
      title: rendered.title,
      body: rendered.body,
      link: input.link ?? null,
      data: input.data ?? {},
      dedupeKey: input.dedupeKey ?? null,
      emailQueued: email,
      readAt: inApp ? null : new Date(), // se solo email, la riga esiste per storico ma non "pesa" come non letta
    })
    .onConflictDoNothing()
    .returning({ id: notifications.id });
  const row = inserted[0];
  if (!row) return { created: false, notificationId: null, emailQueued: false, chatQueued: false }; // deduplicata

  if (email && user.email) {
    const [p] = user.personId ? await tx.select({ firstName: persons.firstName, lastName: persons.lastName }).from(persons).where(eq(persons.id, user.personId)) : [];
    await tx.insert(emailOutbox).values({
      tenantId: input.tenantId,
      notificationId: row.id,
      toEmail: user.email,
      toName: p ? `${p.firstName} ${p.lastName}` : null,
      subject: rendered.emailSubject,
      text: `${rendered.emailText}${input.link ? `\n\nApri: ${input.link}` : ''}`,
    });
  }
  if (chat) {
    await tx.insert(chatOutbox).values({ tenantId: input.tenantId, provider: 'slack', target: `user:${user.id}`, userId: user.id, notificationId: row.id, text: `*${rendered.title}*\n${rendered.body}`, payload: { link: input.link ?? null, type: input.type } });
  }
  return { created: true, notificationId: row.id, emailQueued: email && !!user.email, chatQueued: chat };
}
