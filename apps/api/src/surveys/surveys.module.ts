import { Module } from '@nestjs/common';
import { FormsModule } from '../forms/forms.module.js';
import { SurveysController } from './surveys.controller.js';
import { SurveysService } from './surveys.service.js';

@Module({ imports: [FormsModule], controllers: [SurveysController], providers: [SurveysService], exports: [SurveysService] })
export class SurveysModule {}
