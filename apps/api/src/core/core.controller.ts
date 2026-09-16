import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { meResponse } from '../common/responses.js';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { eq } from 'drizzle-orm';
import { tenants } from '@wb/db';
import { Permissions, permissionsForRoles } from '@wb/shared';
import type { z } from 'zod';
import { RequirePermission } from '../auth/decorators.js';
import { principal, tx } from '../common/context.js';
import { notFound } from '../common/errors.js';
import { ZBody, ZOk, ZQuery } from '../common/zod.pipe.js';
import { AuditService } from '../audit/audit.service.js';
import {
  assignRoleDto,
  createOrgUnitDto,
  createPersonDto,
  createUserDto,
  inviteUserDto,
  listPeopleQuery,
  updateOrgUnitDto,
  updatePersonDto,
  updateTenantSettingsDto,
} from './dto.js';
import { OrgUnitsService } from './org-units.service.js';
import { PeopleService } from './people.service.js';
import { PeopleImportService } from './people-import.service.js';
import { PersonFieldsService } from './person-fields.service.js';
import { z as zod } from 'zod';
import { UsersService } from './users.service.js';

const importDto = zod.object({ csv: zod.string().min(1).max(5_000_000), dryRun: zod.boolean().default(true), createOrgUnits: zod.boolean().default(false) });

@ApiTags('core')
@ApiBearerAuth()
@Controller()
export class CoreController {
  constructor(
    private readonly people: PeopleService,
    private readonly orgUnits: OrgUnitsService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly peopleImport: PeopleImportService,
    private readonly fields: PersonFieldsService,
  ) {}

  // ---- me & tenant ----
  @Get('me')
  @ZOk(meResponse)
  @ApiOperation({ summary: 'Principal corrente, persona collegata e permessi effettivi' })
  async me() {
    const p = principal();
    const person = await this.people.me();
    // la persona vede solo i propri campi custom con visibilità «all» (CORE-011)
    const visible = person ? this.fields.redact([person], await this.fields.activeDefs(), p)[0]! : null;
    return { user: { id: p.userId, email: p.email, roles: p.roles }, person: visible, permissions: [...permissionsForRoles(p.roles)] };
  }

  @Get('tenant')
  async tenant() {
    const [t] = await tx().select().from(tenants).where(eq(tenants.id, principal().tenantId));
    if (!t) throw notFound('Tenant');
    const settings = { ...(t.settings as Record<string, unknown>) };
    if (settings.sso && typeof settings.sso === 'object') settings.sso = { ...(settings.sso as Record<string, unknown>), clientSecretEnc: undefined };
    return { ...t, settings };
  }

  @Patch('tenant')
  @RequirePermission(Permissions.TENANT_SETTINGS)
  async updateTenant(@ZBody(updateTenantSettingsDto) body: z.infer<typeof updateTenantSettingsDto>) {
    const [before] = await tx().select().from(tenants).where(eq(tenants.id, principal().tenantId));
    if (!before) throw notFound('Tenant');
    // Le impostazioni si fondono chiave per chiave: un client che salva `branding` non cancella `sso` (e il suo secret cifrato).
    const settings = body.settings ? { ...(before.settings as Record<string, unknown>), ...body.settings } : undefined;
    const [after] = await tx().update(tenants).set({ ...body, ...(settings ? { settings } : {}), updatedAt: new Date() }).where(eq(tenants.id, principal().tenantId)).returning();
    await this.audit.log({ action: 'tenant.update', entityType: 'tenant', entityId: after!.id, before, after });
    return after;
  }

  // ---- people ----
  @Get('people')
  @RequirePermission(Permissions.PEOPLE_READ)
  async listPeople(@ZQuery(listPeopleQuery) q: z.infer<typeof listPeopleQuery>) {
    const page = await this.people.list(q);
    return { ...page, items: this.fields.redact(page.items, await this.fields.activeDefs(), principal()) };
  }

  @Get('people/import/template')
  @RequirePermission(Permissions.PEOPLE_IMPORT)
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('content-disposition', 'attachment; filename="persone-template.csv"')
  importTemplate() {
    return this.peopleImport.template();
  }

  @Post('people/import')
  @RequirePermission(Permissions.PEOPLE_IMPORT)
  @ApiOperation({ summary: 'Import persone da CSV. dryRun=true restituisce anteprima ed errori senza scrivere (CORE-012).' })
  importPeople(@ZBody(importDto) body: zod.infer<typeof importDto>) {
    return this.peopleImport.importCsv(body.csv, { dryRun: body.dryRun, createOrgUnits: body.createOrgUnits });
  }

