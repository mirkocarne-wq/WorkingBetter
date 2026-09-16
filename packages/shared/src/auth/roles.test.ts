import { describe, expect, it } from 'vitest';
import { baseRolesOf, effectivePermissions, hasPermission, resolvePermissions, type RoleDefinition } from './roles.js';

const defs: RoleDefinition[] = [
  { key: 'manager', name: 'Manager', baseRole: null, permissions: ['people:read', 'objectives:read', 'objectives:write:team'] },
  { key: 'people_ops', name: 'People Ops', baseRole: 'hrbp', permissions: ['people:read', 'people:write', 'people:import', 'nope:zzz'] },
  { key: 'tenant_admin', name: 'Admin', baseRole: null, permissions: ['people:read'] },
];

describe('resolvePermissions', () => {
  it('uses defaults without definitions', () => {
    expect(resolvePermissions(['employee']).has('objectives:write:own')).toBe(true);
    expect(resolvePermissions(['manager']).has('surveys:results:team')).toBe(true);
  });
  it('a customized built-in role loses the permissions removed by the tenant', () => {
    const p = resolvePermissions(['manager'], defs);
    expect(p.has('surveys:results:team')).toBe(false);
    expect(p.has('objectives:write:team')).toBe(true);
  });
  it('a custom role grants only its own permissions and ignores unknown keys', () => {
    const p = resolvePermissions(['people_ops'], defs);
    expect([...p].sort()).toEqual(['people:import', 'people:read', 'people:write']);
  });
  it('tenant admin keeps the protected permissions; super_admin has everything', () => {
    const p = resolvePermissions(['tenant_admin'], defs);
    expect(p.has('tenant:settings')).toBe(true);
    expect(p.has('roles:manage')).toBe(true);
    expect(p.has('welfare:manage')).toBe(false);
    expect(resolvePermissions(['super_admin'], defs).has('welfare:manage')).toBe(true);
  });
});

describe('baseRolesOf / hasPermission', () => {
  it('adds the base role of custom roles once', () => {
    expect(baseRolesOf(['people_ops', 'employee'], defs)).toEqual(['hrbp']);
    expect(baseRolesOf(['people_ops', 'hrbp'], defs)).toEqual([]);
  });
  it('prefers resolved permissions on a principal over role defaults', () => {
    expect(hasPermission({ roles: ['manager'], permissions: ['people:read'] }, 'surveys:results:team')).toBe(false);
    expect(hasPermission({ roles: ['manager'] }, 'surveys:results:team')).toBe(true);
    expect(hasPermission(['manager'], 'surveys:results:team')).toBe(true);
    expect(effectivePermissions({ roles: ['employee'], permissions: [] }).size).toBe(0);
  });
});
