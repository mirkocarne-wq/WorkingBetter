import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_CORS_ORIGIN: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().url().optional(),
  DB_APP_ROLE: z.string().regex(/^[a-z_][a-z0-9_]*$/).optional().or(z.literal('').transform(() => undefined)),
  AUTH_MODE: z.enum(['dev', 'oidc']).default('dev'),
  AUTH_DEV_SECRET: z.string().min(32).optional(),
  AUTH_ISSUER: z.string().url().optional(),
  AUTH_AUDIENCE: z.string().default('workingbetter-api'),
});

export type AppConfig = z.infer<typeof schema>;
export const CONFIG = Symbol('CONFIG');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const cfg = schema.parse(env);
  if (cfg.AUTH_MODE === 'dev' && !cfg.AUTH_DEV_SECRET) throw new Error('AUTH_DEV_SECRET è obbligatoria con AUTH_MODE=dev (min 32 caratteri)');
  if (cfg.AUTH_MODE === 'oidc' && !cfg.AUTH_ISSUER) throw new Error('AUTH_ISSUER è obbligatoria con AUTH_MODE=oidc');
  if (cfg.AUTH_MODE === 'dev' && cfg.NODE_ENV === 'production') throw new Error('AUTH_MODE=dev non è consentito in produzione');
  return cfg;
}
