import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@wb/shared';
import type { FastifyReply } from 'fastify';
import type { z } from 'zod';
import { RequirePermission } from '../auth/decorators.js';
import { ZBody, ZQuery } from '../common/zod.pipe.js';
import { createReportDto, runReportQuery, updateReportDto } from './reports.dto.js';
import { ReportsService } from './reports.service.js';

const Q = Permissions.ANALYTICS_QUERY;
const T = Permissions.ANALYTICS_QUERY_TEAM;

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics/reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService) {}

  @Get() @RequirePermission(Q, T) @ApiOperation({ summary: 'Report salvati visibili all’utente: propri e condivisi con il suo ruolo o con lui (ANA-052)' }) list() { return this.svc.list(); }
  @Post() @RequirePermission(Q, T) @ApiOperation({ summary: 'Salva un report: metriche, dimensione, filtri, confronto, visualizzazione, condivisione, pianificazione (ANA-050/060)' }) create(@ZBody(createReportDto) b: z.infer<typeof createReportDto>) { return this.svc.create(b); }
  @Get(':id') @RequirePermission(Q, T) get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.get(id); }
  @Patch(':id') @RequirePermission(Q, T) update(@Param('id', ParseUUIDPipe) id: string, @ZBody(updateReportDto) b: z.infer<typeof updateReportDto>) { return this.svc.update(id, b); }
  @Delete(':id') @HttpCode(204) @RequirePermission(Q, T) remove(@Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(id); }
  @Post(':id/duplicate') @RequirePermission(Q, T) duplicate(@Param('id', ParseUUIDPipe) id: string) { return this.svc.duplicate(id); }
  @Get(':id/recipients') @RequirePermission(Q) recipients(@Param('id', ParseUUIDPipe) id: string) { return this.svc.recipientsPreview(id); }
  @Post(':id/send') @RequirePermission(Q, T) @ApiOperation({ summary: 'Invia subito il report all’utente corrente via email (CSV allegato)' }) send(@Param('id', ParseUUIDPipe) id: string) { return this.svc.sendNow(id); }

  @Get(':id/run') @RequirePermission(Q, T) @ApiOperation({ summary: 'Esegue il report con perimetro e soglie di chi lo apre; filtri dinamici date/orgUnitId/managerId/cycleId (ANA-051); format=csv per l’export' })
  async run(@Param('id', ParseUUIDPipe) id: string, @ZQuery(runReportQuery) q: z.infer<typeof runReportQuery>, @Res({ passthrough: true }) reply: FastifyReply) {
    if (q.format === 'csv') {
      const { filename, csv } = await this.svc.runCsv(id, q);
      reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="${filename}"`);
      return csv;
    }
    return this.svc.run(id, q);
  }
}
