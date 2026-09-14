import Link from 'next/link';
import { apiFetch, fmtDate, type JobRun, type PlatformEvent } from '@/lib/api';

type Failure = { id: string; tenantSlug: string; attempts: number; error: string | null; at: string; to?: string; subject?: string; target?: string; provider?: string; url?: string; op?: string };

/** Log (PLT-033/034): eventi della console, job del worker, consegne fallite. */
export default async function LogsPage({ searchParams }: { searchParams: Promise<{ tab?: string; tenantId?: string; action?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab ?? 'events';
  const qs = new URLSearchParams();
  if (sp.tenantId) qs.set('tenantId', sp.tenantId);
  if (sp.action) qs.set('action', sp.action);
  const [events, jobs, failures] = await Promise.all([
    apiFetch<PlatformEvent[]>(qs.toString() ? `/platform/events?${qs.toString()}` : '/platform/events'),
    tab === 'jobs' ? apiFetch<JobRun[]>('/platform/jobs') : Promise.resolve([] as JobRun[]),
    tab === 'failures' ? apiFetch<{ email: Failure[]; chat: Failure[]; webhooks: Failure[]; calendar: Failure[] }>('/platform/queues/failures') : Promise.resolve(null),
  ]);
  const tabs = [['events', 'Eventi della console'], ['jobs', 'Job del worker'], ['failures', 'Consegne fallite']];
  return (
    <>
      <div className="ph"><div><h1>Log</h1><p>Ciò che la piattaforma registra nel database. I log applicativi (stdout di API e worker) restano nel sistema di log dell’infrastruttura.</p></div></div>
      <div className="tabs">{tabs.map(([k, l]) => <Link key={k} href={`/logs?tab=${k}`} className={tab === k ? 'on' : ''}>{l}</Link>)}</div>
      {tab === 'events' && (
        <div className="card">
          <form style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <input type="hidden" name="tab" value="events" />
            <input name="action" defaultValue={sp.action ?? ''} placeholder="azione (es. tenant., user.reset)" className="input" style={{ maxWidth: 260 }} />
            <input name="tenantId" defaultValue={sp.tenantId ?? ''} placeholder="id tenant" className="input" style={{ maxWidth: 320 }} />
            <button className="btn">Filtra</button>
          </form>
          {events.length === 0 ? <div className="empty">Nessun evento.</div> : (
            <table><thead><tr><th>Quando</th><th>Operatore</th><th>Azione</th><th>Tenant</th><th>Oggetto</th><th>Dettagli</th><th>IP</th></tr></thead>
              <tbody>{events.map((e) => <tr key={e.id}><td>{fmtDate(e.at)}</td><td>{e.actorEmail ?? 'sistema'}</td><td><code>{e.action}</code></td><td>{e.tenantSlug ?? '—'}</td><td>{e.targetLabel ?? '—'}</td><td style={{ fontSize: 12, color: 'var(--muted)' }}>{Object.keys(e.details).length ? JSON.stringify(e.details) : ''}</td><td style={{ fontSize: 12, color: 'var(--muted)' }}>{e.ip ?? ''}</td></tr>)}</tbody></table>
          )}
        </div>
      )}
      {tab === 'jobs' && (
        <div className="card">
          {jobs.length === 0 ? <div className="empty">Nessun run registrato.</div> : (
            <table><thead><tr><th>Avviato</th><th>Job</th><th>Esito</th><th>Durata</th><th>Riepilogo / errore</th></tr></thead>
              <tbody>{jobs.map((j) => <tr key={j.id}><td>{fmtDate(j.startedAt)}</td><td><code>{j.job}</code></td><td>{!j.finishedAt ? <span className="pill b">in corso</span> : j.ok ? <span className="pill g">ok</span> : <span className="pill c">errore</span>}</td><td>{j.durationMs == null ? '—' : `${(j.durationMs / 1000).toFixed(1)} s`}</td><td style={{ fontSize: 12, color: j.error ? 'var(--crit-text)' : 'var(--muted)', maxWidth: 520, overflowWrap: 'anywhere' }}>{j.error ?? j.summary ?? ''}</td></tr>)}</tbody></table>
          )}
        </div>
      )}
      {tab === 'failures' && failures && (
        <div style={{ display: 'grid', gap: 16 }}>
          {(['email', 'chat', 'webhooks', 'calendar'] as const).map((k) => (
            <div key={k} className="card">
              <h3>{k === 'email' ? 'Email' : k === 'chat' ? 'Chat (Slack/Teams)' : k === 'webhooks' ? 'Webhook' : 'Calendario'} <small>{failures[k].length} fallite</small></h3>
              {failures[k].length === 0 ? <div className="empty">Nessuna consegna fallita.</div> : (
                <table><thead><tr><th>Quando</th><th>Tenant</th><th>Destinazione</th><th>Tentativi</th><th>Errore</th></tr></thead>
                  <tbody>{failures[k].map((f) => <tr key={f.id}><td>{fmtDate(f.at)}</td><td>{f.tenantSlug}</td><td style={{ fontSize: 12 }}>{f.to ?? f.target ?? f.url ?? `${f.provider ?? ''} ${f.op ?? ''}`}{f.subject && <div className="sup">{f.subject}</div>}</td><td>{f.attempts}</td><td style={{ fontSize: 12, color: 'var(--crit-text)', maxWidth: 480, overflowWrap: 'anywhere' }}>{f.error}</td></tr>)}</tbody></table>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
