import { Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@wb/shared';
import type { z } from 'zod';
import { RequirePermission } from '../auth/decorators.js';
import { ZBody, ZQuery } from '../common/zod.pipe.js';
import { guideDismissDto, guideQuery, guideStepDto } from './dto.js';
import { GuidesService } from './guides.service.js';

const P = Permissions.NOTIFICATIONS_READ;

@ApiTags('guides')
@ApiBearerAuth()
@Controller('guides')
export class GuidesController {
  constructor(private readonly svc: GuidesService) {}

  @Get('me') @RequirePermission(P) @ApiOperation({ summary: 'Avviamento guidato (AVV-001): passi del profilo con stato calcolato dai dati; ?profile= per consultare i profili inferiori' })
  me(@ZQuery(guideQuery) q: z.infer<typeof guideQuery>) { return this.svc.me(q.profile); }

  @Get('me/summary') @RequirePermission(P) @ApiOperation({ summary: 'Riepilogo per la Home: avanzamento e prossimo passo' })
  summary() { return this.svc.summary(); }

  @Post('me/steps/:key') @RequirePermission(P) @ApiOperation({ summary: 'Segna o annulla un passo manuale (AVV-003)' })
  step(@Param('key') key: string, @ZBody(guideStepDto) b: z.infer<typeof guideStepDto>) { return this.svc.setStep(key, b.done, b.profile); }

  @Post('me/dismiss') @RequirePermission(P) @ApiOperation({ summary: 'Nasconde o riattiva il promemoria in Home (AVV-004)' })
  dismiss(@ZBody(guideDismissDto) b: z.infer<typeof guideDismissDto>) { return this.svc.dismiss(b.dismissed); }
}
