import { apiFetch, type Cycle, type Me, type Objective, type Person } from '@/lib/api';
import { ObjectiveCard } from '@/components/objective-card';
import { Button, Segmented } from '@/components/ui';
import { Distribution } from '@/components/charts';
import { Icon } from '@/components/icons';
import { getNaming } from '@/lib/tenant';

type View = 'mine' | 'team' | 'tree' | 'all';
const daysTo = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);

export default async function ObjectivesPage({ searchParams }: { searchParams: Promise<{ view?: View; cycle?: string }> }) {
  const sp = await searchParams;
  const [me, cycles, naming] = await Promise.all([apiFetch<Me>('/me'), apiFetch<Cycle[]>('/cycles'), getNaming()]);
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
  const flat: Objective[] = [];
  const walk = (nodes: Objective[]) => nodes.forEach((o) => { flat.push(o); if (o.children) walk(o.children); });
  walk(objectives);
  const counts = { on: flat.filter((o) => o.confidence === 'on_track').length, at: flat.filter((o) => o.confidence === 'at_risk').length, off: flat.filter((o) => o.confidence === 'off_track').length };
  const withProgress = flat.filter((o) => o.progress != null);
  const stats = { avg: withProgress.length ? withProgress.reduce((a, o) => a + (o.progress ?? 0), 0) / withProgress.length : null, kr: flat.reduce((a, o) => a + o.keyResults.length, 0), staleKr: flat.filter((o) => o.stale).reduce((a, o) => a + o.keyResults.length, 0) };
  const meId = me.person?.id ?? null;
  const renderTree = (nodes: Objective[]) => (
    <ul className="tree">
      {nodes.map((o) => (
        <li key={o.id}>
          <ObjectiveCard o={o} people={byId} canCheckIn={canCheckIn} meId={meId} />
          {o.children && o.children.length > 0 && renderTree(o.children)}
        </li>
      ))}
    </ul>
  );
  const left = cyc ? daysTo(cyc.endDate) : null;
  return (
    <>
      <div className="ph">
        <div><h1>{naming.objective.plural}</h1><p>{cyc ? `${cyc.name} · ${naming.check_in.singular.toLowerCase()} ogni ${cyc.checkInCadenceDays} giorni${left != null && left >= 0 ? ` · ${left} giorni alla chiusura` : ''}` : 'Nessun periodo'}</p></div>
        <div className="actions">
          {cycles.length > 1 && (
            <span className="seg" aria-label="Periodo">
              {cycles.map((c) => <a key={c.id} href={`/objectives?view=${view}&cycle=${c.id}`} className={c.id === cycleId ? 'on' : ''}>{c.name}</a>)}
            </span>
          )}
          {me.permissions.includes('objectives:write:own') && <Button href={`/objectives/new${cycleId ? `?cycle=${cycleId}` : ''}`} variant="primary" icon="plus">Nuovo obiettivo</Button>}
        </div>
      </div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 20 }}>
        <Segmented current={view} items={tabs.filter(([v]) => v !== 'team' || me.permissions.includes('objectives:write:team')).map(([v, label]) => ({ key: v, label, href: `/objectives?view=${v}${cycleId ? `&cycle=${cycleId}` : ''}` }))} />
      </div>
      {flat.length > 0 && (
        <div className="card" style={{ marginBottom: 20, padding: '12px 20px' }}>
          <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto auto', gap: 28, alignItems: 'center' }}>
            <div>
              <div className="lvl" style={{ marginBottom: 8 }}>Confidenza · {flat.length} {flat.length === 1 ? naming.objective.singular.toLowerCase() : naming.objective.plural.toLowerCase()}</div>
              <Distribution segments={[
                { key: 'on', label: 'On track', value: counts.on, color: 'var(--good)' },
                { key: 'at', label: 'A rischio', value: counts.at, color: 'var(--warn)' },
                { key: 'off', label: 'Off track', value: counts.off, color: 'var(--crit)' },
                { key: 'none', label: `Senza ${naming.check_in.singular.toLowerCase()}`, value: flat.length - counts.on - counts.at - counts.off, color: 'var(--line)' },
              ]} />
            </div>
            <div className="stat"><div className="l">Progresso medio</div><div className="v sm">{stats.avg == null ? '—' : `${Math.round(stats.avg * 100)}%`}</div></div>
            <div className="stat"><div className="l">KR oltre la cadenza</div><div className="v sm">{stats.staleKr}<span className="sup" style={{ fontSize: 'var(--fs-sm)', marginLeft: 4 }}>su {stats.kr}</span></div></div>
          </div>
        </div>
      )}
      {objectives.length === 0 ? (
        <div className="card empty"><b>Nessun obiettivo in questa vista</b>{view === 'mine' && canCheckIn ? <span className="row" style={{ justifyContent: 'center', marginTop: 8 }}><Button href="/objectives/new" size="sm" icon="plus">Crea il primo</Button></span> : <span className="row" style={{ justifyContent: 'center', gap: 4 }}><Icon name="target" size={14} />Prova un’altra vista o un altro periodo.</span>}</div>
      ) : view === 'tree' ? renderTree(objectives)
        : objectives.map((o) => <ObjectiveCard key={o.id} o={o} people={byId} canCheckIn={canCheckIn} meId={meId} />)}
    </>
  );
}
