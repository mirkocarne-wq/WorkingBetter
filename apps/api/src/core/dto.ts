import { z } from 'zod';
import { Roles } from '@wb/shared';

const uuid = z.string().uuid();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato data AAAA-MM-GG');

export const createPersonDto = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email().optional(),
  employeeNumber: z.string().max(50).optional(),
  jobTitle: z.string().max(120).optional(),
  jobLevel: z.string().max(60).optional(),
  location: z.string().max(120).optional(),
  hireDate: isoDate.optional(),
  orgUnitId: uuid.optional(),
  managerId: uuid.optional(),
  customFields: z.record(z.unknown()).optional(),
});
export type CreatePersonDto = z.infer<typeof createPersonDto>;

export const updatePersonDto = createPersonDto.partial().extend({
  status: z.enum(['active', 'leaving', 'suspended']).optional(),
  terminationDate: isoDate.nullable().optional(),
});
export type UpdatePersonDto = z.infer<typeof updatePersonDto>;

export const listPeopleQuery = z.object({
  q: z.string().max(100).optional(),
  orgUnitId: uuid.optional(),
  managerId: uuid.optional(),
  status: z.enum(['invited', 'active', 'leaving', 'terminated', 'suspended']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export const createOrgUnitDto = z.object({
  name: z.string().min(1).max(120),
  code: z.string().max(40).optional(),
  parentId: uuid.nullable().optional(),
});
export const updateOrgUnitDto = createOrgUnitDto.partial();

export const assignRoleDto = z.object({
  userId: uuid,
  role: z.enum([Roles.TENANT_ADMIN, Roles.HR_ADMIN, Roles.HRBP, Roles.MANAGER, Roles.EMPLOYEE, Roles.OBSERVER, Roles.ANALYST]),
  scopeType: z.enum(['tenant', 'org_unit']).default('tenant'),
  scopeId: uuid.optional(),
});

export const createUserDto = z.object({
  email: z.string().email(),
  personId: uuid.optional(),
  roles: z.array(z.string()).default(['employee']),
});

export const updateTenantSettingsDto = z.object({
  name: z.string().min(1).max(120).optional(),
  defaultLocale: z.enum(['it', 'en']).optional(),
  timezone: z.string().max(60).optional(),
  settings: z.record(z.unknown()).optional(),
});
