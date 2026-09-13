import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTestDatabase } from '@wb/db/testing';
import { buildOpenApiDocument, createApp } from '../app.factory.js';
import { loadConfig } from '../config.js';

/**
 * Emette il contratto OpenAPI in packages/api-client/openapi.json (ADR-0009).
 * Avvia l'app su un database PGlite in memoria: nessuna dipendenza esterna, adatto alla CI
 * (`pnpm --filter @wb/api openapi:emit && git diff --exit-code packages/api-client/openapi.json`).
 */
function sortKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(sortKeys) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sortKeys(v)])) as T;
  }
  return value;
}

async function main() {
  const here = dirname(fileURLToPath(import.meta.url));
  const out = resolve(process.argv[2] ?? resolve(here, '../../../../packages/api-client/openapi.json'));
  const config = loadConfig({ NODE_ENV: 'test', AUTH_MODE: 'dev', AUTH_DEV_SECRET: 'openapi-openapi-openapi-openapi-1234', API_CORS_ORIGIN: 'http://localhost', NOTES_MASTER_KEY: 'a'.repeat(64) });
  const tdb = await createTestDatabase();
  const app = await createApp({ config, db: tdb.db, appRole: tdb.appRole, logger: false });
  await app.init();
  const doc = buildOpenApiDocument(app);
  const stable = { ...doc, paths: sortKeys(doc.paths) };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(stable, null, 2)}\n`);
  const ops = Object.values(doc.paths).reduce((n, p) => n + Object.keys(p ?? {}).length, 0);
  console.log(`[openapi] ${Object.keys(doc.paths).length} path, ${ops} operazioni → ${out}`);
  await app.close();
  await tdb.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
