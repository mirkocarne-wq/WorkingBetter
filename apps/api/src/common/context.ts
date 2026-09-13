import { AsyncLocalStorage } from 'node:async_hooks';
import type { Principal } from '@wb/shared';
import type { TenantTx } from '@wb/db';
import { UnauthorizedException } from '@nestjs/common';

export interface RequestContext {
  requestId: string;
  principal: Principal | null;
  tx: TenantTx | null;
  ip?: string;
  userAgent?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function ctx(): RequestContext {
  const c = requestContext.getStore();
  if (!c) throw new Error('Request context non inizializzato');
  return c;
}

/** Transazione tenant corrente (aperta da TenantTxInterceptor). */
export function tx(): TenantTx {
  const c = ctx();
  if (!c.tx) throw new Error('Nessuna transazione tenant attiva');
  return c.tx;
}

export function principal(): Principal {
  const c = ctx();
  if (!c.principal) throw new UnauthorizedException();
  return c.principal;
}
