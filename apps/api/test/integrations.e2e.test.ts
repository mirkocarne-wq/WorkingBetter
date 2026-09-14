import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import { calendarEventLinks, chatOutbox, connectorAccounts, withTenant } from '@wb/db';
import { api, createTestEnv, type TestEnv } from './helpers.js';

type U = { userId: string; personId: string; token: string };
let env: TestEnv;
let tenant: { id: string; slug: string };
let admin: U, giulia: U, luca: U;
let oauth: Server;
let base: string;
const tokenRequests: Record<string, string>[] = [];

/** Provider OAuth finto: token endpoint (Google/Microsoft/Slack), userinfo, Graph /me, Slack oauth.v2.access. */
beforeAll(async () => {
  oauth = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const send = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
      if (req.url === '/google/token' || req.url === '/ms/token') { tokenRequests.push(Object.fromEntries(new URLSearchParams(raw))); return send(200, { access_token: `at-${req.url.split('/')[1]}`, refresh_token: 'rt-1', expires_in: 3600, scope: 'calendar' }); }
      if (req.url === '/slack/oauth.v2.access') { tokenRequests.push(Object.fromEntries(new URLSearchParams(raw))); return send(200, { ok: true, access_token: 'xoxb-bot-token', team: { id: 'T-ACME', name: 'Acme Workspace' }, bot_user_id: 'U-BOT', scope: 'chat:write' }); }
      if (req.url === '/google/userinfo') return send(200, { email: 'giulia@acme.test', name: 'Giulia Ferri' });
      if (req.url === '/ms/me') return send(200, { id: 'ms-1', mail: 'luca@acme.test', displayName: 'Luca Bianchi' });
      if (req.url === '/bad/token') return send(400, { error: 'invalid_grant', error_description: 'Code expired' });
      send(404, { error: 'nope' });
    });
  });
  await new Promise<void>((r) => oauth.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(oauth.address() as { port: number }).port}`;
  env = await createTestEnv();
  tenant = await env.createTenant('Acme Int');
  admin = await env.createUser(tenant.id, 'anna@int.test', ['tenant_admin'], { firstName: 'Anna', lastName: 'Colombo' });
  giulia = await env.createUser(tenant.id, 'giulia@int.test', ['manager'], { firstName: 'Giulia', lastName: 'Ferri' });
  luca = await env.createUser(tenant.id, 'luca@int.test', ['employee'], { firstName: 'Luca', lastName: 'Bianchi', managerId: giulia.personId });
});
afterAll(async () => { oauth.close(); await env.close(); });

const stateOf = (url: string) => new URL(url).searchParams.get('state')!;

describe('connettori esterni (ADR-0012)', () => {
  it('the admin configures the OAuth apps (secrets encrypted, never returned); regular users cannot', async () => {
    expect((await api(env.app, 'GET', '/integrations/config', giulia.token)).status).toBe(403);
    const before = await api(env.app, 'GET', '/integrations/config', admin.token);
    expect(before.body.google).toMatchObject({ enabled: false, hasClientSecret: false });
    expect(before.body.google.redirectUri).toContain('/api/v1/integrations/callback/google');
    const upd = await api(env.app, 'PUT', '/integrations/config', admin.token, {
      google: { enabled: true, clientId: 'g-client', clientSecret: 'g-secret' },
      microsoft: { enabled: true, clientId: 'm-client', clientSecret: 'm-secret', tenant: 'contoso.onmicrosoft.com' },
      slack: { enabled: true, clientId: 's-client', clientSecret: 's-secret', recognitionsChannel: 'C-KUDOS' },
      teams: { enabled: true, webhookUrl: 'https://contoso.webhook.office.com/hook/1', postRecognitions: true },
      endpoints: { google: { authorize: `${base}/google/authorize`, token: `${base}/google/token`, api: `${base}/google` }, microsoft: { authorize: `${base}/ms/authorize`, token: `${base}/ms/token`, api: `${base}/ms` }, slack: { authorize: `${base}/slack/authorize`, token: `${base}/slack/oauth.v2.access`, api: `${base}/slack` } },
    });
    expect(upd.status).toBe(200);
    expect(upd.body.google).toMatchObject({ enabled: true, clientId: 'g-client', hasClientSecret: true });
    expect(upd.body.microsoft.tenant).toBe('contoso.onmicrosoft.com');
    expect(upd.body.teams).toEqual({ enabled: true, hasWebhook: true, postRecognitions: true });
    expect(JSON.stringify(upd.body)).not.toContain('g-secret');
    const tenantRow = await env.db.execute(`select settings from tenants where id = '${tenant.id}'`);
    const stored = JSON.stringify((tenantRow.rows[0] as { settings: unknown }).settings);
    expect(stored).not.toContain('g-secret');
    expect(stored).toContain('clientSecretEnc');
    // rimozione del segreto con stringa vuota, invariato se assente
    const cleared = await api(env.app, 'PUT', '/integrations/config', admin.token, { microsoft: { clientSecret: '' } });
    expect(cleared.body.microsoft).toMatchObject({ hasClientSecret: false, clientId: 'm-client', enabled: true });
    expect((await api(env.app, 'PUT', '/integrations/config', admin.token, { microsoft: { enabled: true } })).body.microsoft.hasClientSecret).toBe(false);
    const ov = await api(env.app, 'GET', '/integrations', luca.token);
    expect(ov.body.providers.google.available).toBe(true);
    expect(ov.body.providers.slack.installed).toBeNull();
    expect(ov.body.chatEnabled).toBe(false);
  });

  it('a user connects Google Calendar with PKCE: authorize URL, callback exchanges the code and stores encrypted tokens', async () => {
    const start = await api(env.app, 'POST', '/integrations/google/connect', giulia.token);
    expect(start.status).toBe(201);
    const url = new URL(start.body.url);
    expect(`${url.origin}${url.pathname}`).toBe(`${base}/google/authorize`);
    expect(url.searchParams.get('client_id')).toBe('g-client');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('access_type')).toBe('offline');
    const cb = await api(env.app, 'GET', `/integrations/callback/google?code=abc123&state=${encodeURIComponent(stateOf(start.body.url))}`);
    expect(cb.status).toBe(302);
    expect(cb.headers.location).toContain('/settings?connected=google');
    const req = tokenRequests.find((r) => r.code === 'abc123')!;
    expect(req).toMatchObject({ grant_type: 'authorization_code', client_id: 'g-client', client_secret: 'g-secret' });
    expect(req.code_verifier).toBeTruthy();
    expect(req.redirect_uri).toContain('/integrations/callback/google');
    const rows = await withTenant(env.db, tenant.id, (t) => t.select().from(connectorAccounts).where(eq(connectorAccounts.userId, giulia.userId)));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ provider: 'google', externalId: 'giulia@acme.test', status: 'active', personId: giulia.personId });
    expect(rows[0]!.accessTokenEnc).not.toContain('at-google');
    expect(rows[0]!.refreshTokenEnc).toBeTruthy();
    const ov = await api(env.app, 'GET', '/integrations', giulia.token);
    expect(ov.body.mine.google).toMatchObject({ displayName: 'giulia@acme.test', status: 'active' });
    expect((await api(env.app, 'GET', '/integrations', luca.token)).body.mine.google).toBeNull();
    // stato riusato, stato falso, errore del provider → nessun account, redirect con errore
    expect((await api(env.app, 'GET', `/integrations/callback/google?code=x&state=not-a-state`)).headers.location).toContain('integration_error=');
    expect((await api(env.app, 'GET', `/integrations/callback/google?error=access_denied&error_description=Utente+ha+annullato`)).headers.location).toContain('integration_error=Utente');
    expect((await api(env.app, 'GET', `/integrations/callback/microsoft?code=x&state=${encodeURIComponent(stateOf(start.body.url))}`)).headers.location).toContain('Provider+non+corrispondente');
  });

  it('creating, rescheduling and cancelling a 1:1 queues the calendar sync for participants with a connected calendar', async () => {
    const rel = await api(env.app, 'POST', '/one-on-ones', giulia.token, { otherPersonId: luca.personId, cadenceDays: 14 });
    expect(rel.status).toBe(201);
    const m = await api(env.app, 'POST', `/one-on-ones/${rel.body.id}/meetings`, giulia.token, { scheduledAt: '2026-10-01T09:00:00.000Z', durationMin: 30 });
    expect(m.status).toBe(201);
    let links = await withTenant(env.db, tenant.id, (t) => t.select().from(calendarEventLinks).where(eq(calendarEventLinks.meetingId, m.body.id)));
    expect(links).toHaveLength(1); // solo Giulia ha un calendario collegato
    expect(links[0]).toMatchObject({ provider: 'google', op: 'upsert', status: 'pending', attempts: 0 });
    expect((await api(env.app, 'GET', `/meetings/${m.body.id}`, giulia.token)).body.calendarLinks).toEqual([expect.objectContaining({ provider: 'google', status: 'pending' })]);
    // simulo la sincronizzazione avvenuta, poi riprogrammo: torna in coda con lo stesso evento esterno
    await withTenant(env.db, tenant.id, (t) => t.update(calendarEventLinks).set({ status: 'synced', externalEventId: 'gev-1', joinUrl: 'https://meet.google.com/x' }).where(eq(calendarEventLinks.id, links[0]!.id)));
    await api(env.app, 'PATCH', `/meetings/${m.body.id}`, giulia.token, { scheduledAt: '2026-10-01T10:00:00.000Z' });
    links = await withTenant(env.db, tenant.id, (t) => t.select().from(calendarEventLinks).where(eq(calendarEventLinks.meetingId, m.body.id)));
    expect(links[0]).toMatchObject({ op: 'upsert', status: 'pending', externalEventId: 'gev-1' });
    await api(env.app, 'PATCH', `/meetings/${m.body.id}`, giulia.token, { status: 'cancelled' });
    links = await withTenant(env.db, tenant.id, (t) => t.select().from(calendarEventLinks).where(eq(calendarEventLinks.meetingId, m.body.id)));
    expect(links[0]).toMatchObject({ op: 'delete', status: 'pending' });
  });

  it('the admin installs Slack for the workspace; notifications and recognitions are queued for Slack and Teams; users can opt out of chat', async () => {
    expect((await api(env.app, 'POST', '/integrations/slack/connect', giulia.token)).status).toBe(403);
    const start = await api(env.app, 'POST', '/integrations/slack/connect', admin.token);
    expect(new URL(start.body.url).searchParams.get('scope')).toContain('chat:write');
    const cb = await api(env.app, 'GET', `/integrations/callback/slack?code=slack-code&state=${encodeURIComponent(stateOf(start.body.url))}`);
    expect(cb.headers.location).toContain('connected=slack');
    const ws = await withTenant(env.db, tenant.id, (t) => t.select().from(connectorAccounts).where(and(eq(connectorAccounts.provider, 'slack'), isNull(connectorAccounts.userId))));
    expect(ws[0]).toMatchObject({ externalId: 'T-ACME', displayName: 'Acme Workspace', status: 'active' });
    expect((await api(env.app, 'GET', '/integrations', luca.token)).body).toMatchObject({ chatEnabled: true, providers: { slack: { installed: { teamName: 'Acme Workspace' } } } });
    // un feedback a Luca → notifica in-app + email + DM Slack in coda
    const fb = await api(env.app, 'POST', '/feedback', giulia.token, { toPersonId: luca.personId, body: 'Ottima presentazione al cliente', visibility: 'private' });
    expect(fb.status).toBe(201);
    let outbox = await withTenant(env.db, tenant.id, (t) => t.select().from(chatOutbox));
    const dm = outbox.find((x) => x.target === `user:${luca.userId}`)!;
    expect(dm).toMatchObject({ provider: 'slack', status: 'pending' });
    expect(dm.text).toContain('Giulia');
    // riconoscimento → canale Slack e webhook Teams
    expect((await api(env.app, 'POST', '/recognitions', giulia.token, { recipientPersonIds: [luca.personId], message: 'Grazie per il supporto al rilascio!' })).status).toBe(201);
    outbox = await withTenant(env.db, tenant.id, (t) => t.select().from(chatOutbox));
    expect(outbox.find((x) => x.target === 'channel:C-KUDOS')!.text).toContain('Grazie per il supporto');
    expect(outbox.find((x) => x.provider === 'teams')).toMatchObject({ target: 'webhook', status: 'pending' });
    // preferenza chat disattivata: niente DM per quel tipo
    const prefs = await api(env.app, 'GET', '/notification-preferences', luca.token);
    expect(prefs.body.find((p: { type: string }) => p.type === 'feedback.received').chat).toBe(true);
    await api(env.app, 'PUT', '/notification-preferences', luca.token, { items: [{ type: 'feedback.received', inApp: true, email: false, chat: false }] });
    const n = outbox.length;
    await api(env.app, 'POST', '/feedback', giulia.token, { toPersonId: luca.personId, body: 'Secondo feedback', visibility: 'private' });
    expect((await withTenant(env.db, tenant.id, (t) => t.select().from(chatOutbox))).length).toBe(n);
    // messaggio di prova e disconnessione
    expect((await api(env.app, 'POST', '/integrations/teams/test', admin.token)).body).toEqual({ queued: true });
    expect((await api(env.app, 'POST', '/integrations/slack/test', admin.token)).body).toEqual({ queued: true });
    const disc = await api(env.app, 'DELETE', '/integrations/google', giulia.token);
    expect(disc.status, JSON.stringify(disc.body)).toBe(200);
    expect(disc.body.mine.google).toBeNull();
    expect((await api(env.app, 'DELETE', '/integrations/slack', admin.token)).body.chatEnabled).toBe(false);
  });
});
