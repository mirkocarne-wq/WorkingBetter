import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().optional(),
  /** log = stampa le email nel log (dev/test); smtp = invio reale */
  EMAIL_TRANSPORT: z.enum(['log', 'smtp']).default('log'),
  SMTP_URL: z.string().optional(), // smtp://user:pass@host:587
  EMAIL_FROM: z.string().default('WorkingBetter <no-reply@workingbetter.local>'),
  APP_BASE_URL: z.string().url().default('http://localhost:3000'),
  REMINDERS_CRON: z.string().default('0 7 * * *'), // ogni giorno alle 7 (UTC)
  MART_REFRESH_CRON: z.string().default('30 2 * * *'), // snapshot giornaliero del data mart (UTC)
  EMAIL_DISPATCH_EVERY_MS: z.coerce.number().int().min(5000).default(30000),
  /** master key per decifrare i token dei connettori (stessa dell'API); senza chiave i job calendario/chat restano fermi */
  /** ammette webhook verso indirizzi privati/locali (solo sviluppo e test) */
  ALLOW_PRIVATE_URLS: z.coerce.boolean().default(false),
  NOTES_MASTER_KEY: z.string().regex(/^[0-9a-f]{64}$/i).optional().or(z.literal('').transform(() => undefined)),
});
export type WorkerConfig = z.infer<typeof schema>;
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): WorkerConfig => schema.parse(env);
