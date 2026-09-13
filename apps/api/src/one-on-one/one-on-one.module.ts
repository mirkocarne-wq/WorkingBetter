import { Module } from '@nestjs/common';
import { CoreModule } from '../core/core.module.js';
import { OneOnOneController } from './one-on-one.controller.js';
import { OneOnOneService } from './one-on-one.service.js';

@Module({ imports: [CoreModule], controllers: [OneOnOneController], providers: [OneOnOneService], exports: [OneOnOneService] })
export class OneOnOneModule {}
