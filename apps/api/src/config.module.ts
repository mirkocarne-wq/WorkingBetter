import { type DynamicModule, Global, Module } from '@nestjs/common';
import { CONFIG, type AppConfig } from './config.js';

@Global()
@Module({})
export class ConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return { module: ConfigModule, providers: [{ provide: CONFIG, useValue: config }], exports: [CONFIG] };
  }
}
