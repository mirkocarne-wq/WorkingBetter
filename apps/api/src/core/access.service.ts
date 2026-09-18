import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { orgUnits, persons, roleAssignments, roleDefinitions, tenants, users } from '@wb/db';
import { BuiltInRoleLabels, PermissionCatalog, TenantModuleLabels, baseRolesOf, guideProfileForRoles, isBuiltInRole, isModuleEnabled, resolvePermissions, type BuiltInRole, type ModuleSettings, type RoleDefinition, type TenantModule } from '@wb/shared';
import { tx } from '../common/context.js';
import { notFound } from '../common/errors.js';

/** Vista «cosa vede X» (CORE-044): ruoli, permessi effettivi per modulo e perimetro di dato di un utente. */
@Injectable()
export class AccessService {
  async ofUser(userId: string) {
    const [u] = await tx().select().from(users).where(eq(users.id, userId));
    if (!u) throw notFound('Utente', userId);
    const person = u.personId ? (await tx().select().from(persons).where(eq(persons.id, u.personId)))[0] ?? null : null;
    const assignments = await tx().select().from(roleAssignments).where(eq(roleAssignments.userId, userId));
    const defs: RoleDefinition[] = (await tx().select().from(roleDefinitions).where(isNull(roleDefinitions.archivedAt))).map((d) => ({ key: d.key, name: d.name, description: d.description, baseRole: (d.baseRole as BuiltInRole | null) ?? null, permissions: d.permissions }));
    const [t] = await tx().select({ settings: tenants.settings }).from(tenants);
    const modules = (t?.settings as { modules?: ModuleSettings } | undefined) ?? {};
    const roleKeys = [...new Set(assignments.map((a) => a.role))];
    const implicit = baseRolesOf(roleKeys, defs);
    const permissions = resolvePermissions(roleKeys, defs);
    const unitIds = assignments.map((a) => a.scopeId).filter((x): x is string => !!x);
    const units = unitIds.length ? await tx().select({ id: orgUnits.id, name: orgUnits.name }).from(orgUnits).where(inArray(orgUnits.id, unitIds)) : [];
    const unitName = new Map(units.map((x) => [x.id, x.name]));
    const defByKey = new Map(defs.map((d) => [d.key, d]));
    const roles = assignments.map((a) => ({
      key: a.role,
      name: defByKey.get(a.role)?.name ?? (isBuiltInRole(a.role) ? BuiltInRoleLabels[a.role] : a.role),
      builtIn: isBuiltInRole(a.role),
      customized: isBuiltInRole(a.role) && defByKey.has(a.role),
      baseRole: defByKey.get(a.role)?.baseRole ?? null,
      scopeType: a.scopeType,
      scopeId: a.scopeId,
      scopeName: a.scopeId ? (unitName.get(a.scopeId) ?? null) : null,
    }));
    // perimetro di dato: riporti diretti e indiretti della persona collegata
    const direct = person ? await tx().select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName, jobTitle: persons.jobTitle }).from(persons).where(and(eq(persons.managerId, person.id), inArray(persons.status, ['active', 'invited', 'leaving']))) : [];
    let indirect = 0;
    if (direct.length) {
      let frontier = direct.map((d) => d.id);
      for (let depth = 0; depth < 6 && frontier.length; depth++) {
        const next = await tx().select({ id: persons.id }).from(persons).where(and(inArray(persons.managerId, frontier), inArray(persons.status, ['active', 'invited', 'leaving'])));
        indirect += next.length;
        frontier = next.map((n) => n.id);
      }
    }
    const effectiveRoles = [...roleKeys, ...implicit];
    const catalog = PermissionCatalog.map((g) => ({
      module: g.module,
      title: g.title,
      moduleEnabled: g.module === 'core' || g.module === 'forms' || isModuleEnabled(modules, g.module as TenantModule),
      moduleLabel: g.module === 'core' || g.module === 'forms' ? null : (TenantModuleLabels[g.module as TenantModule]?.name ?? g.module),
      items: g.items.map((i) => ({ key: i.key, label: i.label, granted: permissions.has(i.key) })),
    }));
    const isHr = permissions.has('people:write');
    return {
      user: { id: u.id, email: u.email, disabledAt: u.disabledAt, lastLoginAt: u.lastLoginAt, authProvider: u.authProvider, mfaEnabled: !!u.mfaEnabledAt },
      person: person ? { id: person.id, firstName: person.firstName, lastName: person.lastName, jobTitle: person.jobTitle, orgUnitId: person.orgUnitId, managerId: person.managerId, status: person.status } : null,
      roles,
      implicitRoles: implicit,
      guideProfile: guideProfileForRoles(effectiveRoles),
      permissions: [...permissions],
      catalog,
      perimeter: {
        directReports: direct,
        indirectReportsCount: indirect,
        orgUnitScopes: roles.filter((r) => r.scopeType === 'org_unit' && r.scopeName).map((r) => ({ id: r.scopeId!, name: r.scopeName!, role: r.key })),
        /** i moduli oggi distinguono tenant e team del manager: il perimetro per unità è registrato, non ancora applicato */
        orgUnitScopeApplied: false,
        customFieldsVisibility: isHr ? 'hr' : direct.length ? 'manager' : 'all',
        seesEveryone: isHr || permissions.has('objectives:write:any') || permissions.has('analytics:query'),
      },
    };
  }
}
