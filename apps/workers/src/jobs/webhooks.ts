import { and, eq, lt, lte } from 'drizzle-orm';
import { appInstanceEvents, webhookDeliveries, withPlatform, type AnyDb } from '@wb/db';

export type WebhookFetch = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal: AbortSignal }) => Promise<{ ok: boolean; status: number }>;

/**
 * Ritentativi dei webhook delle azioni automatiche (APP-024): consegne in `webhook_deliveries` con backoff
 * esponenziale (2, 4, 8, 16 minuti, massimo 60) fino a 5 tentativi; l'esito finale finisce nel log dell'istanza.
 */
export type UrlCheck = (url: string) => Promise<void>;
export async function dispatchWebhooks(db: AnyDb, now = new Date(), fetchImpl: WebhookFetch = fetch as unknown as WebhookFetch, batch = 50, checkUrl?: UrlCheck): Promise<{ sent: number; failed: number; retried: number }> {
  const out = { sent: 0, failed: 0, retried: 0 };
  const pending = await withPlatform(db, (tx) => tx.select().from(webhookDeliveries).where(and(eq(webhookDeliveries.status, 'pending'), lte(webhookDeliveries.nextAttemptAt, now), lt(webhookDeliveries.attempts, 5))).orderBy(webhookDeliveries.createdAt).limit(batch));
  for (const d of pending) {
    const attempts = d.attempts + 1;
    let status: number | null = null;
    let error: string | null = null;
    try {
      if (checkUrl) await checkUrl(d.url);
      const res = await fetchImpl(d.url, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'WorkingBetter-webhook/1', 'x-wb-attempt': String(attempts) }, body: JSON.stringify(d.payload), signal: AbortSignal.timeout(5000) });
      status = res.status;
      if (!res.ok) error = `HTTP ${res.status}`;
    } catch (e) {
      error = String((e as Error).message ?? e).slice(0, 500);
    }
    if (!error) {
      await withPlatform(db, (tx) => tx.update(webhookDeliveries).set({ status: 'sent', attempts, lastStatus: status, lastError: null, sentAt: now, updatedAt: now }).where(eq(webhookDeliveries.id, d.id)));
      if (d.instanceId) await withPlatform(db, (tx) => tx.insert(appInstanceEvents).values({ tenantId: d.tenantId, instanceId: d.instanceId!, type: 'webhook_delivered', stageKey: d.stageKey, data: { url: d.url, attempts }, at: now }));
      out.sent++;
      continue;
    }
    const final = attempts >= 5;
    const delayMin = Math.min(60, 2 ** attempts);
    await withPlatform(db, (tx) => tx.update(webhookDeliveries).set({ status: final ? 'failed' : 'pending', attempts, lastStatus: status, lastError: error, nextAttemptAt: new Date(now.getTime() + delayMin * 60000), updatedAt: now }).where(eq(webhookDeliveries.id, d.id)));
    if (final) {
      if (d.instanceId) await withPlatform(db, (tx) => tx.insert(appInstanceEvents).values({ tenantId: d.tenantId, instanceId: d.instanceId!, type: 'webhook_failed', stageKey: d.stageKey, data: { url: d.url, attempts, error }, at: now }));
      out.failed++;
    } else out.retried++;
  }
  return out;
}
