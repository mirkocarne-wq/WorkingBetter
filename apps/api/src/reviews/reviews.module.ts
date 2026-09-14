import { Module } from '@nestjs/common';
import { AppsModule } from '../apps/apps.module.js';
import { CoreModule } from '../core/core.module.js';
import { FormsModule } from '../forms/forms.module.js';
import { ReviewsController } from './reviews.controller.js';
import { ReviewsService } from './reviews.service.js';

@Module({ imports: [CoreModule, FormsModule, AppsModule], controllers: [ReviewsController], providers: [ReviewsService], exports: [ReviewsService] })
export class ReviewsModule {}
