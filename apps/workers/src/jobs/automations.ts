/**
 * Trigger a tempo delle automazioni (ADR-0015): il worker non valuta le regole, chiede all'API di farlo
 * (`POST /internal/automations/tick`) con il segreto condiviso INTERNAL_JOB_TOKEN. Senza segreto il job segnala e si ferma.
 */
export interface AutomationsTickSummary { skipped?: string; tenants?: number; events?: number; status?: number }
type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

export async function runAutomationsTick(cfg: { API_INTERNAL_URL?: string; INTERNAL_JOB_TOKEN?: string }, fetchImpl: FetchLike = fetch as unknown as FetchLike, today?: string): Promise<AutomationsTickSummary> {
  if (!cfg.INTERNAL_JOB_TOKEN) return { skipped: 'INTERNAL_JOB_TOKEN non configurato: i trigger a tempo delle automazioni restano fermi' };
  if (!cfg.API_INTERNAL_URL) return { skipped: 'API_INTERNAL_URL non configurato' };
  const url = `${cfg.API_INTERNAL_URL.replace(/\/$/, '')}/api/v1/internal/automations/tick`;
  const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-internal-token': cfg.INTERNAL_JOB_TOKEN }, body: JSON.stringify(today ? { today } : {}), signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`tick automazioni: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { tenants: number; events: number };
  return { tenants: body.tenants, events: body.events, status: res.status };
}
