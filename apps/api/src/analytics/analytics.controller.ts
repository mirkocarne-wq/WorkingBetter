import { Controller, Get, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@wb/shared';
import type { FastifyReply } from 'fastify';
import type { z } from 'zod';
import { RequirePermission } from '../auth/decorators.js';
import { ZQuery } from '../common/zod.pipe.js';
import { AnalyticsService } from './analytics.service.js';
import { formatDto, overviewDto, queryDto, trendDto } from './dto.js';

const Q = Permissions.ANALYTICS_QUERY;
const T = Permissions.ANALYTICS_QUERY_TEAM;

function csv(reply: FastifyReply, name: string, body: string) {
  reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', `attachment; filename="${name}"`);
  return body;
}

@ApiTags('analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly svc: AnalyticsService) {}

  @Get('metrics') @RequirePermission(Q, T) @ApiOperation({ summary: 'Data dictionary: catalogo metriche visibili al richiedente' }) metrics() { return this.svc.catalog(); }

  @Get('query') @RequirePermission(Q, T) @ApiOperation({ summary: 'Metriche × dimensione × filtri alla data (ultimo snapshot); soglie e perimetro applicati lato server' })
  async query(@ZQuery(queryDto) q: z.infer<typeof queryDto>, @Res({ passthrough: true }) reply: FastifyReply) {
    return q.format === 'csv' ? csv(reply, 'report.csv', await this.svc.queryCsv(q)) : this.svc.query(q);
  }

  @Get('trend') @RequirePermission(Q, T) @ApiOperation({ summary: 'Serie giornaliera di una metrica' }) trend(@ZQuery(trendDto) q: z.infer<typeof trendDto>) { return this.svc.trend(q); }

  @Get('overview') @RequirePermission(Q, T) @ApiOperation({ summary: 'Panoramica: per ogni metrica valore corrente, variazione dall’inizio della finestra e serie breve per sparkline' }) overview(@ZQuery(overviewDto) q: z.infer<typeof overviewDto>) { return this.svc.overview(q); }

  @Get('alerts') @RequirePermission(Q, T) @ApiOperation({ summary: 'Segnali: persone senza obiettivi, senza 1:1, review scadute, KR stale, azioni scadute' })
  async alerts(@ZQuery(formatDto) q: z.infer<typeof formatDto>, @Res({ passthrough: true }) reply: FastifyReply) {
    return q.format === 'csv' ? csv(reply, 'segnali.csv', await this.svc.alertsCsv()) : this.svc.alerts();
  }

  @Get('process') @RequirePermission(Q, T) processCycles() { return this.svc.processCycles(); }
  @Get('process/:cycleId') @RequirePermission(Q, T) @ApiOperation({ summary: 'Report di processo di un ciclo di review: completamento per fase, unità e manager, ritardatari, tempi' })
  async process(@Param('cycleId', ParseUUIDPipe) id: string, @ZQuery(formatDto) q: z.infer<typeof formatDto>, @Res({ passthrough: true }) reply: FastifyReply) {
    return q.format === 'csv' ? csv(reply, 'processo-review.csv', await this.svc.processCsv(id)) : this.svc.processReport(id);
  }

  @Post('refresh') @RequirePermission(Q) @ApiOperation({ summary: 'Ricalcola lo snapshot di oggi del data mart per il tenant' }) refresh() { return this.svc.refresh(); }
}
