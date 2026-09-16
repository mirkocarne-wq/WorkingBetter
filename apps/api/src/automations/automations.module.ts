import { Module } from '@nestjs/common';
import { AppsModule } from '../apps/apps.module.js';
import { AutomationsController } from './automations.controller.js';
import { AutomationsService } from './automations.service.js';

@Module({ imports: [AppsModule], controllers: [AutomationsController], providers: [AutomationsService], exports: [AutomationsService] })
export class AutomationsModule {}
