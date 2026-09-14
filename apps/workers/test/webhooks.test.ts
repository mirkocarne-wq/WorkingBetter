import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { appInstanceEvents, tenants, webhookDeliveries } from '@wb/db';
import { createTestDatabase, type TestDatabase } from '@wb/db/testing';
import { dispatchWebhooks } from '../src/jobs/webhooks.js';

let t: TestDatabase;
let tenantId: string;
const instanceId = crypto.randomUUID();

beforeAll(async () => {
  t = await createTestDatabase();
  const [tn] = await t.db.insert(tenants).values({ name: 'Acme', slug: 'acme' }).returning();
  tenantId = tn!.id;
  await t.db.insert(webhookDeliveries).values([
    { tenantId, instanceId, stageKey: 'apply', url: 'https://hooks.test/ok', payload: { event: 'app.stage' }, attempts: 1, nextAttemptAt: new Date('2026-09-14T10:00:00Z') },
    { tenantId, instanceId, stageKey: 'apply', url: 'https://hooks.test/down', payload: { event: 'app.stage' }, attempts: 4, nextAttemptAt: new Date('2026-09-14T10:00:00Z') },
    { tenantId, instanceId, stageKey: 'apply', url: 'https://hooks.test/later', payload: { event: 'app.stage' }, attempts: 1, nextAttemptAt: new Date('2026-09-14T12:00:00Z') },
  ]);
});
afterAll(() => t.close());

describe('ritentativi webhook (APP-024)', () => {
  it('riconsegna con backoff, segna fallita dopo 5 tentativi e scrive l’esito nel log dell’istanza', async () => {
    const calls: { url: string; attempt: string }[] = [];
    const fake = async (url: string, init: { headers: Record<string, string> }) => { calls.push({ url, attempt: init.headers['x-wb-attempt']! }); return url.endsWith('/ok') ? { ok: true, status: 204 } : { ok: false, status: 503 }; };
    const r = await dispatchWebhooks(t.db, new Date('2026-09-14T10:05:00Z'), fake);
    expect(r).toEqual({ sent: 1, failed: 1, retried: 0 });
    expect(calls.map((c) => c.url).sort()).toEqual(['https://hooks.test/down', 'https://hooks.test/ok']);
    const rows = await t.db.select().from(webhookDeliveries);
    expect(rows.find((x) => x.url.endsWith('/ok'))).toMatchObject({ status: 'sent', attempts: 2, lastStatus: 204 });
    expect(rows.find((x) => x.url.endsWith('/down'))).toMatchObject({ status: 'failed', attempts: 5, lastError: 'HTTP 503' });
    expect(rows.find((x) => x.url.endsWith('/later'))!.status).toBe('pending');
    const events = await t.db.select().from(appInstanceEvents).where(eq(appInstanceEvents.instanceId, instanceId));
    expect(events.map((e) => e.type).sort()).toEqual(['webhook_delivered', 'webhook_failed']);
    // la consegna programmata più tardi parte quando arriva il suo momento; un errore di rete la rimanda con backoff
    const boom = async () => { throw new Error('ECONNREFUSED'); };
    expect(await dispatchWebhooks(t.db, new Date('2026-09-14T12:01:00Z'), boom)).toEqual({ sent: 0, failed: 0, retried: 1 });
    const later = (await t.db.select().from(webhookDeliveries)).find((x) => x.url.endsWith('/later'))!;
    expect(later).toMatchObject({ status: 'pending', attempts: 2, lastError: 'ECONNREFUSED' });
    expect(later.nextAttemptAt.toISOString()).toBe('2026-09-14T12:05:00.000Z');
  });
});
