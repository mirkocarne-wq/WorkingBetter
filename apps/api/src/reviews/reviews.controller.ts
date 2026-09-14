import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@wb/shared';
import type { z } from 'zod';
import { RequirePermission } from '../auth/decorators.js';
import { ZBody, ZQuery } from '../common/zod.pipe.js';
import { approveDto, calibrationRatingDto, conversationDto, createCalibrationDto, createCycleDto, createTemplateDto, launchDto, listCalibrationQuery, listReviewsQuery, overrideRatingDto, reopenDto, signDto, updateCalibrationDto, updateCycleDto, updateTemplateDto } from './dto.js';
import { CalibrationService } from './calibration.service.js';
import { ReviewsService } from './reviews.service.js';

const M = Permissions.REVIEWS_MANAGE;
const P = Permissions.REVIEWS_PARTICIPATE;

@ApiTags('reviews')
@ApiBearerAuth()
@Controller()
export class ReviewsController {
  constructor(private readonly svc: ReviewsService, private readonly calibration: CalibrationService) {}

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
  @Post('reviews/:id/approve') @RequirePermission(P) @ApiOperation({ summary: 'Catena di approvazione (REV-050): approva il passo attivo o rimanda al manager con commento' }) approve(@Param('id', ParseUUIDPipe) id: string, @ZBody(approveDto) b: z.infer<typeof approveDto>) { return this.svc.approve(id, b); }

  // calibrazione (REV-040…045)
  @Get('calibration-sessions') @RequirePermission(P) @ApiOperation({ summary: 'Sessioni di calibrazione: tutte per HR, le proprie per partecipanti e facilitatori' }) calibrationSessions(@ZQuery(listCalibrationQuery) q: z.infer<typeof listCalibrationQuery>) { return this.calibration.list(q.cycleId); }
  @Post('review-cycles/:id/calibration-sessions') @RequirePermission(M) @ApiOperation({ summary: 'Crea una sessione di calibrazione sul ciclo: perimetro per unità, partecipanti, distribuzione attesa' }) createCalibration(@Param('id', ParseUUIDPipe) id: string, @ZBody(createCalibrationDto) b: z.infer<typeof createCalibrationDto>) { return this.calibration.create(id, b); }
  @Get('calibration-sessions/:id') @RequirePermission(P) @ApiOperation({ summary: 'Sessione: righe, distribuzione vs attesa, medie per manager con outlier, 9-box' }) calibrationSession(@Param('id', ParseUUIDPipe) id: string) { return this.calibration.get(id); }
  @Patch('calibration-sessions/:id') @RequirePermission(M) updateCalibration(@Param('id', ParseUUIDPipe) id: string, @ZBody(updateCalibrationDto) b: z.infer<typeof updateCalibrationDto>) { return this.calibration.update(id, b); }
  @Post('calibration-sessions/:id/ratings') @RequirePermission(P) @ApiOperation({ summary: 'Cambia rating e/o potenziale di una review in sessione (storico REV-043, alimenta la 9-box)' }) calibrationRating(@Param('id', ParseUUIDPipe) id: string, @ZBody(calibrationRatingDto) b: z.infer<typeof calibrationRatingDto>) { return this.calibration.setRating(id, b); }
  @Post('calibration-sessions/:id/lock') @RequirePermission(P) @ApiOperation({ summary: 'Blocca la sessione (HR o facilitatore): i rating diventano definitivi e le review si possono condividere' }) lockCalibration(@Param('id', ParseUUIDPipe) id: string) { return this.calibration.lock(id); }
  @Post('calibration-sessions/:id/unlock') @RequirePermission(M) unlockCalibration(@Param('id', ParseUUIDPipe) id: string) { return this.calibration.unlock(id); }
}
