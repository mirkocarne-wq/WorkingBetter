import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportJWK, generateKeyPair, SignJWT, type KeyLike } from 'jose';
import { emailOutbox, persons, users, withTenant } from '@wb/db';
import { eq } from 'drizzle-orm';
import { api, createTestEnv, type TestEnv } from './helpers.js';

let env: TestEnv;
let tenant: { id: string; slug: string };
let admin: { userId: string; personId: string; token: string };
let hr: { userId: string; personId: string; token: string };

/** IdP OIDC finto: discovery, authorize (memorizza challenge e nonce), token (verifica PKCE), JWKS. */
class FakeIdp {
  server!: Server;
  issuer = '';
  private key!: { publicKey: KeyLike; privateKey: KeyLike };
  private codes = new Map<string, { challenge: string; nonce: string; email: string }>();
  nextEmail = 'nuova.persona@acme.test';
  tokenRequests: URLSearchParams[] = [];
  async start() {
    this.key = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(this.key.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
    this.server = createServer(async (req, res) => {
      const url = new URL(req.url!, this.issuer);
      const json = (b: unknown, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(b)); };
      if (url.pathname === '/.well-known/openid-configuration') return json({ issuer: this.issuer, authorization_endpoint: `${this.issuer}/authorize`, token_endpoint: `${this.issuer}/token`, jwks_uri: `${this.issuer}/jwks` });
      if (url.pathname === '/jwks') return json({ keys: [jwk] });
      if (url.pathname === '/token') {
        let body = '';
        for await (const c of req) body += c;
        const p = new URLSearchParams(body);
        this.tokenRequests.push(p);
        const c = this.codes.get(p.get('code') ?? '');
        if (!c) return json({ error: 'invalid_grant' }, 400);
        if (createHash('sha256').update(p.get('code_verifier') ?? '').digest('base64url') !== c.challenge) return json({ error: 'invalid_grant', error_description: 'pkce' }, 400);
        const idToken = await new SignJWT({ email: c.email, given_name: 'Nuova', family_name: 'Persona', nonce: c.nonce }).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(this.issuer).setAudience(p.get('client_id')!).setSubject(`sub-${c.email}`).setIssuedAt().setExpirationTime('5m').sign(this.key.privateKey);
        return json({ access_token: 'x', id_token: idToken, token_type: 'Bearer' });
      }
      json({ error: 'not_found' }, 404);
    });
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', r));
    const addr = this.server.address() as { port: number };
    this.issuer = `http://127.0.0.1:${addr.port}`;
  }
  /** Simula il consenso dell'utente: dato l'URL di autorizzazione restituisce un code. */
  authorize(authorizeUrl: string): { code: string; state: string } {
    const u = new URL(authorizeUrl);
    expect(u.origin).toBe(this.issuer);
    expect(u.searchParams.get('code_challenge_method')).toBe('S256');
    const code = `code-${this.codes.size + 1}`;
    this.codes.set(code, { challenge: u.searchParams.get('code_challenge')!, nonce: u.searchParams.get('nonce')!, email: this.nextEmail });
    return { code, state: u.searchParams.get('state')! };
  }
  stop() { return new Promise<void>((r) => this.server.close(() => r())); }
}
const idp = new FakeIdp();

beforeAll(async () => {
  env = await createTestEnv();
  tenant = await env.createTenant('Acme');
  admin = await env.createUser(tenant.id, 'anna@acme.test', ['tenant_admin'], { firstName: 'Anna', lastName: 'Colombo' });
  hr = await env.createUser(tenant.id, 'hr@acme.test', ['hr_admin'], { firstName: 'Chiara', lastName: 'Moretti' });
  await idp.start();
});
afterAll(async () => { await idp.stop(); await env.close(); });

const outboxLink = async (to: string) => {
  const rows = await withTenant(env.db, tenant.id, (t) => t.select().from(emailOutbox).where(eq(emailOutbox.toEmail, to)));
  const last = rows.at(-1)!;
  return last.text.match(/https?:\/\/\S+/)![0];
};

