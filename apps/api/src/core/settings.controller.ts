import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { eq } from 'drizzle-orm';
import { tenants } from '@wb/db';
import { Permissions, TenantModules, type ModuleSettings } from '@wb/shared';
import type { z } from 'zod';
import { RequirePermission } from '../auth/decorators.js';
import { principal, tx } from '../common/context.js';
import { notFound } from '../common/errors.js';
import { ZBody, ZQuery } from '../common/zod.pipe.js';
import { AuditService } from '../audit/audit.service.js';
import { createPersonFieldDto, listPersonFieldsQuery, namingQuery, putModulesDto, putNamingDto, updatePersonFieldDto } from './dto.js';
import { NamingService } from './naming.service.js';
import { PersonFieldsService } from './person-fields.service.js';

/** Personalizzazione del tenant (sprint 26): campi persona (CORE-011), glossario (CORE-003), moduli attivi (CORE-004). */
@ApiTags('core')
@ApiBearerAuth()
@Controller()
export class SettingsController {
  constructor(private readonly fields: PersonFieldsService, private readonly naming: NamingService, private readonly audit: AuditService) {}

  // ---- campi custom della persona ----
  @Get('person-fields')
  @RequirePermission(Permissions.PEOPLE_READ)
  @ApiOperation({ summary: 'Catalogo dei campi custom della persona (CORE-011); ?includeArchived=true include gli archiviati' })
  listFields(@ZQuery(listPersonFieldsQuery) q: z.infer<typeof listPersonFieldsQuery>) {
    return this.fields.list(q.includeArchived === 'true');
  }

  @Post('person-fields')
  @RequirePermission(Permissions.PEOPLE_WRITE)
  @ApiOperation({ summary: 'Crea un campo custom: chiave stabile, tipo, opzioni, obbligatorietà e visibilità' })
  createField(@ZBody(createPersonFieldDto) body: z.infer<typeof createPersonFieldDto>) {
    return this.fields.create(body);
  }

  @Patch('person-fields/:id')
  @RequirePermission(Permissions.PEOPLE_WRITE)
  @ApiOperation({ summary: 'Aggiorna o archivia un campo custom (archived=true); la chiave non cambia' })
  updateField(@Param('id', ParseUUIDPipe) id: string, @ZBody(updatePersonFieldDto) body: z.infer<typeof updatePersonFieldDto>) {
    return this.fields.update(id, body);
  }

  // ---- glossario aziendale ----
  @Get('naming')
  @ApiOperation({ summary: 'Glossario aziendale (CORE-003): nomi dei concetti risolti per la lingua del tenant, più le personalizzazioni' })
  getNaming(@ZQuery(namingQuery) q: z.infer<typeof namingQuery>) {
    return this.naming.get(q.locale);
  }

  @Put('naming')
  @RequirePermission(Permissions.TENANT_SETTINGS)
  @ApiOperation({ summary: 'Sostituisce le personalizzazioni del glossario per una lingua; voce vuota = torna al default' })
  putNaming(@ZBody(putNamingDto) body: z.infer<typeof putNamingDto>) {
    return this.naming.put(body.overrides, body.locale);
  }

  // ---- moduli attivi ----
  @Put('tenant/modules')
  @RequirePermission(Permissions.TENANT_SETTINGS)
  @ApiOperation({ summary: 'Attiva o disattiva i moduli del tenant (CORE-004): l’interfaccia nasconde i moduli spenti, i permessi restano la barriera di sicurezza' })
  async putModules(@ZBody(putModulesDto) body: z.infer<typeof putModulesDto>) {
    const [before] = await tx().select().from(tenants).where(eq(tenants.id, principal().tenantId));
    if (!before) throw notFound('Tenant');
    const settings = { ...(before.settings as Record<string, unknown>) };
    const modules: ModuleSettings = { ...((settings.modules as ModuleSettings | undefined) ?? {}) };
    for (const m of TenantModules) if (body.modules[m] !== undefined) modules[m] = body.modules[m];
    settings.modules = modules;
    const [after] = await tx().update(tenants).set({ settings, updatedAt: new Date() }).where(eq(tenants.id, before.id)).returning();
    await this.audit.log({ action: 'tenant.modules', entityType: 'tenant', entityId: before.id, before: { modules: (before.settings as { modules?: ModuleSettings }).modules ?? {} }, after: { modules } });
    return { modules: (after!.settings as { modules: ModuleSettings }).modules };
  }
}
