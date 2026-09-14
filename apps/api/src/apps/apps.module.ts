import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { FormsModule } from '../forms/forms.module.js';
import { AppsController } from './apps.controller.js';
import { AppsService } from './apps.service.js';

@Module({ imports: [AuditModule, FormsModule], controllers: [AppsController], providers: [AppsService], exports: [AppsService] })
export class AppsModule {}
