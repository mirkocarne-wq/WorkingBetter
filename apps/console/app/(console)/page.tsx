import { apiFetch, fmtBytes, fmtDate, fmtDuration, moduleLabels, type CertInfo, type Stats, type Status } from '@/lib/api';
import { StatusPill } from '@/components/pill';

/** Stato piattaforma (PLT-030…032): API, database, worker, code, certificati, statistiche. */
export default async function StatusPage() {
  const [st, stats, certs] = await Promise.all([apiFetch<Status>('/platform/status'), apiFetch<Stats>('/platform/stats'), apiFetch<{ items: CertInfo[]; warnDays: number; criticalDays: number }>('/platform/certificates')]);
  const worst = (xs: string[]) => (xs.includes('critical') || xs.includes('error') ? 'c' : xs.includes('warning') ? 'w' : 'g');
  const certTone = worst(certs.items.filter((c) => c.status !== 'none').map((c) => c.status));
  const queueTone = st.queues.some((q) => q.failed > 0) ? 'w' : 'g';
  const maxLogins = Math.max(1, ...stats.lastLoginsByDay.map((d) => d.n));
  return (
    <>
      <div className="ph"><div><h1>Stato della piattaforma</h1><p>Verificato {fmtDate(st.checkedAt)} · dati aggiornati ogni 30 secondi</p></div></div>
      <div className="grid kpis" style={{ marginBottom: 16 }}>
        <div className="card kpi"><div className="l">API</div><div className="v"><span className="pill g">ok</span></div><div className="d">v{st.api.version} · attiva da {fmtDuration(st.api.uptimeSec)} · {st.api.env}</div></div>
        <div className="card kpi"><div className="l">Database</div><div className="v"><span className={`pill ${st.db.ok ? 'g' : 'c'}`}>{st.db.ok ? `${st.db.latencyMs} ms` : 'errore'}</span></div><div className="d">{fmtBytes(st.db.sizeBytes)}{st.db.connections ? ` · ${st.db.connections.active}/${st.db.connections.max} connessioni` : ''}</div></div>
        <div className="card kpi"><div className="l">Worker</div><div className="v"><span className={`pill ${st.worker.alive ? 'g' : 'c'}`}>{st.worker.alive ? 'attivo' : 'fermo'}</span></div><div className="d">{st.worker.jobs.length} job · ultimo {fmtDate(st.worker.jobs[0]?.startedAt)}</div></div>
        <div className="card kpi"><div className="l">Code</div><div className="v"><span className={`pill ${queueTone}`}>{st.queues.reduce((a, q) => a + q.pending, 0)} in attesa</span></div><div className="d">{st.queues.reduce((a, q) => a + q.failed, 0)} in errore</div></div>
        <div className="card kpi"><div className="l">Certificati</div><div className="v"><span className={`pill ${certTone}`}>{certs.items.filter((c) => c.status !== 'none').length ? (certTone === 'g' ? 'ok' : certTone === 'w' ? 'in scadenza' : 'attenzione') : 'nessuno'}</span></div><div className="d">soglie {certs.warnDays} / {certs.criticalDays} giorni</div></div>
        <div className="card kpi"><div className="l">Tenant</div><div className="v">{stats.tenants.active}</div><div className="d">{stats.tenants.suspended} sospesi · {stats.people} persone</div></div>
        <div className="card kpi"><div className="l">Utenti attivi 30 gg</div><div className="v">{stats.users.active30d}</div><div className="d">{stats.users.active7d} negli ultimi 7 · {stats.users.total} totali</div></div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card">
            <h3>Worker <small>ultimo run per job</small></h3>
            <div style={{ overflowX: 'auto' }}><table><thead><tr><th>Job</th><th>Esito</th><th>Avviato</th><th>Durata</th><th>Riepilogo</th></tr></thead>
              <tbody>{st.worker.jobs.map((j) => <tr key={j.job}><td><code>{j.job}</code></td><td><StatusPill status={j.status} /></td><td>{fmtDate(j.startedAt)}</td><td>{j.durationMs == null ? '—' : `${(j.durationMs / 1000).toFixed(1)} s`}</td><td style={{ fontSize: 12, color: j.error ? 'var(--crit-text)' : 'var(--muted)' }}>{j.error ?? j.summary ?? ''}</td></tr>)}</tbody></table></div>
            {st.worker.jobs.length === 0 && <div className="empty">Nessun job registrato: il worker non è mai partito.</div>}
          </div>
          <div className="card">
            <h3>Code <small>email, chat, webhook, calendario</small></h3>
            <table><thead><tr><th>Coda</th><th>In attesa</th><th>In errore</th><th>Più vecchia in attesa</th><th>Per stato</th></tr></thead>
              <tbody>{st.queues.map((q) => <tr key={q.name}><td>{q.name}</td><td>{q.pending}</td><td>{q.failed > 0 ? <span className="pill w">{q.failed}</span> : 0}</td><td>{fmtDate(q.oldestPending)}</td><td style={{ fontSize: 12, color: 'var(--muted)' }}>{Object.entries(q.byStatus).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}</td></tr>)}</tbody></table>
          </div>
          <div className="card">
            <h3>Certificati TLS <small>URL pubblici e file configurati</small></h3>
            {certs.items.length === 0 ? <div className="empty">Nessun URL o file configurato (APP_BASE_URL, API_PUBLIC_URL, CONSOLE_PUBLIC_URL, TLS_CERT_FILES).</div> : (
              <div style={{ overflowX: 'auto' }}><table><thead><tr><th>Sorgente</th><th>Stato</th><th>Scade</th><th>Giorni</th><th>Emittente</th></tr></thead>
                <tbody>{certs.items.map((c) => <tr key={c.source}><td><code style={{ fontSize: 12 }}>{c.source}</code>{c.detail && <div className="sup">{c.detail}</div>}</td><td><StatusPill status={c.status} /></td><td>{fmtDate(c.validTo)}</td><td>{c.daysLeft ?? '—'}</td><td style={{ fontSize: 12 }}>{c.issuer ?? '—'}</td></tr>)}</tbody></table></div>
            )}
            <div className="sup" style={{ marginTop: 8 }}>La sostituzione dei certificati è un’operazione dell’infrastruttura (docs/13): la console segnala le scadenze, non gestisce le chiavi.</div>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card">
            <h3>API e database</h3>
            <table><tbody>
              <tr><td>Versione</td><td>{st.api.version}</td></tr>
              <tr><td>Ambiente</td><td>{st.api.env} · auth {st.api.authMode}</td></tr>
              <tr><td>Web app</td><td><code style={{ fontSize: 12 }}>{st.api.appBaseUrl}</code></td></tr>
              <tr><td>API pubblica</td><td><code style={{ fontSize: 12 }}>{st.api.apiPublicUrl ?? '—'}</code></td></tr>
              <tr><td>Console</td><td><code style={{ fontSize: 12 }}>{st.api.consoleUrl ?? '—'}</code></td></tr>
              <tr><td>Redis</td><td>{st.api.redisConfigured ? 'configurato' : 'non configurato (scheduler in-process)'}</td></tr>
              <tr><td>Chiave note/segreti</td><td>{st.api.notesKeyConfigured ? 'presente' : <span className="pill c">assente</span>}</td></tr>
              <tr><td>Database</td><td>{st.db.name} · {st.db.serverVersion}</td></tr>
              <tr><td>Migrazioni</td><td>{st.db.migrations ? `${st.db.migrations.n} applicate · ultima ${st.db.migrations.last}` : '—'}</td></tr>
            </tbody></table>
          </div>
          <div className="card">
            <h3>Utilizzo <small>tutti i tenant</small></h3>
            <table><tbody>{Object.entries(stats.modules).map(([k, v]) => <tr key={k}><td>{moduleLabels[k] ?? k}</td><td style={{ textAlign: 'right' }}><b>{v}</b></td></tr>)}</tbody></table>
          </div>
          <div className="card">
            <h3>Ultimi accessi per giorno <small>30 giorni</small></h3>
            {stats.lastLoginsByDay.length === 0 ? <div className="empty">Nessun accesso registrato.</div> : stats.lastLoginsByDay.map((d) => <div key={d.day} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, padding: '2px 0' }}><span style={{ width: 80, color: 'var(--muted)' }}>{d.day.slice(5)}</span><div className="bar b" style={{ flex: 1 }}><i style={{ width: `${Math.round((d.n / maxLogins) * 100)}%` }} /></div><span style={{ width: 24, textAlign: 'right' }}>{d.n}</span></div>)}
            <div className="sup" style={{ marginTop: 6 }}>Conteggio degli utenti il cui ultimo accesso cade in quel giorno.</div>
          </div>
        </div>
      </div>
    </>
  );
}
