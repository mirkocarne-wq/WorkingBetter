import { Controller, Delete, Get, Param, ParseUUIDPipe, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@wb/shared';
import type { FastifyReply } from 'fastify';
import { z } from 'zod';
import { Public, RequirePermission } from '../auth/decorators.js';
import { ZQuery } from '../common/zod.pipe.js';
import { RateLimit } from '../common/rate-limit.js';
import { CalendarService } from './calendar.service.js';

const slotsQuery = z.object({ durationMin: z.coerce.number().int().min(10).max(240).optional() });

@ApiTags('calendar')
@Controller()
export class CalendarController {
  constructor(private readonly svc: CalendarService) {}

  @Get('calendar/feed') @ApiBearerAuth() @RequirePermission(Permissions.NOTIFICATIONS_READ) @ApiOperation({ summary: 'Stato del feed iCalendar personale (URL segreto) e anteprima dei prossimi eventi (INT-022)' })
  status() { return this.svc.feedStatus(); }

  @Post('calendar/feed/rotate') @ApiBearerAuth() @RequirePermission(Permissions.NOTIFICATIONS_READ) @ApiOperation({ summary: 'Attiva il feed o rigenera l’URL segreto (il precedente smette di funzionare)' })
  rotate() { return this.svc.rotateFeed(); }

  @Delete('calendar/feed') @ApiBearerAuth() @RequirePermission(Permissions.NOTIFICATIONS_READ) @ApiOperation({ summary: 'Disattiva il feed personale' })
  disable() { return this.svc.disableFeed(); }

  @Public() @RateLimit(60, 60) @Get('calendar/feed/:token.ics') @ApiOperation({ summary: 'Feed iCalendar (text/calendar) da sottoscrivere in Google Calendar, Outlook, Apple Calendar' })
  async feed(@Param('token') token: string, @Res() reply: FastifyReply) {
    const ics = await this.svc.feedIcs(token);
    if (!ics) return reply.status(404).header('content-type', 'text/plain; charset=utf-8').send('Feed non trovato o disattivato');
    return reply.header('content-type', 'text/calendar; charset=utf-8').header('cache-control', 'private, max-age=300').header('content-disposition', 'inline; filename="workingbetter.ics"').send(ics);
  }

  @Get('meetings/:id.ics') @ApiBearerAuth() @RequirePermission(Permissions.ONE_ON_ONES_PARTICIPATE) @ApiOperation({ summary: 'Invito .ics del singolo 1:1 (Aggiungi al calendario)' })
  async meetingIcs(@Param('id', ParseUUIDPipe) id: string, @Res() reply: FastifyReply) {
    const { filename, content } = await this.svc.meetingIcs(id);
    return reply.header('content-type', 'text/calendar; charset=utf-8').header('content-disposition', `attachment; filename="${filename}"`).send(content);
  }

  @Get('one-on-ones/:id/slots') @ApiBearerAuth() @RequirePermission(Permissions.ONE_ON_ONES_PARTICIPATE) @ApiOperation({ summary: 'Proposte di slot per il prossimo 1:1 da orario di lavoro e impegni noti (INT-024)' })
  slots(@Param('id', ParseUUIDPipe) id: string, @ZQuery(slotsQuery) q: z.infer<typeof slotsQuery>) { return this.svc.slotsFor(id, q.durationMin); }
}
