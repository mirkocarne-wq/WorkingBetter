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
  const reportId = url.searchParams.get('reportId') ?? '';
  params.delete('reportId');
  const meetingId = url.searchParams.get('meetingId') ?? '';
  params.delete('meetingId');
  const campaignId = url.searchParams.get('campaignId') ?? '';
  params.delete('campaignId');
  if (report === 'meeting-ics') {
    // invito iCalendar del singolo 1:1 (INT-023): passthrough con il content-type dell'API
    const r = await fetch(`${API_SERVER_URL}/api/v1/meetings/${encodeURIComponent(meetingId)}.ics`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
    const text = await r.text();
    return new Response(text, { status: r.status, headers: { 'content-type': r.headers.get('content-type') ?? 'text/calendar; charset=utf-8', 'content-disposition': r.headers.get('content-disposition') ?? 'attachment; filename="1-1.ics"' } });
  }
  const path = report === 'saved' ? `/analytics/reports/${encodeURIComponent(reportId)}/run` : report === 'alerts' ? '/analytics/alerts' : report === 'process' ? `/analytics/process/${encodeURIComponent(url.searchParams.get('cycleId') ?? '')}` : report === 'welfare-payroll' ? `/welfare/payroll/batches/${encodeURIComponent(batchId)}/csv` : report === 'f360-aggregate' ? `/f360/campaigns/${encodeURIComponent(campaignId)}/aggregate` : report === 'app-instances' ? '/apps/instances' : '/analytics/query';
  const res = await fetch(`${API_SERVER_URL}/api/v1${path}?${params.toString()}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
  const body = await res.text();
  if (!res.ok) return new Response(body, { status: res.status, headers: { 'content-type': res.headers.get('content-type') ?? 'application/json' } });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': res.headers.get('content-disposition') ?? 'attachment; filename="report.csv"' } });
}
