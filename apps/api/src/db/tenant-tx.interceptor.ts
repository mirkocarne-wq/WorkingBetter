import { type CallHandler, type ExecutionContext, Inject, Injectable, type NestInterceptor } from '@nestjs/common';
import { from, lastValueFrom, type Observable } from 'rxjs';
import { withTenant, type AnyDb } from '@wb/db';
import { DB, DB_APP_ROLE } from './db.module.js';
import { requestContext } from '../common/context.js';

/**
 * Apre una transazione con contesto tenant (RLS) per ogni richiesta autenticata e la espone via AsyncLocalStorage.
 * Un errore nel handler fa rollback dell'intera richiesta.
 */
@Injectable()
export class TenantTxInterceptor implements NestInterceptor {
  constructor(@Inject(DB) private readonly db: AnyDb, @Inject(DB_APP_ROLE) private readonly appRole: string | null) {}

  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const store = requestContext.getStore();
    if (!store?.principal) return next.handle();
    const tenantId = store.principal.tenantId;
    return from(
      withTenant(
        this.db,
        tenantId,
        async (tx) => {
          store.tx = tx;
          try {
            return await lastValueFrom(next.handle(), { defaultValue: undefined });
          } finally {
            store.tx = null;
          }
        },
        { appRole: this.appRole },
      ),
    );
  }
}
