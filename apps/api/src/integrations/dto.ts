import { z } from 'zod';

const secret = z.string().max(500).optional(); // '' = rimuovi, assente = lascia
const providerCfg = z.object({ enabled: z.boolean().optional(), clientId: z.string().max(300).nullable().optional(), clientSecret: secret });
const endpoints = z.object({ authorize: z.string().url().optional(), token: z.string().url().optional(), api: z.string().url().optional() }).optional();

export const updateIntegrationsDto = z.object({
  google: providerCfg.optional(),
  microsoft: providerCfg.extend({ tenant: z.string().max(120).nullable().optional() }).optional(),
  slack: providerCfg.extend({ recognitionsChannel: z.string().max(80).nullable().optional() }).optional(),
  teams: z.object({ enabled: z.boolean().optional(), webhookUrl: z.string().url().max(1000).nullable().optional(), postRecognitions: z.boolean().optional() }).optional(),
  /** endpoint alternativi (proxy aziendali, ambienti di test) */
  endpoints: z.object({ google: endpoints, microsoft: endpoints, slack: endpoints }).optional(),
});
export const providerParam = z.enum(['google', 'microsoft', 'slack']);
export const testProviderParam = z.enum(['slack', 'teams']);
export const callbackQuery = z.object({ code: z.string().max(4000).optional(), state: z.string().max(4000).optional(), error: z.string().max(200).optional(), error_description: z.string().max(1000).optional() });
