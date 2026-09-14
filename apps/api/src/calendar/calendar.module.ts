import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { IntegrationsModule } from '../integrations/integrations.module.js';
import { CalendarController } from './calendar.controller.js';
import { CalendarService } from './calendar.service.js';

@Module({ imports: [AuditModule, IntegrationsModule], controllers: [CalendarController], providers: [CalendarService], exports: [CalendarService] })
export class CalendarModule {}
