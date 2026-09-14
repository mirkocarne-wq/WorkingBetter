import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { calendarEventLinks, chatOutbox, connectorAccounts, meetings, oneOnOneRelations, persons, tenants, users } from '@wb/db';
import { createTestDatabase, type TestDatabase } from '@wb/db/testing';
import { TenantCipher, dispatchChat, syncCalendarLinks, type FetchLike } from '@wb/connectors';

let t: TestDatabase;
let tenantId: string;
let giuliaUser: string;
let lucaUser: string;
let meetingId: string;
let googleAccount: string;
let msAccount: string;
const cipher = new TenantCipher('b'.repeat(64));
// le righe in coda nascono con nextAttemptAt = adesso: il «now» dei job deve essere successivo all'inserimento
const T0 = Date.now() + 60_000;
const at = (min: number) => new Date(T0 + min * 60_000);
const calls: { url: string; method: string; body: unknown; auth: string | undefined }[] = [];
const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });

/** Provider finti: token endpoint, Calendar API, Graph, Slack, webhook Teams. */
const fake: FetchLike = async (url, init) => {
  const body = init?.body ? (init.headers?.['content-type']?.includes('json') ? JSON.parse(init.body) : Object.fromEntries(new URLSearchParams(init.body))) : null;
  calls.push({ url, method: init?.method ?? 'GET', body, auth: init?.headers?.authorization });
  if (url.endsWith('/token')) return res(200, { access_token: 'fresh-google', expires_in: 3600, refresh_token: undefined });
  if (url.includes('/calendars/primary/events')) {
    if (init?.method === 'DELETE') return res(204, {});
    if (init?.headers?.authorization !== 'Bearer fresh-google') return res(401, { error: 'invalid_credentials' });
    return res(200, { id: 'gev-1', hangoutLink: 'https://meet.google.com/abc-defg', htmlLink: 'https://calendar.google.com/e/1' });
  }
  if (url.includes('/me/events')) {
    if (init?.headers?.authorization === 'Bearer ms-revoked') return res(401, { error: { code: 'InvalidAuthenticationToken' } });
    return res(201, { id: 'msev-1', webLink: 'https://outlook.office.com/e/1', onlineMeeting: { joinUrl: 'https://teams.microsoft.com/l/meetup-join/x' } });
  }
  if (url.endsWith('/users.lookupByEmail')) return res(200, body.email === 'luca@acme.test' ? { ok: true, user: { id: 'U-LUCA', real_name: 'Luca Bianchi' } } : { ok: false, error: 'users_not_found' });
  if (url.endsWith('/chat.postMessage')) return res(200, { ok: true, ts: '1.2' });
  if (url.startsWith('https://teams.example/')) return res(200, '1');
  return res(404, { error: 'not found' });
};

