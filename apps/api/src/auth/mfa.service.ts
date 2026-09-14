import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { users, verifyPassword, withTenant, type AnyDb, type TenantTx } from '@wb/db';
import { ErrorCodes } from '@wb/shared';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { TenantCipher } from '../common/crypto.js';
import { AppError, unprocessable } from '../common/errors.js';
import { CONFIG, type AppConfig } from '../config.js';
import { DB } from '../db/db.module.js';
import { TokenService } from './token.service.js';

type UserRow = typeof users.$inferSelect;
const ISSUER = 'WorkingBetter';
const RECOVERY_CODES = 8;
const CHALLENGE_TTL = 300; // 5 minuti per inserire il codice
const hash = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Verifica in due passaggi con TOTP (RFC 6238) e codici di recupero (CORE-030).
 * Il segreto è cifrato con la chiave del tenant (stessa primitiva delle note private); i codici di recupero sono salvati come hash.
 * Il login SSO delega l'MFA all'identity provider e non passa da qui.
 */
@Injectable()
export class MfaService {
  private readonly cipher: TenantCipher;
  constructor(@Inject(CONFIG) private readonly cfg: AppConfig, @Inject(DB) private readonly db: AnyDb, private readonly tokens: TokenService) {
    this.cipher = new TenantCipher(cfg.NOTES_MASTER_KEY);
  }

