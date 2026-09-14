import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@wb/shared';
import type { z } from 'zod';
import { RequirePermission } from '../auth/decorators.js';
import { ZBody, ZQuery } from '../common/zod.pipe.js';
import { conversationDto, createCycleDto, createTemplateDto, launchDto, listReviewsQuery, overrideRatingDto, reopenDto, signDto, updateCycleDto, updateTemplateDto } from './dto.js';
import { ReviewsService } from './reviews.service.js';

const M = Permissions.REVIEWS_MANAGE;
const P = Permissions.REVIEWS_PARTICIPATE;

@ApiTags('reviews')
@ApiBearerAuth()
@Controller()
export class ReviewsController {
  constructor(private readonly svc: ReviewsService) {}

  // template
  @Get('review-templates') @RequirePermission(M) templates() { return this.svc.listTemplates(); }
  @Post('review-templates') @RequirePermission(M) @ApiOperation({ summary: 'Template di review: form self/manager (chiavi del form engine), fasi, scadenze, regole' }) createTemplate(@ZBody(createTemplateDto) b: z.infer<typeof createTemplateDto>) { return this.svc.createTemplate(b); }
  @Patch('review-templates/:id') @RequirePermission(M) updateTemplate(@Param('id', ParseUUIDPipe) id: string, @ZBody(updateTemplateDto) b: z.infer<typeof updateTemplateDto>) { return this.svc.updateTemplate(id, b); }

  // cicli
  @Get('review-cycles') @RequirePermission(M) cycles() { return this.svc.listCycles(); }
  @Post('review-cycles') @RequirePermission(M) createCycle(@ZBody(createCycleDto) b: z.infer<typeof createCycleDto>) { return this.svc.createCycle(b); }
  @Get('review-cycles/:id') @RequirePermission(M) cycle(@Param('id', ParseUUIDPipe) id: string) { return this.svc.getCycle(id); }
  @Patch('review-cycles/:id') @RequirePermission(M) updateCycle(@Param('id', ParseUUIDPipe) id: string, @ZBody(updateCycleDto) b: z.infer<typeof updateCycleDto>) { return this.svc.updateCycle(id, b); }
  @Get('review-cycles/:id/population') @RequirePermission(M) @ApiOperation({ summary: 'Anteprima popolazione: inclusi, esclusi e persone senza manager' }) population(@Param('id', ParseUUIDPipe) id: string) { return this.svc.previewPopulation(id); }
  @Post('review-cycles/:id/launch') @RequirePermission(M) launch(@Param('id', ParseUUIDPipe) id: string, @ZBody(launchDto) b: z.infer<typeof launchDto>) { return this.svc.launch(id, b.launchDate); }
  @Post('review-cycles/:id/remind') @RequirePermission(M) remind(@Param('id', ParseUUIDPipe) id: string) { return this.svc.remind(id); }
  @Post('review-cycles/:id/close') @RequirePermission(M) close(@Param('id', ParseUUIDPipe) id: string) { return this.svc.closeCycle(id); }
  @Get('review-cycles/:id/progress') @RequirePermission(M) progress(@Param('id', ParseUUIDPipe) id: string) { return this.svc.progress(id); }

  // review
  @Get('reviews') @RequirePermission(P) list(@ZQuery(listReviewsQuery) q: z.infer<typeof listReviewsQuery>) { return this.svc.list(q); }
  @Get('reviews/:id') @RequirePermission(P) get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.get(id); }
  @Get('reviews/:id/context') @RequirePermission(P) @ApiOperation({ summary: 'Pannello di contesto: obiettivi, feedback condivisi, riconoscimenti, review precedenti, 1:1' }) context(@Param('id', ParseUUIDPipe) id: string) { return this.svc.context(id); }
  @Get('reviews/:id/pdf') @RequirePermission(P) @ApiOperation({ summary: 'Export PDF della review (REV-054): contenuti secondo la visibilità di chi chiede; tracciato nell’audit' })
  async pdf(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) reply: FastifyReply) {
    const { buffer, filename } = await this.svc.pdf(id);
    reply.header('content-type', 'application/pdf').header('content-disposition', `attachment; filename="${filename}"`);
    return buffer;
  }
  @Post('reviews/:id/share') @RequirePermission(P) share(@Param('id', ParseUUIDPipe) id: string) { return this.svc.share(id); }
  @Post('reviews/:id/sign') @RequirePermission(P) sign(@Param('id', ParseUUIDPipe) id: string, @ZBody(signDto) b: z.infer<typeof signDto>) { return this.svc.sign(id, b); }
  @Post('reviews/:id/conversation') @RequirePermission(P) conversation(@Param('id', ParseUUIDPipe) id: string, @ZBody(conversationDto) b: z.infer<typeof conversationDto>) { return this.svc.conversation(id, b.at); }
  @Post('reviews/:id/rating-override') @RequirePermission(M) override(@Param('id', ParseUUIDPipe) id: string, @ZBody(overrideRatingDto) b: z.infer<typeof overrideRatingDto>) { return this.svc.overrideRating(id, b); }
  @Post('reviews/:id/reopen') @RequirePermission(M) reopen(@Param('id', ParseUUIDPipe) id: string, @ZBody(reopenDto) b: z.infer<typeof reopenDto>) { return this.svc.reopen(id, b.stage); }
}
