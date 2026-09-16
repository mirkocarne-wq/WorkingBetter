import { z } from 'zod';
import { BuiltInRoles, NamingConcepts, PersonFieldTypes, PersonFieldVisibilities, TenantModules, type NamingConcept, type TenantModule } from '@wb/shared';

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

/** Chiave di ruolo: predefinito oppure custom del tenant (CORE-041); l'esistenza è verificata dal servizio. */
export const roleKey = z.string().regex(/^[a-z][a-z0-9_]{1,40}$/, 'Chiave ruolo: minuscole, numeri e _');
export const assignRoleDto = z.object({
  userId: uuid,
  role: roleKey,
  scopeType: z.enum(['tenant', 'org_unit']).default('tenant'),
  scopeId: uuid.optional(),
});

export const createUserDto = z.object({
  email: z.string().email(),
  personId: uuid.optional(),
  roles: z.array(roleKey).default(['employee']),
});

/** Invito (CORE-014): persona esistente (personId) oppure nuova (nome e cognome). */
export const inviteUserDto = z.object({
  email: z.string().email(),
  personId: uuid.optional(),
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
  jobTitle: z.string().max(120).optional(),
  managerId: uuid.optional(),
  orgUnitId: uuid.optional(),
  roles: z.array(roleKey).min(1).default(['employee']),
});

export const updateTenantSettingsDto = z.object({
  name: z.string().min(1).max(120).optional(),
  defaultLocale: z.enum(['it', 'en']).optional(),
  timezone: z.string().max(60).optional(),
  settings: z.record(z.unknown()).optional(),
});

// ---- personalizzazione del tenant (sprint 26) ----
const fieldKey = z.string().regex(/^[a-z][a-z0-9_]{0,40}$/, 'Chiave: minuscole, numeri e _ (es. contract_type)');
const fieldOption = z.object({ value: z.string().min(1).max(80), label: z.string().min(1).max(120) });
/** Campo custom della persona (CORE-011). */
export const createPersonFieldDto = z.object({
  key: fieldKey,
  label: z.string().min(1).max(120),
  type: z.enum(PersonFieldTypes).default('text'),
  options: z.array(fieldOption).max(50).optional(),
  section: z.string().max(80).nullable().optional(),
  help: z.string().max(300).nullable().optional(),
  required: z.boolean().default(false),
  visibility: z.enum(PersonFieldVisibilities).default('hr'),
  position: z.number().int().min(0).max(1000).optional(),
});
export type CreatePersonFieldDto = z.infer<typeof createPersonFieldDto>;
export const updatePersonFieldDto = createPersonFieldDto.omit({ key: true }).partial().extend({ archived: z.boolean().optional() });
export type UpdatePersonFieldDto = z.infer<typeof updatePersonFieldDto>;
export const listPersonFieldsQuery = z.object({ includeArchived: z.enum(['true', 'false']).optional() });

/** Glossario aziendale (CORE-003): personalizzazioni per concetto. */
const namingEntry = z.object({ singular: z.string().max(60).optional(), plural: z.string().max(60).optional() });
export const namingQuery = z.object({ locale: z.enum(['it', 'en']).optional() });
export const putNamingDto = z.object({
  locale: z.enum(['it', 'en']).optional(),
  overrides: z.object(Object.fromEntries(NamingConcepts.map((c) => [c, namingEntry.optional()])) as Record<NamingConcept, z.ZodOptional<typeof namingEntry>>),
});
export type PutNamingDto = z.infer<typeof putNamingDto>;

/** Moduli attivi (CORE-004): chiavi assenti restano invariate. */
export const putModulesDto = z.object({
  modules: z.object(Object.fromEntries(TenantModules.map((m) => [m, z.boolean().optional()])) as Record<TenantModule, z.ZodOptional<z.ZodBoolean>>).strict(),
});
export type PutModulesDto = z.infer<typeof putModulesDto>;

/** Ruoli custom e personalizzazione dei predefiniti (CORE-041/043). */
export const createRoleDto = z.object({
  key: roleKey,
  name: z.string().min(1).max(80),
  description: z.string().max(300).nullable().optional(),
  baseRole: z.enum(BuiltInRoles),
  permissions: z.array(z.string().max(60)).max(100),
});
export type CreateRoleDto = z.infer<typeof createRoleDto>;
export const updateRoleDto = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(300).nullable().optional(),
  baseRole: z.enum(BuiltInRoles).optional(),
  permissions: z.array(z.string().max(60)).max(100).optional(),
  archived: z.boolean().optional(),
});
export type UpdateRoleDto = z.infer<typeof updateRoleDto>;
export const listRolesQuery = z.object({ includeArchived: z.enum(['true', 'false']).optional() });
