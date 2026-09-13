import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth.guard.js';
import { DevAuthController } from './dev-auth.controller.js';
import { TokenService } from './token.service.js';

@Module({})
export class AuthModule {
  static forRoot(opts: { devLogin: boolean }): DynamicModule {
    return {
      module: AuthModule,
      controllers: opts.devLogin ? [DevAuthController] : [],
      providers: [TokenService, { provide: APP_GUARD, useClass: AuthGuard }],
      exports: [TokenService],
    };
  }
}
