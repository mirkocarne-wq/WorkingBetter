import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_CORS_ORIGIN: z.string().default('http://localhost:3000'),
  /** dietro reverse proxy (Caddy, nginx, bilanciatore): usa X-Forwarded-For per l'IP del client (rate limiting, audit) */
  API_TRUST_PROXY: z.enum(['true','false']).default('false').transform((v) => v === 'true'),
  DATABASE_URL: z.string().url().optional(),
  DB_APP_ROLE: z.string().regex(/^[a-z_][a-z0-9_]*$/).optional().or(z.literal('').transform(() => undefined)),
  /** dev = login di sviluppo attivo; prod = solo password e SSO (ADR-0007). `oidc` è accettato come alias di prod. */
  AUTH_MODE: z.enum(['dev', 'prod', 'oidc']).default('dev').transform((v) => (v === 'oidc' ? 'prod' : v)),
  AUTH_DEV_SECRET: z.string().min(32).optional(),
  /** chiave HS256 delle sessioni emesse dall'API; in dev ricade su AUTH_DEV_SECRET */
  AUTH_SESSION_SECRET: z.string().min(32).optional().or(z.literal('').transform(() => undefined)),
  AUTH_SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(12),
  /** IdP di piattaforma opzionale: i token emessi da questo issuer sono accettati come Bearer (client macchina) */
  AUTH_ISSUER: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  AUTH_AUDIENCE: z.string().default('workingbetter-api'),
  /** URL pubblico della web app: link nelle email (inviti, reset) e redirect al termine del login SSO */
  APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  /** mittente logico degli inviti iCalendar (ORGANIZER): deve coincidere con EMAIL_FROM del worker */
  CALENDAR_ORGANIZER_EMAIL: z.string().email().default('no-reply@workingbetter.local'),
  /** URL pubblico dell'API (redirect URI del flusso OIDC) */
  API_PUBLIC_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  /** 32 byte in esadecimale: cifratura delle note private 1:1. Obbligatoria in produzione. */
  NOTES_MASTER_KEY: z.string().regex(/^[0-9a-f]{64}$/i).optional().or(z.literal('').transform(() => undefined)),
  /** console di piattaforma (ADR-0013): primo operatore all'avvio se non ne esistono; URL pubblico della console; certificati locali da monitorare */
  PLATFORM_BOOTSTRAP_EMAIL: z.string().email().optional().or(z.literal('').transform(() => undefined)),
  PLATFORM_BOOTSTRAP_PASSWORD: z.string().min(10).optional().or(z.literal('').transform(() => undefined)),
  CONSOLE_PUBLIC_URL: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  TLS_CERT_FILES: z.string().optional().or(z.literal('').transform(() => undefined)),
  REDIS_URL: z.string().optional().or(z.literal('').transform(() => undefined)),
  /** segreto condiviso con il worker per il tick giornaliero delle automazioni (ADR-0015) */
  INTERNAL_JOB_TOKEN: z.string().min(16).optional().or(z.literal('').transform(() => undefined)),
});

export type AppConfig = z.infer<typeof schema>;
export const CONFIG = Symbol('CONFIG');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const cfg = schema.parse(env);
  if (cfg.AUTH_MODE === 'dev' && !cfg.AUTH_DEV_SECRET && !cfg.AUTH_SESSION_SECRET) throw new Error('AUTH_DEV_SECRET (o AUTH_SESSION_SECRET) è obbligatoria con AUTH_MODE=dev (min 32 caratteri)');
  if (cfg.AUTH_MODE === 'prod' && !cfg.AUTH_SESSION_SECRET) throw new Error('AUTH_SESSION_SECRET è obbligatoria con AUTH_MODE=prod (min 32 caratteri)');
  if (cfg.AUTH_MODE === 'dev' && cfg.NODE_ENV === 'production') throw new Error('AUTH_MODE=dev non è consentito in produzione');
  if (cfg.NODE_ENV === 'production' && !cfg.NOTES_MASTER_KEY) throw new Error('NOTES_MASTER_KEY è obbligatoria in produzione');
  return cfg;
}
