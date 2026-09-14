import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module.js';
import { IntegrationsModule } from '../integrations/integrations.module.js';
import { FeedbackController } from './feedback.controller.js';
import { FeedbackService } from './feedback.service.js';

@Module({ imports: [CoreModule, IntegrationsModule], controllers: [FeedbackController], providers: [FeedbackService], exports: [FeedbackService] })
export class FeedbackModule {}
