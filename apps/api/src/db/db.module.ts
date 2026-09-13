import { type DynamicModule, Global, Module } from '@nestjs/common';
import type { AnyDb } from '@wb/db';

export const DB = Symbol('DB');
export const DB_APP_ROLE = Symbol('DB_APP_ROLE');

export interface DbModuleOptions {
  db: AnyDb;
  appRole?: string | null;
  close?: () => Promise<void>;
}

@Global()
@Module({})
export class DbModule {
  static forRoot(opts: DbModuleOptions): DynamicModule {
    return {
      module: DbModule,
      providers: [
        { provide: DB, useValue: opts.db },
        { provide: DB_APP_ROLE, useValue: opts.appRole ?? null },
      ],
      exports: [DB, DB_APP_ROLE],
    };
  }
}
