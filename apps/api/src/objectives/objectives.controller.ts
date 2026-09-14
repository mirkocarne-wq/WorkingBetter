import { Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@wb/shared';
import type { z } from 'zod';
import { RequirePermission } from '../auth/decorators.js';
import { ZBody, ZQuery } from '../common/zod.pipe.js';
import { CyclesService } from './cycles.service.js';
import {
  checkInDto,
  closeObjectiveDto,
  createCycleDto,
  createObjectiveDto,
  keyResultInput,
  listObjectivesQuery,
  updateCycleDto,
  updateKeyResultDto,
  updateObjectiveDto,
} from './dto.js';
import { ObjectivesService } from './objectives.service.js';

@ApiTags('objectives')
@ApiBearerAuth()
@Controller()
export class ObjectivesController {
  constructor(private readonly cycles: CyclesService, private readonly objectives: ObjectivesService) {}

  // ---- cycles ----
  @Get('cycles')
  @RequirePermission(Permissions.OBJECTIVES_READ)
  listCycles() {
    return this.cycles.list();
  }

  @Get('cycles/current')
  @RequirePermission(Permissions.OBJECTIVES_READ)
  currentCycle() {
    return this.cycles.current();
  }

  @Post('cycles')
  @RequirePermission(Permissions.CYCLES_WRITE)
  createCycle(@ZBody(createCycleDto) body: z.infer<typeof createCycleDto>) {
    return this.cycles.create(body);
  }

  @Patch('cycles/:id')
  @RequirePermission(Permissions.CYCLES_WRITE)
  updateCycle(@Param('id', ParseUUIDPipe) id: string, @ZBody(updateCycleDto) body: z.infer<typeof updateCycleDto>) {
    return this.cycles.update(id, body);
  }

  // ---- objectives ----
  @Get('objectives')
  @RequirePermission(Permissions.OBJECTIVES_READ)
  @ApiOperation({ summary: 'Elenco obiettivi visibili; ?tree=true restituisce l\'albero di allineamento' })
  list(@ZQuery(listObjectivesQuery) q: z.infer<typeof listObjectivesQuery>) {
    return this.objectives.list(q);
  }

  @Get('objectives/:id')
  @RequirePermission(Permissions.OBJECTIVES_READ)
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.objectives.get(id);
  }

  @Post('objectives')
  @RequirePermission(Permissions.OBJECTIVES_WRITE_OWN, Permissions.OBJECTIVES_WRITE_TEAM, Permissions.OBJECTIVES_WRITE_ANY)
  create(@ZBody(createObjectiveDto) body: z.infer<typeof createObjectiveDto>) {
    return this.objectives.create(body);
  }

  @Patch('objectives/:id')
  @RequirePermission(Permissions.OBJECTIVES_WRITE_OWN, Permissions.OBJECTIVES_WRITE_TEAM, Permissions.OBJECTIVES_WRITE_ANY)
  update(@Param('id', ParseUUIDPipe) id: string, @ZBody(updateObjectiveDto) body: z.infer<typeof updateObjectiveDto>) {
    return this.objectives.update(id, body);
  }

  @Post('objectives/:id/publish')
  @RequirePermission(Permissions.OBJECTIVES_WRITE_OWN, Permissions.OBJECTIVES_WRITE_TEAM, Permissions.OBJECTIVES_WRITE_ANY)
  publish(@Param('id', ParseUUIDPipe) id: string) {
    return this.objectives.publish(id);
  }

  @Post('objectives/:id/close')
  @RequirePermission(Permissions.OBJECTIVES_WRITE_OWN, Permissions.OBJECTIVES_WRITE_TEAM, Permissions.OBJECTIVES_WRITE_ANY)
  close(@Param('id', ParseUUIDPipe) id: string, @ZBody(closeObjectiveDto) body: z.infer<typeof closeObjectiveDto>) {
    return this.objectives.close(id, body);
  }

  @Delete('objectives/:id')
  @HttpCode(204)
  @RequirePermission(Permissions.OBJECTIVES_WRITE_OWN, Permissions.OBJECTIVES_WRITE_TEAM, Permissions.OBJECTIVES_WRITE_ANY)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.objectives.remove(id);
  }

  // ---- key results ----
  @Post('objectives/:id/key-results')
  @RequirePermission(Permissions.OBJECTIVES_WRITE_OWN, Permissions.OBJECTIVES_WRITE_TEAM, Permissions.OBJECTIVES_WRITE_ANY)
  addKeyResult(@Param('id', ParseUUIDPipe) id: string, @ZBody(keyResultInput) body: z.infer<typeof keyResultInput>) {
    return this.objectives.addKeyResult(id, body);
  }

  @Patch('key-results/:id')
  @RequirePermission(Permissions.OBJECTIVES_WRITE_OWN, Permissions.OBJECTIVES_WRITE_TEAM, Permissions.OBJECTIVES_WRITE_ANY)
  updateKeyResult(@Param('id', ParseUUIDPipe) id: string, @ZBody(updateKeyResultDto) body: z.infer<typeof updateKeyResultDto>) {
    return this.objectives.updateKeyResult(id, body);
  }

  @Delete('key-results/:id')
  @RequirePermission(Permissions.OBJECTIVES_WRITE_OWN, Permissions.OBJECTIVES_WRITE_TEAM, Permissions.OBJECTIVES_WRITE_ANY)
  deleteKeyResult(@Param('id', ParseUUIDPipe) id: string) {
    return this.objectives.deleteKeyResult(id);
  }

  @Get('key-results/:id/check-ins')
  @RequirePermission(Permissions.OBJECTIVES_READ)
  checkIns(@Param('id', ParseUUIDPipe) id: string) {
    return this.objectives.checkInsOf(id);
  }

  @Post('key-results/:id/check-ins')
  @RequirePermission(Permissions.OBJECTIVES_WRITE_OWN, Permissions.OBJECTIVES_WRITE_TEAM, Permissions.OBJECTIVES_WRITE_ANY)
  @ApiOperation({ summary: 'Check-in: nuovo valore, confidenza, commento; ricalcola progresso di obiettivo e padri' })
  checkIn(@Param('id', ParseUUIDPipe) id: string, @ZBody(checkInDto) body: z.infer<typeof checkInDto>) {
    return this.objectives.checkIn(id, body);
  }
}
