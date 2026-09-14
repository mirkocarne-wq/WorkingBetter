import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { z } from 'zod';
import { PlatformOnly, Public } from '../auth/decorators.js';
import { RateLimit } from '../common/rate-limit.js';
import { ZBody, ZQuery } from '../common/zod.pipe.js';
import { auditQuery, changePasswordDto, createOperatorDto, createTenantDto, eventsQuery, inviteAdminDto, listTenantsQuery, operatorStateDto, platformLoginDto, searchUsersQuery, updateTenantDto, userActionDto } from './dto.js';
import { PlatformAuthService } from './platform-auth.service.js';
import { PlatformService } from './platform.service.js';

/** Console di piattaforma (ADR-0013): tutte le rotte sotto /platform, riservate ai token con claim `platform`. */
@ApiTags('platform')
@Controller('platform')
export class PlatformController {
  constructor(private readonly svc: PlatformService, private readonly auth: PlatformAuthService) {}

  // ---- accesso operatori ----
  @Public() @RateLimit(20, 60) @Post('auth/login') @HttpCode(200) @ApiOperation({ summary: 'Login di un operatore di piattaforma (PLT-001): email e password, blocco dopo 5 tentativi' })
  login(@ZBody(platformLoginDto) b: z.infer<typeof platformLoginDto>) { return this.auth.login(b.email, b.password); }

  @PlatformOnly() @ApiBearerAuth() @Get('auth/me') me() { return this.auth.me(); }
  @PlatformOnly() @ApiBearerAuth() @Post('auth/password') @HttpCode(200) @ApiOperation({ summary: 'Cambia la propria password (revoca le altre sessioni)' })
  changePassword(@ZBody(changePasswordDto) b: z.infer<typeof changePasswordDto>) { return this.auth.changePassword(b); }

  // ---- operatori ----
  @PlatformOnly() @ApiBearerAuth() @Get('operators') operators() { return this.auth.listOperators(); }
  @PlatformOnly() @ApiBearerAuth() @Post('operators') createOperator(@ZBody(createOperatorDto) b: z.infer<typeof createOperatorDto>) { return this.auth.createOperator(b); }
  @PlatformOnly() @ApiBearerAuth() @Patch('operators/:id') operatorState(@Param('id', ParseUUIDPipe) id: string, @ZBody(operatorStateDto) b: z.infer<typeof operatorStateDto>) { return this.auth.setOperatorState(id, b.disabled); }

  // ---- tenant ----
  @PlatformOnly() @ApiBearerAuth() @Get('tenants') @ApiOperation({ summary: 'Elenco tenant con persone, utenti, ultimo accesso (PLT-010)' })
  tenants(@ZQuery(listTenantsQuery) q: z.infer<typeof listTenantsQuery>) { return this.svc.listTenants(q); }
  @PlatformOnly() @ApiBearerAuth() @Post('tenants') @ApiOperation({ summary: 'Crea un tenant con unità radice e primo amministratore invitato (PLT-011)' })
  createTenant(@ZBody(createTenantDto) b: z.infer<typeof createTenantDto>) { return this.svc.createTenant(b); }
  @PlatformOnly() @ApiBearerAuth() @Get('tenants/:id') @ApiOperation({ summary: 'Dettaglio tenant: statistiche per modulo, amministratori, configurazione, eventi (PLT-012)' })
  tenant(@Param('id', ParseUUIDPipe) id: string) { return this.svc.getTenant(id); }
  @PlatformOnly() @ApiBearerAuth() @Patch('tenants/:id') @ApiOperation({ summary: 'Aggiorna nome, fuso, lingua o stato (sospensione PLT-014)' })
  updateTenant(@Param('id', ParseUUIDPipe) id: string, @ZBody(updateTenantDto) b: z.infer<typeof updateTenantDto>) { return this.svc.updateTenant(id, b); }
  @PlatformOnly() @ApiBearerAuth() @Post('tenants/:id/admins') @ApiOperation({ summary: 'Invita (o reinvita) un amministratore del tenant (PLT-013)' })
  inviteAdmin(@Param('id', ParseUUIDPipe) id: string, @ZBody(inviteAdminDto) b: z.infer<typeof inviteAdminDto>) { return this.svc.inviteAdmin(id, b); }
  @PlatformOnly() @ApiBearerAuth() @Get('tenants/:id/audit') @ApiOperation({ summary: 'Audit del tenant come elenco di azioni, senza contenuti (PLT-015)' })
  audit(@Param('id', ParseUUIDPipe) id: string, @ZQuery(auditQuery) q: z.infer<typeof auditQuery>) { return this.svc.tenantAudit(id, q); }

  // ---- utenti dei tenant ----
  @PlatformOnly() @ApiBearerAuth() @Get('users') @ApiOperation({ summary: 'Ricerca utenti per email su tutti i tenant (PLT-020)' })
  users(@ZQuery(searchUsersQuery) q: z.infer<typeof searchUsersQuery>) { return this.svc.searchUsers(q); }
  @PlatformOnly() @ApiBearerAuth() @Post('users/:id/actions') @HttpCode(200) @ApiOperation({ summary: 'Reset password, sblocco, revoca sessioni, disattivazione, riattivazione, disattivazione MFA (PLT-021/022)' })
  userAction(@Param('id', ParseUUIDPipe) id: string, @ZBody(userActionDto) b: z.infer<typeof userActionDto>) { return this.svc.userAction(id, b); }

  // ---- stato, statistiche, certificati, log ----
  @PlatformOnly() @ApiBearerAuth() @Get('status') @ApiOperation({ summary: 'Stato piattaforma: API, database, worker, code (PLT-030)' }) status() { return this.svc.status(); }
  @PlatformOnly() @ApiBearerAuth() @Get('stats') @ApiOperation({ summary: 'Statistiche trasversali ai tenant (PLT-031)' }) stats() { return this.svc.stats(); }
  @PlatformOnly() @ApiBearerAuth() @Get('certificates') @ApiOperation({ summary: 'Certificati TLS degli URL pubblici e dei file configurati, con giorni residui (PLT-032)' }) certificates() { return this.svc.certificates(); }
  @PlatformOnly() @ApiBearerAuth() @Get('events') @ApiOperation({ summary: 'Eventi della console (PLT-033)' }) events(@ZQuery(eventsQuery) q: z.infer<typeof eventsQuery>) { return this.svc.events(q); }
  @PlatformOnly() @ApiBearerAuth() @Get('jobs') @ApiOperation({ summary: 'Ultimi run dei job del worker' }) jobs() { return this.svc.jobs(); }
  @PlatformOnly() @ApiBearerAuth() @Get('queues/failures') @ApiOperation({ summary: 'Ultime consegne fallite di email, chat, webhook e calendario' }) failures() { return this.svc.queueFailures(); }
}
