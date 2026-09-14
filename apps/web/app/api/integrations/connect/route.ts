import { cookies } from 'next/headers';
import { API_SERVER_URL, TOKEN_COOKIE } from '@/lib/api';

/** Avvio del collegamento OAuth (ADR-0012): il token di sessione è in un cookie httpOnly, quindi si passa da qui e si rimanda al provider. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const provider = url.searchParams.get('provider') ?? '';
  const back = (msg: string) => Response.redirect(new URL(`/settings?integration_error=${encodeURIComponent(msg)}`, url.origin), 302);
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) return Response.redirect(new URL('/login', url.origin), 302);
  if (!['google', 'microsoft', 'slack'].includes(provider)) return back('Provider non valido');
  const r = await fetch(`${API_SERVER_URL}/api/v1/integrations/${provider}/connect`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { detail?: string; title?: string };
    return back(body.detail ?? body.title ?? `Collegamento non disponibile (${r.status})`);
  }
  const { url: authorize } = (await r.json()) as { url: string };
  return Response.redirect(authorize, 302);
}
