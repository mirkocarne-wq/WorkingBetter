import { z } from 'zod';

/**
 * Schemi Zod delle risposte pubblicate nel contratto OpenAPI (decoratore ZOk).
 * Sono dichiarativi: descrivono ciò che l'endpoint restituisce e generano i tipi del client.
 */
export const sessionResponse = z.object({ accessToken: z.string(), tokenType: z.literal('Bearer'), expiresIn: z.number().int(), roles: z.array(z.string()).optional() });
export const authConfigResponse = z.object({ found: z.boolean(), tenant: z.object({ name: z.string(), slug: z.string() }).nullable(), password: z.boolean(), sso: z.boolean(), devLogin: z.boolean() });
export const meResponse = z.object({
  user: z.object({ id: z.string().uuid(), email: z.string().optional(), roles: z.array(z.string()) }),
  person: z.object({ id: z.string().uuid(), firstName: z.string(), lastName: z.string(), jobTitle: z.string().nullable() }).passthrough().nullable(),
  permissions: z.array(z.string()),
});
export const healthResponse = z.object({ status: z.literal('ok'), db: z.literal('ok'), time: z.string().datetime() });
export const countResponse = z.object({ count: z.number().int() });
