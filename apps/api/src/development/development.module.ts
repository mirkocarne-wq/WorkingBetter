import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { DevelopmentController } from './development.controller.js';
import { DevelopmentService } from './development.service.js';

@Module({ imports: [AuditModule], controllers: [DevelopmentController], providers: [DevelopmentService], exports: [DevelopmentService] })
export class DevelopmentModule {}
