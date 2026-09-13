import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { API_SERVER_URL, TOKEN_COOKIE } from '@/lib/api';

/** Fine del login SSO: converte il codice monouso in sessione e imposta il cookie httpOnly (ADR-0007). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/dashboard';
  if (!code) return NextResponse.redirect(new URL('/login?error=Codice+mancante', url.origin));
  const res = await fetch(`${API_SERVER_URL}/api/v1/auth/exchange`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code }), cache: 'no-store' });
  if (!res.ok) return NextResponse.redirect(new URL('/login?error=' + encodeURIComponent('Sessione SSO scaduta: riprova'), url.origin));
  const { accessToken, expiresIn } = (await res.json()) as { accessToken: string; expiresIn: number };
  (await cookies()).set(TOKEN_COOKIE, accessToken, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: expiresIn });
  return NextResponse.redirect(new URL(next.startsWith('/') ? next : '/dashboard', url.origin));
}
