import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type Schema = typeof schema;
export type Database = PostgresJsDatabase<Schema>;

export interface CreateDbOptions {
  url: string;
  max?: number;
}

/** Client Postgres (postgres.js) + Drizzle con lo schema completo. */
export function createDatabase(opts: CreateDbOptions): { db: Database; close: () => Promise<void> } {
  const client = postgres(opts.url, { max: opts.max ?? 10, prepare: false });
  const db = drizzle(client, { schema, casing: 'snake_case' });
  return { db, close: () => client.end({ timeout: 5 }) };
}

export { schema };
