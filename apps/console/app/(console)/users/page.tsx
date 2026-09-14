import Link from 'next/link';
import { actionLabels, apiFetch, fmtDate, type UserRow } from '@/lib/api';
import { userAction } from '@/lib/actions';
import { ActionForm } from '@/components/action-form';

/** Utenti dei tenant (PLT-020…022): ricerca per email e azioni amministrative. */
export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams;
  const rows = q.length >= 2 ? await apiFetch<UserRow[]>(`/platform/users?q=${encodeURIComponent(q)}`) : [];
  return (
    <>
      <div className="ph"><div><h1>Utenti</h1><p>Ricerca per email su tutti i tenant · le azioni sono registrate negli eventi</p></div></div>
      <form style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input name="q" defaultValue={q} placeholder="parte dell’email (almeno 2 caratteri)" className="input" style={{ maxWidth: 360 }} autoFocus />
        <button className="btn p">Cerca</button>
      </form>
      <div className="card">
        {q.length < 2 ? <div className="empty">Scrivi almeno due caratteri dell’email.</div> : rows.length === 0 ? <div className="empty">Nessun utente trovato.</div> : (
          <table><thead><tr><th>Email</th><th>Tenant</th><th>Ruoli</th><th>Stato</th><th>Ultimo accesso</th><th>Azione</th></tr></thead>
            <tbody>{rows.map((u) => (
              <tr key={u.id}>
                <td>{u.email}{u.mfa && <span className="pill g" style={{ marginLeft: 6 }}>MFA</span>}</td>
                <td><Link href={`/tenants/${u.tenantId}`}>{u.tenantName}</Link><div className="sup">{u.tenantSlug}</div></td>
                <td style={{ fontSize: 12 }}>{u.roles.join(', ') || '—'}</td>
                <td>{u.disabledAt ? <span className="pill c">disattivato</span> : u.locked ? <span className="pill w">bloccato</span> : !u.inviteAcceptedAt && u.inviteExpiresAt ? <span className="pill n">invitato</span> : <span className="pill g">attivo</span>}{u.failedLogins > 0 && <div className="sup">{u.failedLogins} tentativi falliti</div>}</td>
                <td>{fmtDate(u.lastLoginAt)}</td>
                <td>
                  <ActionForm action={userAction.bind(null, u.id)} inline confirm="Confermi l’azione su questo utente?">
                    <select name="action" className="input" style={{ width: 230 }}>{Object.entries(actionLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                    <button className="btn sm">Esegui</button>
                  </ActionForm>
                </td>
              </tr>
            ))}</tbody></table>
        )}
      </div>
    </>
  );
}
