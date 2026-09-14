import { cookies } from 'next/headers';
import { request, type ApiRoute } from '@wb/api-client';

/** URL dell'API (dentro Docker: API_INTERNAL_URL). La console parla con l'API solo lato server. */
export const API_SERVER_URL = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const TOKEN_COOKIE = 'wb_platform';

export { ApiError, errorMessage, type ApiRoute } from '@wb/api-client';

const sessionToken = async () => (await cookies()).get(TOKEN_COOKIE)?.value;

export async function apiFetch<T>(path: ApiRoute, init: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: string } = {}): Promise<T> {
  return request<T>({ baseUrl: API_SERVER_URL, getToken: sessionToken }, path, init);
}
export async function publicFetch<T>(path: ApiRoute, init: { method?: 'GET' | 'POST'; body?: string } = {}): Promise<T> {
  return request<T>({ baseUrl: API_SERVER_URL }, path, init);
}

export const fmtDate = (d?: string | Date | null) => (d ? new Date(d).toLocaleString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
export const fmtBytes = (n?: number | null) => (n == null ? '—' : n > 1e9 ? `${(n / 1e9).toFixed(2)} GB` : n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.round(n / 1e3)} KB`);
export const fmtDuration = (s?: number | null) => (s == null ? '—' : s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)} min` : s < 86400 ? `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min` : `${Math.floor(s / 86400)} g ${Math.floor((s % 86400) / 3600)} h`);

// ---- tipi (contratto /platform) ----
export interface Operator { id: string; email: string; firstName: string; lastName: string; lastLoginAt: string | null; disabledAt: string | null; lockedUntil: string | null; createdAt: string; mustChangePassword?: boolean }
export interface TenantRow { id: string; name: string; slug: string; status: string; timezone: string; defaultLocale: string; createdAt: string; people: number; users: number; activeUsers30d: number; lastLoginAt: string | null }
export interface PlatformEvent { id: string; at: string; actorEmail: string | null; action: string; tenantId: string | null; tenantSlug?: string | null; targetType: string | null; targetLabel: string | null; details: Record<string, unknown>; ip: string | null }
export interface TenantDetail {
  id: string; name: string; slug: string; status: string; timezone: string; defaultLocale: string; createdAt: string;
  stats: Record<string, number>;
  config: { ssoEnabled: boolean; ssoIssuer: string | null; mfaRequiredRoles: string[]; integrations: string[]; branding: boolean };
  admins: { id: string; email: string; role: string; lastLoginAt: string | null; disabledAt: string | null; inviteStatus: string }[];
  recentLogins: { email: string; lastLoginAt: string | null }[];
  events: PlatformEvent[];
  invite?: { email: string; url: string; expiresAt: string };
}
export interface UserRow { id: string; email: string; tenantId: string; tenantName: string; tenantSlug: string; lastLoginAt: string | null; disabledAt: string | null; locked: boolean; failedLogins: number; mfa: boolean; roles: string[]; inviteAcceptedAt: string | null; inviteExpiresAt: string | null; authProvider: string | null }
export interface Status {
  api: { version: string; uptimeSec: number; env: string; authMode: string; appBaseUrl: string; apiPublicUrl: string | null; consoleUrl: string | null; redisConfigured: boolean; notesKeyConfigured: boolean };
  db: { ok: boolean; latencyMs?: number; sizeBytes?: number; name?: string; serverVersion?: string; connections?: { active: number; max: number } | null; migrations?: { n: number; last: string; at: string } | null; error?: string };
  worker: { alive: boolean; jobs: { job: string; status: string; startedAt: string; finishedAt: string | null; durationMs: number | null; summary: string | null; error: string | null }[] };
  queues: { name: string; pending: number; failed: number; byStatus: Record<string, number>; oldestPending: string | null }[];
  checkedAt: string;
}
export interface Stats { tenants: { active: number; suspended: number }; users: { total: number; active30d: number; active7d: number }; people: number; modules: Record<string, number>; lastLoginsByDay: { day: string; n: number }[]; platformEvents7d: number }
export interface CertInfo { source: string; kind: 'url' | 'file'; subject: string | null; issuer: string | null; validFrom: string | null; validTo: string | null; daysLeft: number | null; status: 'ok' | 'warning' | 'critical' | 'error' | 'none'; detail: string | null }
export interface JobRun { id: string; job: string; ok: boolean; startedAt: string; finishedAt: string | null; durationMs: number | null; summary: string | null; error: string | null }
export interface AuditRow { at: string; action: string; entityType: string; entityId: string | null; actorEmail: string | null; ip: string | null }
export const moduleLabels: Record<string, string> = { people: 'Persone attive', usersTotal: 'Utenti', usersActive30: 'Utenti attivi 30 gg', units: 'Unità organizzative', objectivesActive: 'Obiettivi attivi', reviewCycles: 'Cicli di review', reviews: 'Review', surveys: 'Survey', oneOnOneRelations: 'Relazioni 1:1', meetingsDone30d: '1:1 conclusi 30 gg', feedback30d: 'Feedback 30 gg', recognitions30d: 'Riconoscimenti 30 gg', appInstances: 'Processi avviati', welfarePlans: 'Piani welfare', welfareRequests: 'Richieste welfare', f360Campaigns: 'Campagne 360°', onboardingJourneys: 'Percorsi onboarding', objectivesActiveAll: 'Obiettivi attivi', reviewCyclesActive: 'Cicli di review attivi', surveysLaunched: 'Survey lanciate', appInstancesActive: 'Processi in corso', onboardingActive: 'Onboarding in corso' };
export const actionLabels: Record<string, string> = { reset_password: 'Reset password (email con link, 60 min)', unlock: 'Sblocca account', revoke_sessions: 'Revoca sessioni', disable: 'Disattiva', enable: 'Riattiva', disable_mfa: 'Disattiva verifica in due passaggi' };
