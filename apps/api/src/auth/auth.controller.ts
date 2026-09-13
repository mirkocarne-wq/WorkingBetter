import { Controller, Get, HttpCode, HttpException, Param, Patch, Post, Put, Query, Res } from '@nestjs/common';
import { authConfigResponse, sessionResponse } from '../common/responses.js';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { eq } from 'drizzle-orm';
import { tenants } from '@wb/db';
import { Permissions } from '@wb/shared';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { principal, tx } from '../common/context.js';
import { ZBody, ZOk, ZQuery } from '../common/zod.pipe.js';
import { Inject } from '@nestjs/common';
import { CONFIG, type AppConfig } from '../config.js';
import { AuthService, type SsoSettings } from './auth.service.js';
import { Public, RequirePermission } from './decorators.js';

const slug = z.string().min(1).max(60);
const loginDto = z.object({ tenantSlug: slug, email: z.string().email(), password: z.string().min(1).max(200) });
const forgotDto = z.object({ tenantSlug: slug, email: z.string().email() });
const resetDto = z.object({ token: z.string().min(10), password: z.string().min(1).max(200) });
const acceptDto = z.object({ password: z.string().min(1).max(200).optional() });
const changeDto = z.object({ currentPassword: z.string().max(200).default(''), newPassword: z.string().min(1).max(200) });
const exchangeDto = z.object({ code: z.string().min(10) });
const startQuery = z.object({ tenant: slug, redirectTo: z.string().max(200).optional() });
const callbackQuery = z.object({ code: z.string().min(1).optional(), state: z.string().min(1).optional(), error: z.string().optional(), error_description: z.string().optional() });
const ssoDto = z.object({
  enabled: z.boolean().default(false),
  issuer: z.string().url().or(z.literal('')).default(''),
  clientId: z.string().max(200).default(''),
  /** undefined = lascia invariato; '' = rimuovi; valore = aggiorna (cifrato) */
  clientSecret: z.string().max(500).nullable().optional(),
  jitProvisioning: z.boolean().default(false),
  defaultRole: z.enum(['employee', 'manager', 'observer']).default('employee'),
  allowedDomains: z.array(z.string().min(1).max(100)).max(20).default([]),
  passwordDisabled: z.boolean().default(false),
}).refine((s) => !s.enabled || (s.issuer && s.clientId), { message: 'Issuer e client id sono obbligatori per abilitare l’SSO', path: ['issuer'] });

/**
 * Autenticazione (ADR-0007): password, inviti, reset, SSO OIDC per tenant, sessioni.
 * Gli endpoint pubblici lavorano fuori dalla transazione tenant (withTenant esplicito nel servizio).
 */
