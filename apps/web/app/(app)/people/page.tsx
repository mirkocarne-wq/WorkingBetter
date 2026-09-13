import { apiFetch, initials, type Person } from '@/lib/api';

interface OrgUnit { id: string; name: string; parentId: string | null; children: OrgUnit[] }

export default async function PeoplePage() {
  const [{ items }, tree] = await Promise.all([apiFetch<{ items: Person[] }>('/people?limit=200'), apiFetch<OrgUnit[]>('/org-units?tree=true')]);
  const byId = new Map(items.map((p) => [p.id, p]));
  const unitName = new Map<string, string>();
  const walk = (n: OrgUnit[]) => n.forEach((u) => { unitName.set(u.id, u.name); walk(u.children); });
  walk(tree);
  const renderTree = (nodes: OrgUnit[]) => (
    <ul className="tree">{nodes.map((u) => <li key={u.id}><div style={{ padding: '6px 0', fontWeight: 600 }}>{u.name} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>· {items.filter((p) => p.orgUnitId === u.id).length}</span></div>{u.children.length > 0 && renderTree(u.children)}</li>)}</ul>
  );
  return (
    <>
      <div className="ph"><div><h1>Persone</h1><p>{items.length} persone · {unitName.size} unità organizzative</p></div></div>
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
        <div className="card"><h3>Organigramma</h3>{renderTree(tree)}</div>
      </div>
    </>
  );
}
