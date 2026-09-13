import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuditModule } from '../audit/audit.module.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { DevAuthController } from './dev-auth.controller.js';
import { TokenService } from './token.service.js';

/** Modulo globale: TokenService e AuthService (inviti) sono iniettabili ovunque senza import espliciti. */
@Module({})
export class AuthModule {
  static forRoot(opts: { devLogin: boolean }): DynamicModule {
    return {
      module: AuthModule,
      global: true,
      imports: [AuditModule],
      controllers: opts.devLogin ? [AuthController, DevAuthController] : [AuthController],
      providers: [TokenService, AuthService, { provide: APP_GUARD, useClass: AuthGuard }],
      exports: [TokenService, AuthService],
    };
  }
}
