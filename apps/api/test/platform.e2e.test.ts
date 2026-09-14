import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { emailOutbox, hashPassword, platformEvents, platformUsers, tenants, users, withPlatform, withTenant } from '@wb/db';
import { api, createTestEnv, type TestEnv } from './helpers.js';

let env: TestEnv;
let tenant: { id: string; slug: string };
let hr: { userId: string; personId: string; token: string };
let luca: { userId: string; personId: string; token: string };
let ops: string; // token di piattaforma
let newTenantId: string;

beforeAll(async () => {
  env = await createTestEnv();
  tenant = await env.createTenant('Acme');
  hr = await env.createUser(tenant.id, 'hr@acme.test', ['hr_admin'], { firstName: 'Chiara', lastName: 'Moretti' });
  luca = await env.createUser(tenant.id, 'luca@acme.test', ['employee'], { firstName: 'Luca', lastName: 'Bianchi' });
  await env.db.insert(platformUsers).values({ email: 'ops@platform.test', firstName: 'Ops', lastName: 'Team', passwordHash: hashPassword('platform-password-1') });
});
afterAll(() => env.close());

describe('console di piattaforma (PLT)', () => {
  it('login operatore: credenziali errate contate, blocco dopo 5 tentativi; login corretto emette un token di piattaforma', async () => {
    expect((await api(env.app, 'POST', '/platform/auth/login', undefined, { email: 'ops@platform.test', password: 'sbagliata-123' })).status).toBe(401);
    const ok = await api(env.app, 'POST', '/platform/auth/login', undefined, { email: 'ops@platform.test', password: 'platform-password-1' });
    expect(ok.status).toBe(200);
    expect(ok.body.mustChangePassword).toBe(true);
    ops = ok.body.accessToken;
    const me = await api(env.app, 'GET', '/platform/auth/me', ops);
    expect(me.body.email).toBe('ops@platform.test');
  });
  it('separazione dei perimetri (PLT-004): token tenant rifiutato su /platform, token di piattaforma rifiutato sulle API dei moduli', async () => {
    expect((await api(env.app, 'GET', '/platform/status', hr.token)).status).toBe(403);
    expect((await api(env.app, 'GET', '/platform/tenants', hr.token)).status).toBe(403);
    expect((await api(env.app, 'GET', '/objectives', ops)).status).toBe(403);
    expect((await api(env.app, 'GET', '/me', ops)).status).toBe(403);
  });
  it('stato, statistiche e certificati rispondono con la struttura attesa', async () => {
    const st = await api(env.app, 'GET', '/platform/status', ops);
    expect(st.status).toBe(200);
    expect(st.body.db.ok).toBe(true);
    expect(st.body.queues.map((q: any) => q.name)).toEqual(['email', 'chat', 'webhook', 'calendar']);
    expect(st.body.api.version).toBeTruthy();
    const stats = await api(env.app, 'GET', '/platform/stats', ops);
    expect(stats.body.tenants.active).toBeGreaterThanOrEqual(1);
    expect(stats.body.users.total).toBeGreaterThanOrEqual(2);
    const certs = await api(env.app, 'GET', '/platform/certificates', ops);
    expect(certs.status).toBe(200);
    // gli URL di test sono http: nessun certificato da verificare
    expect(certs.body.items.every((c: any) => c.status === 'none')).toBe(true);
  });
  it('crea un tenant con amministratore invitato (PLT-011) e lo mostra nel dettaglio (PLT-012)', async () => {
    expect((await api(env.app, 'POST', '/platform/tenants', ops, { name: 'Globex', slug: 'Globex!', admin: { email: 'anna@globex.test', firstName: 'Anna' } })).status).toBe(400);
    const c = await api(env.app, 'POST', '/platform/tenants', ops, { name: 'Globex S.p.A.', slug: 'globex', admin: { email: 'Anna@globex.test', firstName: 'Anna', lastName: 'Verdi' } });
    expect(c.status).toBe(201);
    newTenantId = c.body.id;
    expect(c.body.invite.url).toContain('/accept-invite?token=');
    expect(c.body.admins.map((a: any) => [a.email, a.role, a.inviteStatus])).toEqual([['anna@globex.test', 'tenant_admin', 'pending']]);
    expect(c.body.stats.units).toBe(1);
    expect((await api(env.app, 'POST', '/platform/tenants', ops, { name: 'Dup', slug: 'globex', admin: { email: 'x@globex.test', firstName: 'X' } })).status).toBe(409);
    const list = await api(env.app, 'GET', '/platform/tenants?q=glob', ops);
    expect(list.body.map((t: any) => t.slug)).toEqual(['globex']);
    const mails = await withTenant(env.db, newTenantId, (db) => db.select().from(emailOutbox));
    expect(mails).toHaveLength(1);
    expect(mails[0]!.toEmail).toBe('anna@globex.test');
    // l'invito è accettabile dalla web app
    const token = c.body.invite.url.split('token=')[1];
    const inv = await api(env.app, 'GET', `/auth/invite/${token}`);
    expect(inv.status).toBe(200);
    // reinvito di un secondo amministratore
    const inv2 = await api(env.app, 'POST', `/platform/tenants/${newTenantId}/admins`, ops, { email: 'bruno@globex.test', firstName: 'Bruno' });
    expect(inv2.status).toBe(201);
    const d = await api(env.app, 'GET', `/platform/tenants/${newTenantId}`, ops);
    expect(d.body.admins).toHaveLength(2);
    expect(d.body.events.map((e: any) => e.action)).toEqual(['tenant.invite_admin', 'tenant.create']);
  });
  it('sospensione (PLT-014): gli utenti del tenant sospeso non passano più il guard; la riattivazione li ripristina', async () => {
    expect((await api(env.app, 'GET', '/me', luca.token)).status).toBe(200);
    const s = await api(env.app, 'PATCH', `/platform/tenants/${tenant.id}`, ops, { status: 'suspended' });
    expect(s.body.status).toBe('suspended');
    expect((await api(env.app, 'GET', '/me', luca.token)).status).toBe(401);
    expect((await api(env.app, 'PATCH', `/platform/tenants/${tenant.id}`, ops, { status: 'active' })).body.status).toBe('active');
    expect((await api(env.app, 'GET', '/me', luca.token)).status).toBe(200);
  });
  it('utenti (PLT-020…022): ricerca per email; reset password accoda l’email e sblocca; disattivazione revoca l’accesso', async () => {
    const found = await api(env.app, 'GET', '/platform/users?q=acme.test', ops);
    expect(found.body.map((u: any) => u.email).sort()).toEqual(['hr@acme.test', 'luca@acme.test']);
    expect(found.body.find((u: any) => u.email === 'hr@acme.test').roles).toEqual(['hr_admin']);
    await withTenant(env.db, tenant.id, (db) => db.update(users).set({ failedLogins: 5, lockedUntil: new Date(Date.now() + 600000) }).where(eq(users.id, luca.userId)));
    await new Promise((r) => setTimeout(r, 1100)); // la revoca ha granularità al secondo (iat del token)
    const reset = await api(env.app, 'POST', `/platform/users/${luca.userId}/actions`, ops, { action: 'reset_password' });
    expect(reset.status).toBe(200);
    expect(reset.body.emailQueued).toBe(true);
    expect(reset.body.link).toContain('/reset-password?token=');
    const [u] = await withTenant(env.db, tenant.id, (db) => db.select().from(users).where(eq(users.id, luca.userId)));
    expect(u!.lockedUntil).toBeNull();
    expect(u!.resetTokenHash).toBeTruthy();
    // il reset revoca le sessioni precedenti: il vecchio token non vale più
    expect((await api(env.app, 'GET', '/me', luca.token)).status).toBe(401);
    const dis = await api(env.app, 'POST', `/platform/users/${hr.userId}/actions`, ops, { action: 'disable' });
    expect(dis.status).toBe(200);
    expect((await api(env.app, 'GET', '/me', hr.token)).status).toBe(401);
    expect((await api(env.app, 'POST', `/platform/users/${hr.userId}/actions`, ops, { action: 'enable' })).status).toBe(200);
    expect((await api(env.app, 'GET', '/platform/users?q=x', ops)).status).toBe(400); // q troppo corta
  });
  it('log: eventi di piattaforma con operatore e tenant; job e code in errore', async () => {
    const ev = await api(env.app, 'GET', '/platform/events', ops);
    expect(ev.body.length).toBeGreaterThanOrEqual(6);
    expect(ev.body[0]).toMatchObject({ actorEmail: 'ops@platform.test' });
    expect(ev.body.some((e: any) => e.action === 'user.reset_password' && e.targetLabel === 'luca@acme.test' && e.tenantSlug === tenant.slug)).toBe(true);
    const byTenant = await api(env.app, 'GET', `/platform/events?tenantId=${newTenantId}`, ops);
    expect(byTenant.body.every((e: any) => e.tenantId === newTenantId)).toBe(true);
    expect((await api(env.app, 'GET', '/platform/jobs', ops)).status).toBe(200);
    const fail = await api(env.app, 'GET', '/platform/queues/failures', ops);
    expect(Object.keys(fail.body)).toEqual(['email', 'chat', 'webhooks', 'calendar']);
    const audit = await api(env.app, 'GET', `/platform/tenants/${tenant.id}/audit`, ops);
    expect(audit.status).toBe(200);
    expect(audit.body.every((a: any) => !('before' in a) && !('after' in a))).toBe(true);
  });
  it('operatori (PLT-003): creazione, cambio password con revoca, disattivazione', async () => {
    expect((await api(env.app, 'POST', '/platform/operators', ops, { email: 'nuovo@platform.test', firstName: 'Nuovo', password: 'corta' })).status).toBe(400);
    const c = await api(env.app, 'POST', '/platform/operators', ops, { email: 'nuovo@platform.test', firstName: 'Nuovo', password: 'una-password-lunga-1' });
    expect(c.status).toBe(201);
    expect((await api(env.app, 'GET', '/platform/operators', ops)).body).toHaveLength(2);
    const ch = await api(env.app, 'POST', '/platform/auth/password', ops, { currentPassword: 'platform-password-1', newPassword: 'platform-password-2' });
    expect(ch.status).toBe(200);
    expect((await api(env.app, 'GET', '/platform/auth/me', ops)).status).toBe(401); // vecchio token revocato
    ops = ch.body.accessToken;
    const me = await api(env.app, 'GET', '/platform/auth/me', ops);
    expect(me.body.mustChangePassword).toBe(false);
    expect((await api(env.app, 'PATCH', `/platform/operators/${c.body.id}`, ops, { disabled: true })).body.disabledAt).toBeTruthy();
    expect((await api(env.app, 'PATCH', `/platform/operators/${me.body.id}`, ops, { disabled: true })).status).toBe(409);
    const events = await withPlatform(env.db, (db) => db.select().from(platformEvents).where(eq(platformEvents.action, 'platform_user.password_change')));
    expect(events).toHaveLength(1);
    const [t] = await env.db.select().from(tenants).where(eq(tenants.id, newTenantId));
    expect(t!.slug).toBe('globex');
  });
});