  @Get('people/:id')
  @RequirePermission(Permissions.PEOPLE_READ)
  @ApiOperation({ summary: 'Scheda persona; customFields è ridotto ai campi visibili a chi legge (CORE-011)' })
  async getPerson(@Param('id', ParseUUIDPipe) id: string) {
    const row = await this.people.get(id);
    return this.fields.redact([row], await this.fields.activeDefs(), principal())[0];
  }

  @Get('people/:id/history')
  @RequirePermission(Permissions.PEOPLE_WRITE)
  personHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.people.history(id);
  }

  @Post('people')
  @RequirePermission(Permissions.PEOPLE_WRITE)
  createPerson(@ZBody(createPersonDto) body: z.infer<typeof createPersonDto>) {
    return this.people.create(body);
  }

  @Patch('people/:id')
  @RequirePermission(Permissions.PEOPLE_WRITE)
  updatePerson(@Param('id', ParseUUIDPipe) id: string, @ZBody(updatePersonDto) body: z.infer<typeof updatePersonDto>) {
    return this.people.update(id, body);
  }

  @Post('people/:id/terminate')
  @RequirePermission(Permissions.PEOPLE_WRITE)
  terminate(@Param('id', ParseUUIDPipe) id: string, @Body() body: { terminationDate: string }) {
    return this.people.terminate(id, body.terminationDate);
  }

  // ---- org units ----
  @Get('org-units')
  @RequirePermission(Permissions.ORG_READ)
  listOrgUnits(@Query('tree') tree?: string) {
    return tree === 'true' ? this.orgUnits.tree() : this.orgUnits.list();
  }

  @Post('org-units')
  @RequirePermission(Permissions.ORG_WRITE)
  createOrgUnit(@ZBody(createOrgUnitDto) body: z.infer<typeof createOrgUnitDto>) {
    return this.orgUnits.create(body);
  }

  @Patch('org-units/:id')
  @RequirePermission(Permissions.ORG_WRITE)
  updateOrgUnit(@Param('id', ParseUUIDPipe) id: string, @ZBody(updateOrgUnitDto) body: z.infer<typeof updateOrgUnitDto>) {
    return this.orgUnits.update(id, body);
  }

  @Delete('org-units/:id')
  @HttpCode(204)
  @RequirePermission(Permissions.ORG_WRITE)
  archiveOrgUnit(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgUnits.archive(id);
  }

  // ---- users & roles ----
  @Get('users')
  @RequirePermission(Permissions.ROLES_MANAGE)
  @ApiOperation({ summary: 'Utenti del tenant con persona, ruoli e stato (invitato, attivo, disattivato)' })
  listUsers() {
    return this.users.list();
  }

  @Post('users')
  @RequirePermission(Permissions.ROLES_MANAGE)
  createUser(@ZBody(createUserDto) body: z.infer<typeof createUserDto>) {
    return this.users.create(body);
  }

  @Post('users/invite')
  @RequirePermission(Permissions.ROLES_MANAGE)
  @ApiOperation({ summary: 'Invita una persona: crea utente (e persona se nuova), assegna i ruoli e invia il link di invito' })
  invite(@ZBody(inviteUserDto) body: z.infer<typeof inviteUserDto>) {
    return this.users.invite(body);
  }

  @Post('users/:id/resend-invite')
  @RequirePermission(Permissions.ROLES_MANAGE)
  resendInvite(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.resendInvite(id);
  }

  @Post('users/:id/disable')
  @RequirePermission(Permissions.ROLES_MANAGE)
  disable(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.setDisabled(id, true);
  }

  @Post('users/:id/enable')
  @RequirePermission(Permissions.ROLES_MANAGE)
  enable(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.setDisabled(id, false);
  }

  @Get('users/:id/roles')
  @RequirePermission(Permissions.ROLES_MANAGE)
  roles(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.rolesOf(id);
  }

  @Post('role-assignments')
  @RequirePermission(Permissions.ROLES_MANAGE)
  assignRole(@ZBody(assignRoleDto) body: z.infer<typeof assignRoleDto>) {
    return this.users.assignRole(body);
  }

  @Delete('role-assignments/:id')
  @HttpCode(204)
  @RequirePermission(Permissions.ROLES_MANAGE)
  revokeRole(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.revokeRole(id);
  }
}
