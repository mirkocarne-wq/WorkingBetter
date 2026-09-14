import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@wb/shared';
import type { z } from 'zod';
import { Public, RequirePermission } from '../auth/decorators.js';
import { RateLimit } from '../common/rate-limit.js';
import { ZBody, ZQuery } from '../common/zod.pipe.js';
import { addTaskDto, autoStartDto, createTemplateDto, externalFormDto, externalTaskDto, listJourneysQuery, listTasksQuery, startJourneyDto, surveyDto, updateJourneyDto, updateTaskDto, updateTemplateDto } from './dto.js';
import { OnboardingService } from './onboarding.service.js';

const M = Permissions.ONBOARDING_MANAGE;
const T = Permissions.ONBOARDING_TEAM;
const U = Permissions.ONBOARDING_USE;

@ApiTags('onboarding')
@ApiBearerAuth()
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly svc: OnboardingService) {}

  // ---- template (HR) ----
  @Get('templates') @RequirePermission(M, T) @ApiOperation({ summary: 'Template di percorso (onboarding, cambio ruolo, offboarding) con fasi, task e regole di assegnazione' }) templates() { return this.svc.listTemplates(); }
  @Post('templates') @RequirePermission(M) createTemplate(@ZBody(createTemplateDto) b: z.infer<typeof createTemplateDto>) { return this.svc.createTemplate(b); }
  @Post('templates/presets') @RequirePermission(M) @ApiOperation({ summary: 'Carica i percorsi predefiniti (generico, manager, remoto, cambio ruolo, offboarding) non ancora presenti' }) presets() { return this.svc.loadPresets(); }
  @Get('templates/:id') @RequirePermission(M, T) template(@Param('id', ParseUUIDPipe) id: string) { return this.svc.getTemplate(id); }
  @Patch('templates/:id') @RequirePermission(M) updateTemplate(@Param('id', ParseUUIDPipe) id: string, @ZBody(updateTemplateDto) b: z.infer<typeof updateTemplateDto>) { return this.svc.updateTemplate(id, b); }

  // ---- percorsi ----
  @Get('me') @RequirePermission(U) @ApiOperation({ summary: 'Il mio onboarding (percorso attivo o ultimo) e i task assegnati a me in tutti i percorsi (ONB-012)' }) me() { return this.svc.me(); }
  @Get('journeys') @RequirePermission(U, T, M) @ApiOperation({ summary: 'Percorsi: miei (mine), dei miei riporti (team) o tutti (all, HR)' }) journeys(@ZQuery(listJourneysQuery) q: z.infer<typeof listJourneysQuery>) { return this.svc.listJourneys(q); }
  @Post('journeys') @RequirePermission(T, M) @ApiOperation({ summary: 'Avvia un percorso per una persona: template esplicito o scelto dalle regole; scadenze dalla data di riferimento' }) start(@ZBody(startJourneyDto) b: z.infer<typeof startJourneyDto>) { return this.svc.start(b); }
  @Post('journeys/auto') @RequirePermission(M) @ApiOperation({ summary: 'Avvia i percorsi mancanti per i nuovi ingressi recenti e le uscite programmate (ONB-010)' }) auto(@ZBody(autoStartDto) b: z.infer<typeof autoStartDto>) { return this.svc.autoStart(b.sinceDays); }
  @Get('dashboard') @RequirePermission(T, M) @ApiOperation({ summary: 'Avanzamento per persona, task in ritardo per ruolo, punteggi delle survey con segnali (ONB-016/017)' }) dashboard() { return this.svc.dashboard(); }
  @Get('journeys/:id') @RequirePermission(U, T, M) journey(@Param('id', ParseUUIDPipe) id: string) { return this.svc.getJourney(id); }
  @Patch('journeys/:id') @RequirePermission(T, M) @ApiOperation({ summary: 'Buddy, IT/HR di riferimento, data di riferimento (ricalcola le scadenze aperte), stato' }) updateJourney(@Param('id', ParseUUIDPipe) id: string, @ZBody(updateJourneyDto) b: z.infer<typeof updateJourneyDto>) { return this.svc.updateJourney(id, b); }
  @Get('journeys/:id/buddy-suggestions') @RequirePermission(T, M) @ApiOperation({ summary: 'Suggerimenti buddy: stesso team o unità, anzianità, carico (ONB-013)' }) buddies(@Param('id', ParseUUIDPipe) id: string) { return this.svc.buddySuggestions(id); }
  @Post('journeys/:id/external-link') @RequirePermission(T, M) @ApiOperation({ summary: 'Invia (o reinvia) alla persona il magic link del pre-boarding: task prima dell’ingresso senza account (ONB-011)' }) externalLink(@Param('id', ParseUUIDPipe) id: string) { return this.svc.sendExternalLink(id); }
  @Post('journeys/:id/tasks') @RequirePermission(T, M) @ApiOperation({ summary: 'Aggiunge un task ad hoc al percorso' }) addTask(@Param('id', ParseUUIDPipe) id: string, @ZBody(addTaskDto) b: z.infer<typeof addTaskDto>) { return this.svc.addTask(id, b); }
  @Post('journeys/:id/surveys/:key') @RequirePermission(U) @ApiOperation({ summary: 'Invia la mini-survey di onboarding (nominale); punteggi bassi avvisano manager e HR' }) survey(@Param('id', ParseUUIDPipe) id: string, @Param('key') key: string, @ZBody(surveyDto) b: z.infer<typeof surveyDto>) { return this.svc.submitSurvey(id, key, b); }

  // ---- task ----
  @Get('tasks') @RequirePermission(U) @ApiOperation({ summary: 'Task di onboarding assegnati a me (come persona, manager, buddy, HR o IT)' }) tasks(@ZQuery(listTasksQuery) q: z.infer<typeof listTasksQuery>) { return this.svc.myTasks(q.box); }
  @Patch('tasks/:id') @RequirePermission(U) @ApiOperation({ summary: 'Completa, salta o riapre un task; la presa visione richiede la conferma esplicita (ONB-014)' }) updateTask(@Param('id', ParseUUIDPipe) id: string, @ZBody(updateTaskDto) b: z.infer<typeof updateTaskDto>) { return this.svc.updateTask(id, b); }

  // ---- pre-boarding con identità esterna (magic link, ONB-011) ----
  @Public() @RateLimit(60, 60) @Get('external/:token') @ApiOperation({ summary: 'Percorso di pre-boarding della persona senza account: task prima dell’ingresso, moduli inclusi' }) external(@Param('token') token: string) { return this.svc.externalJourney(token); }
  @Public() @RateLimit(30, 60) @Post('external/:token/tasks/:taskId') @HttpCode(200) @ApiOperation({ summary: 'Completa un task di pre-boarding (lettura, presa visione con conferma, attività)' }) externalTask(@Param('token') token: string, @Param('taskId', ParseUUIDPipe) taskId: string, @ZBody(externalTaskDto) b: z.infer<typeof externalTaskDto>) { return this.svc.externalCompleteTask(token, taskId, b); }
  @Public() @RateLimit(30, 60) @Post('external/:token/tasks/:taskId/form') @HttpCode(200) @ApiOperation({ summary: 'Invia il modulo di un task di pre-boarding (form engine)' }) externalForm(@Param('token') token: string, @Param('taskId', ParseUUIDPipe) taskId: string, @ZBody(externalFormDto) b: z.infer<typeof externalFormDto>) { return this.svc.externalSubmitForm(token, taskId, b.answers); }
}
