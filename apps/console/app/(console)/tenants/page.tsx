import Link from 'next/link';
import { apiFetch, fmtDate, type TenantRow } from '@/lib/api';
import { StatusPill } from '@/components/pill';

export default async function TenantsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  if (sp.q) qs.set('q', sp.q);
  if (sp.status) qs.set('status', sp.status);
  const rows = await apiFetch<TenantRow[]>(qs.toString() ? `/platform/tenants?${qs.toString()}` : '/platform/tenants');
  return (
    <>
      <div className="ph"><div><h1>Tenant</h1><p>{rows.length} organizzazioni</p></div><Link href="/tenants/new" className="btn p">Nuovo tenant</Link></div>
      <form style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input name="q" defaultValue={sp.q ?? ''} placeholder="Cerca per nome o slug" className="input" style={{ maxWidth: 320 }} />
        <select name="status" defaultValue={sp.status ?? ''} className="input" style={{ maxWidth: 180 }}><option value="">Tutti gli stati</option><option value="active">Attivi</option><option value="suspended">Sospesi</option></select>
        <button className="btn">Filtra</button>
      </form>
      <div className="card">
        {rows.length === 0 ? <div className="empty">Nessun tenant.</div> : (
          <table><thead><tr><th>Tenant</th><th>Stato</th><th>Persone</th><th>Utenti</th><th>Attivi 30 gg</th><th>Ultimo accesso</th><th>Creato</th><th></th></tr></thead>
            <tbody>{rows.map((t) => <tr key={t.id}><td><b>{t.name}</b><div className="sup">{t.slug} · {t.timezone}</div></td><td><StatusPill status={t.status} /></td><td>{t.people}</td><td>{t.users}</td><td>{t.activeUsers30d}</td><td>{fmtDate(t.lastLoginAt)}</td><td>{fmtDate(t.createdAt)}</td><td><Link href={`/tenants/${t.id}`} className="btn sm">Apri</Link></td></tr>)}</tbody></table>
        )}
      </div>
    </>
  );
}
