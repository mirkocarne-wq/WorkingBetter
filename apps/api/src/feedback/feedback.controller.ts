import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@wb/shared';
import type { z } from 'zod';
import { RequirePermission } from '../auth/decorators.js';
import { ZBody, ZQuery } from '../common/zod.pipe.js';
import { acknowledgeDto, createRequestDto, createValueDto, declineDto, giveFeedbackDto, giveRecognitionDto, listFeedbackQuery, listRecognitionsQuery, listRequestsQuery, reactDto, updateValueDto } from './dto.js';
import { FeedbackService } from './feedback.service.js';

const G = Permissions.FEEDBACK_GIVE;

@ApiTags('feedback')
@ApiBearerAuth()
@Controller()
export class FeedbackController {
  constructor(private readonly svc: FeedbackService) {}

  // valori aziendali
  @Get('company-values') @RequirePermission(G) values(@Query('all') all?: string) { return this.svc.listValues(all === 'true'); }
  @Post('company-values') @RequirePermission(Permissions.VALUES_MANAGE) createValue(@ZBody(createValueDto) b: z.infer<typeof createValueDto>) { return this.svc.createValue(b); }
  @Patch('company-values/:id') @RequirePermission(Permissions.VALUES_MANAGE) updateValue(@Param('id', ParseUUIDPipe) id: string, @ZBody(updateValueDto) b: z.infer<typeof updateValueDto>) { return this.svc.updateValue(id, b); }
  @Get('company-values/stats') @RequirePermission(Permissions.FEEDBACK_READ_TEAM) valueStats(@Query('days') days?: string) { return this.svc.valueStats(days ? Number(days) : 90); }

  // feedback
  @Post('feedback') @RequirePermission(G) @ApiOperation({ summary: 'Dai un feedback (privato al destinatario o condiviso con il suo manager)' }) give(@ZBody(giveFeedbackDto) b: z.infer<typeof giveFeedbackDto>) { return this.svc.give(b); }
  @Get('feedback') @RequirePermission(G) list(@ZQuery(listFeedbackQuery) q: z.infer<typeof listFeedbackQuery>) { return this.svc.list(q); }
  @Get('feedback/:id') @RequirePermission(G) get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.getFeedback(id); }
  @Post('feedback/:id/acknowledge') @RequirePermission(G) ack(@Param('id', ParseUUIDPipe) id: string, @ZBody(acknowledgeDto) b: z.infer<typeof acknowledgeDto>) { return this.svc.acknowledge(id, b.helpful); }
  @Post('feedback/:id/share-with-manager') @RequirePermission(G) shareManager(@Param('id', ParseUUIDPipe) id: string) { return this.svc.share(id, { withManager: true }); }
  @Post('feedback/:id/add-to-record') @RequirePermission(G) @ApiOperation({ summary: 'Il destinatario rende il feedback parte del proprio fascicolo (visibile anche ai manager successivi e all\'HR)' }) addToRecord(@Param('id', ParseUUIDPipe) id: string) { return this.svc.share(id, { withManager: true, inRecord: true }); }

  // richieste
  @Post('feedback-requests') @RequirePermission(G) createRequest(@ZBody(createRequestDto) b: z.infer<typeof createRequestDto>) { return this.svc.createRequest(b); }
  @Get('feedback-requests') @RequirePermission(G) listRequests(@ZQuery(listRequestsQuery) q: z.infer<typeof listRequestsQuery>) { return this.svc.listRequests(q); }
  @Get('feedback-requests/:id') @RequirePermission(G) getRequest(@Param('id', ParseUUIDPipe) id: string) { return this.svc.getRequest(id); }
  @Post('feedback-request-recipients/:id/decline') @RequirePermission(G) decline(@Param('id', ParseUUIDPipe) id: string, @ZBody(declineDto) b: z.infer<typeof declineDto>) { return this.svc.decline(id, b.reason); }

  // riconoscimenti
  @Post('recognitions') @RequirePermission(G) giveRecognition(@ZBody(giveRecognitionDto) b: z.infer<typeof giveRecognitionDto>) { return this.svc.giveRecognition(b); }
  @Get('recognitions') @RequirePermission(G) feed(@ZQuery(listRecognitionsQuery) q: z.infer<typeof listRecognitionsQuery>) { return this.svc.feed(q); }
  @Post('recognitions/:id/reactions') @RequirePermission(G) react(@Param('id', ParseUUIDPipe) id: string, @ZBody(reactDto) b: z.infer<typeof reactDto>) { return this.svc.react(id, b.emoji); }
  @Delete('recognitions/:id') @HttpCode(204) @RequirePermission(Permissions.FEEDBACK_MODERATE) hide(@Param('id', ParseUUIDPipe) id: string) { return this.svc.hide(id); }
}
