import { Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { roleAssignments, roleDefinitions } from '@wb/db';
import { BuiltInRoleLabels, BuiltInRoles, ErrorCodes, Permissions, ProtectedPermissions, RolePermissions, isBuiltInRole, type BuiltInRole, type Permission } from '@wb/shared';
import { principal, tx } from '../common/context.js';
import { conflict, notFound, unprocessable } from '../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import type { CreateRoleDto, UpdateRoleDto } from './dto.js';

export interface RoleView {
  key: string;
  name: string;
  description: string | null;
  builtIn: boolean;
  /** per i predefiniti: permessi personalizzati rispetto ai default */
  customized: boolean;
  baseRole: BuiltInRole | null;
  permissions: string[];
  defaultPermissions: string[] | null;
  assignedUsers: number;
  archivedAt: string | null;
}

const ALL_PERMISSIONS = new Set<string>(Object.values(Permissions));
const ROLE_ORDER: string[] = [...BuiltInRoles];

/** Ruoli del tenant (CORE-041/043): predefiniti (personalizzabili) e custom composti da permessi atomici. */
@Injectable()
export class RolesService {
  constructor(private readonly audit: AuditService, private readonly guard: AuthGuard) {}

  private async counts(): Promise<Map<string, number>> {
    const rows = await tx().select({ role: roleAssignments.role }).from(roleAssignments);
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.role, (m.get(r.role) ?? 0) + 1);
    return m;
  }

  async list(includeArchived = false): Promise<RoleView[]> {
    const defs = await tx().select().from(roleDefinitions).orderBy(asc(roleDefinitions.createdAt));
    const counts = await this.counts();
    const byKey = new Map(defs.map((d) => [d.key, d]));
    const builtIns: RoleView[] = BuiltInRoles.map((k) => {
      const d = byKey.get(k);
      const defaults = [...RolePermissions[k]];
      return { key: k, name: BuiltInRoleLabels[k], description: d?.description ?? null, builtIn: true, customized: !!d && !d.archivedAt, baseRole: null, permissions: d && !d.archivedAt ? d.permissions : defaults, defaultPermissions: defaults, assignedUsers: counts.get(k) ?? 0, archivedAt: null };
    });
    const custom: RoleView[] = defs.filter((d) => !isBuiltInRole(d.key) && (includeArchived || !d.archivedAt)).map((d) => ({
      key: d.key, name: d.name, description: d.description, builtIn: false, customized: false, baseRole: (d.baseRole as BuiltInRole | null) ?? null, permissions: d.permissions, defaultPermissions: null, assignedUsers: counts.get(d.key) ?? 0, archivedAt: d.archivedAt ? d.archivedAt.toISOString() : null,
    }));
    return [...builtIns.sort((a, b) => ROLE_ORDER.indexOf(a.key) - ROLE_ORDER.indexOf(b.key)), ...custom];
  }

  /** Chiavi assegnabili: predefiniti più custom attivi (usato da inviti e assegnazioni). */
  async assignableKeys(): Promise<Set<string>> {
    const defs = await tx().select({ key: roleDefinitions.key, archivedAt: roleDefinitions.archivedAt }).from(roleDefinitions);
    return new Set<string>([...BuiltInRoles, ...defs.filter((d) => !d.archivedAt && !isBuiltInRole(d.key)).map((d) => d.key)]);
  }

  private cleanPermissions(key: string, perms: readonly string[]): string[] {
    const bad = perms.filter((p) => !ALL_PERMISSIONS.has(p));
    if (bad.length) throw unprocessable(ErrorCodes.VALIDATION, `Permessi sconosciuti: ${bad.join(', ')}`);
    const out = new Set(perms);
    if (key === 'tenant_admin') for (const p of ProtectedPermissions) out.add(p);
    return [...out];
  }

  async create(dto: CreateRoleDto): Promise<RoleView> {
    const p = principal();
    if (isBuiltInRole(dto.key) || dto.key === 'super_admin') throw conflict(ErrorCodes.CONFLICT, `«${dto.key}» è un ruolo predefinito: personalizzalo con PATCH /roles/${dto.key}`);
    const [dup] = await tx().select({ id: roleDefinitions.id }).from(roleDefinitions).where(eq(roleDefinitions.key, dto.key));
    if (dup) throw conflict(ErrorCodes.CONFLICT, `Esiste già un ruolo con chiave «${dto.key}»`);
    const permissions = this.cleanPermissions(dto.key, dto.permissions);
    const [row] = await tx().insert(roleDefinitions).values({ tenantId: p.tenantId, createdBy: p.userId, key: dto.key, name: dto.name, description: dto.description ?? null, baseRole: dto.baseRole, permissions }).returning();
    await this.audit.log({ action: 'role.create', entityType: 'role', entityId: row!.id, after: row });
    this.guard.forgetRoles(p.tenantId);
    return (await this.list(true)).find((r) => r.key === dto.key)!;
  }

  /** Aggiorna un ruolo custom oppure personalizza un predefinito (crea la definizione se manca). */
  async update(key: string, dto: UpdateRoleDto): Promise<RoleView> {
    const p = principal();
    if (key === 'super_admin') throw unprocessable(ErrorCodes.VALIDATION, 'Il ruolo di piattaforma non è modificabile');
    const [existing] = await tx().select().from(roleDefinitions).where(eq(roleDefinitions.key, key));
    const builtIn = isBuiltInRole(key);
    if (!existing && !builtIn) throw notFound('Ruolo', key);
    if (dto.archived && builtIn) throw unprocessable(ErrorCodes.VALIDATION, 'Un ruolo predefinito non si archivia: ripristina i default con /reset');
    if (dto.archived && existing) {
      const counts = await this.counts();
      if ((counts.get(key) ?? 0) > 0) throw conflict(ErrorCodes.CONFLICT, `Il ruolo è assegnato a ${counts.get(key)} utenti: rimuovilo prima dalle assegnazioni`);
    }
    const permissions = dto.permissions ? this.cleanPermissions(key, dto.permissions) : undefined;
    const patch = { ...(dto.name !== undefined ? { name: dto.name } : {}), ...(dto.description !== undefined ? { description: dto.description } : {}), ...(dto.baseRole !== undefined && !builtIn ? { baseRole: dto.baseRole } : {}), ...(permissions ? { permissions } : {}), ...(dto.archived !== undefined ? { archivedAt: dto.archived ? (existing?.archivedAt ?? new Date()) : null } : {}), updatedAt: new Date() };
    if (existing) {
      const [row] = await tx().update(roleDefinitions).set(patch).where(eq(roleDefinitions.id, existing.id)).returning();
      await this.audit.log({ action: 'role.update', entityType: 'role', entityId: existing.id, before: existing, after: row });
    } else {
      const [row] = await tx().insert(roleDefinitions).values({ tenantId: p.tenantId, createdBy: p.userId, key, name: dto.name ?? BuiltInRoleLabels[key as BuiltInRole], description: dto.description ?? null, baseRole: null, permissions: permissions ?? [...RolePermissions[key as BuiltInRole]] }).returning();
      await this.audit.log({ action: 'role.customize', entityType: 'role', entityId: row!.id, after: row });
    }
    this.guard.forgetRoles(p.tenantId);
    return (await this.list(true)).find((r) => r.key === key)!;
  }

  /** Riporta un ruolo predefinito ai permessi standard della piattaforma. */
  async reset(key: string): Promise<RoleView> {
    const p = principal();
    if (!isBuiltInRole(key)) throw unprocessable(ErrorCodes.VALIDATION, 'Solo i ruoli predefiniti si ripristinano');
    const [existing] = await tx().select().from(roleDefinitions).where(eq(roleDefinitions.key, key));
    if (existing) {
      await tx().delete(roleDefinitions).where(eq(roleDefinitions.id, existing.id));
      await this.audit.log({ action: 'role.reset', entityType: 'role', entityId: existing.id, before: existing });
      this.guard.forgetRoles(p.tenantId);
    }
    return (await this.list()).find((r) => r.key === key)!;
  }

  /** Permessi effettivi di un ruolo (per la vista «cosa può fare»). */
  permissionKeys(): Permission[] { return [...ALL_PERMISSIONS] as Permission[]; }
}
