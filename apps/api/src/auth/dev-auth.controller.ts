import { Controller, Inject, Post, UnauthorizedException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { roleAssignments, tenants, users, withTenant, type AnyDb } from '@wb/db';
import { Public } from './decorators.js';
import { TokenService } from './token.service.js';
import { ZBody } from '../common/zod.pipe.js';
import { RateLimit } from '../common/rate-limit.js';
import { CONFIG, type AppConfig } from '../config.js';
import { DB } from '../db/db.module.js';

const devLogin = z.object({ tenantSlug: z.string().min(1), email: z.string().email() });

/**
 * Login di sviluppo (solo AUTH_MODE=dev): emette un JWT per un utente esistente del tenant.
 * In produzione l'autenticazione passa dall'IdP (Keycloak) e questo controller non è registrato.
 */
@ApiTags('auth')
@Controller('auth')
export class DevAuthController {
  constructor(@Inject(CONFIG) private readonly cfg: AppConfig, @Inject(DB) private readonly db: AnyDb, private readonly tokens: TokenService) {}

  @Public()
  @RateLimit(60, 60)
  @Post('dev-login')
  @ApiOperation({ summary: 'Login di sviluppo (senza password). Disponibile solo con AUTH_MODE=dev.' })
  async devLogin(@ZBody(devLogin) body: z.infer<typeof devLogin>) {
    if (this.cfg.AUTH_MODE !== 'dev') throw new UnauthorizedException();
    const [tenant] = await this.db.select().from(tenants).where(eq(tenants.slug, body.tenantSlug));
    if (!tenant) throw new UnauthorizedException('Tenant sconosciuto');
    const result = await withTenant(this.db, tenant.id, async (tx) => {
      const [user] = await tx.select().from(users).where(and(eq(users.tenantId, tenant.id), eq(users.email, body.email.toLowerCase())));
      if (!user || user.disabledAt) return null;
      const roles = await tx.select({ role: roleAssignments.role }).from(roleAssignments).where(eq(roleAssignments.userId, user.id));
      await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
      return { user, roles: roles.map((r) => r.role) };
    });
    if (!result) throw new UnauthorizedException('Utente sconosciuto');
    const token = await this.tokens.signDev({
      sub: result.user.id,
      tenant_id: tenant.id,
      person_id: result.user.personId ?? undefined,
      roles: result.roles,
      email: result.user.email,
    });
    return { accessToken: token, tokenType: 'Bearer', expiresIn: 8 * 3600, roles: result.roles };
  }
}
