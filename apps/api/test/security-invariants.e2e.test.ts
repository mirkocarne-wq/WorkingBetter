import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { ModulesContainer } from '@nestjs/core';
import { IS_PUBLIC, PERMISSIONS } from '../src/auth/decorators.js';
import { createTestEnv, type TestEnv } from './helpers.js';

/**
 * Rotte che richiedono solo l'autenticazione (nessun permesso): riguardano l'utente stesso o dati che ogni
 * ruolo può leggere. Ogni aggiunta va motivata qui, non nel controller.
 */
const AUTHENTICATED_ONLY = new Set([
  'GET /me',
  'GET /tenant',
  'POST /auth/refresh',
  'PATCH /auth/password',
  'POST /auth/logout-all',
]);
const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'ALL', 'OPTIONS', 'HEAD', 'SEARCH'];

let env: TestEnv;
beforeAll(async () => {
  env = await createTestEnv();
});
afterAll(() => env.close());

describe('invarianti di sicurezza (docs/06)', () => {
  it('ogni rotta è @Public, ha @RequirePermission o è nella lista chiusa delle rotte solo autenticate', () => {
    const offenders: string[] = [];
    const seen: string[] = [];
    const modules = env.app.get(ModulesContainer);
    for (const m of modules.values()) {
      for (const c of m.controllers.values()) {
        const ctor = c.metatype as new () => unknown;
        if (!ctor) continue;
        const base = String(Reflect.getMetadata(PATH_METADATA, ctor) ?? '');
        const classPublic = !!Reflect.getMetadata(IS_PUBLIC, ctor);
        const classPerms = Reflect.getMetadata(PERMISSIONS, ctor) as string[] | undefined;
        for (const name of Object.getOwnPropertyNames(ctor.prototype)) {
          if (name === 'constructor') continue;
          const fn = ctor.prototype[name];
          if (typeof fn !== 'function') continue;
          const path = Reflect.getMetadata(PATH_METADATA, fn) as string | undefined;
          const method = Reflect.getMetadata(METHOD_METADATA, fn) as number | undefined;
          if (path === undefined || method === undefined) continue;
          const full = `${METHODS[method]} /${[base, path].filter((x) => x && x !== '/').join('/').replace(/\/+/g, '/')}`.replace(/\/$/, '');
          seen.push(full);
          const isPublic = classPublic || !!Reflect.getMetadata(IS_PUBLIC, fn);
          const perms = (Reflect.getMetadata(PERMISSIONS, fn) as string[] | undefined) ?? classPerms;
          if (!isPublic && !(perms && perms.length) && !AUTHENTICATED_ONLY.has(full)) offenders.push(full);
        }
      }
    }
    expect(seen.length).toBeGreaterThan(150);
    expect(offenders, `Rotte senza @Public né @RequirePermission: ${offenders.join(', ')}`).toEqual([]);
    const stale = [...AUTHENTICATED_ONLY].filter((r) => !seen.includes(r));
    expect(stale, `Voci della lista che non esistono più: ${stale.join(', ')}`).toEqual([]);
  });

  it('le risposte portano gli header di sicurezza e nessuna cache', async () => {
    const res = await env.app.inject({ method: 'GET', url: '/api/v1/auth/config?tenant=nope' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-request-id']).toBeTruthy();
  });
});
