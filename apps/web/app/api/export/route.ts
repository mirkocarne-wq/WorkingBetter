import { cookies } from 'next/headers';
import { API_SERVER_URL, TOKEN_COOKIE } from '@/lib/api';

/**
 * Proxy degli export CSV: il token di sessione è in un cookie httpOnly, quindi il browser
 * non può chiamare l'API direttamente. L'API registra ogni export nell'audit (ANA-063).
 */
export async function GET(req: Request) {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  if (!token) return new Response('Non autenticato', { status: 401 });
  const url = new URL(req.url);
  const report = url.searchParams.get('report') ?? 'query';
  const params = new URLSearchParams(url.searchParams);
  params.delete('report');
  params.delete('cycleId');
  params.set('format', 'csv');
  const batchId = url.searchParams.get('batchId') ?? '';
  params.delete('batchId');
  const path = report === 'alerts' ? '/analytics/alerts' : report === 'process' ? `/analytics/process/${encodeURIComponent(url.searchParams.get('cycleId') ?? '')}` : report === 'welfare-payroll' ? `/welfare/payroll/batches/${encodeURIComponent(batchId)}/csv` : '/analytics/query';
  const res = await fetch(`${API_SERVER_URL}/api/v1${path}?${params.toString()}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
  const body = await res.text();
  if (!res.ok) return new Response(body, { status: res.status, headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' } });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': res.headers.get('content-disposition') ?? 'attachment; filename="report.csv"' } });
}
