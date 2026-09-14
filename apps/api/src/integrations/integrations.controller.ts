import { Controller, Delete, Get, HttpCode, Param, Post, Put, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { Permissions } from '@wb/shared';
import type { z } from 'zod';
import { Public, RequirePermission } from '../auth/decorators.js';
import { RateLimit } from '../common/rate-limit.js';
import { ZBody, ZQuery } from '../common/zod.pipe.js';
import { callbackQuery, providerParam, testProviderParam, updateIntegrationsDto } from './dto.js';
import { IntegrationsService } from './integrations.service.js';

const A = Permissions.TENANT_SETTINGS;
const N = Permissions.NOTIFICATIONS_READ; // ogni utente autenticato

@ApiTags('integrations')
@ApiBearerAuth()
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly svc: IntegrationsService) {}

  @Get() @RequirePermission(N) @ApiOperation({ summary: 'Connettori disponibili nel tenant e i miei collegamenti (calendario Google/Microsoft, Slack)' }) overview() { return this.svc.overview(); }
  @Get('config') @RequirePermission(A) @ApiOperation({ summary: 'Configurazione dei connettori (app OAuth per tenant, webhook Teams); i segreti non vengono restituiti' }) config() { return this.svc.config(); }
  @Put('config') @RequirePermission(A) @ApiOperation({ summary: 'Aggiorna la configurazione: client id/secret (cifrato), abilitazione, canale riconoscimenti, webhook Teams, endpoint alternativi' }) update(@ZBody(updateIntegrationsDto) b: z.infer<typeof updateIntegrationsDto>) { return this.svc.updateConfig(b); }
  @Post(':provider/connect') @RequirePermission(N) @ApiOperation({ summary: 'URL di autorizzazione OAuth (PKCE, state firmato): calendario personale o installazione Slack (amministratori)' }) connect(@Param('provider') provider: string) { return this.svc.connectUrl(providerParam.parse(provider)); }
  @Delete(':provider') @RequirePermission(N) @HttpCode(200) @ApiOperation({ summary: 'Scollega il mio calendario oppure (amministratori) disinstalla Slack' }) disconnect(@Param('provider') provider: string) { return this.svc.disconnect(providerParam.parse(provider)); }
  @Post(':provider/test') @RequirePermission(A) @HttpCode(200) @ApiOperation({ summary: 'Messaggio di prova: DM Slack a chi chiede o card nel canale Teams (consegna dal worker)' }) test(@Param('provider') provider: string) { return this.svc.test(testProviderParam.parse(provider)); }

  @Public() @RateLimit(30, 60) @Get('callback/:provider') @ApiOperation({ summary: 'Callback OAuth del provider: salva i token cifrati e rimanda alle Impostazioni della web app' })
  async callback(@Param('provider') provider: string, @ZQuery(callbackQuery) q: z.infer<typeof callbackQuery>, @Res() reply: FastifyReply) {
    const parsed = providerParam.safeParse(provider);
    const url = parsed.success ? await this.svc.callback(parsed.data, q) : `${process.env.APP_BASE_URL ?? 'http://localhost:3000'}/settings?integration_error=provider`;
    return reply.redirect(url, 302);
  }
}
