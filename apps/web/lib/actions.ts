'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { API_URL, TOKEN_COOKIE, apiFetch } from './api';

export async function devLogin(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const tenantSlug = String(form.get('tenantSlug') ?? '');
  const email = String(form.get('email') ?? '');
  const res = await fetch(`${API_URL}/api/v1/auth/dev-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenantSlug, email }),
  });
  if (!res.ok) return { error: 'Accesso non riuscito: controlla tenant ed email' };
  const { accessToken, expiresIn } = (await res.json()) as { accessToken: string; expiresIn: number };
  (await cookies()).set(TOKEN_COOKIE, accessToken, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: expiresIn });
  redirect('/dashboard');
}

export async function logout() {
  (await cookies()).delete(TOKEN_COOKIE);
  redirect('/login');
}

export async function checkIn(keyResultId: string, form: FormData) {
  const value = Number(form.get('value'));
  const confidence = String(form.get('confidence'));
  const comment = String(form.get('comment') ?? '') || undefined;
  await apiFetch(`/key-results/${keyResultId}/check-ins`, { method: 'POST', body: JSON.stringify({ value, confidence, comment }) });
  revalidatePath('/objectives');
  revalidatePath('/dashboard');
}
