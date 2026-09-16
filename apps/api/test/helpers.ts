import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { roleAssignments, tenants, users, persons, type AnyDb } from '@wb/db';
import { createTestDatabase } from '@wb/db/testing';
import { createApp } from '../src/app.factory.js';
import { loadConfig } from '../src/config.js';
import { TokenService } from '../src/auth/token.service.js';

export const DEV_SECRET = 'test-secret-test-secret-test-secret-1234';

export interface TestEnv {
  app: NestFastifyApplication;
  db: AnyDb;
  close: () => Promise<void>;
  tokenFor: (u: { userId: string; tenantId: string; personId?: string | null; roles: string[] }) => Promise<string>;
  createTenant: (name: string) => Promise<{ id: string; slug: string }>;
  createUser: (tenantId: string, email: string, roles: string[], person?: { firstName: string; lastName: string; managerId?: string }) => Promise<{ userId: string; personId: string; token: string }>;
}

export async function createTestEnv(): Promise<TestEnv> {
  const config = loadConfig({ NODE_ENV: 'test', AUTH_MODE: 'dev', AUTH_DEV_SECRET: DEV_SECRET, API_CORS_ORIGIN: 'http://localhost', NOTES_MASTER_KEY: 'a'.repeat(64), INTERNAL_JOB_TOKEN: 'test-internal-job-token-1234' });
  const tdb = await createTestDatabase();
  const app = await createApp({ config, db: tdb.db, appRole: tdb.appRole, logger: false });
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  const tokens = app.get(TokenService);
  return {
    app,
    db: tdb.db,
    close: async () => {
      await app.close();
      await tdb.close();
    },
    tokenFor: (u) => tokens.signDev({ sub: u.userId, tenant_id: u.tenantId, person_id: u.personId ?? undefined, roles: u.roles }),
    createTenant: async (name) => {
      const slug = name.toLowerCase().replace(/\W+/g, '-');
      const [t] = await tdb.db.insert(tenants).values({ name, slug }).returning();
      return { id: t!.id, slug };
    },
    createUser: async (tenantId, email, roles, person) => {
      const [p] = await tdb.db
        .insert(persons)
        .values({ tenantId, firstName: person?.firstName ?? email.split('@')[0]!, lastName: person?.lastName ?? 'Test', email, managerId: person?.managerId })
        .returning();
      const [u] = await tdb.db.insert(users).values({ tenantId, email, personId: p!.id }).returning();
      for (const role of roles) await tdb.db.insert(roleAssignments).values({ tenantId, userId: u!.id, role });
      const token = await tokens.signDev({ sub: u!.id, tenant_id: tenantId, person_id: p!.id, roles });
      return { userId: u!.id, personId: p!.id, token };
    },
  };
}

export async function api(app: NestFastifyApplication, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, token?: string, body?: unknown) {
  const res = await app.inject({
    method,
    url: url.startsWith('/health') ? url : `/api/v1${url}`,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    payload: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: unknown = null;
  try {
    json = res.body ? JSON.parse(res.body) : null;
  } catch {
    json = res.body;
  }
  return { status: res.statusCode, body: json as any, headers: res.headers as Record<string, string> };
}
