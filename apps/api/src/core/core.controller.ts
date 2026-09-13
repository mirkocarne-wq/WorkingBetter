import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { eq } from 'drizzle-orm';
import { tenants } from '@wb/db';
import { Permissions, permissionsForRoles } from '@wb/shared';
import type { z } from 'zod';
import { RequirePermission } from '../auth/decorators.js';
import { principal, tx } from '../common/context.js';
import { notFound } from '../common/errors.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { AuditService } from '../audit/audit.service.js';
import {
  assignRoleDto,
  createOrgUnitDto,
  createPersonDto,
  createUserDto,
  listPeopleQuery,
  updateOrgUnitDto,
  updatePersonDto,
  updateTenantSettingsDto,
} from './dto.js';
import { OrgUnitsService } from './org-units.service.js';
import { PeopleService } from './people.service.js';
import { UsersService } from './users.service.js';

@ApiTags('core')
@ApiBearerAuth()
@Controller()
export class CoreController {
  constructor(
    private readonly people: PeopleService,
    private readonly orgUnits: OrgUnitsService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  // ---- me & tenant ----
  @Get('me')
  @ApiOperation({ summary: 'Principal corrente, persona collegata e permessi effettivi' })
  async me() {
    const p = principal();
    const person = await this.people.me();
    return { user: { id: p.userId, email: p.email, roles: p.roles }, person, permissions: [...permissionsForRoles(p.roles)] };
  }

  @Get('tenant')
  async tenant() {
    const [t] = await tx().select().from(tenants).where(eq(tenants.id, principal().tenantId));
    if (!t) throw notFound('Tenant');
    return t;
  }

  @Patch('tenant')
  @RequirePermission(Permissions.TENANT_SETTINGS)
  async updateTenant(@Body(new ZodValidationPipe(updateTenantSettingsDto)) body: z.infer<typeof updateTenantSettingsDto>) {
    const [before] = await tx().select().from(tenants).where(eq(tenants.id, principal().tenantId));
    const [after] = await tx().update(tenants).set({ ...body, updatedAt: new Date() }).where(eq(tenants.id, principal().tenantId)).returning();
    await this.audit.log({ action: 'tenant.update', entityType: 'tenant', entityId: after!.id, before, after });
    return after;
  }

  // ---- people ----
  @Get('people')
  @RequirePermission(Permissions.PEOPLE_READ)
  listPeople(@Query(new ZodValidationPipe(listPeopleQuery)) q: z.infer<typeof listPeopleQuery>) {
    return this.people.list(q);
  }

  @Get('people/:id')
  @RequirePermission(Permissions.PEOPLE_READ)
  getPerson(@Param('id', ParseUUIDPipe) id: string) {
    return this.people.get(id);
  }

  @Get('people/:id/history')
  @RequirePermission(Permissions.PEOPLE_WRITE)
  personHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.people.history(id);
  }

  @Post('people')
  @RequirePermission(Permissions.PEOPLE_WRITE)
  createPerson(@Body(new ZodValidationPipe(createPersonDto)) body: z.infer<typeof createPersonDto>) {
    return this.people.create(body);
  }

  @Patch('people/:id')
  @RequirePermission(Permissions.PEOPLE_WRITE)
  updatePerson(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updatePersonDto)) body: z.infer<typeof updatePersonDto>) {
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
  createOrgUnit(@Body(new ZodValidationPipe(createOrgUnitDto)) body: z.infer<typeof createOrgUnitDto>) {
    return this.orgUnits.create(body);
  }

  @Patch('org-units/:id')
  @RequirePermission(Permissions.ORG_WRITE)
  updateOrgUnit(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodValidationPipe(updateOrgUnitDto)) body: z.infer<typeof updateOrgUnitDto>) {
    return this.orgUnits.update(id, body);
  }

  @Delete('org-units/:id')
  @HttpCode(204)
  @RequirePermission(Permissions.ORG_WRITE)
  archiveOrgUnit(@Param('id', ParseUUIDPipe) id: string) {
    return this.orgUnits.archive(id);
  }

  // ---- users & roles ----
  @Post('users')
  @RequirePermission(Permissions.ROLES_MANAGE)
  createUser(@Body(new ZodValidationPipe(createUserDto)) body: z.infer<typeof createUserDto>) {
    return this.users.create(body);
  }

  @Get('users/:id/roles')
  @RequirePermission(Permissions.ROLES_MANAGE)
  roles(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.rolesOf(id);
  }

  @Post('role-assignments')
  @RequirePermission(Permissions.ROLES_MANAGE)
  assignRole(@Body(new ZodValidationPipe(assignRoleDto)) body: z.infer<typeof assignRoleDto>) {
    return this.users.assignRole(body);
  }

  @Delete('role-assignments/:id')
  @HttpCode(204)
  @RequirePermission(Permissions.ROLES_MANAGE)
  revokeRole(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.revokeRole(id);
  }
}
