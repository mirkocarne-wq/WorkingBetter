import { and, eq, isNull, lt, lte } from 'drizzle-orm';
import { chatOutbox, connectorAccounts, tenants, users, withPlatform, withTenant, type AnyDb } from '@wb/db';
import { backoffMinutes, type ConnectorDeps } from './calendar-sync.js';
import { ProviderError, endpointsFor, integrationSettingsOf, slackLookupUserByEmail, slackPostMessage, teamsWebhookPost } from './providers.js';

/** Consegna i messaggi in coda: DM e canali Slack (workspace collegato, utenti mappati per email) e webhook Teams (INT-010/012/014). */
export async function dispatchChat(db: AnyDb, deps: ConnectorDeps, batch = 50): Promise<{ sent: number; failed: number; retried: number; skipped: number }> {
  const now = deps.now ?? new Date();
  const out = { sent: 0, failed: 0, retried: 0, skipped: 0 };
  const rows = await withPlatform(db, (t) => t.select().from(chatOutbox).where(and(eq(chatOutbox.status, 'pending'), lte(chatOutbox.nextAttemptAt, now), lt(chatOutbox.attempts, 5))).orderBy(chatOutbox.createdAt).limit(batch));
  const cache = new Map<string, ReturnType<typeof integrationSettingsOf>>();
  const base = (deps.appBaseUrl ?? '').replace(/\/$/, '');
  for (const msg of rows) {
    const attempts = msg.attempts + 1;
    try {
      let settings = cache.get(msg.tenantId);
      if (!settings) {
        const [tenant] = await withPlatform(db, (t) => t.select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, msg.tenantId)));
        settings = integrationSettingsOf(tenant?.settings);
        cache.set(msg.tenantId, settings);
      }
      const payload = (msg.payload ?? {}) as { link?: string | null; title?: string | null };
      const link = payload.link ? (payload.link.startsWith('http') ? payload.link : `${base}${payload.link}`) : null;
      const text = link ? `${msg.text}\n${link}` : msg.text;
      const outcome = await withTenant(db, msg.tenantId, async (t): Promise<'sent' | string> => {
        if (msg.provider === 'teams') {
          const url = settings!.teams?.webhookUrl;
          if (!settings!.teams?.enabled || !url) return 'skip:Teams non configurato';
          await teamsWebhookPost(deps.fetch, url, text, payload.title ?? undefined);
          return 'sent';
        }
        const [ws] = await t.select().from(connectorAccounts).where(and(eq(connectorAccounts.provider, 'slack'), isNull(connectorAccounts.userId)));
        if (!ws || ws.status !== 'active' || !ws.accessTokenEnc) return 'skip:Slack non collegato';
        const token = deps.cipher.decrypt(msg.tenantId, ws.accessTokenEnc);
        const endpoints = endpointsFor(settings!, 'slack');
        let channel: string | null = null;
        if (msg.target.startsWith('channel:')) channel = msg.target.slice(8);
        else if (msg.target.startsWith('user:')) {
          const userId = msg.target.slice(5);
          const [map] = await t.select().from(connectorAccounts).where(and(eq(connectorAccounts.provider, 'slack_user'), eq(connectorAccounts.userId, userId)));
          if (map?.externalId) channel = map.externalId;
          else {
            const [u] = await t.select({ email: users.email }).from(users).where(eq(users.id, userId));
            const found = u ? await slackLookupUserByEmail(deps.fetch, endpoints, token, u.email) : null;
            if (!found) return 'skip:utente non presente nel workspace Slack';
            await t.insert(connectorAccounts).values({ tenantId: msg.tenantId, provider: 'slack_user', userId, externalId: found.id, displayName: found.name, status: 'active' }).onConflictDoNothing();
            channel = found.id;
          }
        } else channel = msg.target;
        await slackPostMessage(deps.fetch, endpoints, token, channel!, text);
        await t.update(connectorAccounts).set({ lastUsedAt: now, updatedAt: now }).where(eq(connectorAccounts.id, ws.id));
        return 'sent';
      });
      if (outcome === 'sent') {
        await withPlatform(db, (t) => t.update(chatOutbox).set({ status: 'sent', attempts, lastError: null, sentAt: now, updatedAt: now }).where(eq(chatOutbox.id, msg.id)));
        out.sent++;
      } else {
        await withPlatform(db, (t) => t.update(chatOutbox).set({ status: 'skipped', attempts, lastError: outcome.replace(/^skip:/, ''), updatedAt: now }).where(eq(chatOutbox.id, msg.id)));
        out.skipped++;
      }
    } catch (e) {
      const err = e as Error;
      const unauthorized = e instanceof ProviderError && e.unauthorized;
      const final = unauthorized || attempts >= 5;
      await withPlatform(db, (t) => t.update(chatOutbox).set({ status: final ? 'failed' : 'pending', attempts, lastError: err.message.slice(0, 500), nextAttemptAt: new Date(now.getTime() + backoffMinutes(attempts) * 60000), updatedAt: now }).where(eq(chatOutbox.id, msg.id)));
      if (unauthorized && msg.provider === 'slack') await withTenant(db, msg.tenantId, (t) => t.update(connectorAccounts).set({ status: 'error', lastError: err.message.slice(0, 500), updatedAt: now }).where(and(eq(connectorAccounts.provider, 'slack'), isNull(connectorAccounts.userId))));
      if (final) out.failed++; else out.retried++;
    }
  }
  return out;
}
