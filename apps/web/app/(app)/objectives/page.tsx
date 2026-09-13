import Link from 'next/link';
import { apiFetch, type Cycle, type Me, type Objective, type Person } from '@/lib/api';
import { ObjectiveCard } from '@/components/objective-card';

type View = 'mine' | 'team' | 'tree' | 'all';

export default async function ObjectivesPage({ searchParams }: { searchParams: Promise<{ view?: View; cycle?: string }> }) {
  const sp = await searchParams;
  const [me, cycles] = await Promise.all([apiFetch<Me>('/me'), apiFetch<Cycle[]>('/cycles')]);
  const current = (await apiFetch<Cycle | null>('/cycles/current')) ?? null;
  const cycleId = sp.cycle ?? current?.id;
  const view: View = sp.view ?? 'tree';
  const params = new URLSearchParams();
  if (cycleId) params.set('cycleId', cycleId);
  if (view === 'mine') params.set('mine', 'true');
  if (view === 'team') params.set('team', 'true');
  if (view === 'tree') params.set('tree', 'true');
  const [objectives, people] = await Promise.all([
    apiFetch<Objective[]>(`/objectives?${params}`),
    me.permissions.includes('people:read') ? apiFetch<{ items: Person[] }>('/people?limit=200').then((r) => r.items) : Promise.resolve([] as Person[]),
  ]);
  const byId = new Map(people.map((p) => [p.id, p]));
  const canCheckIn = me.permissions.includes('objectives:write:own');
  const tabs: Array<[View, string]> = [['mine', 'I miei'], ['team', 'Team'], ['tree', 'Albero di allineamento'], ['all', 'Tutti']];
  const cyc = cycles.find((c) => c.id === cycleId);
  const renderTree = (nodes: Objective[]) => (
    <ul className="tree">
      {nodes.map((o) => (
        <li key={o.id}>
          <ObjectiveCard o={o} people={byId} canCheckIn={canCheckIn} />
          {o.children && o.children.length > 0 && renderTree(o.children)}
        </li>
      ))}
    </ul>
  );
  return (
    <>
      <div className="ph">
        <div><h1>Obiettivi</h1><p>{cyc ? `${cyc.name} · ${cyc.startDate} – ${cyc.endDate} · check-in ogni ${cyc.checkInCadenceDays} giorni` : 'Nessun periodo'}</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          {cycles.length > 1 && (
            <span className="pill n">
              {cycles.map((c) => <Link key={c.id} href={`/objectives?view=${view}&cycle=${c.id}`} style={{ padding: '0 6px', fontWeight: c.id === cycleId ? 700 : 400 }}>{c.name}</Link>)}
            </span>
          )}
        </div>
      </div>
      <div className="tabs">
        {tabs.filter(([v]) => v !== 'team' || me.permissions.includes('objectives:write:team')).map(([v, label]) => (
          <Link key={v} href={`/objectives?view=${v}${cycleId ? `&cycle=${cycleId}` : ''}`} className={view === v ? 'on' : ''}>{label}</Link>
        ))}
      </div>
      {objectives.length === 0 ? <div className="card empty">Nessun obiettivo in questa vista.</div>
        : view === 'tree' ? renderTree(objectives)
        : objectives.map((o) => <ObjectiveCard key={o.id} o={o} people={byId} canCheckIn={canCheckIn} />)}
    </>
  );
}
