import { type CanActivate, type ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { platformUsers, tenants, users, withPlatform, type AnyDb } from '@wb/db';
import { hasPermission, type Permission } from '@wb/shared';
import { IS_PUBLIC, PERMISSIONS, PLATFORM_ONLY } from './decorators.js';
import { TokenService } from './token.service.js';
import { requestContext } from '../common/context.js';
import { DB } from '../db/db.module.js';

interface SessionState {
  disabled: boolean;
  /** secondi epoch: i token con iat precedente non valgono più */
  revokedBefore: number | null;
  at: number;
}
const CACHE_MS = 30_000;

/**
 * Autenticazione e autorizzazione (ADR-0007). Oltre alla firma del token verifica che l'utente esista,
 * non sia disattivato e che la sessione non sia stata revocata (CORE-030): la lettura è per chiave primaria
 * e viene ricordata 30 secondi per utente.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly sessions = new Map<string, SessionState>();
  private readonly tenantStatus = new Map<string, { active: boolean; at: number }>();
  constructor(private readonly reflector: Reflector, private readonly tokens: TokenService, @Inject(DB) private readonly db: AnyDb) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true;
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('Token mancante');
    let principal;
    try {
      principal = await this.tokens.verify(header.slice(7));
    } catch {
      throw new UnauthorizedException('Token non valido');
    }
    const platformRoute = !!this.reflector.getAllAndOverride<boolean>(PLATFORM_ONLY, targets);
    if (platformRoute !== !!principal.platform) throw new ForbiddenException(platformRoute ? 'Rotta riservata alla console di piattaforma' : 'Un token di piattaforma non può usare le API dei tenant');
    const state = principal.platform ? await this.platformSessionState(principal.userId) : await this.sessionState(principal.userId);
    if (state?.disabled) throw new UnauthorizedException('Utente disattivato');
    if (state?.revokedBefore != null && principal.issuedAt != null && principal.issuedAt < state.revokedBefore) throw new UnauthorizedException('Sessione revocata: accedi di nuovo');
    if (!principal.platform && !(await this.tenantActive(principal.tenantId))) throw new UnauthorizedException('Organizzazione sospesa');
    const store = requestContext.getStore();
    if (store) store.principal = principal;
    if (platformRoute) return true;
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS, targets);
    if (required?.length && !required.some((p) => hasPermission(principal.roles, p))) {
      throw new ForbiddenException(`Permesso richiesto: ${required.join(' | ')}`);
    }
    return true;
  }

  /** Stato di sessione dell'utente; null se il subject non è un utente locale (token di piattaforma). */
  private async sessionState(userId: string): Promise<SessionState | null> {
    const now = Date.now();
    const cached = this.sessions.get(userId);
    if (cached && now - cached.at < CACHE_MS) return cached;
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
    const [u] = await withPlatform(this.db, (tx) => tx.select({ disabledAt: users.disabledAt, revokedAt: users.sessionsRevokedAt }).from(users).where(eq(users.id, userId)));
    const state: SessionState = u ? { disabled: !!u.disabledAt, revokedBefore: u.revokedAt ? Math.floor(u.revokedAt.getTime() / 1000) : null, at: now } : { disabled: false, revokedBefore: null, at: now };
    this.sessions.set(userId, state);
    return state;
  }

  /** Stato di sessione di un operatore di piattaforma (ADR-0013): disattivazione e revoca. */
  private async platformSessionState(id: string): Promise<SessionState | null> {
    const now = Date.now();
    const key = `platform:${id}`;
    const cached = this.sessions.get(key);
    if (cached && now - cached.at < CACHE_MS) return cached;
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const [u] = await withPlatform(this.db, (tx) => tx.select({ disabledAt: platformUsers.disabledAt, revokedAt: platformUsers.sessionsRevokedAt }).from(platformUsers).where(eq(platformUsers.id, id)));
    const state: SessionState = u ? { disabled: !!u.disabledAt, revokedBefore: u.revokedAt ? Math.floor(u.revokedAt.getTime() / 1000) : null, at: now } : { disabled: true, revokedBefore: null, at: now };
    this.sessions.set(key, state);
    return state;
  }

  /** Un tenant sospeso dalla console (PLT-014) non accetta più token: verifica con cache breve. */
  private async tenantActive(tenantId: string): Promise<boolean> {
    if (!/^[0-9a-f-]{36}$/i.test(tenantId)) return true;
    const now = Date.now();
    const cached = this.tenantStatus.get(tenantId);
    if (cached && now - cached.at < CACHE_MS) return cached.active;
    const [t] = await withPlatform(this.db, (tx) => tx.select({ status: tenants.status }).from(tenants).where(eq(tenants.id, tenantId)));
    const active = !t || t.status === 'active';
    this.tenantStatus.set(tenantId, { active, at: now });
    return active;
  }

  /** Invalida la cache di un utente (chiamato dopo revoche e disattivazioni nella stessa istanza). */
  forget(userId: string) {
    this.sessions.delete(userId);
    this.sessions.delete(`platform:${userId}`);
  }
  forgetTenant(tenantId: string) {
    this.tenantStatus.delete(tenantId);
  }
}