beforeAll(async () => {
  t = await createTestDatabase();
  const settings = { integrations: { google: { enabled: true, clientId: 'g-id', clientSecretEnc: null }, microsoft: { enabled: true, clientId: 'm-id' }, slack: { enabled: true, clientId: 's-id', recognitionsChannel: 'C-KUDOS' }, teams: { enabled: true, webhookUrl: 'https://teams.example/hook', postRecognitions: true }, endpoints: { google: { token: 'https://google.example/token', api: 'https://google.example/calendar' }, microsoft: { api: 'https://graph.example' }, slack: { api: 'https://slack.example/api' } } } };
  const [tn] = await t.db.insert(tenants).values({ name: 'Acme', slug: 'acme', settings }).returning();
  tenantId = tn!.id;
  const [g] = await t.db.insert(persons).values({ tenantId, firstName: 'Giulia', lastName: 'Ferri', email: 'giulia@acme.test' }).returning();
  const [l] = await t.db.insert(persons).values({ tenantId, firstName: 'Luca', lastName: 'Bianchi', email: 'luca@acme.test', managerId: g!.id }).returning();
  const [gu] = await t.db.insert(users).values({ tenantId, email: 'giulia@acme.test', personId: g!.id }).returning();
  const [lu] = await t.db.insert(users).values({ tenantId, email: 'luca@acme.test', personId: l!.id }).returning();
  giuliaUser = gu!.id; lucaUser = lu!.id;
  const [rel] = await t.db.insert(oneOnOneRelations).values({ tenantId, personAId: g!.id, personBId: l!.id, cadenceDays: 14, durationMin: 30 }).returning();
  const [m] = await t.db.insert(meetings).values({ tenantId, relationId: rel!.id, scheduledAt: new Date('2026-09-21T09:00:00Z'), durationMin: 30 }).returning();
  meetingId = m!.id;
  // Giulia: Google con token scaduto (va rinfrescato); Luca: Microsoft con token revocato
  const [ga] = await t.db.insert(connectorAccounts).values({ tenantId, provider: 'google', userId: giuliaUser, personId: g!.id, externalId: 'giulia@acme.test', accessTokenEnc: cipher.encrypt(tenantId, 'old-google'), refreshTokenEnc: cipher.encrypt(tenantId, 'refresh-1'), expiresAt: new Date('2026-09-14T09:00:00Z'), status: 'active' }).returning();
  const [ma] = await t.db.insert(connectorAccounts).values({ tenantId, provider: 'microsoft', userId: lucaUser, personId: l!.id, externalId: 'luca@acme.test', accessTokenEnc: cipher.encrypt(tenantId, 'ms-revoked'), expiresAt: new Date('2026-12-01T00:00:00Z'), status: 'active' }).returning();
  googleAccount = ga!.id; msAccount = ma!.id;
  await t.db.insert(connectorAccounts).values({ tenantId, provider: 'slack', userId: null, externalId: 'T-ACME', displayName: 'Acme', accessTokenEnc: cipher.encrypt(tenantId, 'xoxb-bot'), status: 'active' });
  await t.db.insert(calendarEventLinks).values([
    { tenantId, meetingId, accountId: googleAccount, provider: 'google', op: 'upsert' },
    { tenantId, meetingId, accountId: msAccount, provider: 'microsoft', op: 'upsert' },
  ]);
  await t.db.insert(chatOutbox).values([
    { tenantId, provider: 'slack', target: `user:${lucaUser}`, userId: lucaUser, text: '*Feedback ricevuto*\nGiulia ti ha dato un feedback', payload: { link: '/feedback' } },
    { tenantId, provider: 'slack', target: `user:${giuliaUser}`, userId: giuliaUser, text: 'x', payload: {} },
    { tenantId, provider: 'slack', target: 'channel:C-KUDOS', text: '🏅 Giulia ha riconosciuto Luca', payload: { link: '/feedback' } },
    { tenantId, provider: 'teams', target: 'webhook', text: '🏅 Giulia ha riconosciuto Luca', payload: { title: 'Riconoscimento', link: '/feedback' } },
  ]);
});
afterAll(() => t.close());