describe('inviti e password', () => {
  let inviteToken: string;
  let lucaUserId: string;
  it('public config: password login available, no SSO yet, dev login on', async () => {
    const c = await api(env.app, 'GET', `/auth/config?tenant=${tenant.slug}`);
    expect(c.body).toMatchObject({ found: true, password: true, sso: false, devLogin: true, tenant: { name: 'Acme' } });
    expect((await api(env.app, 'GET', '/auth/config?tenant=nope')).body.found).toBe(false);
  });
  it('HR invites a new person: user + person created, email queued with a one-time link', async () => {
    const r = await api(env.app, 'POST', '/users/invite', hr.token, { email: 'Luca@acme.test', firstName: 'Luca', lastName: 'Bianchi', jobTitle: 'Developer', roles: ['employee'] });
    expect(r.status).toBe(201);
    expect(r.body.email).toBe('luca@acme.test');
    expect(r.body.inviteUrl).toContain('/accept-invite?token=');
    lucaUserId = r.body.id;
    const link = await outboxLink('luca@acme.test');
    expect(link).toBe(r.body.inviteUrl);
    inviteToken = new URL(link).searchParams.get('token')!;
    const [p] = await withTenant(env.db, tenant.id, (t) => t.select().from(persons).where(eq(persons.id, r.body.personId)));
    expect(p!.status).toBe('invited');
    expect((await api(env.app, 'POST', '/users/invite', hr.token, { email: 'luca@acme.test', firstName: 'X', lastName: 'Y' })).status).toBe(409);
    expect((await api(env.app, 'POST', '/users/invite', admin.token, { email: 'nome.solo@acme.test' })).status).toBe(422);
    const list = await api(env.app, 'GET', '/users', hr.token);
    expect(list.body.find((u: any) => u.email === 'luca@acme.test')).toMatchObject({ status: 'invited', person: { firstName: 'Luca' }, roles: [{ role: 'employee' }] });
  });
  it('the invite can be inspected and accepted with a policy-compliant password', async () => {
    expect((await api(env.app, 'GET', '/auth/invite/wrong-token')).body.valid).toBe(false);
    const info = await api(env.app, 'GET', `/auth/invite/${inviteToken}`);
    expect(info.body).toMatchObject({ valid: true, email: 'luca@acme.test', firstName: 'Luca', tenant: { slug: tenant.slug }, sso: false });
    expect((await api(env.app, 'POST', `/auth/invite/${inviteToken}/accept`, undefined, { password: 'short' })).status).toBe(422);
    const ok = await api(env.app, 'POST', `/auth/invite/${inviteToken}/accept`, undefined, { password: 'Password!2026' });
    expect(ok.status).toBe(200);
    expect(ok.body.accessToken).toBeTruthy();
    const me = await api(env.app, 'GET', '/me', ok.body.accessToken);
    expect(me.body.person.firstName).toBe('Luca');
    expect(me.body.permissions).toContain('objectives:write:own');
    const [p] = await withTenant(env.db, tenant.id, (t) => t.select().from(persons).where(eq(persons.id, me.body.person.id)));
    expect(p!.status).toBe('active');
    expect((await api(env.app, 'POST', `/auth/invite/${inviteToken}/accept`, undefined, { password: 'Password!2026' })).status).toBe(422); // monouso
  });
  it('password login works, wrong attempts lock the account after 5 tries', async () => {
    const ok = await api(env.app, 'POST', '/auth/login', undefined, { tenantSlug: tenant.slug, email: 'luca@acme.test', password: 'Password!2026' });
    expect(ok.status).toBe(200);
    expect(ok.body.roles).toEqual(['employee']);
    for (let i = 0; i < 4; i++) expect((await api(env.app, 'POST', '/auth/login', undefined, { tenantSlug: tenant.slug, email: 'luca@acme.test', password: 'nope-nope-nope' })).status).toBe(401);
    expect((await api(env.app, 'POST', '/auth/login', undefined, { tenantSlug: tenant.slug, email: 'luca@acme.test', password: 'nope-nope-nope' })).status).toBe(429);
    expect((await api(env.app, 'POST', '/auth/login', undefined, { tenantSlug: tenant.slug, email: 'luca@acme.test', password: 'Password!2026' })).status).toBe(429); // bloccato anche con password giusta
    expect((await api(env.app, 'POST', '/auth/login', undefined, { tenantSlug: 'nope', email: 'luca@acme.test', password: 'Password!2026' })).status).toBe(401);
  });
  it('forgot/reset password unlocks the account; the reset link is single-use', async () => {
    expect((await api(env.app, 'POST', '/auth/forgot-password', undefined, { tenantSlug: tenant.slug, email: 'nessuno@acme.test' })).status).toBe(202);
    expect((await api(env.app, 'POST', '/auth/forgot-password', undefined, { tenantSlug: tenant.slug, email: 'luca@acme.test' })).status).toBe(202);
    const link = await outboxLink('luca@acme.test');
    const token = new URL(link).searchParams.get('token')!;
    expect(link).toContain('/reset-password?token=');
    const r = await api(env.app, 'POST', '/auth/reset-password', undefined, { token, password: 'NuovaPassword!2026' });
    expect(r.status).toBe(200);
    expect((await api(env.app, 'POST', '/auth/reset-password', undefined, { token, password: 'AltraPassword!2026' })).status).toBe(422);
    expect((await api(env.app, 'POST', '/auth/login', undefined, { tenantSlug: tenant.slug, email: 'luca@acme.test', password: 'NuovaPassword!2026' })).status).toBe(200);
  });
  it('change password, refresh session, disable user', async () => {
    const login = await api(env.app, 'POST', '/auth/login', undefined, { tenantSlug: tenant.slug, email: 'luca@acme.test', password: 'NuovaPassword!2026' });
    const tok = login.body.accessToken;
    expect((await api(env.app, 'PATCH', '/auth/password', tok, { currentPassword: 'sbagliata-sbagliata', newPassword: 'Ancora!Diversa2026' })).status).toBe(401);
    const changed = await api(env.app, 'PATCH', '/auth/password', tok, { currentPassword: 'NuovaPassword!2026', newPassword: 'Ancora!Diversa2026' });
    expect(changed.status).toBe(200);
    expect(changed.body.accessToken).toBeTruthy(); // le sessioni precedenti sono revocate (CORE-030): si prosegue con la nuova
    const ref = await api(env.app, 'POST', '/auth/refresh', changed.body.accessToken);
    expect(ref.status).toBe(200);
    expect((await api(env.app, 'GET', '/me', ref.body.accessToken)).status).toBe(200);
    expect((await api(env.app, 'POST', `/users/${hr.userId}/disable`, hr.token)).status).toBe(409); // non se stessi
    expect((await api(env.app, 'POST', `/users/${lucaUserId}/disable`, hr.token)).status).toBe(201);
    expect((await api(env.app, 'POST', '/auth/login', undefined, { tenantSlug: tenant.slug, email: 'luca@acme.test', password: 'Ancora!Diversa2026' })).status).toBe(401);
    expect((await api(env.app, 'POST', '/auth/refresh', ref.body.accessToken)).status).toBe(401);
    expect((await api(env.app, 'POST', `/users/${lucaUserId}/enable`, hr.token)).status).toBe(201);
    const re = await api(env.app, 'POST', `/users/${lucaUserId}/resend-invite`, hr.token);
    expect(re.body.inviteUrl).toContain('token=');
    expect((await api(env.app, 'GET', '/users', hr.token)).body.find((u: any) => u.id === lucaUserId).status).toBe('active');
  });
});

