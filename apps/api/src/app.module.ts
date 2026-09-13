import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import type { AnyDb } from '@wb/db';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { ProblemDetailsFilter } from './common/problem.filter.js';
import type { AppConfig } from './config.js';
import { ConfigModule } from './config.module.js';
import { CoreModule } from './core/core.module.js';
import { DbModule } from './db/db.module.js';
import { TenantTxInterceptor } from './db/tenant-tx.interceptor.js';
import { HealthController } from './health/health.controller.js';
import { ObjectivesModule } from './objectives/objectives.module.js';
import { OneOnOneModule } from './one-on-one/one-on-one.module.js';
import { FeedbackModule } from './feedback/feedback.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { FormsModule } from './forms/forms.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { SurveysModule } from './surveys/surveys.module.js';
import { WelfareModule } from './welfare/welfare.module.js';

export interface AppModuleOptions {
  config: AppConfig;
  db: AnyDb;
  appRole?: string | null;
}

@Module({})
export class AppModule {
  static forRoot(opts: AppModuleOptions): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(opts.config),
        DbModule.forRoot({ db: opts.db, appRole: opts.appRole ?? opts.config.DB_APP_ROLE ?? null }),
        AuthModule.forRoot({ devLogin: opts.config.AUTH_MODE === 'dev' }),
        AuditModule,
        NotificationsModule,
        CoreModule,
        ObjectivesModule,
        OneOnOneModule,
        FeedbackModule,
        FormsModule,
        ReviewsModule,
        AnalyticsModule,
        SurveysModule,
        WelfareModule,
      ],
      controllers: [HealthController],
      providers: [
        { provide: APP_FILTER, useClass: ProblemDetailsFilter },
        { provide: APP_INTERCEPTOR, useClass: TenantTxInterceptor },
      ],
    };
  }
}
