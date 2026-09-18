import { Global, Module } from '@nestjs/common';
import { AuditController } from './audit.controller.js';
import { AuditSearchService } from './audit-search.service.js';
import { AuditService } from './audit.service.js';

@Global()
@Module({ controllers: [AuditController], providers: [AuditService, AuditSearchService], exports: [AuditService] })
export class AuditModule {}
