import { Inject, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { hashPassword, passwordPolicyError, platformEvents, platformUsers, verifyPassword, withPlatform, type AnyDb } from '@wb/db';
import { ErrorCodes } from '@wb/shared';
import type { z } from 'zod';
import { CONFIG, type AppConfig } from '../config.js';
import { DB } from '../db/db.module.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { TokenService } from '../auth/token.service.js';
import { ctx, principal, tx } from '../common/context.js';
import { conflict, forbidden, unprocessable } from '../common/errors.js';
import type { changePasswordDto, createOperatorDto } from './dto.js';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

/** Operatori della console di piattaforma (PLT-001…003): login, password, gestione operatori, eventi. */
@Injectable()
export class PlatformAuthService implements OnModuleInit {
  constructor(@Inject(DB) private readonly db: AnyDb, @Inject(CONFIG) private readonly cfg: AppConfig, private readonly tokens: TokenService, private readonly guard: AuthGuard) {}

  /** PLT-002: primo operatore da variabili d'ambiente, solo se non ne esiste nessuno. */
  async onModuleInit() {
    if (!this.cfg.PLATFORM_BOOTSTRAP_EMAIL || !this.cfg.PLATFORM_BOOTSTRAP_PASSWORD) return;
    try {
      await withPlatform(this.db, async (t) => {
        const [row] = await t.select({ n: sql<number>`count(*)::int` }).from(platformUsers);
        if ((row?.n ?? 0) > 0) return;
        const email = this.cfg.PLATFORM_BOOTSTRAP_EMAIL!.toLowerCase();
        await t.insert(platformUsers).values({ email, firstName: email.split('@')[0] ?? 'Operatore', lastName: '', passwordHash: hashPassword(this.cfg.PLATFORM_BOOTSTRAP_PASSWORD!) });
        await t.insert(platformEvents).values({ action: 'platform_user.bootstrap', actorEmail: 'system', targetType: 'platform_user', targetLabel: email, details: { source: 'env' } });
      });
    } catch {
      // tabella assente (migrazioni non ancora applicate): il bootstrap riproverà al prossimo avvio
    }
  }

  async login(email: string, password: string) {
    return withPlatform(this.db, async (t) => {
      const [u] = await t.select().from(platformUsers).where(eq(platformUsers.email, email));
      if (!u || u.disabledAt) throw new UnauthorizedException('Credenziali non valide');
      if (u.lockedUntil && u.lockedUntil > new Date()) throw new UnauthorizedException('Account bloccato: riprova tra qualche minuto');
      if (!verifyPassword(password, u.passwordHash)) {
        const failed = u.failedLogins + 1;
        await t.update(platformUsers).set({ failedLogins: failed, lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60000) : null, updatedAt: new Date() }).where(eq(platformUsers.id, u.id));
        throw new UnauthorizedException(failed >= MAX_FAILED ? 'Account bloccato per 15 minuti' : 'Credenziali non valide');
      }
      await t.update(platformUsers).set({ lastLoginAt: new Date(), failedLogins: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(platformUsers.id, u.id));
      await t.insert(platformEvents).values({ action: 'platform_user.login', actorId: u.id, actorEmail: u.email, targetType: 'platform_user', targetId: u.id, targetLabel: u.email, ip: ctx().ip ?? null });
      const accessToken = await this.tokens.signSession({ sub: u.id, platform: true, roles: ['platform_admin'], email: u.email, name: `${u.firstName} ${u.lastName}`.trim() });
      return { accessToken, tokenType: 'Bearer' as const, expiresIn: this.cfg.AUTH_SESSION_TTL_HOURS * 3600, mustChangePassword: u.mustChangePassword === 1, operator: this.view(u) };
    });
  }

  async me() {
    const p = principal();
    const [u] = await tx().select().from(platformUsers).where(eq(platformUsers.id, p.userId));
    if (!u) throw new UnauthorizedException();
    return { ...this.view(u), mustChangePassword: u.mustChangePassword === 1 };
  }

  async changePassword(dto: z.infer<typeof changePasswordDto>) {
    const p = principal();
    const [u] = await tx().select().from(platformUsers).where(eq(platformUsers.id, p.userId));
    if (!u || !verifyPassword(dto.currentPassword, u.passwordHash)) throw forbidden('Password attuale errata');
    const policy = passwordPolicyError(dto.newPassword, u.email);
    if (policy) throw unprocessable(ErrorCodes.VALIDATION, policy);
    if (dto.newPassword === dto.currentPassword) throw unprocessable(ErrorCodes.VALIDATION, 'La nuova password deve essere diversa');
    await tx().update(platformUsers).set({ passwordHash: hashPassword(dto.newPassword), mustChangePassword: 0, sessionsRevokedAt: new Date(), updatedAt: new Date() }).where(eq(platformUsers.id, u.id));
    await this.event('platform_user.password_change', { targetType: 'platform_user', targetId: u.id, targetLabel: u.email });
    this.guard.forget(u.id);
    // la sessione corrente resta valida: il token viene riemesso
    const accessToken = await this.tokens.signSession({ sub: u.id, platform: true, roles: ['platform_admin'], email: u.email, name: `${u.firstName} ${u.lastName}`.trim() });
    return { accessToken, tokenType: 'Bearer' as const, expiresIn: this.cfg.AUTH_SESSION_TTL_HOURS * 3600 };
  }

  async listOperators() {
    const rows = await tx().select().from(platformUsers).orderBy(platformUsers.email);
    return rows.map((u) => this.view(u));
  }

  async createOperator(dto: z.infer<typeof createOperatorDto>) {
    const policy = passwordPolicyError(dto.password, dto.email);
    if (policy) throw unprocessable(ErrorCodes.VALIDATION, policy);
    const [existing] = await tx().select({ id: platformUsers.id }).from(platformUsers).where(eq(platformUsers.email, dto.email));
    if (existing) throw conflict(ErrorCodes.CONFLICT, 'Esiste già un operatore con questa email');
    const [u] = await tx().insert(platformUsers).values({ email: dto.email, firstName: dto.firstName, lastName: dto.lastName, passwordHash: hashPassword(dto.password), createdBy: principal().userId }).returning();
    await this.event('platform_user.create', { targetType: 'platform_user', targetId: u!.id, targetLabel: u!.email });
    return this.view(u!);
  }

  async setOperatorState(id: string, disabled: boolean) {
    const p = principal();
    if (id === p.userId && disabled) throw conflict(ErrorCodes.CONFLICT, 'Non puoi disattivare il tuo account');
    const [u] = await tx().update(platformUsers).set({ disabledAt: disabled ? new Date() : null, sessionsRevokedAt: disabled ? new Date() : undefined, updatedAt: new Date() }).where(eq(platformUsers.id, id)).returning();
    if (!u) throw conflict(ErrorCodes.CONFLICT, 'Operatore inesistente');
    await this.event(disabled ? 'platform_user.disable' : 'platform_user.enable', { targetType: 'platform_user', targetId: id, targetLabel: u.email });
    this.guard.forget(id);
    return this.view(u);
  }

  /** Registra un evento di piattaforma nella transazione corrente (PLT-033). */
  async event(action: string, input: { tenantId?: string | null; targetType?: string; targetId?: string | null; targetLabel?: string | null; details?: Record<string, unknown> }) {
    const p = principal();
    await tx().insert(platformEvents).values({ action, actorId: p.userId, actorEmail: p.email ?? null, tenantId: input.tenantId ?? null, targetType: input.targetType ?? null, targetId: input.targetId ?? null, targetLabel: input.targetLabel ?? null, details: input.details ?? {}, ip: ctx().ip ?? null });
  }

  private view(u: typeof platformUsers.$inferSelect) {
    return { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, lastLoginAt: u.lastLoginAt, disabledAt: u.disabledAt, lockedUntil: u.lockedUntil, createdAt: u.createdAt };
  }
}
