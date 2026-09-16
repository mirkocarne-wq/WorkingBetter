import { Body, Controller, Get, Headers, Inject, Param, ParseUUIDPipe, Patch, Post, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AutomationActionTypeLabels, AutomationEventCatalog, AutomationEvents, AutomationPersonFields, Permissions, type AutomationEventPayload } from '@wb/shared';
import type { z } from 'zod';
import { Public, RequirePermission } from '../auth/decorators.js';
import { ZBody, ZQuery } from '../common/zod.pipe.js';
import { CONFIG, type AppConfig } from '../config.js';
import { AutomationsService } from './automations.service.js';
import { createAutomationDto, listAutomationsQuery, runsQuery, updateAutomationDto } from './dto.js';

const M = Permissions.APPS_MANAGE;

@ApiTags('automations')
@ApiBearerAuth()
@Controller()
export class AutomationsController {
  constructor(private readonly svc: AutomationsService, @Inject(CONFIG) private readonly cfg: AppConfig) {}

  @Get('automations/catalog') @RequirePermission(M) @ApiOperation({ summary: 'Catalogo di eventi, campi e azioni disponibili per le regole (APP-037)' })
  catalog() {
    return { events: AutomationEvents.map((e) => ({ key: e, ...AutomationEventCatalog[e] })), personFields: AutomationPersonFields, actions: AutomationActionTypeLabels };
  }

  @Get('automations') @RequirePermission(M) @ApiOperation({ summary: 'Regole del tenant; ?includeArchived=true' })
  list(@ZQuery(listAutomationsQuery) q: z.infer<typeof listAutomationsQuery>) { return this.svc.list(q.includeArchived === 'true'); }

  @Post('automations') @RequirePermission(M) @ApiOperation({ summary: 'Crea una regola «quando → se → allora»' })
  create(@ZBody(createAutomationDto) b: z.infer<typeof createAutomationDto>) { return this.svc.create(b); }

  @Get('automations/:id') @RequirePermission(M)
  get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.get(id); }

  @Patch('automations/:id') @RequirePermission(M) @ApiOperation({ summary: 'Aggiorna, attiva/disattiva o archivia una regola' })
  update(@Param('id', ParseUUIDPipe) id: string, @ZBody(updateAutomationDto) b: z.infer<typeof updateAutomationDto>) { return this.svc.update(id, b); }

  @Get('automations/:id/runs') @RequirePermission(M) @ApiOperation({ summary: 'Esecuzioni della regola con l’esito di ogni azione' })
  runs(@Param('id', ParseUUIDPipe) id: string, @ZQuery(runsQuery) q: z.infer<typeof runsQuery>) { return this.svc.runs(id, q.limit); }

  @Post('automations/dry-run') @RequirePermission(M) @ApiOperation({ summary: 'Prova a secco: quali regole scatterebbero per un evento (nessuna azione)' })
  dryRun(@Body() body: AutomationEventPayload) { return this.svc.dryRun({ type: body.type, subjectPersonId: body.subjectPersonId ?? null, sourceId: 'dry-run', data: body.data ?? {} }); }

  /** Chiamato dal worker una volta al giorno (ADR-0015): protetto dal segreto condiviso INTERNAL_JOB_TOKEN. */
  @Public() @Post('internal/automations/tick') @ApiOperation({ summary: 'Trigger a tempo delle automazioni (job giornaliero del worker; header x-internal-token)' })
  async tick(@Headers('x-internal-token') token: string | undefined, @Body() body: { today?: string } | undefined) {
    if (!this.cfg.INTERNAL_JOB_TOKEN || token !== this.cfg.INTERNAL_JOB_TOKEN) throw new UnauthorizedException('Token interno mancante o errato');
    const day = body?.today && /^\d{4}-\d{2}-\d{2}$/.test(body.today) ? body.today : undefined;
    return this.svc.tick(day);
  }
}
