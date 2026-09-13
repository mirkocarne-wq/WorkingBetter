import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { roleAssignments, users } from '@wb/db';
import { ErrorCodes } from '@wb/shared';
import { z } from 'zod';
import { principal, tx } from '../common/context.js';
import { conflict, notFound } from '../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import type { assignRoleDto, createUserDto } from './dto.js';

@Injectable()
export class UsersService {
  constructor(private readonly audit: AuditService) {}

  async create(dto: z.infer<typeof createUserDto>) {
    const p = principal();
    const email = dto.email.toLowerCase();
    const [existing] = await tx().select().from(users).where(eq(users.email, email));
    if (existing) throw conflict(ErrorCodes.CONFLICT, `Esiste già un utente con email ${email}`);
    const [user] = await tx().insert(users).values({ tenantId: p.tenantId, createdBy: p.userId, email, personId: dto.personId ?? null }).returning();
    for (const role of dto.roles) {
      await tx().insert(roleAssignments).values({ tenantId: p.tenantId, createdBy: p.userId, userId: user!.id, role });
    }
    await this.audit.log({ action: 'user.create', entityType: 'user', entityId: user!.id, after: { ...user, roles: dto.roles } });
    return { ...user!, roles: dto.roles };
  }

  async rolesOf(userId: string) {
    return tx().select().from(roleAssignments).where(eq(roleAssignments.userId, userId));
  }

  async assignRole(dto: z.infer<typeof assignRoleDto>) {
    const p = principal();
    const [user] = await tx().select().from(users).where(eq(users.id, dto.userId));
    if (!user) throw notFound('Utente', dto.userId);
    const [dup] = await tx()
      .select()
      .from(roleAssignments)
      .where(and(eq(roleAssignments.userId, dto.userId), eq(roleAssignments.role, dto.role), eq(roleAssignments.scopeType, dto.scopeType)));
    if (dup) return dup;
    const [row] = await tx()
      .insert(roleAssignments)
      .values({ tenantId: p.tenantId, createdBy: p.userId, userId: dto.userId, role: dto.role, scopeType: dto.scopeType, scopeId: dto.scopeId ?? null })
      .returning();
    await this.audit.log({ action: 'role.assign', entityType: 'user', entityId: dto.userId, after: row });
    return row!;
  }

  async revokeRole(assignmentId: string) {
    const [row] = await tx().delete(roleAssignments).where(eq(roleAssignments.id, assignmentId)).returning();
    if (!row) throw notFound('Assegnazione ruolo', assignmentId);
    await this.audit.log({ action: 'role.revoke', entityType: 'user', entityId: row.userId, before: row });
  }
}
