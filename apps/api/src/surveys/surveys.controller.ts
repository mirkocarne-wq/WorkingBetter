import { Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@wb/shared';
import type { z } from 'zod';
import { RequirePermission } from '../auth/decorators.js';
import { ZBody, ZQuery } from '../common/zod.pipe.js';
import { createSurveyDto, extendDto, launchDto, listQuery, respondDto, resultsQuery, shareDto, updateSurveyDto } from './dto.js';
import { SurveysService } from './surveys.service.js';

const M = Permissions.SURVEYS_MANAGE;
const R = Permissions.SURVEYS_RESPOND;
const T = Permissions.SURVEYS_RESULTS_TEAM;

@ApiTags('surveys')
@ApiBearerAuth()
@Controller('surveys')
export class SurveysController {
  constructor(private readonly svc: SurveysService) {}

  @Get() @RequirePermission(R, M) @ApiOperation({ summary: 'Survey: le mie (invitato) oppure tutte (HR, box=all)' }) list(@ZQuery(listQuery) q: z.infer<typeof listQuery>) { return this.svc.list(q.box); }
  @Post() @RequirePermission(M) @ApiOperation({ summary: 'Crea una survey da template della libreria (engagement, pulse, eNPS, benessere) o da un form pubblicato' }) create(@ZBody(createSurveyDto) b: z.infer<typeof createSurveyDto>) { return this.svc.create(b); }
  @Get(':id') @RequirePermission(M) get(@Param('id', ParseUUIDPipe) id: string) { return this.svc.get(id); }
  @Patch(':id') @RequirePermission(M) update(@Param('id', ParseUUIDPipe) id: string, @ZBody(updateSurveyDto) b: z.infer<typeof updateSurveyDto>) { return this.svc.update(id, b); }
  @Post(':id/launch') @RequirePermission(M) @ApiOperation({ summary: 'Lancia: crea gli inviti e notifica la popolazione' }) launch(@Param('id', ParseUUIDPipe) id: string, @ZBody(launchDto) b: z.infer<typeof launchDto>) { return this.svc.launch(id, b.closesAt); }
  @Post(':id/remind') @RequirePermission(M) @ApiOperation({ summary: 'Sollecita i non rispondenti (restituisce solo i conteggi)' }) remind(@Param('id', ParseUUIDPipe) id: string) { return this.svc.remind(id); }
  @Post(':id/close') @RequirePermission(M) close(@Param('id', ParseUUIDPipe) id: string) { return this.svc.close(id); }
  @Post(':id/extend') @RequirePermission(M) extend(@Param('id', ParseUUIDPipe) id: string, @ZBody(extendDto) b: z.infer<typeof extendDto>) { return this.svc.extend(id, b.closesAt); }
  @Post(':id/share') @RequirePermission(M) @ApiOperation({ summary: 'Pubblica la sintesi ai rispondenti' }) share(@Param('id', ParseUUIDPipe) id: string, @ZBody(shareDto) b: z.infer<typeof shareDto>) { return this.svc.share(id, b.summary); }

  @Get(':id/form') @RequirePermission(R, M) @ApiOperation({ summary: 'Questionario da compilare (solo invitati) con dichiarazione di anonimato' }) form(@Param('id', ParseUUIDPipe) id: string) { return this.svc.formFor(id); }
  @Post(':id/respond') @RequirePermission(R) @ApiOperation({ summary: 'Invia le risposte: nelle survey anonime nessun legame con la persona' }) respond(@Param('id', ParseUUIDPipe) id: string, @ZBody(respondDto) b: z.infer<typeof respondDto>) { return this.svc.respond(id, b.answers); }
  @Get(':id/results') @RequirePermission(M, T) @ApiOperation({ summary: 'Risultati aggregati con soglia di anonimato: driver, domande, eNPS, heatmap, commenti (HR), confronto con la precedente' }) results(@Param('id', ParseUUIDPipe) id: string, @ZQuery(resultsQuery) q: z.infer<typeof resultsQuery>) { return this.svc.results(id, q.segment); }
  @Get(':id/summary') @RequirePermission(R, M) @ApiOperation({ summary: 'Sintesi pubblicata dall’HR (dopo la condivisione)' }) summary(@Param('id', ParseUUIDPipe) id: string) { return this.svc.summary(id); }
}
