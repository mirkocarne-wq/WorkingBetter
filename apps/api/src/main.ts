import { createDatabase, runMigrations } from '@wb/db';
import { createApp } from './app.factory.js';
import { loadConfig } from './config.js';

const config = loadConfig();
if (!config.DATABASE_URL) throw new Error('DATABASE_URL non impostata');
const { db } = createDatabase({ url: config.DATABASE_URL });
if (process.env.DB_AUTO_MIGRATE === 'true') {
  const done = await runMigrations(db);
  if (done.length) console.log(`[db] migrazioni applicate: ${done.join(', ')}`);
}
const app = await createApp({ config, db, appRole: config.DB_APP_ROLE ?? null, logger: true });
// '::' = dual stack IPv4/IPv6; se l'host non supporta IPv6 (EAFNOSUPPORT) si ripiega su IPv4.
const host = process.env.API_HOST ?? '::';
try {
  await app.listen({ port: config.API_PORT, host });
} catch (err) {
  if (host !== '::' || (err as NodeJS.ErrnoException).code !== 'EAFNOSUPPORT') throw err;
  await app.listen({ port: config.API_PORT, host: '0.0.0.0' });
}
console.log(`[api] in ascolto su http://localhost:${config.API_PORT} · OpenAPI: /docs`);
