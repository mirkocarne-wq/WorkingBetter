import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import type { AnyDb } from '@wb/db';
import { AppModule } from './app.module.js';
import { requestContext } from './common/context.js';
import type { AppConfig } from './config.js';

export interface CreateAppOptions {
  config: AppConfig;
  db: AnyDb;
  appRole?: string | null;
  logger?: boolean;
}

/** Crea l'app Nest su Fastify con contesto richiesta (AsyncLocalStorage), CORS e OpenAPI. Usata da main.ts e dai test. */
export async function createApp(opts: CreateAppOptions): Promise<NestFastifyApplication> {
  const adapter = new FastifyAdapter({ logger: opts.logger ?? false, genReqId: () => randomUUID() });
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot({ config: opts.config, db: opts.db, appRole: opts.appRole }),
    adapter,
    { logger: opts.logger === false ? false : ['log', 'warn', 'error'], abortOnError: false },
  );
  const fastify = app.getHttpAdapter().getInstance();
  // Contesto per richiesta: propaga principal e transazione tenant a servizi e filtri.
  fastify.addHook('onRequest', (req, _reply, done) => {
    requestContext.run(
      { requestId: String(req.id), principal: null, tx: null, ip: req.ip, userAgent: req.headers['user-agent'] },
      done,
    );
  });
  const https = (opts.config.API_PUBLIC_URL ?? '').startsWith('https://');
  fastify.addHook('onSend', (req, reply, _payload, done) => {
    reply.header('x-request-id', String(req.id));
    // header di sicurezza (docs/06): l'API serve JSON, CSV e iCalendar, mai HTML se non la documentazione su /docs
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    if (!req.url.startsWith('/docs')) {
      reply.header('x-frame-options', 'DENY');
      if (!reply.getHeader('cache-control')) reply.header('cache-control', 'no-store');
    }
    if (https) reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains');
    done();
  });
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'docs'] });
  app.enableCors({ origin: opts.config.API_CORS_ORIGIN.split(',').map((s) => s.trim()), credentials: true });

  SwaggerModule.setup('docs', app, buildOpenApiDocument(app), { jsonDocumentUrl: 'docs/openapi.json' });
  return app;
}

/** Documento OpenAPI dell'API: servito su /docs e pubblicato in packages/api-client/openapi.json (ADR-0009). */
export function buildOpenApiDocument(app: NestFastifyApplication): OpenAPIObject {
  const doc = new DocumentBuilder()
    .setTitle('WorkingBetter API')
    .setDescription('API REST unica per web, mobile e connettori (ADR-0005). Errori in formato RFC 9457 (application/problem+json). I body e le query sono descritti dagli stessi schemi Zod usati per la validazione (ADR-0009).')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, doc, { operationIdFactory: (controller, method) => `${controller.replace(/Controller$/, '')}_${method}` });
  document.components = { ...document.components, schemas: { ...document.components?.schemas, Problem: PROBLEM_SCHEMA } };
  for (const path of Object.values(document.paths)) {
    for (const op of Object.values(path as Record<string, { responses?: Record<string, unknown> }>)) {
      if (op && typeof op === 'object' && 'responses' in op && op.responses && !op.responses.default) {
        op.responses.default = { description: 'Errore (RFC 9457)', content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } } } };
      }
    }
  }
  return document;
}

/** Formato degli errori (RFC 9457) come esposto da ProblemFilter. */
const PROBLEM_SCHEMA = {
  type: 'object',
  required: ['type', 'title', 'status'],
  properties: {
    type: { type: 'string', description: 'URI del tipo di errore (about:blank per gli errori generici)' },
    title: { type: 'string' },
    status: { type: 'integer' },
    detail: { type: 'string' },
    instance: { type: 'string', description: 'Identificativo della richiesta (x-request-id)' },
    code: { type: 'string', description: 'Codice applicativo stabile (ErrorCodes in @wb/shared)' },
    errors: { type: 'array', items: { type: 'object', required: ['path', 'message'], properties: { path: { type: 'string' }, message: { type: 'string' } } } },
  },
};
