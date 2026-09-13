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
await app.listen({ port: config.API_PORT, host: process.env.API_HOST ?? '::' }); // '::' = dual stack IPv4/IPv6
console.log(`[api] in ascolto su http://localhost:${config.API_PORT} · OpenAPI: /docs`);
