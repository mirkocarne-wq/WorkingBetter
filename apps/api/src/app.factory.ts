import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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
  fastify.addHook('onSend', (req, reply, _payload, done) => {
    reply.header('x-request-id', String(req.id));
    done();
  });
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'docs'] });
  app.enableCors({ origin: opts.config.API_CORS_ORIGIN.split(',').map((s) => s.trim()), credentials: true });

  const doc = new DocumentBuilder()
    .setTitle('WorkingBetter API')
    .setDescription('API REST unica per web, mobile e connettori (ADR-0005). Errori in formato RFC 9457.')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc), { jsonDocumentUrl: 'docs/openapi.json' });
  return app;
}