describe('connettori (ADR-0012)', () => {
  it('calendar-sync: rinfresca il token Google scaduto, crea l’evento con link Meet; il token Microsoft revocato mette l’account in errore', async () => {
    const r = await syncCalendarLinks(t.db, { cipher, fetch: fake, now: at(0), appBaseUrl: 'https://app.acme.test' });
    expect(r).toEqual({ synced: 1, deleted: 0, failed: 1, retried: 0 });
    const links = await t.db.select().from(calendarEventLinks).where(eq(calendarEventLinks.meetingId, meetingId));
    const g = links.find((l) => l.provider === 'google')!;
    expect(g).toMatchObject({ status: 'synced', externalEventId: 'gev-1', joinUrl: 'https://meet.google.com/abc-defg' });
    const ms = links.find((l) => l.provider === 'microsoft')!;
    expect(ms.status).toBe('failed');
    expect((await t.db.select().from(connectorAccounts).where(eq(connectorAccounts.id, msAccount)))[0]).toMatchObject({ status: 'error' });
    const refreshed = (await t.db.select().from(connectorAccounts).where(eq(connectorAccounts.id, googleAccount)))[0]!;
    expect(cipher.decrypt(tenantId, refreshed.accessTokenEnc!)).toBe('fresh-google');
    const tokenCall = calls.find((c) => c.url === 'https://google.example/token')!;
    expect(tokenCall.body).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'refresh-1', client_id: 'g-id' });
    const create = calls.find((c) => c.url.startsWith('https://google.example/calendar/calendars/primary/events'))!;
    expect(create.method).toBe('POST');
    expect((create.body as { summary: string; attendees: unknown[]; conferenceData: unknown; description: string })).toMatchObject({ summary: '1:1 Giulia Ferri · Luca Bianchi' });
    expect((create.body as { attendees: unknown[] }).attendees).toHaveLength(2);
    expect((create.body as { description: string }).description).toContain('https://app.acme.test/one-on-ones/');
    // riprogrammazione: PATCH sullo stesso evento; annullamento: DELETE
    await t.db.update(calendarEventLinks).set({ status: 'pending', op: 'upsert', attempts: 0 }).where(eq(calendarEventLinks.id, g.id));
    await syncCalendarLinks(t.db, { cipher, fetch: fake, now: at(5) });
    expect(calls.filter((c) => c.method === 'PATCH' && c.url.includes('/events/gev-1'))).toHaveLength(1);
    await t.db.update(calendarEventLinks).set({ status: 'pending', op: 'delete', attempts: 0 }).where(eq(calendarEventLinks.id, g.id));
    expect(await syncCalendarLinks(t.db, { cipher, fetch: fake, now: at(10) })).toMatchObject({ deleted: 1 });
    expect(calls.filter((c) => c.method === 'DELETE' && c.url.includes('/events/gev-1'))).toHaveLength(1);
  });

  it('chat-dispatch: DM Slack con utente mappato per email (e memorizzato), canale riconoscimenti, webhook Teams; utente assente saltato', async () => {
    const r = await dispatchChat(t.db, { cipher, fetch: fake, now: at(0), appBaseUrl: 'https://app.acme.test' });
    expect(r).toEqual({ sent: 3, failed: 0, retried: 0, skipped: 1 });
    const posts = calls.filter((c) => c.url.endsWith('/chat.postMessage')).map((c) => c.body as { channel: string; text: string });
    expect(posts.map((p) => p.channel).sort()).toEqual(['C-KUDOS', 'U-LUCA']);
    expect(posts.find((p) => p.channel === 'U-LUCA')!.text).toContain('https://app.acme.test/feedback');
    expect(calls.find((c) => c.url.endsWith('/chat.postMessage'))!.auth).toBe('Bearer xoxb-bot');
    const teams = calls.find((c) => c.url === 'https://teams.example/hook')!;
    expect(JSON.stringify(teams.body)).toContain('AdaptiveCard');
    const map = await t.db.select().from(connectorAccounts).where(eq(connectorAccounts.provider, 'slack_user'));
    expect(map).toHaveLength(1);
    expect(map[0]).toMatchObject({ userId: lucaUser, externalId: 'U-LUCA' });
    const rows = await t.db.select().from(chatOutbox);
    expect(rows.find((x) => x.target === `user:${giuliaUser}`)).toMatchObject({ status: 'skipped', lastError: 'utente non presente nel workspace Slack' });
    // seconda consegna a Luca: nessun nuovo lookup, usa la mappatura
    const before = calls.filter((c) => c.url.endsWith('/users.lookupByEmail')).length;
    await t.db.insert(chatOutbox).values({ tenantId, provider: 'slack', target: `user:${lucaUser}`, userId: lucaUser, text: 'di nuovo', payload: {} });
    expect(await dispatchChat(t.db, { cipher, fetch: fake, now: at(1) })).toMatchObject({ sent: 1 });
    expect(calls.filter((c) => c.url.endsWith('/users.lookupByEmail')).length).toBe(before);
  });
});