@ApiTags('auth')
@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService, private readonly audit: AuditService, @Inject(CONFIG) private readonly cfg: AppConfig) {}

  @Public() @Get('auth/config') @ZOk(authConfigResponse) @ApiOperation({ summary: 'Metodi di accesso disponibili per un tenant (password, SSO, login di sviluppo)' })
  config(@Query('tenant') tenant?: string) { return this.auth.publicConfig(tenant ?? ''); }

  @Public() @Post('auth/login') @HttpCode(200) @ZOk(sessionResponse) @ApiOperation({ summary: 'Login con email e password; blocco temporaneo dopo 5 tentativi' })
  login(@ZBody(loginDto) b: z.infer<typeof loginDto>) { return this.auth.passwordLogin(b.tenantSlug, b.email, b.password); }

  @Public() @Post('auth/forgot-password') @HttpCode(202) @ApiOperation({ summary: 'Invia il link di reset se l’utente esiste (risposta sempre 202)' })
  forgot(@ZBody(forgotDto) b: z.infer<typeof forgotDto>) { return this.auth.forgotPassword(b.tenantSlug, b.email); }

  @Public() @Post('auth/reset-password') @HttpCode(200)
  reset(@ZBody(resetDto) b: z.infer<typeof resetDto>) { return this.auth.resetPassword(b.token, b.password); }

  @Public() @Get('auth/invite/:token') @ApiOperation({ summary: 'Dettagli di un invito (email, tenant, scadenza, SSO)' })
  invite(@Param('token') token: string) { return this.auth.inviteInfo(token); }

  @Public() @Post('auth/invite/:token/accept') @HttpCode(200) @ApiOperation({ summary: 'Accetta l’invito impostando la password (o senza, se il tenant usa l’SSO)' })
  accept(@Param('token') token: string, @ZBody(acceptDto) b: z.infer<typeof acceptDto>) { return this.auth.acceptInvite(token, b.password); }

  @Public() @Get('auth/oidc/start') @ApiOperation({ summary: 'Avvia il login SSO (Authorization Code + PKCE): redirect all’identity provider del tenant' })
  async oidcStart(@ZQuery(startQuery) q: z.infer<typeof startQuery>, @Res() reply: FastifyReply) {
    const { url } = await this.auth.oidcStart(q.tenant, q.redirectTo);
    return reply.redirect(url, 302);
  }

  @Public() @Get('auth/oidc/callback')
  async oidcCallback(@ZQuery(callbackQuery) q: z.infer<typeof callbackQuery>, @Res() reply: FastifyReply) {
    if (q.error || !q.code || !q.state) return reply.redirect(`${this.cfg.APP_BASE_URL}/login?error=${encodeURIComponent(q.error_description ?? q.error ?? 'Login SSO annullato')}`, 302);
    try {
      const { redirect } = await this.auth.oidcCallback(q.code, q.state);
      return reply.redirect(redirect, 302);
    } catch (e) {
      const resp = e instanceof HttpException ? e.getResponse() : null;
      const detail = (resp && typeof resp === 'object' && 'detail' in resp ? String((resp as { detail?: string }).detail ?? '') : '') || (e as Error).message || 'Login SSO non riuscito';
      return reply.redirect(`${this.cfg.APP_BASE_URL}/login?error=${encodeURIComponent(detail)}`, 302);
    }
  }

  @Public() @Post('auth/exchange') @HttpCode(200) @ApiOperation({ summary: 'Converte il codice monouso del login SSO in una sessione' })
  exchange(@ZBody(exchangeDto) b: z.infer<typeof exchangeDto>) { return this.auth.exchange(b.code); }

  @ApiBearerAuth() @Post('auth/refresh') @HttpCode(200) @ApiOperation({ summary: 'Rinnova la sessione corrente (ruoli aggiornati)' })
  refresh() { return this.auth.refresh(tx(), principal().userId); }

  @ApiBearerAuth() @Patch('auth/password') @ApiOperation({ summary: 'Cambia la propria password' })
  async changePassword(@ZBody(changeDto) b: z.infer<typeof changeDto>) {
    const p = principal();
    const r = await this.auth.changePassword(tx(), p.userId, b.currentPassword, b.newPassword);
    await this.audit.log({ action: 'user.password_change', entityType: 'user', entityId: p.userId });
    return r;
  }

  // ---- SSO del tenant (tenant_admin) ----
  @ApiBearerAuth() @Get('tenant/sso') @RequirePermission(Permissions.TENANT_SETTINGS)
  async getSso() {
    const [t] = await tx().select().from(tenants).where(eq(tenants.id, principal().tenantId));
    return this.auth.maskSso(t!);
  }
  @ApiBearerAuth() @Put('tenant/sso') @RequirePermission(Permissions.TENANT_SETTINGS) @ApiOperation({ summary: 'Configura l’SSO OIDC del tenant (client secret cifrato, provisioning automatico, domini ammessi)' })
  async putSso(@ZBody(ssoDto) b: z.infer<typeof ssoDto>) {
    const p = principal();
    const [t] = await tx().select().from(tenants).where(eq(tenants.id, p.tenantId));
    const settings = (t!.settings as Record<string, unknown>) ?? {};
    const sso = this.auth.buildSso(p.tenantId, settings.sso as SsoSettings | undefined, b);
    const [after] = await tx().update(tenants).set({ settings: { ...settings, sso }, updatedAt: new Date() }).where(eq(tenants.id, p.tenantId)).returning();
    await this.audit.log({ action: 'tenant.sso_update', entityType: 'tenant', entityId: p.tenantId, after: { ...sso, clientSecretEnc: sso.clientSecretEnc ? '***' : null } });
    return this.auth.maskSso(after!);
  }
}
