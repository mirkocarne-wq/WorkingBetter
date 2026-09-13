import { cookies } from 'next/headers';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const TOKEN_COOKIE = 'wb_token';

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`API ${status}`);
  }
}

/** Chiamata API lato server con il token di sessione (cookie httpOnly). */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
    cache: 'no-store',
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
}

export interface Me {
  user: { id: string; email?: string; roles: string[] };
  person: { id: string; firstName: string; lastName: string; jobTitle: string | null } | null;
  permissions: string[];
}
export interface KeyResult { id: string; title: string; unit: string | null; startValue: number; targetValue: number; currentValue: number; progress: number; confidence: Confidence | null; lastCheckInAt: string | null }
export type Confidence = 'on_track' | 'at_risk' | 'off_track';
export interface Objective {
  id: string; title: string; level: 'company' | 'unit' | 'team' | 'individual'; ownerPersonId: string | null; parentId: string | null;
  status: string; visibility: string; progress: number | null; confidence: Confidence | null; stale: boolean; lastCheckInAt: string | null;
  keyResults: KeyResult[]; children?: Objective[];
}
export interface Person { id: string; firstName: string; lastName: string; email: string | null; jobTitle: string | null; managerId: string | null; orgUnitId: string | null; status: string }
export interface Cycle { id: string; name: string; startDate: string; endDate: string; status: string; checkInCadenceDays: number }

export const initials = (p: { firstName: string; lastName: string }) => `${p.firstName[0] ?? ''}${p.lastName[0] ?? ''}`.toUpperCase();
export const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);
export const confidenceLabel: Record<Confidence, { text: string; cls: string }> = {
  on_track: { text: 'On track', cls: 'g' },
  at_risk: { text: 'A rischio', cls: 'w' },
  off_track: { text: 'Off track', cls: 'c' },
};
