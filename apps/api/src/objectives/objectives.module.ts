import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module.js';
import { CyclesService } from './cycles.service.js';
import { ObjectivesController } from './objectives.controller.js';
import { ObjectivesService } from './objectives.service.js';

@Module({
  imports: [CoreModule],
  controllers: [ObjectivesController],
  providers: [CyclesService, ObjectivesService],
  exports: [CyclesService, ObjectivesService],
})
export class ObjectivesModule {}
