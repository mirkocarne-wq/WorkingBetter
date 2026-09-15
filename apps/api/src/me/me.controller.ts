import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@wb/shared';
import { RequirePermission } from '../auth/decorators.js';
import { ZOk } from '../common/zod.pipe.js';
import { todoResponse } from './dto.js';
import { MeService } from './me.service.js';

@ApiTags('core')
@ApiBearerAuth()
@Controller('me')
export class MeController {
  constructor(private readonly svc: MeService) {}

  @Get('todo') @RequirePermission(Permissions.NOTIFICATIONS_READ) @ZOk(todoResponse)
  @ApiOperation({ summary: 'Home «Da fare» (CORE-063): passi di processo, azioni, check-in, survey e 360° in sospeso per la persona, più il prossimo 1:1' })
  todo() { return this.svc.todo(); }
}
