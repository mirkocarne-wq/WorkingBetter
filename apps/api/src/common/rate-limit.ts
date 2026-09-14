import { type CanActivate, type ExecutionContext, HttpStatus, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCodes } from '@wb/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from './errors.js';

export const RATE_LIMIT = 'rateLimit';
export interface RateLimitOptions {
  /** richieste ammesse nella finestra */
  limit: number;
  /** finestra in secondi */
  windowSec: number;
}

/**
 * Limite di frequenza per rotta e indirizzo IP (docs/06): finestra scorrevole in memoria.
 * Pensato per gli endpoint pubblici (login, reset, inviti, feed); per più repliche il limite va portato su Redis o sul gateway.
 */
export const RateLimit = (limit: number, windowSec: number) => SetMetadata(RATE_LIMIT, { limit, windowSec } satisfies RateLimitOptions);

interface Bucket {
  hits: number[];
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = Date.now();
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const opts = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT, [context.getHandler(), context.getClass()]);
    if (!opts || process.env.RATE_LIMIT_DISABLED === '1') return true;
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    const now = Date.now();
    const windowMs = opts.windowSec * 1000;
    const key = `${req.routeOptions?.url ?? req.url}|${req.ip}`;
    this.sweep(now, windowMs);
    const b = this.buckets.get(key) ?? { hits: [] };
    b.hits = b.hits.filter((t) => now - t < windowMs);
    if (b.hits.length >= opts.limit) {
      const retryAfter = Math.max(1, Math.ceil((b.hits[0]! + windowMs - now) / 1000));
      reply.header('retry-after', String(retryAfter));
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, ErrorCodes.RATE_LIMITED, 'Troppe richieste', `Riprova tra ${retryAfter} secondi`);
    }
    b.hits.push(now);
    this.buckets.set(key, b);
    return true;
  }

  /** Ogni minuto elimina le chiavi senza colpi recenti (memoria limitata anche sotto scansione di IP). */
  private sweep(now: number, windowMs: number) {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [k, b] of this.buckets) if (!b.hits.some((t) => now - t < Math.max(windowMs, 60_000))) this.buckets.delete(k);
  }
}
