import { HttpStatus, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { hashPassword, hashToken, newOneTimeToken, notify, passwordPolicyError, persons, roleAssignments, tenants, users, verifyPassword, withPlatform, withTenant, type AnyDb, type TenantTx } from '@wb/db';
import { ErrorCodes } from '@wb/shared';
import { AppError, unprocessable } from '../common/errors.js';
import { TenantCipher } from '../common/crypto.js';
import { CONFIG, type AppConfig } from '../config.js';
import { DB } from '../db/db.module.js';
import { TokenService } from './token.service.js';

type UserRow = typeof users.$inferSelect;
type TenantRow = typeof tenants.$inferSelect;

/** Configurazione SSO per tenant, salvata in tenants.settings.sso (client secret cifrato). */
export interface SsoSettings {
  enabled: boolean;
  issuer: string;
  clientId: string;
  clientSecretEnc?: string | null;
  jitProvisioning: boolean;
  defaultRole: string;
  allowedDomains: string[];
  /** se true il login con password è disabilitato per il tenant (tranne tenant_admin) */
  passwordDisabled?: boolean;
}
interface Discovery { authorization_endpoint: string; token_endpoint: string; jwks_uri: string; issuer: string; end_session_endpoint?: string }
interface OidcState extends Record<string, unknown> { t: string; n: string; v: string; r: string }

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const INVITE_DAYS = 7;
const RESET_MINUTES = 60;
const EXCHANGE_TTL_MS = 60_000;

const invalidCredentials = () => new UnauthorizedException({ code: ErrorCodes.UNAUTHENTICATED, detail: 'Credenziali non valide' });

@Injectable()
export class AuthService {
  private readonly cipher: TenantCipher;
  private readonly discoveryCache = new Map<string, { at: number; doc: Discovery }>();
  private readonly jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
  /** codici di scambio monouso (OIDC → web): in memoria, 60 s (ADR-0007 §6) */
  private readonly exchangeCodes = new Map<string, { token: string; expiresIn: number; at: number }>();

  constructor(@Inject(CONFIG) private readonly cfg: AppConfig, @Inject(DB) private readonly db: AnyDb, private readonly tokens: TokenService) {
    this.cipher = new TenantCipher(cfg.NOTES_MASTER_KEY);
  }

  // ---------- helpers ----------

  private async tenantBySlug(slug: string): Promise<TenantRow | null> {
    const [t] = await this.db.select().from(tenants).where(eq(tenants.slug, slug.toLowerCase()));
    return t && t.status === 'active' ? t : null;
  }
  ssoOf(t: TenantRow): SsoSettings | null {
    const sso = (t.settings as Record<string, unknown>)?.sso as SsoSettings | undefined;
    return sso?.enabled && sso.issuer && sso.clientId ? sso : null;
  }
  private async rolesOf(tx: TenantTx, userId: string): Promise<string[]> {
    return (await tx.select({ role: roleAssignments.role }).from(roleAssignments).where(eq(roleAssignments.userId, userId))).map((r) => r.role);
  }
  private async issue(tx: TenantTx, user: UserRow, provider: string) {
    const roles = await this.rolesOf(tx, user.id);
    await tx.update(users).set({ lastLoginAt: new Date(), failedLogins: 0, lockedUntil: null, authProvider: provider, updatedAt: new Date() }).where(eq(users.id, user.id));
    if (user.personId) await tx.update(persons).set({ status: 'active', updatedAt: new Date() }).where(and(eq(persons.id, user.personId), eq(persons.status, 'invited')));
    const accessToken = await this.tokens.signSession({ sub: user.id, tenant_id: user.tenantId, person_id: user.personId ?? undefined, roles, email: user.email });
    return { accessToken, tokenType: 'Bearer' as const, expiresIn: this.tokens.sessionTtlSeconds, roles };
  }

  // ---------- configurazione pubblica per la pagina di login ----------

  async publicConfig(slug: string) {
    const t = await this.tenantBySlug(slug);
    if (!t) return { found: false, tenant: null, password: false, sso: false, devLogin: this.cfg.AUTH_MODE === 'dev' };
    const sso = this.ssoOf(t);
    return { found: true, tenant: { name: t.name, slug: t.slug }, password: !sso?.passwordDisabled, sso: !!sso, devLogin: this.cfg.AUTH_MODE === 'dev' };
  }

  // ---------- password ----------

  async passwordLogin(slug: string, email: string, password: string) {
    const t = await this.tenantBySlug(slug);
    if (!t) throw invalidCredentials();
    const res = await withTenant(this.db, t.id, async (tx) => {
      const [user] = await tx.select().from(users).where(and(eq(users.tenantId, t.id), eq(users.email, email.toLowerCase())));
      if (!user || user.disabledAt || !user.passwordHash) return { ok: false as const, locked: false };
      if (user.lockedUntil && user.lockedUntil > new Date()) return { ok: false as const, locked: true };
      if (!verifyPassword(password, user.passwordHash)) {
        const failed = user.failedLogins + 1;
        await tx.update(users).set({ failedLogins: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60000) : null, updatedAt: new Date() }).where(eq(users.id, user.id));
        return { ok: false as const, locked: failed >= MAX_FAILED };
      }
      const sso = this.ssoOf(t);
      const roles = await this.rolesOf(tx, user.id);
      if (sso?.passwordDisabled && !roles.includes('tenant_admin')) return { ok: false as const, locked: false, ssoOnly: true };
      return { ok: true as const, session: await this.issue(tx, user, 'password') };
    });
    if (!res.ok) {
      if ('ssoOnly' in res && res.ssoOnly) throw new AppError(HttpStatus.FORBIDDEN, ErrorCodes.FORBIDDEN, 'Accesso solo tramite SSO', 'Questo tenant richiede l’accesso con SSO aziendale');
      if (res.locked) throw new AppError(HttpStatus.TOO_MANY_REQUESTS, ErrorCodes.RATE_LIMITED, 'Account temporaneamente bloccato', `Troppi tentativi: riprova tra ${LOCK_MINUTES} minuti`);
      throw invalidCredentials();
    }
    return res.session;
  }

  /** Endpoint autenticato: usa la transazione tenant della richiesta (mai una seconda transazione annidata). */
  async changePassword(tx: TenantTx, userId: string, current: string, next: string) {
    const [user] = await tx.select().from(users).where(eq(users.id, userId));
    if (!user) throw invalidCredentials();
    if (user.passwordHash && !verifyPassword(current, user.passwordHash)) throw invalidCredentials();
    const err = passwordPolicyError(next, user.email);
    if (err) throw unprocessable(ErrorCodes.VALIDATION, err);
    await tx.update(users).set({ passwordHash: hashPassword(next), passwordUpdatedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId));
    return { ok: true };
  }

  async forgotPassword(slug: string, email: string) {
    const t = await this.tenantBySlug(slug);
    if (!t) return { accepted: true };
    await withTenant(this.db, t.id, async (tx) => {
      const [user] = await tx.select().from(users).where(and(eq(users.tenantId, t.id), eq(users.email, email.toLowerCase())));
      if (!user || user.disabledAt) return;
      const { token, hash } = newOneTimeToken();
      await tx.update(users).set({ resetTokenHash: hash, resetExpiresAt: new Date(Date.now() + RESET_MINUTES * 60000), updatedAt: new Date() }).where(eq(users.id, user.id));
      await notify(tx, { tenantId: t.id, userId: user.id, type: 'user.password_reset', force: { email: true, inApp: false }, link: `${this.cfg.APP_BASE_URL}/reset-password?token=${token}` });
    });
    return { accepted: true };
  }

  async resetPassword(token: string, password: string) {
    const hash = hashToken(token);
    const [user] = await withPlatform(this.db, (tx) => tx.select().from(users).where(eq(users.resetTokenHash, hash)));
    if (!user || !user.resetExpiresAt || user.resetExpiresAt < new Date() || user.disabledAt) throw unprocessable(ErrorCodes.VALIDATION, 'Link non valido o scaduto');
    const err = passwordPolicyError(password, user.email);
    if (err) throw unprocessable(ErrorCodes.VALIDATION, err);
    return withTenant(this.db, user.tenantId, async (tx) => {
      await tx.update(users).set({ passwordHash: hashPassword(password), passwordUpdatedAt: new Date(), resetTokenHash: null, resetExpiresAt: null, failedLogins: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(users.id, user.id));
      return this.issue(tx, user, 'password');
    });
  }

  // ---------- inviti (CORE-014) ----------

  /** Genera (o rigenera) il token di invito e accoda l'email. Va chiamato dentro la transazione tenant dell'operatore. */
  async sendInvite(tx: TenantTx, tenant: { id: string; name: string }, user: UserRow): Promise<{ inviteUrl: string | null }> {
    const { token, hash } = newOneTimeToken();
    await tx.update(users).set({ invitedAt: new Date(), inviteTokenHash: hash, inviteExpiresAt: new Date(Date.now() + INVITE_DAYS * 86400000), inviteAcceptedAt: null, updatedAt: new Date() }).where(eq(users.id, user.id));
    const link = `${this.cfg.APP_BASE_URL}/accept-invite?token=${token}`;
    await notify(tx, { tenantId: tenant.id, userId: user.id, type: 'person.invited', data: { tenantName: tenant.name, email: user.email }, force: { email: true, inApp: false }, link });
    // in sviluppo il link torna anche nella risposta, così si può provare senza posta
    return { inviteUrl: this.cfg.AUTH_MODE === 'dev' ? link : null };
  }

  async inviteInfo(token: string) {
    const [user] = await withPlatform(this.db, (tx) => tx.select().from(users).where(eq(users.inviteTokenHash, hashToken(token))));
    if (!user) return { valid: false as const };
    const [t] = await this.db.select().from(tenants).where(eq(tenants.id, user.tenantId));
    const expired = !user.inviteExpiresAt || user.inviteExpiresAt < new Date() || !!user.disabledAt;
    const [p] = user.personId ? await withPlatform(this.db, (tx) => tx.select({ firstName: persons.firstName }).from(persons).where(eq(persons.id, user.personId!))) : [];
    return { valid: !expired, expired, email: user.email, firstName: p?.firstName ?? null, tenant: t ? { name: t.name, slug: t.slug } : null, sso: t ? !!this.ssoOf(t) : false };
  }

  async acceptInvite(token: string, password: string | undefined) {
    const [user] = await withPlatform(this.db, (tx) => tx.select().from(users).where(eq(users.inviteTokenHash, hashToken(token))));
    if (!user || !user.inviteExpiresAt || user.inviteExpiresAt < new Date() || user.disabledAt) throw unprocessable(ErrorCodes.VALIDATION, 'Invito non valido o scaduto');
    const [t] = await this.db.select().from(tenants).where(eq(tenants.id, user.tenantId));
    const sso = t ? this.ssoOf(t) : null;
    if (!password && !sso) throw unprocessable(ErrorCodes.VALIDATION, 'Scegli una password');
    if (password) {
      const err = passwordPolicyError(password, user.email);
      if (err) throw unprocessable(ErrorCodes.VALIDATION, err);
    }
    return withTenant(this.db, user.tenantId, async (tx) => {
      await tx.update(users).set({ passwordHash: password ? hashPassword(password) : user.passwordHash, passwordUpdatedAt: password ? new Date() : user.passwordUpdatedAt, inviteTokenHash: null, inviteAcceptedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
      return this.issue(tx, user, password ? 'password' : 'invite');
    });
  }

  // ---------- OIDC per tenant (CORE-031) ----------

  private async discover(issuer: string): Promise<Discovery> {
    const cached = this.discoveryCache.get(issuer);
    if (cached && Date.now() - cached.at < 10 * 60000) return cached.doc;
    const res = await fetch(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`);
    if (!res.ok) throw new AppError(HttpStatus.BAD_GATEWAY, ErrorCodes.UPSTREAM, 'Identity provider non raggiungibile', `Discovery fallita (${res.status})`);
    const doc = (await res.json()) as Discovery;
    this.discoveryCache.set(issuer, { at: Date.now(), doc });
    return doc;
  }

  async oidcStart(slug: string, redirectTo = '/dashboard') {
    const t = await this.tenantBySlug(slug);
    const sso = t ? this.ssoOf(t) : null;
    if (!t || !sso) throw unprocessable(ErrorCodes.VALIDATION, 'SSO non configurato per questo tenant');
    const doc = await this.discover(sso.issuer);
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const nonce = randomBytes(16).toString('base64url');
    const state = await this.tokens.signState({ t: t.id, n: nonce, v: verifier, r: redirectTo.startsWith('/') ? redirectTo : '/dashboard' } satisfies OidcState, 600);
    const url = new URL(doc.authorization_endpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', sso.clientId);
    url.searchParams.set('redirect_uri', this.oidcRedirectUri());
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return { url: url.toString() };
  }

  oidcRedirectUri(): string {
    return `${this.cfg.API_PUBLIC_URL ?? 'http://localhost:4000'}/api/v1/auth/oidc/callback`;
  }

  /** Scambia il codice con l'IdP, verifica l'id_token, collega/crea l'utente e restituisce l'URL del web con il codice di scambio. */
  async oidcCallback(code: string, state: string): Promise<{ redirect: string }> {
    let st: OidcState;
    try {
      st = await this.tokens.verifyState<OidcState>(state);
    } catch {
      throw unprocessable(ErrorCodes.VALIDATION, 'Stato del login non valido o scaduto: riprova');
    }
    const [t] = await this.db.select().from(tenants).where(eq(tenants.id, st.t));
    const sso = t ? this.ssoOf(t) : null;
    if (!t || !sso) throw unprocessable(ErrorCodes.VALIDATION, 'SSO non configurato');
    const doc = await this.discover(sso.issuer);
    const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: this.oidcRedirectUri(), client_id: sso.clientId, code_verifier: st.v });
    if (sso.clientSecretEnc) body.set('client_secret', this.cipher.decrypt(t.id, sso.clientSecretEnc));
    const tokenRes = await fetch(doc.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    if (!tokenRes.ok) throw new AppError(HttpStatus.BAD_GATEWAY, ErrorCodes.UPSTREAM, 'Scambio del codice fallito', `L’identity provider ha risposto ${tokenRes.status}`);
    const tokens = (await tokenRes.json()) as { id_token?: string };
    if (!tokens.id_token) throw new AppError(HttpStatus.BAD_GATEWAY, ErrorCodes.UPSTREAM, 'Risposta IdP incompleta', 'id_token assente');
    let jwks = this.jwksCache.get(doc.jwks_uri);
    if (!jwks) {
      jwks = createRemoteJWKSet(new URL(doc.jwks_uri));
      this.jwksCache.set(doc.jwks_uri, jwks);
    }
    const { payload } = await jwtVerify(tokens.id_token, jwks, { issuer: doc.issuer, audience: sso.clientId });
    if (payload.nonce !== st.n) throw unprocessable(ErrorCodes.VALIDATION, 'Nonce non corrispondente');
    const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : null;
    const sub = String(payload.sub);
    if (!email) throw unprocessable(ErrorCodes.VALIDATION, 'L’identity provider non ha fornito l’email');
    if (sso.allowedDomains.length && !sso.allowedDomains.some((d) => email.endsWith(`@${d.toLowerCase()}`))) throw new AppError(HttpStatus.FORBIDDEN, ErrorCodes.FORBIDDEN, 'Dominio non ammesso', `Il dominio di ${email} non è abilitato per questo tenant`);

    const session = await withTenant(this.db, t.id, async (tx) => {
      let [user] = await tx.select().from(users).where(and(eq(users.tenantId, t.id), eq(users.externalSubject, `${doc.issuer}|${sub}`)));
      if (!user) [user] = await tx.select().from(users).where(and(eq(users.tenantId, t.id), eq(users.email, email)));
      if (!user) {
        if (!sso.jitProvisioning) throw new AppError(HttpStatus.FORBIDDEN, ErrorCodes.FORBIDDEN, 'Utente non abilitato', 'Chiedi all’HR un invito: il provisioning automatico non è attivo');
        const given = typeof payload.given_name === 'string' ? payload.given_name : null;
        const family = typeof payload.family_name === 'string' ? payload.family_name : null;
        const name = typeof payload.name === 'string' ? payload.name : email.split('@')[0]!;
        const [person] = await tx.insert(persons).values({ tenantId: t.id, firstName: given ?? name.split(' ')[0]!, lastName: family ?? name.split(' ').slice(1).join(' ') ?? '', email, status: 'active' }).returning();
        [user] = await tx.insert(users).values({ tenantId: t.id, email, personId: person!.id }).returning();
        await tx.insert(roleAssignments).values({ tenantId: t.id, userId: user!.id, role: sso.defaultRole || 'employee' });
      }
      if (user!.disabledAt) throw new AppError(HttpStatus.FORBIDDEN, ErrorCodes.FORBIDDEN, 'Utente disattivato');
      await tx.update(users).set({ externalSubject: `${doc.issuer}|${sub}`, inviteTokenHash: null, inviteAcceptedAt: user!.inviteAcceptedAt ?? (user!.invitedAt ? new Date() : null) }).where(eq(users.id, user!.id));
      return this.issue(tx, user!, 'oidc');
    });
    const exchange = randomBytes(24).toString('base64url');
    this.exchangeCodes.set(exchange, { token: session.accessToken, expiresIn: session.expiresIn, at: Date.now() });
    return { redirect: `${this.cfg.APP_BASE_URL}/auth/callback?code=${exchange}&next=${encodeURIComponent(st.r)}` };
  }

  exchange(code: string) {
    for (const [k, v] of this.exchangeCodes) if (Date.now() - v.at > EXCHANGE_TTL_MS) this.exchangeCodes.delete(k);
    const hit = this.exchangeCodes.get(code);
    if (!hit) throw invalidCredentials();
    this.exchangeCodes.delete(code);
    return { accessToken: hit.token, tokenType: 'Bearer' as const, expiresIn: hit.expiresIn };
  }

  async refresh(tx: TenantTx, userId: string) {
    const [user] = await tx.select().from(users).where(eq(users.id, userId));
    if (!user || user.disabledAt) throw invalidCredentials();
    const roles = await this.rolesOf(tx, user.id);
    const accessToken = await this.tokens.signSession({ sub: user.id, tenant_id: user.tenantId, person_id: user.personId ?? undefined, roles, email: user.email });
    return { accessToken, tokenType: 'Bearer' as const, expiresIn: this.tokens.sessionTtlSeconds, roles };
  }

  // ---------- impostazioni SSO del tenant ----------

  maskSso(t: TenantRow) {
    const sso = ((t.settings as Record<string, unknown>)?.sso as SsoSettings | undefined) ?? null;
    return sso ? { ...sso, clientSecretEnc: undefined, hasClientSecret: !!sso.clientSecretEnc, redirectUri: this.oidcRedirectUri() } : { enabled: false, issuer: '', clientId: '', hasClientSecret: false, jitProvisioning: false, defaultRole: 'employee', allowedDomains: [], passwordDisabled: false, redirectUri: this.oidcRedirectUri() };
  }
  buildSso(tenantId: string, current: SsoSettings | undefined, dto: { enabled: boolean; issuer: string; clientId: string; clientSecret?: string | null; jitProvisioning: boolean; defaultRole: string; allowedDomains: string[]; passwordDisabled: boolean }): SsoSettings {
    const clientSecretEnc = dto.clientSecret ? (this.cipher.enabled ? this.cipher.encrypt(tenantId, dto.clientSecret) : null) : dto.clientSecret === '' ? null : (current?.clientSecretEnc ?? null);
    if (dto.clientSecret && !this.cipher.enabled) throw unprocessable(ErrorCodes.VALIDATION, 'NOTES_MASTER_KEY non configurata: impossibile salvare il client secret in modo cifrato');
    return { enabled: dto.enabled, issuer: dto.issuer.replace(/\/$/, ''), clientId: dto.clientId, clientSecretEnc, jitProvisioning: dto.jitProvisioning, defaultRole: dto.defaultRole, allowedDomains: dto.allowedDomains.map((d) => d.toLowerCase().replace(/^@/, '')), passwordDisabled: dto.passwordDisabled };
  }
}
