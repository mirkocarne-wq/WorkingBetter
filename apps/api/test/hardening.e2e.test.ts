import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createTestEnv, type TestEnv } from './helpers.js';

let env: TestEnv;
let tenant: { id: string; slug: string };
let hr: { userId: string; personId: string; token: string };
let luca: { userId: string; personId: string; token: string };

beforeAll(async () => {
  env = await createTestEnv();
  tenant = await env.createTenant('Acme Hardening');
  hr = await env.createUser(tenant.id, 'hr@hard.test', ['hr_admin']);
  luca = await env.createUser(tenant.id, 'luca@hard.test', ['employee'], { firstName: 'Luca', lastName: 'Bianchi' });
});
afterAll(() => env.close());

describe('rate limiting (docs/06)', () => {
  it('forgot-password accetta 5 richieste per IP in 15 minuti, poi 429 con Retry-After', async () => {
    for (let i = 0; i < 5; i++) expect((await api(env.app, 'POST', '/auth/forgot-password', undefined, { tenantSlug: tenant.slug, email: `x${i}@hard.test` })).status).toBe(202);
    const res = await env.app.inject({ method: 'POST', url: '/api/v1/auth/forgot-password', payload: { tenantSlug: tenant.slug, email: 'x@hard.test' } });
    expect(res.statusCode).toBe(429);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(JSON.parse(res.body).code).toBe('rate_limited');
    // altre rotte non sono toccate dal contatore di questa
    expect((await api(env.app, 'GET', '/auth/config?tenant=' + tenant.slug)).status).toBe(200);
  });
});

describe('revoca delle sessioni (CORE-030)', () => {
  it('logout-all invalida i token emessi prima; un token nuovo funziona', async () => {
    expect((await api(env.app, 'GET', '/me', luca.token)).status).toBe(200);
    await new Promise((r) => setTimeout(r, 1100)); // il confronto è al secondo: il token deve essere più vecchio della revoca
    const out = await api(env.app, 'POST', '/auth/logout-all', luca.token);
    expect(out.status).toBe(200);
    const after = await api(env.app, 'GET', '/me', luca.token);
    expect(after.status).toBe(401);
    expect(after.body.title).toContain('revocata');
    await new Promise((r) => setTimeout(r, 1100));
    const fresh = await env.tokenFor({ userId: luca.userId, tenantId: tenant.id, personId: luca.personId, roles: ['employee'] });
    expect((await api(env.app, 'GET', '/me', fresh)).status).toBe(200);
    luca = { ...luca, token: fresh };
  });

  it('disabling a user kills their sessions immediately; re-enabling requires a new token', async () => {
    expect((await api(env.app, 'GET', '/me', luca.token)).status).toBe(200);
    await new Promise((r) => setTimeout(r, 1100));
    expect((await api(env.app, 'POST', `/users/${luca.userId}/disable`, hr.token)).status).toBe(201);
    const res = await api(env.app, 'GET', '/me', luca.token);
    expect(res.status).toBe(401);
    expect(res.body.title).toContain('disattivato');
    await api(env.app, 'POST', `/users/${luca.userId}/enable`, hr.token);
    expect((await api(env.app, 'GET', '/me', luca.token)).status).toBe(401); // revocato dalla disattivazione
    await new Promise((r) => setTimeout(r, 1100));
    const fresh = await env.tokenFor({ userId: luca.userId, tenantId: tenant.id, personId: luca.personId, roles: ['employee'] });
    expect((await api(env.app, 'GET', '/me', fresh)).status).toBe(200);
  });

  it('changing the password revokes other sessions and returns a new one for the caller', async () => {
    const anna = await env.createUser(tenant.id, 'anna@hard.test', ['employee'], { firstName: 'Anna', lastName: 'Test' });
    const other = await env.tokenFor({ userId: anna.userId, tenantId: tenant.id, personId: anna.personId, roles: ['employee'] });
    await new Promise((r) => setTimeout(r, 1100));
    const ch = await api(env.app, 'PATCH', '/auth/password', anna.token, { currentPassword: '', newPassword: 'NuovaPassword!2026' });
    expect(ch.status).toBe(200);
    expect(ch.body.accessToken).toBeTruthy();
    expect((await api(env.app, 'GET', '/me', other)).status).toBe(401);
    expect((await api(env.app, 'GET', '/me', ch.body.accessToken)).status).toBe(200);
  });
});
