import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { Permissions } from '@wb/shared';
import type { z } from 'zod';
import { RequirePermission } from '../auth/decorators.js';
import { ZBody, ZQuery } from '../common/zod.pipe.js';
import { cancelDto, createAppDto, decideDto, duplicateDto, extendDto, importDto, installDto, launchDto, listAppsQuery, listInstancesQuery, reassignDto, updateAppDto } from './dto.js';
import { AppsService } from './apps.service.js';

const M = Permissions.APPS_MANAGE;
const U = Permissions.APPS_USE;

@ApiTags('apps')
@ApiBearerAuth()
@Controller('apps')
export class AppsController {
  constructor(private readonly svc: AppsService) {}

  // ---- studio (HR) ----
  @Get('templates') @RequirePermission(M) @ApiOperation({ summary: 'Template pronti (richiesta formazione, proposta promozione, fine progetto, exit interview, segnalazione HR)' }) templates() { return this.svc.listTemplates(); }
  @Post('templates/install') @RequirePermission(M) @ApiOperation({ summary: 'Installa un template: crea e pubblica i suoi form, crea l’app in bozza' }) install(@ZBody(installDto) b: z.infer<typeof installDto>) { return this.svc.installTemplate(b.key); }
  @Post('import') @RequirePermission(M) @ApiOperation({ summary: 'Importa un’app da JSON (definizione + form), come esportata da un altro tenant (APP-035)' }) importApp(@ZBody(importDto) b: z.infer<typeof importDto>) { return this.svc.importApp(b); }
  @Get() @RequirePermission(U, M) @ApiOperation({ summary: 'App: quelle che posso avviare (launchable) oppure tutte le versioni correnti (all, HR)' }) list(@ZQuery(listAppsQuery) q: z.infer<typeof listAppsQuery>) { return this.svc.listApps(q.scope); }
  @Post() @RequirePermission(M) @ApiOperation({ summary: 'Crea un’app in bozza da una definizione dichiarativa (fasi, attori, approvazioni, instradamenti)' }) create(@ZBody(createAppDto) b: z.infer<typeof createAppDto>) { return this.svc.createApp(b); }
  @Get('dashboard') @RequirePermission(M) @ApiOperation({ summary: 'Istanze per app e fase: attive, scadute, concluse (APP-034)' }) dashboard() { return this.svc.dashboard(); }

  // ---- istanze ----
  @Get('instances') @RequirePermission(U, M) @ApiOperation({ summary: 'Istanze: da fare (todo), su di me (mine), avviate da me (launched), del mio team (team), tutte (all, HR); format=csv per l’export' })
  async instances(@ZQuery(listInstancesQuery) q: z.infer<typeof listInstancesQuery>, @Res({ passthrough: true }) reply: FastifyReply) {
    if (q.format === 'csv') {
      reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="istanze.csv"');
      return this.svc.instancesCsv(q);
    }
    return this.svc.listInstances(q);
  }
  @Post('instances') @RequirePermission(U, M) @ApiOperation({ summary: 'Avvia un’istanza per un soggetto secondo i permessi dell’app; risolve gli attori e attiva la prima fase' }) launch(@ZBody(launchDto) b: z.infer<typeof launchDto>) { return this.svc.launch(b); }
  @Get('instances/:id') @RequirePermission(U, M) @ApiOperation({ summary: 'Istanza con fasi, run, risposte visibili secondo il ruolo e log' }) instance(@Param('id', ParseUUIDPipe) id: string) { return this.svc.getInstance(id); }
  @Post('instances/:id/cancel') @RequirePermission(U, M) cancel(@Param('id', ParseUUIDPipe) id: string, @ZBody(cancelDto) b: z.infer<typeof cancelDto>) { return this.svc.cancelInstance(id, b.reason); }
  @Post('runs/:id/decide') @RequirePermission(U, M) @ApiOperation({ summary: 'Approva o rimanda una fase di approvazione (con commento); il rimando riapre la fase indicata' }) decide(@Param('id', ParseUUIDPipe) id: string, @ZBody(decideDto) b: z.infer<typeof decideDto>) { return this.svc.decide(id, b); }
  @Post('runs/:id/reassign') @RequirePermission(M) @ApiOperation({ summary: 'Riassegna una fase attiva a un’altra persona (APP-025)' }) reassign(@Param('id', ParseUUIDPipe) id: string, @ZBody(reassignDto) b: z.infer<typeof reassignDto>) { return this.svc.reassign(id, b.actorPersonId); }
  @Post('runs/:id/extend') @RequirePermission(M) @ApiOperation({ summary: 'Proroga la scadenza di una fase attiva (APP-025)' }) extend(@Param('id', ParseUUIDPipe) id: string, @ZBody(extendDto) b: z.infer<typeof extendDto>) { return this.svc.extend(id, b.dueDate); }

  // ---- singola app (HR) ----
  @Get(':id') @RequirePermission(U, M) get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.getApp(id); }
  @Patch(':id') @RequirePermission(M) @ApiOperation({ summary: 'Modifica una bozza (le versioni pubblicate sono immutabili: usa versions)' }) update(@Param('id', ParseUUIDPipe) id: string, @ZBody(updateAppDto) b: z.infer<typeof updateAppDto>) { return this.svc.updateApp(id, b); }
  @Post(':id/publish') @RequirePermission(M) @ApiOperation({ summary: 'Pubblica: valida la definizione contro i form pubblicati e archivia la versione precedente' }) publish(@Param('id', ParseUUIDPipe) id: string) { return this.svc.publishApp(id); }
  @Post(':id/versions') @RequirePermission(M) @ApiOperation({ summary: 'Nuova versione in bozza a partire da quella pubblicata (le istanze in corso restano sulla loro)' }) newVersion(@Param('id', ParseUUIDPipe) id: string) { return this.svc.newVersion(id); }
  @Post(':id/archive') @RequirePermission(M) archive(@Param('id', ParseUUIDPipe) id: string) { return this.svc.archiveApp(id); }
  @Post(':id/duplicate') @RequirePermission(M) @ApiOperation({ summary: 'Duplica come nuova app in bozza (APP-031)' }) duplicate(@Param('id', ParseUUIDPipe) id: string, @ZBody(duplicateDto) b: z.infer<typeof duplicateDto>) { return this.svc.duplicateApp(id, b); }
  @Get(':id/export') @RequirePermission(M) @HttpCode(200) @ApiOperation({ summary: 'Esporta definizione e form in JSON (APP-035)' }) exportApp(@Param('id', ParseUUIDPipe) id: string) { return this.svc.exportApp(id); }
}
