import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { persons, roleAssignments, tenants, users } from '@wb/db';
import { ErrorCodes } from '@wb/shared';
import { z } from 'zod';
import { principal, tx } from '../common/context.js';
import { conflict, notFound, unprocessable } from '../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { AuthService } from '../auth/auth.service.js';
import type { assignRoleDto, createUserDto, inviteUserDto } from './dto.js';

export type UserStatus = 'invited' | 'active' | 'disabled' | 'expired';

@Injectable()
export class UsersService {
  constructor(private readonly audit: AuditService, private readonly auth: AuthService, private readonly guard: AuthGuard) {}

  /** Elenco utenti con persona, ruoli e stato (CORE-014). */
  async list() {
    const rows = await tx().select().from(users).orderBy(asc(users.email));
    const personIds = rows.map((u) => u.personId).filter((x): x is string => !!x);
    const people = personIds.length ? await tx().select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName, jobTitle: persons.jobTitle, status: persons.status }).from(persons).where(inArray(persons.id, personIds)) : [];
    const roles = rows.length ? await tx().select().from(roleAssignments).where(inArray(roleAssignments.userId, rows.map((u) => u.id))) : [];
    const byPerson = new Map(people.map((p) => [p.id, p]));
    const now = new Date();
    return rows.map((u) => ({
      id: u.id,
      email: u.email,
      person: u.personId ? (byPerson.get(u.personId) ?? null) : null,
      roles: roles.filter((r) => r.userId === u.id).map((r) => ({ id: r.id, role: r.role, scopeType: r.scopeType })),
      status: (u.disabledAt ? 'disabled' : u.passwordHash || u.externalSubject || u.lastLoginAt || u.inviteAcceptedAt ? 'active' : u.inviteExpiresAt && u.inviteExpiresAt < now ? 'expired' : 'invited') as UserStatus,
      authProvider: u.authProvider,
      invitedAt: u.invitedAt,
      inviteExpiresAt: u.inviteExpiresAt,
      lastLoginAt: u.lastLoginAt,
      disabledAt: u.disabledAt,
    }));
  }

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

  /** Invito: persona esistente o nuova, utente, ruoli, email con link monouso (CORE-014). */
  async invite(dto: z.infer<typeof inviteUserDto>) {
    const p = principal();
    const email = dto.email.toLowerCase();
    const [existing] = await tx().select().from(users).where(eq(users.email, email));
    if (existing) throw conflict(ErrorCodes.CONFLICT, `Esiste già un utente con email ${email}: usa "Reinvia invito"`);
    let personId = dto.personId ?? null;
    if (personId) {
      const [person] = await tx().select().from(persons).where(eq(persons.id, personId));
      if (!person) throw notFound('Persona', personId);
      const [linked] = await tx().select({ id: users.id }).from(users).where(eq(users.personId, personId));
      if (linked) throw conflict(ErrorCodes.CONFLICT, 'La persona ha già un utente');
      if (!person.email) await tx().update(persons).set({ email, updatedAt: new Date() }).where(eq(persons.id, personId));
    } else {
      if (!dto.firstName || !dto.lastName) throw unprocessable(ErrorCodes.VALIDATION, 'Per una nuova persona servono nome e cognome');
      const [byEmail] = await tx().select({ id: persons.id }).from(persons).where(eq(persons.email, email));
      if (byEmail) personId = byEmail.id;
      else {
        const [person] = await tx().insert(persons).values({ tenantId: p.tenantId, createdBy: p.userId, firstName: dto.firstName, lastName: dto.lastName, email, jobTitle: dto.jobTitle ?? null, managerId: dto.managerId ?? null, orgUnitId: dto.orgUnitId ?? null, status: 'invited' }).returning();
        personId = person!.id;
      }
    }
    const [user] = await tx().insert(users).values({ tenantId: p.tenantId, createdBy: p.userId, email, personId }).returning();
    for (const role of dto.roles) await tx().insert(roleAssignments).values({ tenantId: p.tenantId, createdBy: p.userId, userId: user!.id, role });
    const [t] = await tx().select({ id: tenants.id, name: tenants.name }).from(tenants).where(eq(tenants.id, p.tenantId));
    const { inviteUrl } = await this.auth.sendInvite(tx(), t!, user!);
    await this.audit.log({ action: 'user.invite', entityType: 'user', entityId: user!.id, after: { email, personId, roles: dto.roles } });
    return { id: user!.id, email, personId, roles: dto.roles, inviteUrl };
  }

  async resendInvite(userId: string) {
    const p = principal();
    const [user] = await tx().select().from(users).where(eq(users.id, userId));
    if (!user) throw notFound('Utente', userId);
    if (user.disabledAt) throw conflict(ErrorCodes.CONFLICT, 'Utente disattivato');
    const [t] = await tx().select({ id: tenants.id, name: tenants.name }).from(tenants).where(eq(tenants.id, p.tenantId));
    const { inviteUrl } = await this.auth.sendInvite(tx(), t!, user);
    await this.audit.log({ action: 'user.invite_resend', entityType: 'user', entityId: userId });
    return { id: userId, inviteUrl };
  }

  async setDisabled(userId: string, disabled: boolean) {
    const p = principal();
    if (disabled && userId === p.userId) throw conflict(ErrorCodes.CONFLICT, 'Non puoi disattivare il tuo utente');
    const [user] = await tx().select().from(users).where(eq(users.id, userId));
    if (!user) throw notFound('Utente', userId);
    const [after] = await tx().update(users).set({ disabledAt: disabled ? new Date() : null, ...(disabled ? { sessionsRevokedAt: new Date() } : {}), updatedAt: new Date() }).where(eq(users.id, userId)).returning();
    this.guard.forget(userId);
    await this.audit.log({ action: disabled ? 'user.disable' : 'user.enable', entityType: 'user', entityId: userId });
    return { id: after!.id, disabledAt: after!.disabledAt };
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
