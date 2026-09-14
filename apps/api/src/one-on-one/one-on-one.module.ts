import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module.js';
import { CalendarModule } from '../calendar/calendar.module.js';
import { OneOnOneController } from './one-on-one.controller.js';
import { OneOnOneService } from './one-on-one.service.js';

@Module({ imports: [CoreModule, CalendarModule], controllers: [OneOnOneController], providers: [OneOnOneService], exports: [OneOnOneService] })
export class OneOnOneModule {}
