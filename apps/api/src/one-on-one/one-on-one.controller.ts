import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@wb/shared';
import type { z } from 'zod';
import { RequirePermission } from '../auth/decorators.js';
import { ZBody, ZQuery } from '../common/zod.pipe.js';
import {
  completeMeetingDto,
  createActionItemDto,
  createMeetingDto,
  createRelationDto,
  createTalkingPointDto,
  listActionItemsQuery,
  metricsQuery,
  updateActionItemDto,
  updateMeetingDto,
  updateRelationDto,
  updateTalkingPointDto,
  upsertNoteDto,
} from './dto.js';
import { OneOnOneService } from './one-on-one.service.js';

const P = Permissions.ONE_ON_ONES_PARTICIPATE;

@ApiTags('one-on-ones')
@ApiBearerAuth()
@Controller()
export class OneOnOneController {
  constructor(private readonly svc: OneOnOneService) {}

  @Get('one-on-ones') @RequirePermission(P) list() { return this.svc.listMine(); }

  @Get('one-on-ones/metrics')
  @RequirePermission(Permissions.ONE_ON_ONES_METRICS)
  @ApiOperation({ summary: 'Metriche di adozione (solo aggregati: mai contenuti)' })
  metrics(@ZQuery(metricsQuery) q: z.infer<typeof metricsQuery>) { return this.svc.metrics(q.days); }

  @Get('one-on-ones/:id') @RequirePermission(P) get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.getRelation(id); }
  @Post('one-on-ones') @RequirePermission(P) create(@ZBody(createRelationDto) b: z.infer<typeof createRelationDto>) { return this.svc.createRelation(b); }
  @Patch('one-on-ones/:id') @RequirePermission(P) update(@Param('id', ParseUUIDPipe) id: string, @ZBody(updateRelationDto) b: z.infer<typeof updateRelationDto>) { return this.svc.updateRelation(id, b); }
  @Get('one-on-ones/:id/suggestions') @RequirePermission(P) @ApiOperation({ summary: 'Punti di agenda suggeriti da obiettivi, azioni scadute e feedback' }) suggestions(@Param('id', ParseUUIDPipe) id: string) { return this.svc.suggestions(id); }
  @Post('one-on-ones/:id/meetings') @RequirePermission(P) createMeeting(@Param('id', ParseUUIDPipe) id: string, @ZBody(createMeetingDto) b: z.infer<typeof createMeetingDto>) { return this.svc.createMeeting(id, b); }

  @Get('meetings/:id') @RequirePermission(P) getMeeting(@Param('id', ParseUUIDPipe) id: string) { return this.svc.getMeeting(id); }
  @Patch('meetings/:id') @RequirePermission(P) updateMeeting(@Param('id', ParseUUIDPipe) id: string, @ZBody(updateMeetingDto) b: z.infer<typeof updateMeetingDto>) { return this.svc.updateMeeting(id, b); }
  @Post('meetings/:id/complete') @RequirePermission(P) complete(@Param('id', ParseUUIDPipe) id: string, @ZBody(completeMeetingDto) b: z.infer<typeof completeMeetingDto>) { return this.svc.completeMeeting(id, b); }
  @Post('meetings/:id/talking-points') @RequirePermission(P) addPoint(@Param('id', ParseUUIDPipe) id: string, @ZBody(createTalkingPointDto) b: z.infer<typeof createTalkingPointDto>) { return this.svc.addTalkingPoint(id, b); }
  @Patch('talking-points/:id') @RequirePermission(P) updatePoint(@Param('id', ParseUUIDPipe) id: string, @ZBody(updateTalkingPointDto) b: z.infer<typeof updateTalkingPointDto>) { return this.svc.updateTalkingPoint(id, b); }
  @Delete('talking-points/:id') @HttpCode(204) @RequirePermission(P) deletePoint(@Param('id', ParseUUIDPipe) id: string) { return this.svc.deleteTalkingPoint(id); }
  @Put('meetings/:id/notes/shared') @RequirePermission(P) sharedNote(@Param('id', ParseUUIDPipe) id: string, @ZBody(upsertNoteDto) b: z.infer<typeof upsertNoteDto>) { return this.svc.upsertNote(id, 'shared', b.body); }
  @Put('meetings/:id/notes/private') @RequirePermission(P) @ApiOperation({ summary: 'Nota privata: visibile solo all\'autore, cifrata a riposo' }) privateNote(@Param('id', ParseUUIDPipe) id: string, @ZBody(upsertNoteDto) b: z.infer<typeof upsertNoteDto>) { return this.svc.upsertNote(id, 'private', b.body); }
  @Post('meetings/:id/action-items') @RequirePermission(P) addAction(@Param('id', ParseUUIDPipe) id: string, @ZBody(createActionItemDto) b: z.infer<typeof createActionItemDto>) { return this.svc.createActionItem(id, b); }

  @Get('action-items') @RequirePermission(P) listActions(@ZQuery(listActionItemsQuery) q: z.infer<typeof listActionItemsQuery>) { return this.svc.listActionItems(q); }
  @Patch('action-items/:id') @RequirePermission(P) updateAction(@Param('id', ParseUUIDPipe) id: string, @ZBody(updateActionItemDto) b: z.infer<typeof updateActionItemDto>) { return this.svc.updateActionItem(id, b); }
}
