/**
 * Ruoli e permessi (vedi docs/02-specifiche-funzionali.md e docs/specifiche/core.md §3).
 * I permessi sono atomici e in inglese; i ruoli predefiniti li compongono.
 */
export const Roles = {
  SUPER_ADMIN: 'super_admin',
  TENANT_ADMIN: 'tenant_admin',
  HR_ADMIN: 'hr_admin',
  HRBP: 'hrbp',
  MANAGER: 'manager',
  EMPLOYEE: 'employee',
  OBSERVER: 'observer',
  ANALYST: 'analyst',
} as const;
export type Role = (typeof Roles)[keyof typeof Roles];

export const Permissions = {
  TENANT_SETTINGS: 'tenant:settings',
  ROLES_MANAGE: 'roles:manage',
  PEOPLE_READ: 'people:read',
  PEOPLE_WRITE: 'people:write',
  ORG_READ: 'org:read',
  ORG_WRITE: 'org:write',
  AUDIT_READ: 'audit:read',
  CYCLES_WRITE: 'cycles:write',
  OBJECTIVES_READ: 'objectives:read',
  OBJECTIVES_WRITE_OWN: 'objectives:write:own',
  OBJECTIVES_WRITE_TEAM: 'objectives:write:team',
  OBJECTIVES_WRITE_ANY: 'objectives:write:any',
  OBJECTIVES_WRITE_COMPANY: 'objectives:write:company',
  ANALYTICS_QUERY: 'analytics:query',
} as const;
export type Permission = (typeof Permissions)[keyof typeof Permissions];

const P = Permissions;
const employee: Permission[] = [P.PEOPLE_READ, P.ORG_READ, P.OBJECTIVES_READ, P.OBJECTIVES_WRITE_OWN];
const manager: Permission[] = [...employee, P.OBJECTIVES_WRITE_TEAM];
const hrbp: Permission[] = [...manager, P.PEOPLE_WRITE, P.ORG_WRITE, P.OBJECTIVES_WRITE_ANY, P.ANALYTICS_QUERY];
const hrAdmin: Permission[] = [...hrbp, P.CYCLES_WRITE, P.OBJECTIVES_WRITE_COMPANY, P.ROLES_MANAGE, P.AUDIT_READ];
const tenantAdmin: Permission[] = [...hrAdmin, P.TENANT_SETTINGS];

export const RolePermissions: Record<Role, readonly Permission[]> = {
  super_admin: Object.values(P),
  tenant_admin: tenantAdmin,
  hr_admin: hrAdmin,
  hrbp,
  manager,
  employee,
  observer: [P.PEOPLE_READ, P.ORG_READ, P.OBJECTIVES_READ, P.ANALYTICS_QUERY],
  analyst: [P.PEOPLE_READ, P.ORG_READ, P.OBJECTIVES_READ, P.ANALYTICS_QUERY],
};

export function permissionsForRoles(roles: readonly string[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const r of roles) {
    const perms = RolePermissions[r as Role];
    if (perms) for (const p of perms) out.add(p);
  }
  return out;
}

export function hasPermission(roles: readonly string[], permission: Permission): boolean {
  return permissionsForRoles(roles).has(permission);
}
