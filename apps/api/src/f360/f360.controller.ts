import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { Permissions } from '@wb/shared';
import type { z } from 'zod';
import { Public, RequirePermission } from '../auth/decorators.js';
import { RateLimit } from '../common/rate-limit.js';
import { ZBody, ZQuery } from '../common/zod.pipe.js';
import { aggregateQuery, answersDto, approveDto, createCampaignDto, debriefDto, declineDto, devActionDto, listRequestsQuery, listSubjectsQuery, nominateDto, updateCampaignDto } from './dto.js';
import { F360Service } from './f360.service.js';

const M = Permissions.F360_MANAGE;
const T = Permissions.F360_TEAM;
const P = Permissions.F360_PARTICIPATE;

@ApiTags('f360')
@ApiBearerAuth()
@Controller('f360')
export class F360Controller {
  constructor(private readonly svc: F360Service) {}

  // ---- campagne (HR) ----
  @Get('campaigns') @RequirePermission(M) @ApiOperation({ summary: 'Campagne 360° del tenant con avanzamento' }) campaigns() { return this.svc.listCampaigns(); }
  @Post('campaigns') @RequirePermission(M) @ApiOperation({ summary: 'Crea una campagna 360°: competenze del framework, scala, domande aperte, categorie con min/max/anonimato, regole di nomina e rilascio, popolazione' }) createCampaign(@ZBody(createCampaignDto) b: z.infer<typeof createCampaignDto>) { return this.svc.createCampaign(b); }
  @Get('campaigns/:id') @RequirePermission(M) campaign(@Param('id', ParseUUIDPipe) id: string) { return this.svc.getCampaign(id); }
  @Patch('campaigns/:id') @RequirePermission(M) updateCampaign(@Param('id', ParseUUIDPipe) id: string, @ZBody(updateCampaignDto) b: z.infer<typeof updateCampaignDto>) { return this.svc.updateCampaign(id, b); }
  @Get('campaigns/:id/population') @RequirePermission(M) @ApiOperation({ summary: 'Anteprima dei soggetti della popolazione' }) population(@Param('id', ParseUUIDPipe) id: string) { return this.svc.previewPopulation(id); }
  @Post('campaigns/:id/launch') @RequirePermission(M) @ApiOperation({ summary: 'Lancia la fase di nomina: crea i soggetti (self e manager già inclusi) e avvisa chi deve nominare' }) launch(@Param('id', ParseUUIDPipe) id: string) { return this.svc.launch(id); }
  @Post('campaigns/:id/start-collection') @RequirePermission(M) @ApiOperation({ summary: 'Avvia la raccolta: approva le nomine rimaste in sospeso, invita i valutatori (magic link per gli esterni)' }) startCollection(@Param('id', ParseUUIDPipe) id: string) { return this.svc.startCollection(id); }
  @Post('campaigns/:id/remind') @RequirePermission(M) @ApiOperation({ summary: 'Sollecita i valutatori che non hanno ancora risposto (una volta al giorno)' }) remind(@Param('id', ParseUUIDPipe) id: string) { return this.svc.remind(id); }
  @Post('campaigns/:id/close') @RequirePermission(M) @ApiOperation({ summary: 'Chiude la raccolta e genera i report con la soglia di anonimato; alimenta le valutazioni di competenza (fonte 360°)' }) close(@Param('id', ParseUUIDPipe) id: string) { return this.svc.close(id); }
  @Get('campaigns/:id/progress') @RequirePermission(M) @ApiOperation({ summary: 'Avanzamento per soggetto: stato, invitati e risposte per categoria (mai chi ha risposto nelle categorie anonime)' }) progress(@Param('id', ParseUUIDPipe) id: string) { return this.svc.progress(id); }
  @Get('campaigns/:id/aggregate') @RequirePermission(M) @ApiOperation({ summary: 'Heatmap competenze per unità o manager sui report generati, con soppressione sotto soglia; format=csv per l’export' })
  async aggregate(@Param('id', ParseUUIDPipe) id: string, @ZQuery(aggregateQuery) q: z.infer<typeof aggregateQuery>, @Res({ passthrough: true }) reply: FastifyReply) {
    if (q.format === 'csv') {
      reply.header('content-type', 'text/csv; charset=utf-8').header('content-disposition', 'attachment; filename="360-aggregato.csv"');
      return this.svc.aggregateCsv(id, q.groupBy);
    }
    return this.svc.aggregate(id, q.groupBy);
  }

