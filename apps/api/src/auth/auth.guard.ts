import { type CanActivate, type ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { users, withPlatform, type AnyDb } from '@wb/db';
import { hasPermission, type Permission } from '@wb/shared';
import { IS_PUBLIC, PERMISSIONS } from './decorators.js';
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
    const state = await this.sessionState(principal.userId);
    if (state?.disabled) throw new UnauthorizedException('Utente disattivato');
    if (state?.revokedBefore != null && principal.issuedAt != null && principal.issuedAt < state.revokedBefore) throw new UnauthorizedException('Sessione revocata: accedi di nuovo');
    const store = requestContext.getStore();
    if (store) store.principal = principal;
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

  /** Invalida la cache di un utente (chiamato dopo revoche e disattivazioni nella stessa istanza). */
  forget(userId: string) {
    this.sessions.delete(userId);
  }
}
