import { z } from 'zod';

const uuid = z.string().uuid();
const email = z.string().email().max(200).transform((v) => v.toLowerCase());

export const platformLoginDto = z.object({ email, password: z.string().min(1).max(200) });
export const changePasswordDto = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(10).max(200) });
export const createOperatorDto = z.object({ email, firstName: z.string().min(1).max(80), lastName: z.string().max(80).default(''), password: z.string().min(10).max(200) });
export const operatorStateDto = z.object({ disabled: z.boolean() });

export const listTenantsQuery = z.object({ q: z.string().max(100).optional(), status: z.enum(['active', 'suspended']).optional() });
export const createTenantDto = z.object({
  name: z.string().min(2).max(120),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/, 'minuscole, cifre e trattini'),
  timezone: z.string().min(3).max(60).default('Europe/Rome'),
  defaultLocale: z.enum(['it', 'en']).default('it'),
  admin: z.object({ email, firstName: z.string().min(1).max(80), lastName: z.string().max(80).default('') }),
});
export const updateTenantDto = z.object({ name: z.string().min(2).max(120).optional(), timezone: z.string().min(3).max(60).optional(), defaultLocale: z.enum(['it', 'en']).optional(), status: z.enum(['active', 'suspended']).optional() });
export const inviteAdminDto = z.object({ email, firstName: z.string().min(1).max(80), lastName: z.string().max(80).default('') });
export const auditQuery = z.object({ action: z.string().max(80).optional(), limit: z.coerce.number().int().min(1).max(500).default(100) });

export const searchUsersQuery = z.object({ q: z.string().min(2).max(200), tenantId: uuid.optional() });
export const userActionDto = z.object({ action: z.enum(['reset_password', 'unlock', 'revoke_sessions', 'disable', 'enable', 'disable_mfa']) });

export const eventsQuery = z.object({ tenantId: uuid.optional(), action: z.string().max(80).optional(), limit: z.coerce.number().int().min(1).max(500).default(100) });
