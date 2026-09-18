import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch, fmtDate, roleLabel, type Me, type Person, type RoleView, type UserAdmin } from '@/lib/api';
import { assignRole, resendInvite, revokeRole, setUserDisabled } from '@/lib/actions';
import { InviteForm } from './invite-form';

const statusPill: Record<UserAdmin['status'], { text: string; cls: string }> = { invited: { text: 'Invitato', cls: 'w' }, active: { text: 'Attivo', cls: 'g' }, disabled: { text: 'Disattivato', cls: 'n' }, expired: { text: 'Invito scaduto', cls: 's' } };

export default async function UsersPage() {
  const me = await apiFetch<Me>('/me');
  if (!me.permissions.includes('roles:manage')) redirect('/people');
  const [users, people, units, roleDefs] = await Promise.all([
    apiFetch<UserAdmin[]>('/users'),
    apiFetch<{ items: Person[] }>('/people?limit=200').then((r) => r.items),
    apiFetch<{ id: string; name: string }[]>('/org-units'),
    apiFetch<RoleView[]>('/roles').catch(() => [] as RoleView[]),
  ]);
  // ruoli assegnabili: predefiniti e custom del tenant (CORE-041), con i nomi del catalogo
  const ROLES = roleDefs.length ? roleDefs.map((r) => r.key) : ['employee', 'manager', 'hrbp', 'hr_admin', 'analyst', 'observer', 'tenant_admin'];
  const labelOf = (k: string) => roleDefs.find((r) => r.key === k)?.name ?? roleLabel[k] ?? k;
  const withUser = new Set(users.map((u) => u.person?.id).filter(Boolean));
  const withoutUser = people.filter((p) => !withUser.has(p.id) && p.status !== 'terminated');
  return (
    <>
      <div className="ph">
        <div><h1>Utenti e accessi</h1><p>{users.filter((u) => u.status === 'active').length} attivi · {users.filter((u) => u.status === 'invited').length} invitati · {users.filter((u) => u.status === 'disabled').length} disattivati</p></div>
        <div style={{ display: 'flex', gap: 8 }}><Link href="/people" className="btn">Persone</Link><Link href="/settings/roles" className="btn">Ruoli e permessi</Link>{me.permissions.includes('tenant:settings') && <Link href="/settings" className="btn">Impostazioni e SSO</Link>}</div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <div className="card" style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Utente</th><th>Ruoli</th><th>Stato</th><th>Ultimo accesso</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => {
                const st = statusPill[u.status];
                return (
                  <tr key={u.id}>
                    <td><div style={{ fontWeight: 600 }}>{u.person ? `${u.person.firstName} ${u.person.lastName}` : '—'}</div><div className="sup">{u.email}{u.person?.jobTitle ? ` · ${u.person.jobTitle}` : ''}</div></td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                        {u.roles.map((r) => <form key={r.id} action={revokeRole.bind(null, r.id)} style={{ display: 'inline' }}><button className="pill b" title="Rimuovi ruolo" style={{ border: 0, cursor: 'pointer', font: 'inherit' }}>{labelOf(r.role)} ×</button></form>)}
                        <form action={assignRole.bind(null, u.id)} style={{ display: 'inline-flex', gap: 4 }}>
                          <select name="role" className="btn sm" style={{ padding: '3px 6px' }} defaultValue="">{[['', '+ ruolo'], ...ROLES.filter((r) => !u.roles.some((x) => x.role === r)).map((r) => [r, labelOf(r)])].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                          <button className="btn sm">Ok</button>
                        </form>
                      </div>
                    </td>
                    <td><span className={`pill ${st.cls}`}>{st.text}</span>{u.authProvider && <div className="sup">{u.authProvider === 'oidc' ? 'SSO' : u.authProvider === 'password' ? 'password' : u.authProvider}</div>}</td>
                    <td className="sup">{u.lastLoginAt ? fmtDate(u.lastLoginAt) : u.invitedAt ? `invitato ${fmtDate(u.invitedAt)}` : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <Link href={`/people/users/${u.id}/access`} className="btn sm ghost" title="Ruoli, permessi effettivi e perimetro">Cosa vede</Link>
                        {u.status !== 'disabled' && !u.lastLoginAt && <form action={resendInvite.bind(null, u.id)}><button className="btn sm">Reinvia invito</button></form>}
                        {u.id !== me.user.id && (u.status === 'disabled' ? <form action={setUserDisabled.bind(null, u.id, false)}><button className="btn sm">Riattiva</button></form> : <form action={setUserDisabled.bind(null, u.id, true)}><button className="btn sm">Disattiva</button></form>)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Invita una persona</h3>
          <InviteForm people={withoutUser.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, email: p.email }))} managers={people.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}` }))} units={units} roles={ROLES.map((k) => [k, labelOf(k)] as [string, string])} />
          <div className="sup" style={{ marginTop: 10 }}>L’invitato riceve un’email con un link valido 7 giorni per impostare la password (o entrare con l’SSO se attivo). Le email di prova si leggono su Mailpit.</div>
        </div>
      </div>
    </>
  );
}
