import { Controller, Get, Header } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '@wb/shared';
import type { z } from 'zod';
import { RequirePermission } from '../auth/decorators.js';
import { ZQuery } from '../common/zod.pipe.js';
import { AuditSearchService } from './audit-search.service.js';
import { auditExportQuery, auditSearchQuery } from './dto.js';

const P = Permissions.AUDIT_READ;

/** Consultazione dell'audit del tenant (CORE-051): chi, cosa, quando, su cosa; mai i contenuti. */
@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private readonly svc: AuditSearchService) {}

  @Get() @RequirePermission(P) @ApiOperation({ summary: 'Ricerca nell’audit: filtri per azione, entità, utente, periodo e testo; campi cambiati, mai i valori (CORE-051)' })
  search(@ZQuery(auditSearchQuery) q: z.infer<typeof auditSearchQuery>) { return this.svc.search(q); }

  @Get('actions') @RequirePermission(P) @ApiOperation({ summary: 'Azioni presenti nell’audit del tenant (per il filtro)' })
  actions() { return this.svc.actions(); }

  @Get('export') @RequirePermission(P) @Header('content-type', 'text/csv; charset=utf-8') @Header('content-disposition', 'attachment; filename="audit.csv"')
  @ApiOperation({ summary: 'Export CSV dell’audit con gli stessi filtri della ricerca (massimo 10 000 righe); tracciato nell’audit' })
  export(@ZQuery(auditExportQuery) q: z.infer<typeof auditExportQuery>) { return this.svc.exportCsv(q); }
}
