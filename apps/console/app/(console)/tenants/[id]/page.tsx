import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, apiFetch, fmtDate, moduleLabels, type AuditRow, type TenantDetail } from '@/lib/api';
import { inviteAdmin, updateTenant } from '@/lib/actions';
import { ActionForm } from '@/components/action-form';
import { StatusPill } from '@/components/pill';

export default async function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let t: TenantDetail;
  try { t = await apiFetch<TenantDetail>(`/platform/tenants/${id}`); } catch (e) { if (e instanceof ApiError && e.status === 404) notFound(); throw e; }
  const audit = await apiFetch<AuditRow[]>(`/platform/tenants/${id}/audit?limit=50`).catch(() => [] as AuditRow[]);
  const suspended = t.status === 'suspended';
  return (
    <>
      <div className="ph">
        <div><h1>{t.name}</h1><p><code>{t.slug}</code> · {t.timezone} · {t.defaultLocale} · creato {fmtDate(t.createdAt)} · <StatusPill status={t.status} /></p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/tenants" className="btn">Tutti i tenant</Link>
          <ActionForm action={updateTenant.bind(null, id)} inline confirm={suspended ? 'Riattivare il tenant? Gli utenti potranno accedere di nuovo.' : 'Sospendere il tenant? Tutti gli accessi vengono bloccati entro 30 secondi.'}>
            <input type="hidden" name="status" value={suspended ? 'active' : 'suspended'} />
            <button className={`btn ${suspended ? 'p' : ''}`}>{suspended ? 'Riattiva' : 'Sospendi'}</button>
          </ActionForm>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card">
            <h3>Utilizzo <small>conteggi, mai contenuti</small></h3>
            <div className="grid kpis">{Object.entries(t.stats).map(([k, v]) => <div key={k} className="kpi" style={{ padding: 8 }}><div className="l">{moduleLabels[k] ?? k}</div><div className="v" style={{ fontSize: 22 }}>{v}</div></div>)}</div>
          </div>
          <div className="card">
            <h3>Amministratori e referenti HR <small>{t.admins.length}</small></h3>
            <table><thead><tr><th>Email</th><th>Ruolo</th><th>Invito</th><th>Ultimo accesso</th><th>Stato</th></tr></thead>
              <tbody>{t.admins.map((a) => <tr key={a.id + a.role}><td>{a.email}</td><td><code>{a.role}</code></td><td><StatusPill status={a.inviteStatus} /></td><td>{fmtDate(a.lastLoginAt)}</td><td>{a.disabledAt ? <span className="pill c">disattivato</span> : <span className="pill g">attivo</span>}</td></tr>)}</tbody></table>
            <ActionForm action={inviteAdmin.bind(null, id)} style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              <div className="lvl">Invita un amministratore <span className="sup">(o reinvia l’invito a uno esistente)</span></div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input name="email" type="email" required placeholder="email" className="input" style={{ flex: 2, minWidth: 200 }} />
                <input name="firstName" required placeholder="Nome" className="input" style={{ flex: 1, minWidth: 120 }} />
                <input name="lastName" placeholder="Cognome" className="input" style={{ flex: 1, minWidth: 120 }} />
                <button className="btn sm" disabled={suspended}>Invita</button>
              </div>
            </ActionForm>
          </div>
          <div className="card">
            <h3>Audit del tenant <small>ultime 50 azioni · senza contenuti</small></h3>
            {audit.length === 0 ? <div className="empty">Nessuna azione registrata.</div> : (
              <table><thead><tr><th>Quando</th><th>Azione</th><th>Entità</th><th>Utente</th><th>IP</th></tr></thead>
                <tbody>{audit.map((a, i) => <tr key={i}><td>{fmtDate(a.at)}</td><td><code>{a.action}</code></td><td>{a.entityType}</td><td>{a.actorEmail ?? '—'}</td><td style={{ fontSize: 12, color: 'var(--muted)' }}>{a.ip ?? ''}</td></tr>)}</tbody></table>
            )}
          </div>
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card">
            <h3>Configurazione</h3>
            <table><tbody>
              <tr><td>SSO</td><td>{t.config.ssoEnabled ? <span className="pill g">attivo</span> : <span className="pill n">non attivo</span>}{t.config.ssoIssuer && <div className="sup">{t.config.ssoIssuer}</div>}</td></tr>
              <tr><td>MFA obbligatoria</td><td>{t.config.mfaRequiredRoles.length ? t.config.mfaRequiredRoles.join(', ') : 'nessun ruolo'}</td></tr>
              <tr><td>Integrazioni</td><td>{t.config.integrations.length ? t.config.integrations.join(', ') : 'nessuna'}</td></tr>
              <tr><td>Marchio</td><td>{t.config.branding ? 'personalizzato' : 'predefinito'}</td></tr>
            </tbody></table>
            <ActionForm action={updateTenant.bind(null, id)} style={{ display: 'grid', gap: 8, marginTop: 12 }}>
              <div className="lvl">Anagrafica</div>
              <input name="name" defaultValue={t.name} className="input" />
              <div style={{ display: 'flex', gap: 8 }}><input name="timezone" defaultValue={t.timezone} className="input" /><select name="defaultLocale" defaultValue={t.defaultLocale} className="input"><option value="it">it</option><option value="en">en</option></select></div>
              <div><button className="btn sm">Salva</button></div>
            </ActionForm>
          </div>
          <div className="card">
            <h3>Ultimi accessi</h3>
            {t.recentLogins.length === 0 ? <div className="empty">Nessun accesso.</div> : t.recentLogins.map((l) => <div key={l.email} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--grid)' }}><span>{l.email}</span><span style={{ color: 'var(--muted)' }}>{fmtDate(l.lastLoginAt)}</span></div>)}
          </div>
          <div className="card">
            <h3>Eventi di piattaforma <small>su questo tenant</small></h3>
            {t.events.length === 0 ? <div className="empty">Nessun evento.</div> : t.events.map((e) => <div key={e.id} style={{ fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--grid)' }}><code>{e.action}</code> {e.targetLabel ?? ''}<div className="sup">{fmtDate(e.at)} · {e.actorEmail ?? 'sistema'}</div></div>)}
            <Link href={`/logs?tenantId=${id}`} className="btn sm" style={{ marginTop: 8 }}>Tutti gli eventi</Link>
          </div>
        </div>
      </div>
    </>
  );
}
