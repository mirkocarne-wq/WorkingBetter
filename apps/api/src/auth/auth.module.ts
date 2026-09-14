import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from '../audit/audit.module.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { RateLimitGuard } from '../common/rate-limit.js';
import { AuthService } from './auth.service.js';
import { DevAuthController } from './dev-auth.controller.js';
import { TokenService } from './token.service.js';
import { MfaService } from './mfa.service.js';

/** Modulo globale: TokenService e AuthService (inviti) sono iniettabili ovunque senza import espliciti. */
@Module({})
export class AuthModule {
  static forRoot(opts: { devLogin: boolean }): DynamicModule {
    return {
      module: AuthModule,
      global: true,
      imports: [AuditModule],
      controllers: opts.devLogin ? [AuthController, DevAuthController] : [AuthController],
      providers: [TokenService, MfaService, AuthService, AuthGuard, { provide: APP_GUARD, useClass: RateLimitGuard }, { provide: APP_GUARD, useExisting: AuthGuard }],
      exports: [TokenService, AuthService, AuthGuard, MfaService],
    };
  }
}