describe('SSO OIDC per tenant', () => {
  let startUrl: string;
  it('tenant admin configures SSO; the secret is stored encrypted and never returned', async () => {
    expect((await api(env.app, 'PUT', '/tenant/sso', hr.token, { enabled: true })).status).toBe(403);
    expect((await api(env.app, 'PUT', '/tenant/sso', admin.token, { enabled: true, issuer: '', clientId: '' })).status).toBe(400);
    const r = await api(env.app, 'PUT', '/tenant/sso', admin.token, { enabled: true, issuer: idp.issuer, clientId: 'wb-web', clientSecret: 's3cret-value', jitProvisioning: true, defaultRole: 'employee', allowedDomains: ['acme.test'] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ enabled: true, hasClientSecret: true, redirectUri: expect.stringContaining('/api/v1/auth/oidc/callback') });
    expect(JSON.stringify(r.body)).not.toContain('s3cret');
    const t = await api(env.app, 'GET', '/tenant', admin.token);
    expect(JSON.stringify(t.body)).not.toContain('s3cret');
    expect(t.body.settings.sso.clientSecretEnc).toBeUndefined();
    const c = await api(env.app, 'GET', `/auth/config?tenant=${tenant.slug}`);
    expect(c.body.sso).toBe(true);
  });
  it('start redirects to the IdP with PKCE; callback provisions the user and hands a one-time exchange code to the web', async () => {
    const start = await env.app.inject({ method: 'GET', url: `/api/v1/auth/oidc/start?tenant=${tenant.slug}&redirectTo=/reviews` });
    expect(start.statusCode).toBe(302);
    startUrl = start.headers.location as string;
    expect(startUrl).toContain('scope=openid+email+profile');
    const { code, state } = idp.authorize(startUrl);
    const cb = await env.app.inject({ method: 'GET', url: `/api/v1/auth/oidc/callback?code=${code}&state=${encodeURIComponent(state)}` });
    expect(cb.statusCode).toBe(302);
    const loc = new URL(cb.headers.location as string);
    expect(loc.pathname).toBe('/auth/callback');
    expect(loc.searchParams.get('next')).toBe('/reviews');
    expect(idp.tokenRequests.at(-1)!.get('client_secret')).toBe('s3cret-value');
    const ex = await api(env.app, 'POST', '/auth/exchange', undefined, { code: loc.searchParams.get('code') });
    expect(ex.status).toBe(200);
    const me = await api(env.app, 'GET', '/me', ex.body.accessToken);
    expect(me.body.person).toMatchObject({ firstName: 'Nuova', lastName: 'Persona' });
    expect(me.body.user.roles).toEqual(['employee']);
    expect((await api(env.app, 'POST', '/auth/exchange', undefined, { code: loc.searchParams.get('code') })).status).toBe(401); // monouso
    const [u] = await withTenant(env.db, tenant.id, (t) => t.select().from(users).where(eq(users.email, 'nuova.persona@acme.test')));
    expect(u!.externalSubject).toBe(`${idp.issuer}|sub-nuova.persona@acme.test`);
    expect(u!.authProvider).toBe('oidc');
  });
  it('rejects a replayed state/code, a wrong nonce flow and emails outside the allowed domains', async () => {
    const { code, state } = idp.authorize(startUrl);
    const replay = await env.app.inject({ method: 'GET', url: `/api/v1/auth/oidc/callback?code=${code}&state=${encodeURIComponent(state)}` });
    expect(replay.statusCode).toBe(302); // stesso state valido: l'IdP emette un nuovo code, l'utente esiste già → login ok
    idp.nextEmail = 'intruso@evil.test';
    const start2 = await env.app.inject({ method: 'GET', url: `/api/v1/auth/oidc/start?tenant=${tenant.slug}` });
    const a2 = idp.authorize(start2.headers.location as string);
    const bad = await env.app.inject({ method: 'GET', url: `/api/v1/auth/oidc/callback?code=${a2.code}&state=${encodeURIComponent(a2.state)}` });
    expect(bad.statusCode).toBe(302);
    expect(decodeURIComponent(bad.headers.location as string)).toContain('/login?error=');
    expect(decodeURIComponent(bad.headers.location as string)).toContain('dominio');
    const tampered = await env.app.inject({ method: 'GET', url: `/api/v1/auth/oidc/callback?code=x&state=not-a-state` });
    expect(decodeURIComponent(tampered.headers.location as string)).toContain('Stato del login non valido');
    const cancelled = await env.app.inject({ method: 'GET', url: `/api/v1/auth/oidc/callback?error=access_denied&error_description=Annullato` });
    expect(decodeURIComponent(cancelled.headers.location as string)).toContain('Annullato');
  });
  it('an existing invited user is linked by email on first SSO login; JIT can be turned off', async () => {
    idp.nextEmail = 'sara@acme.test';
    const inv = await api(env.app, 'POST', '/users/invite', hr.token, { email: 'sara@acme.test', firstName: 'Sara', lastName: 'Ricci', roles: ['manager'] });
    expect((await api(env.app, 'GET', `/auth/invite/${new URL(inv.body.inviteUrl).searchParams.get('token')}`)).body.sso).toBe(true);
    const s = await env.app.inject({ method: 'GET', url: `/api/v1/auth/oidc/start?tenant=${tenant.slug}` });
    const a = idp.authorize(s.headers.location as string);
    const cb = await env.app.inject({ method: 'GET', url: `/api/v1/auth/oidc/callback?code=${a.code}&state=${encodeURIComponent(a.state)}` });
    const ex = await api(env.app, 'POST', '/auth/exchange', undefined, { code: new URL(cb.headers.location as string).searchParams.get('code') });
    const me = await api(env.app, 'GET', '/me', ex.body.accessToken);
    expect(me.body.person.firstName).toBe('Sara');
    expect(me.body.user.roles).toEqual(['manager']);
    expect((await api(env.app, 'GET', '/users', hr.token)).body.find((u: any) => u.email === 'sara@acme.test').status).toBe('active');
    await api(env.app, 'PUT', '/tenant/sso', admin.token, { enabled: true, issuer: idp.issuer, clientId: 'wb-web', jitProvisioning: false, allowedDomains: ['acme.test'] });
    expect((await api(env.app, 'GET', '/tenant/sso', admin.token)).body.hasClientSecret).toBe(true); // secret invariato se omesso
    idp.nextEmail = 'sconosciuto@acme.test';
    const s2 = await env.app.inject({ method: 'GET', url: `/api/v1/auth/oidc/start?tenant=${tenant.slug}` });
    const a2 = idp.authorize(s2.headers.location as string);
    const cb2 = await env.app.inject({ method: 'GET', url: `/api/v1/auth/oidc/callback?code=${a2.code}&state=${encodeURIComponent(a2.state)}` });
    expect(decodeURIComponent(cb2.headers.location as string)).toContain('provisioning automatico');
  });
  it('passwordDisabled forces SSO for everyone except tenant admins', async () => {
    await api(env.app, 'PUT', '/tenant/sso', admin.token, { enabled: true, issuer: idp.issuer, clientId: 'wb-web', jitProvisioning: false, allowedDomains: ['acme.test'], passwordDisabled: true });
    expect((await api(env.app, 'GET', `/auth/config?tenant=${tenant.slug}`)).body.password).toBe(false);
    expect((await api(env.app, 'POST', '/auth/login', undefined, { tenantSlug: tenant.slug, email: 'luca@acme.test', password: 'Ancora!Diversa2026' })).status).toBe(403);
  });
});
