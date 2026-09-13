import { describe, expect, it } from 'vitest';
import { ApiError, createApiClient, errorMessage, request, type ApiRoute } from '../src/index.js';

function fakeFetch(handler: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const merged = init ?? (input instanceof Request ? { method: input.method, headers: input.headers } : {});
    calls.push({ url, init: merged });
    return handler(url, merged);
  }) as typeof fetch;
  return { fetch: f, calls };
}
const json = (status: number, body: unknown, type = 'application/json') => new Response(JSON.stringify(body), { status, headers: { 'content-type': type } });

describe('api-client', () => {
  it('request: aggiunge il prefisso /api/v1, il Bearer token e serializza il body', async () => {
    const ff = fakeFetch(() => json(201, { id: '1' }));
    const out = await request<{ id: string }>({ baseUrl: 'http://api.test/', getToken: async () => 'tok', fetch: ff.fetch }, '/objectives', { body: { title: 'x' } });
    expect(out).toEqual({ id: '1' });
    expect(ff.calls[0]!.url).toBe('http://api.test/api/v1/objectives');
    const h = ff.calls[0]!.init.headers as Record<string, string>;
    expect(h.authorization).toBe('Bearer tok');
    expect(h['content-type']).toBe('application/json');
    expect(ff.calls[0]!.init.method).toBe('POST');
  });

  it('request: 204 → undefined, errore → ApiError con Problem', async () => {
    const ff = fakeFetch((url) => (url.endsWith('/x') ? new Response(null, { status: 204 }) : json(422, { type: 'about:blank', title: 'Richiesta non processabile', status: 422, code: 'validation_error', errors: [{ path: 'title', message: 'Obbligatorio' }], instance: 'req-1' }, 'application/problem+json')));
    const opts = { baseUrl: 'http://api.test', fetch: ff.fetch };
    expect(await request(opts, '/notifications/read-all' as ApiRoute, { method: 'POST' }).catch((e) => e)).toBeInstanceOf(ApiError);
    const err = (await request(opts, '/objectives', { body: {} }).catch((e) => e)) as ApiError;
    expect(err.status).toBe(422);
    expect(err.code).toBe('validation_error');
    expect(err.requestId).toBe('req-1');
    expect(errorMessage(err)).toBe('title: Obbligatorio');
  });

  it('createApiClient: percorsi e parametri tipizzati, risposta tipizzata dove il contratto la dichiara', async () => {
    const ff = fakeFetch((url) => (url.includes('unread-count') ? json(200, { count: 3 }) : json(200, { found: true, tenant: { name: 'Acme', slug: 'acme' }, password: true, sso: false, devLogin: true })));
    const api = createApiClient({ baseUrl: 'http://api.test', getToken: () => 'tok', fetch: ff.fetch });
    const unread = await api.GET('/api/v1/notifications/unread-count');
    expect(unread.data?.count).toBe(3);
    const cfg = await api.GET('/api/v1/auth/config', { params: { query: { tenant: 'acme' } } });
    expect(cfg.data?.tenant?.slug).toBe('acme');
    expect(ff.calls[0]!.url).toBe('http://api.test/api/v1/notifications/unread-count');
  });
});