  private requireCipher() {
    if (!this.cipher.enabled) throw new AppError(HttpStatus.SERVICE_UNAVAILABLE, ErrorCodes.UPSTREAM, 'MFA non disponibile', 'Configura NOTES_MASTER_KEY per abilitare la verifica in due passaggi');
  }
  private totp(secret: string, label: string) {
    return new OTPAuth.TOTP({ issuer: ISSUER, label, algorithm: 'SHA1', digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) });
  }
  private check(secret: string, code: string): boolean {
    return this.totp(secret, 'x').validate({ token: code.replace(/\s+/g, ''), window: 1 }) !== null;
  }

  async status(tx: TenantTx, userId: string, roles: string[], requiredRoles: string[]) {
    const [u] = await tx.select({ enabledAt: users.mfaEnabledAt, pending: users.mfaPendingSecretEnc, codes: users.mfaRecoveryHashes }).from(users).where(eq(users.id, userId));
    const required = roles.some((r) => requiredRoles.includes(r));
    return { enabled: !!u?.enabledAt, enabledAt: u?.enabledAt ?? null, pending: !!u?.pending, recoveryCodesLeft: ((u?.codes as string[] | null) ?? []).length, requiredForRole: required, setupRequired: required && !u?.enabledAt, available: this.cipher.enabled };
  }

  /** Genera un segreto in attesa di conferma: restituisce URI otpauth e QR (SVG) da inquadrare con l'app di autenticazione. */
  async enroll(tx: TenantTx, user: { id: string; tenantId: string }) {
    this.requireCipher();
    const [row] = await tx.select({ email: users.email }).from(users).where(eq(users.id, user.id));
    const secret = new OTPAuth.Secret({ size: 20 });
    await tx.update(users).set({ mfaPendingSecretEnc: this.cipher.encrypt(user.tenantId, secret.base32), updatedAt: new Date() }).where(eq(users.id, user.id));
    const uri = this.totp(secret.base32, row?.email ?? 'utente').toString();
    const qrSvg = await QRCode.toString(uri, { type: 'svg', margin: 1, width: 200 });
    return { secret: secret.base32, otpauthUrl: uri, qrSvg };
  }

  /** Conferma con un codice valido: attiva l'MFA e restituisce i codici di recupero (mostrati una sola volta). */
  async confirm(tx: TenantTx, user: { id: string; tenantId: string }, code: string) {
    this.requireCipher();
    const [u] = await tx.select().from(users).where(eq(users.id, user.id));
    if (!u?.mfaPendingSecretEnc) throw unprocessable(ErrorCodes.VALIDATION, 'Nessuna attivazione in corso: richiedi prima il QR');
    const secret = this.cipher.decrypt(user.tenantId, u.mfaPendingSecretEnc);
    if (!this.check(secret, code)) throw new AppError(HttpStatus.UNAUTHORIZED, ErrorCodes.UNAUTHENTICATED, 'Codice non valido', 'Controlla l’ora del dispositivo e riprova');
    const codes = Array.from({ length: RECOVERY_CODES }, () => randomBytes(5).toString('hex').replace(/(.{5})/, '$1-'));
    await tx.update(users).set({ mfaSecretEnc: u.mfaPendingSecretEnc, mfaPendingSecretEnc: null, mfaEnabledAt: new Date(), mfaRecoveryHashes: codes.map(hash), updatedAt: new Date() }).where(eq(users.id, user.id));
    return { enabled: true, recoveryCodes: codes };
  }

  /** Nuovi codici di recupero (invalidano i precedenti); richiede un codice TOTP valido. */
  async regenerateRecovery(tx: TenantTx, user: { id: string; tenantId: string }, code: string) {
    const [u] = await tx.select().from(users).where(eq(users.id, user.id));
    if (!u?.mfaSecretEnc) throw unprocessable(ErrorCodes.VALIDATION, 'MFA non attiva');
    if (!this.check(this.cipher.decrypt(user.tenantId, u.mfaSecretEnc), code)) throw new AppError(HttpStatus.UNAUTHORIZED, ErrorCodes.UNAUTHENTICATED, 'Codice non valido');
    const codes = Array.from({ length: RECOVERY_CODES }, () => randomBytes(5).toString('hex').replace(/(.{5})/, '$1-'));
    await tx.update(users).set({ mfaRecoveryHashes: codes.map(hash), updatedAt: new Date() }).where(eq(users.id, user.id));
    return { recoveryCodes: codes };
  }

  /** Disattiva l'MFA: serve la password corrente (o un codice valido se l'utente non ha password, es. SSO). */
  async disable(tx: TenantTx, user: { id: string; tenantId: string }, password: string, code?: string) {
    const [u] = await tx.select().from(users).where(eq(users.id, user.id));
    if (!u?.mfaSecretEnc) return { enabled: false };
    const ok = u.passwordHash ? verifyPassword(password, u.passwordHash) : !!code && this.check(this.cipher.decrypt(user.tenantId, u.mfaSecretEnc), code);
    if (!ok) throw new AppError(HttpStatus.UNAUTHORIZED, ErrorCodes.UNAUTHENTICATED, 'Verifica non riuscita', 'Password o codice non corretti');
    await tx.update(users).set({ mfaSecretEnc: null, mfaPendingSecretEnc: null, mfaEnabledAt: null, mfaRecoveryHashes: null, updatedAt: new Date() }).where(eq(users.id, user.id));
    return { enabled: false };
  }

  // ---------- login in due passaggi ----------

  /** Al posto della sessione: una sfida firmata (5 minuti) da restituire con il codice. */
  async challenge(user: UserRow) {
    const challenge = await this.tokens.signState({ kind: 'mfa', sub: user.id, tenant_id: user.tenantId }, CHALLENGE_TTL);
    return { mfaRequired: true as const, challenge, expiresIn: CHALLENGE_TTL };
  }

  /** Verifica codice TOTP o codice di recupero (consumato); restituisce l'utente se ok. */
  async verifyChallenge(challenge: string, code: string): Promise<UserRow> {
    let st: { kind?: string; sub?: string; tenant_id?: string };
    try {
      st = await this.tokens.verifyState(challenge);
    } catch {
      throw new AppError(HttpStatus.UNAUTHORIZED, ErrorCodes.UNAUTHENTICATED, 'Sfida scaduta', 'Ricomincia l’accesso');
    }
    if (st.kind !== 'mfa' || !st.sub || !st.tenant_id) throw new AppError(HttpStatus.UNAUTHORIZED, ErrorCodes.UNAUTHENTICATED, 'Sfida non valida');
    const tenantId = st.tenant_id;
    const userId = st.sub;
    return withTenant(this.db, tenantId, async (tx) => {
      const [u] = await tx.select().from(users).where(eq(users.id, userId));
      if (!u || u.disabledAt || !u.mfaSecretEnc) throw new AppError(HttpStatus.UNAUTHORIZED, ErrorCodes.UNAUTHENTICATED, 'Sfida non valida');
      if (u.lockedUntil && u.lockedUntil > new Date()) throw new AppError(HttpStatus.TOO_MANY_REQUESTS, ErrorCodes.RATE_LIMITED, 'Account temporaneamente bloccato', 'Troppi tentativi: riprova più tardi');
      const clean = code.trim().toLowerCase();
      const recovery = (u.mfaRecoveryHashes as string[] | null) ?? [];
      const h = hash(clean);
      if (recovery.includes(h)) {
        await tx.update(users).set({ mfaRecoveryHashes: recovery.filter((x) => x !== h), updatedAt: new Date() }).where(eq(users.id, u.id));
        return u;
      }
      if (this.check(this.cipher.decrypt(tenantId, u.mfaSecretEnc), clean)) return u;
      const failed = u.failedLogins + 1;
      await tx.update(users).set({ failedLogins: failed, lockedUntil: failed >= 5 ? new Date(Date.now() + 15 * 60000) : null, updatedAt: new Date() }).where(eq(users.id, u.id));
      throw new AppError(HttpStatus.UNAUTHORIZED, ErrorCodes.UNAUTHENTICATED, 'Codice non valido');
    });
  }

  /** Ruoli per cui il tenant richiede l'MFA (settings.security.mfaRequiredRoles). */
  requiredRoles(settings: unknown): string[] {
    const sec = (settings as { security?: { mfaRequiredRoles?: unknown } } | null)?.security;
    return Array.isArray(sec?.mfaRequiredRoles) ? (sec!.mfaRequiredRoles as string[]) : [];
  }
}
