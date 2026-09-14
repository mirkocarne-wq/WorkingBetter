import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { hashPassword, users } from '@wb/db';
import * as OTPAuth from 'otpauth';
import { api, createTestEnv, type TestEnv } from './helpers.js';

let env: TestEnv;
let tenant: { id: string; slug: string };
let admin: { userId: string; personId: string; token: string };
let luca: { userId: string; personId: string; token: string };
let secret: string;
let recovery: string[];
const code = (s: string) => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(s), digits: 6, period: 30 }).generate();

beforeAll(async () => {
  env = await createTestEnv();
  tenant = await env.createTenant('Acme MFA');
  admin = await env.createUser(tenant.id, 'admin@mfa.test', ['tenant_admin'], { firstName: 'Anna', lastName: 'Colombo' });
  luca = await env.createUser(tenant.id, 'luca@mfa.test', ['employee'], { firstName: 'Luca', lastName: 'Bianchi' });
  await env.db.update(users).set({ passwordHash: hashPassword('Password!2026') }).where(eq(users.id, luca.userId));
});
afterAll(() => env.close());

describe('verifica in due passaggi (CORE-030)', () => {
  it('enrolment: QR + segreto, conferma con un codice valido, codici di recupero una sola volta', async () => {
    const st = await api(env.app, 'GET', '/auth/mfa', luca.token);
    expect(st.body).toMatchObject({ enabled: false, pending: false, available: true });
    expect((await api(env.app, 'POST', '/auth/mfa/confirm', luca.token, { code: '123456' })).status).toBe(422);
    const en = await api(env.app, 'POST', '/auth/mfa/enroll', luca.token);
    expect(en.status).toBe(200);
    expect(en.body.otpauthUrl).toContain('otpauth://totp/WorkingBetter:luca%40mfa.test');
    expect(en.body.qrSvg).toContain('<svg');
    secret = en.body.secret;
    expect((await api(env.app, 'POST', '/auth/mfa/confirm', luca.token, { code: '000000' })).status).toBe(401);
    const ok = await api(env.app, 'POST', '/auth/mfa/confirm', luca.token, { code: code(secret) });
    expect(ok.status).toBe(200);
    expect(ok.body.recoveryCodes).toHaveLength(8);
    recovery = ok.body.recoveryCodes;
    const after = await api(env.app, 'GET', '/auth/mfa', luca.token);
    expect(after.body.enabled).toBe(true);
    expect(after.body.recoveryCodesLeft).toBe(8);
    const [row] = await env.db.select().from(users).where(eq(users.id, luca.userId));
    expect(row!.mfaSecretEnc).not.toContain(secret); // cifrato a riposo
  });

  it('login: la password da sola restituisce una sfida; il codice TOTP o di recupero completa l’accesso', async () => {
    const first = await api(env.app, 'POST', '/auth/login', undefined, { tenantSlug: tenant.slug, email: 'luca@mfa.test', password: 'Password!2026' });
    expect(first.status).toBe(200);
    expect(first.body.mfaRequired).toBe(true);
    expect(first.body.accessToken).toBeUndefined();
    const bad = await api(env.app, 'POST', '/auth/mfa/verify', undefined, { challenge: first.body.challenge, code: '000000' });
    expect(bad.status).toBe(401);
    const good = await api(env.app, 'POST', '/auth/mfa/verify', undefined, { challenge: first.body.challenge, code: code(secret) });
    expect(good.status).toBe(200);
    expect(good.body.accessToken).toBeTruthy();
    expect((await api(env.app, 'GET', '/me', good.body.accessToken)).status).toBe(200);
    // codice di recupero: vale una volta sola
    const again = await api(env.app, 'POST', '/auth/login', undefined, { tenantSlug: tenant.slug, email: 'luca@mfa.test', password: 'Password!2026' });
    expect((await api(env.app, 'POST', '/auth/mfa/verify', undefined, { challenge: again.body.challenge, code: recovery[0]! })).status).toBe(200);
    const third = await api(env.app, 'POST', '/auth/login', undefined, { tenantSlug: tenant.slug, email: 'luca@mfa.test', password: 'Password!2026' });
    expect((await api(env.app, 'POST', '/auth/mfa/verify', undefined, { challenge: third.body.challenge, code: recovery[0]! })).status).toBe(401);
    expect((await api(env.app, 'GET', '/auth/mfa', luca.token)).body.recoveryCodesLeft).toBe(7);
    expect((await api(env.app, 'POST', '/auth/mfa/verify', undefined, { challenge: 'non-una-sfida', code: '123456' })).status).toBe(401);
  });

  it('rigenera i codici di recupero e disattiva con la password', async () => {
    const regen = await api(env.app, 'POST', '/auth/mfa/recovery-codes', luca.token, { code: code(secret) });
    expect(regen.status).toBe(200);
    expect(regen.body.recoveryCodes).toHaveLength(8);
    expect((await api(env.app, 'POST', '/auth/mfa/disable', luca.token, { password: 'sbagliata' })).status).toBe(401);
    expect((await api(env.app, 'POST', '/auth/mfa/disable', luca.token, { password: 'Password!2026' })).body.enabled).toBe(false);
    const plain = await api(env.app, 'POST', '/auth/login', undefined, { tenantSlug: tenant.slug, email: 'luca@mfa.test', password: 'Password!2026' });
    expect(plain.body.accessToken).toBeTruthy();
  });

  it('policy del tenant: MFA obbligatoria per ruolo segnala setupRequired', async () => {
    expect((await api(env.app, 'PUT', '/tenant/security', luca.token, { mfaRequiredRoles: ['employee'] })).status).toBe(403);
    const put = await api(env.app, 'PUT', '/tenant/security', admin.token, { mfaRequiredRoles: ['tenant_admin', 'hr_admin'] });
    expect(put.status).toBe(200);
    expect((await api(env.app, 'GET', '/auth/mfa', admin.token)).body).toMatchObject({ requiredForRole: true, setupRequired: true });
    expect((await api(env.app, 'GET', '/auth/mfa', luca.token)).body.requiredForRole).toBe(false);
    await env.db.update(users).set({ passwordHash: hashPassword('Password!2026') }).where(eq(users.id, admin.userId));
    const login = await api(env.app, 'POST', '/auth/login', undefined, { tenantSlug: tenant.slug, email: 'admin@mfa.test', password: 'Password!2026' });
    expect(login.body.mfaSetupRequired).toBe(true);
  });
});
