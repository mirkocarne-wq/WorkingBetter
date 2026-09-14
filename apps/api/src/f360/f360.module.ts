import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { DevelopmentModule } from '../development/development.module.js';
import { F360Controller } from './f360.controller.js';
import { F360Service } from './f360.service.js';

@Module({ imports: [AuditModule, DevelopmentModule], controllers: [F360Controller], providers: [F360Service], exports: [F360Service] })
export class F360Module {}
