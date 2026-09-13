import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@wb/shared';
import type { z } from 'zod';
import { RequirePermission } from '../auth/decorators.js';
import { principal } from '../common/context.js';
import { forbidden } from '../common/errors.js';
import { ZBody, ZQuery } from '../common/zod.pipe.js';
import { assessDto, assignProfileDto, competencyDto, createActionDto, createPlanDto, jobProfileDto, profileQuery, talentDto, updateActionDto, updateJobProfileDto, updatePlanDto } from './dto.js';
import { DevelopmentService } from './development.service.js';

const U = Permissions.DEV_USE;
const T = Permissions.DEV_TEAM;
const M = Permissions.DEV_MANAGE;

@ApiTags('development')
@ApiBearerAuth()
@Controller('development')
export class DevelopmentController {
  constructor(private readonly svc: DevelopmentService) {}

  // framework
  @Get('framework') @RequirePermission(U) @ApiOperation({ summary: 'Competenze, job profile (con persone assegnate) e libreria di azioni suggerite' }) framework() { return this.svc.framework(); }
  @Post('framework/presets') @RequirePermission(M) @ApiOperation({ summary: 'Carica la libreria di competenze predefinita (DEV-001), senza sovrascrivere quelle esistenti' }) presets() { return this.svc.loadPresets(); }
  @Put('competencies') @RequirePermission(M) upsertCompetency(@ZBody(competencyDto) b: z.infer<typeof competencyDto>) { return this.svc.upsertCompetency(b); }
  @Post('job-profiles') @RequirePermission(M) createProfile(@ZBody(jobProfileDto) b: z.infer<typeof jobProfileDto>) { return this.svc.createProfile(b); }
  @Patch('job-profiles/:id') @RequirePermission(M) updateProfile(@Param('id', ParseUUIDPipe) id: string, @ZBody(updateJobProfileDto) b: z.infer<typeof updateJobProfileDto>) { return this.svc.updateProfile(id, b); }
  @Put('people/:id/job-profile') @RequirePermission(M) assign(@Param('id', ParseUUIDPipe) id: string, @ZBody(assignProfileDto) b: z.infer<typeof assignProfileDto>) { return this.svc.assignProfile(id, b.profileId); }

  // profilo, gap, valutazioni
  @Get('me') @RequirePermission(U) @ApiOperation({ summary: 'Il mio profilo competenze: atteso vs valutato per fonte, gap, ruolo successivo, piano e azioni suggerite' })
  me(@ZQuery(profileQuery) q: z.infer<typeof profileQuery>) {
    const p = principal();
    if (!p.personId) throw forbidden('Serve una persona collegata all’utente');
    return this.svc.profile(p.personId, q.policy);
  }
  @Get('people') @RequirePermission(T, M) @ApiOperation({ summary: 'Persone del perimetro con profilo, piano e azioni (manager: riporti; HR: tutti)' }) people() { return this.svc.people(); }
  @Get('people/:id') @RequirePermission(U) profile(@Param('id', ParseUUIDPipe) id: string, @ZQuery(profileQuery) q: z.infer<typeof profileQuery>) { return this.svc.profile(id, q.policy); }
  @Post('people/:id/assessments') @RequirePermission(U) @ApiOperation({ summary: 'Valutazione competenze: source=self (la persona) o manager (manager/HR)' }) assess(@Param('id', ParseUUIDPipe) id: string, @ZBody(assessDto) b: z.infer<typeof assessDto>) { return this.svc.assess(id, b); }

  // piani
  @Post('plans') @RequirePermission(U) createPlan(@ZBody(createPlanDto) b: z.infer<typeof createPlanDto>) { return this.svc.createPlan(b); }
  @Patch('plans/:id') @RequirePermission(U) @ApiOperation({ summary: 'Aggiorna il piano: invio in approvazione, approvazione (manager/HR), completamento, archiviazione' }) updatePlan(@Param('id', ParseUUIDPipe) id: string, @ZBody(updatePlanDto) b: z.infer<typeof updatePlanDto>) { return this.svc.updatePlan(id, b); }
  @Post('plans/:id/actions') @RequirePermission(U) addAction(@Param('id', ParseUUIDPipe) id: string, @ZBody(createActionDto) b: z.infer<typeof createActionDto>) { return this.svc.addAction(id, b); }
  @Patch('actions/:id') @RequirePermission(U) updateAction(@Param('id', ParseUUIDPipe) id: string, @ZBody(updateActionDto) b: z.infer<typeof updateActionDto>) { return this.svc.updateAction(id, b); }

  // 9-box
  @Get('talent') @RequirePermission(T, M) @ApiOperation({ summary: '9-box: performance dall’ultima review, potenziale del manager; mai visibile al collaboratore' }) talent() { return this.svc.talentGrid(); }
  @Put('talent/:personId') @RequirePermission(T, M) setPotential(@Param('personId', ParseUUIDPipe) id: string, @ZBody(talentDto) b: z.infer<typeof talentDto>) { return this.svc.setPotential(id, b); }
}
