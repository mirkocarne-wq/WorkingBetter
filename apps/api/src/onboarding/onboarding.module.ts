import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { FormsModule } from '../forms/forms.module.js';
import { OnboardingController } from './onboarding.controller.js';
import { OnboardingService } from './onboarding.service.js';

@Module({ imports: [AuditModule, FormsModule], controllers: [OnboardingController], providers: [OnboardingService], exports: [OnboardingService] })
export class OnboardingModule {}
