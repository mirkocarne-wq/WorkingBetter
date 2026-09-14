import Link from 'next/link';
import { apiFetch, initials, type Me, type Person } from '@/lib/api';
import { createOrgUnit } from '@/lib/actions';
import { ActionForm } from '@/components/action-form';

interface OrgUnit { id: string; name: string; parentId: string | null; children: OrgUnit[] }

export default async function PeoplePage() {
  const [{ items }, tree, me] = await Promise.all([apiFetch<{ items: Person[] }>('/people?limit=200'), apiFetch<OrgUnit[]>('/org-units?tree=true'), apiFetch<Me>('/me')]);
  const canWriteOrg = me.permissions.includes('org:write');
  const byId = new Map(items.map((p) => [p.id, p]));
  const unitName = new Map<string, string>();
  const walk = (n: OrgUnit[]) => n.forEach((u) => { unitName.set(u.id, u.name); walk(u.children); });
  walk(tree);
  const renderTree = (nodes: OrgUnit[]) => (
    <ul className="tree">{nodes.map((u) => <li key={u.id}><div style={{ padding: '6px 0', fontWeight: 600 }}>{u.name} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {items.filter((p) => p.orgUnitId === u.id).length}</span></div>{u.children.length > 0 && renderTree(u.children)}</li>)}</ul>
  );
  return (
    <>
      <div className="ph"><div><h1>Persone</h1><p>{items.length} persone · {unitName.size} unità organizzative</p></div><div style={{ display: 'flex', gap: 8 }}><Link href="/people/users" className="btn">Utenti e accessi</Link><Link href="/people/import" className="btn">Importa da CSV</Link></div></div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 300px', alignItems: 'start' }}>
        <div className="card">
          <table>
            <thead><tr><th>Persona</th><th>Ruolo</th><th>Unità</th><th>Manager</th><th>Stato</th></tr></thead>
            <tbody>
              {items.map((p) => {
                const m = p.managerId ? byId.get(p.managerId) : undefined;
                return (
                  <tr key={p.id}>
                    <td><div className="who"><span className="av s">{initials(p)}</span><div><div className="n">{p.firstName} {p.lastName}</div><div className="r">{p.email}</div></div></div></td>
                    <td>{p.jobTitle ?? '—'}</td>
                    <td>{p.orgUnitId ? unitName.get(p.orgUnitId) ?? '—' : '—'}</td>
                    <td>{m ? `${m.firstName} ${m.lastName}` : '—'}</td>
                    <td><span className={`pill ${p.status === 'active' ? 'g' : 'n'}`}>{p.status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card"><h3>Organigramma</h3>{renderTree(tree)}</div>
          {canWriteOrg && (
            <div className="card">
              <h3>Nuova unità <small>direzione, area o team</small></h3>
              <ActionForm action={createOrgUnit} style={{ display: 'grid', gap: 6 }}>
                <input name="name" required placeholder="Nome (es. Customer Care)" className="input" maxLength={120} />
                <input name="code" placeholder="Codice breve (facoltativo, usato nell’import CSV)" className="input" maxLength={40} />
                <select name="parentId" className="input" defaultValue=""><option value="">Livello principale</option>{[...unitName.entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
                <div><button className="btn sm">Crea unità</button></div>
              </ActionForm>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
