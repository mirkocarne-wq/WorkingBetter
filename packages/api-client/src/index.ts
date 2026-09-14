import createClient, { type Middleware } from 'openapi-fetch';
import type { components, paths } from './schema.js';

export type { components, operations, paths } from './schema.js';

/** Errore applicativo nel formato RFC 9457 (application/problem+json). */
export type Problem = components['schemas']['Problem'];

const PREFIX = '/api/v1';

/** Percorsi del contratto senza il prefisso /api/v1, con i parametri `{id}` resi come stringhe. */
type StripPrefix<P extends string> = P extends `${typeof PREFIX}${infer R}` ? R : P;
type Pattern<P extends string> = P extends `${infer A}{${string}}${infer B}` ? `${A}${string}${Pattern<B>}` : P;
export type ApiPath = Pattern<StripPrefix<keyof paths & string>>;
/** Un percorso del contratto, con eventuale query string. */
export type ApiRoute = ApiPath | `${ApiPath}?${string}`;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly problem: Problem | null,
    public readonly body: unknown = problem,
  ) {
    super(problem?.detail ?? problem?.title ?? `API ${status}`);
    this.name = 'ApiError';
  }
  /** Codice applicativo stabile (es. `validation_error`), se presente. */
  get code(): string | undefined {
    return this.problem?.code;
  }
  /** Identificativo della richiesta da riportare nel supporto. */
  get requestId(): string | undefined {
    return this.problem?.instance;
  }
}

export interface ApiClientOptions {
  /** Origine dell'API, senza /api/v1 (es. https://api.workingbetter.example). */
  baseUrl: string;
  /** Token di sessione (Bearer); può essere asincrono (cookie httpOnly lato server, secure storage su mobile). */
  getToken?: () => string | undefined | null | Promise<string | undefined | null>;
  /** Implementazione di fetch (default: globale). */
  fetch?: typeof fetch;
  /** Header aggiunti a ogni richiesta (es. Accept-Language, X-Client). */
  headers?: Record<string, string>;
}

function normalizeBase(url: string) {
  return url.replace(/\/+$/, '');
}

/** Legge un body JSON o problem+json; `null` se vuoto o non JSON. */
export async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function asProblem(body: unknown, status: number): Problem | null {
  if (body && typeof body === 'object' && 'title' in body && 'status' in body) return body as Problem;
  if (body && typeof body === 'object') return { type: 'about:blank', title: `HTTP ${status}`, status, ...(body as Record<string, unknown>) } as Problem;
  return null;
}

/**
 * Client tipizzato dal contratto OpenAPI (openapi-fetch): metodi GET/POST/… con percorsi, parametri,
 * body e risposte verificati dal compilatore. Le risposte di errore sono `Problem`.
 *
 *   const api = createApiClient({ baseUrl, getToken });
 *   const { data, error } = await api.GET('/api/v1/me');
 */
export function createApiClient(opts: ApiClientOptions) {
  const client = createClient<paths>({ baseUrl: normalizeBase(opts.baseUrl), fetch: opts.fetch, headers: opts.headers });
  const auth: Middleware = {
    async onRequest({ request }) {
      const token = await opts.getToken?.();
      if (token && !request.headers.has('authorization')) request.headers.set('authorization', `Bearer ${token}`);
      return request;
    },
  };
  client.use(auth);
  return client;
}
export type ApiClient = ReturnType<typeof createApiClient>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Serializzato in JSON se non è già una stringa. */
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * Chiamata "grezza" ma con percorso verificato a compile time contro il contratto:
 * la usano i server component della web app, che tipizzano la risposta localmente.
 * Lancia `ApiError` con il Problem su risposta non 2xx; restituisce `undefined` su 204.
 */
export async function request<T = unknown>(opts: ApiClientOptions, route: ApiRoute, init: RequestOptions = {}): Promise<T> {
  const token = await opts.getToken?.();
  const doFetch = opts.fetch ?? fetch;
  const hasBody = init.body !== undefined;
  const res = await doFetch(`${normalizeBase(opts.baseUrl)}${PREFIX}${route}`, {
    method: init.method ?? (hasBody ? 'POST' : 'GET'),
    headers: {
      accept: 'application/json, application/problem+json',
      ...(hasBody ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
      ...(init.headers ?? {}),
    },
    body: hasBody ? (typeof init.body === 'string' ? init.body : JSON.stringify(init.body)) : undefined,
    signal: init.signal,
    cache: 'no-store',
  });
  if (res.status === 204) return undefined as T;
  const body = await readJson(res);
  if (!res.ok) throw new ApiError(res.status, asProblem(body, res.status), body);
  return body as T;
}

/** Messaggio leggibile per l'utente a partire da un errore qualsiasi (ApiError, Error, altro). */
export function errorMessage(e: unknown, fallback = 'Si è verificato un errore'): string {
  if (e instanceof ApiError) {
    const p = e.problem;
    if (p?.errors?.length) return p.errors.map((x) => (x.path ? `${x.path}: ${x.message}` : x.message)).join('; ');
    return p?.detail ?? p?.title ?? fallback;
  }
  if (e instanceof Error) return e.message || fallback;
  return fallback;
}
