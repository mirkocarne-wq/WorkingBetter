import { Global, Module } from '@nestjs/common';
import { PlatformEventsService } from './platform-events.service.js';

@Global()
@Module({ providers: [PlatformEventsService], exports: [PlatformEventsService] })
export class EventsModule {}