  // ---- soggetti (persona valutata, manager, HR) ----
  @Get('subjects') @RequirePermission(P, T, M) @ApiOperation({ summary: 'I miei 360° (mine), quelli dei miei riporti (team) o tutti (all, HR)' }) subjects(@ZQuery(listSubjectsQuery) q: z.infer<typeof listSubjectsQuery>) { return this.svc.listSubjects(q); }
  @Get('subjects/:id') @RequirePermission(P, T, M) @ApiOperation({ summary: 'Dettaglio: nomine per categoria, stato, report se rilasciato a chi chiede' }) subject(@Param('id', ParseUUIDPipe) id: string) { return this.svc.getSubject(id); }
  @Get('subjects/:id/suggestions') @RequirePermission(P, T, M) @ApiOperation({ summary: 'Suggerimenti di nomina dall’organizzazione: riporti, pari dello stesso team, colleghi con 1:1 (F360-010)' }) suggestions(@Param('id', ParseUUIDPipe) id: string) { return this.svc.suggestions(id); }
  @Post('subjects/:id/nominations') @RequirePermission(P, T, M) @ApiOperation({ summary: 'Nomina un valutatore interno (persona) o esterno (email e nome)' }) nominate(@Param('id', ParseUUIDPipe) id: string, @ZBody(nominateDto) b: z.infer<typeof nominateDto>) { return this.svc.nominate(id, b); }
  @Delete('nominations/:id') @RequirePermission(P, T, M) @HttpCode(200) removeNomination(@Param('id', ParseUUIDPipe) id: string) { return this.svc.removeNomination(id); }
  @Post('subjects/:id/nominations/submit') @RequirePermission(P, T, M) @ApiOperation({ summary: 'Invia le nomine: verifica i minimi per categoria e, se previsto, chiede l’approvazione al manager' }) submitNominations(@Param('id', ParseUUIDPipe) id: string) { return this.svc.submitNominations(id); }
  @Post('subjects/:id/nominations/approve') @RequirePermission(T, M) @ApiOperation({ summary: 'Approva le nomine (manager o HR), con eventuali esclusioni' }) approve(@Param('id', ParseUUIDPipe) id: string, @ZBody(approveDto) b: z.infer<typeof approveDto>) { return this.svc.approveNominations(id, b.rejectIds); }
  @Post('subjects/:id/release') @RequirePermission(T, M) @ApiOperation({ summary: 'Rilascia il report alla persona secondo la regola della campagna' }) release(@Param('id', ParseUUIDPipe) id: string) { return this.svc.release(id); }
  @Post('subjects/:id/debrief') @RequirePermission(T, M) @ApiOperation({ summary: 'Registra il debrief (data e nota); con la regola "dopo debrief" rilascia il report' }) debrief(@Param('id', ParseUUIDPipe) id: string, @ZBody(debriefDto) b: z.infer<typeof debriefDto>) { return this.svc.debrief(id, b); }
  @Post('subjects/:id/dev-actions') @RequirePermission(P, T, M) @ApiOperation({ summary: 'Crea un’azione nel piano di sviluppo a partire da un’area del report (F360-026)' }) devAction(@Param('id', ParseUUIDPipe) id: string, @ZBody(devActionDto) b: z.infer<typeof devActionDto>) { return this.svc.createDevAction(id, b); }

  // ---- valutatori interni ----
  @Get('requests') @RequirePermission(P) @ApiOperation({ summary: 'Richieste di feedback 360° ricevute, con stato e scadenza (F360-012)' }) requests(@ZQuery(listRequestsQuery) q: z.infer<typeof listRequestsQuery>) { return this.svc.myRequests(q.status); }
  @Get('requests/:id') @RequirePermission(P) @ApiOperation({ summary: 'Questionario da compilare: competenze con livelli, scala, domande aperte, bozza' }) request(@Param('id', ParseUUIDPipe) id: string) { return this.svc.questionnaire(id); }
  @Put('requests/:id/draft') @RequirePermission(P) saveDraft(@Param('id', ParseUUIDPipe) id: string, @ZBody(answersDto) b: z.infer<typeof answersDto>) { return this.svc.saveDraft(id, b); }
  @Post('requests/:id/submit') @RequirePermission(P) @ApiOperation({ summary: 'Invia le risposte: nelle categorie anonime nessun legame con la richiesta' }) submit(@Param('id', ParseUUIDPipe) id: string, @ZBody(answersDto) b: z.infer<typeof answersDto>) { return this.svc.submit(id, b); }
  @Post('requests/:id/decline') @RequirePermission(P) decline(@Param('id', ParseUUIDPipe) id: string, @ZBody(declineDto) b: z.infer<typeof declineDto>) { return this.svc.decline(id, b.reason); }

  // ---- valutatori esterni (magic link, F360-011) ----
  @Public() @RateLimit(60, 60) @Get('external/:token') @ApiOperation({ summary: 'Questionario per un valutatore esterno tramite il link ricevuto via email' }) external(@Param('token') token: string) { return this.svc.externalQuestionnaire(token); }
  @Public() @RateLimit(60, 60) @Put('external/:token/draft') externalDraft(@Param('token') token: string, @ZBody(answersDto) b: z.infer<typeof answersDto>) { return this.svc.externalSaveDraft(token, b); }
  @Public() @RateLimit(20, 60) @Post('external/:token/submit') @HttpCode(200) externalSubmit(@Param('token') token: string, @ZBody(answersDto) b: z.infer<typeof answersDto>) { return this.svc.externalSubmit(token, b); }
}
