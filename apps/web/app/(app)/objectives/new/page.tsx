import Link from 'next/link';
import { apiFetch, type Cycle, type Me, type Objective, type Person } from '@/lib/api';
import { createObjective, createOkrCycle } from '@/lib/actions';
import { KrRows } from '@/components/kr-rows';


export default async function NewObjectivePage({ searchParams }: { searchParams: Promise<{ cycle?: string }> }) {
  const sp = await searchParams;
  const [me, cycles, units] = await Promise.all([apiFetch<Me>('/me'), apiFetch<Cycle[]>('/cycles'), apiFetch<{ id: string; name: string }[]>('/org-units').catch(() => [])]);
  const perms = new Set(me.permissions);
  const canAny = perms.has('objectives:write:any');
  const canTeam = perms.has('objectives:write:team');
  const canCompany = perms.has('objectives:write:company');
  const canCycles = perms.has('cycles:write');
  const open = cycles.filter((c) => c.status !== 'closed');
  const cycleId = sp.cycle && open.some((c) => c.id === sp.cycle) ? sp.cycle : open[0]?.id;
  const [people, parents] = await Promise.all([
    perms.has('people:read') ? apiFetch<{ items: Person[] }>('/people?limit=200').then((r) => r.items) : Promise.resolve([] as Person[]),
    cycleId ? apiFetch<Objective[]>(`/objectives?cycleId=${cycleId}`) : Promise.resolve([] as Objective[]),
  ]);
  const myId = me.person?.id;
  const owners = canAny ? people : canTeam && myId ? people.filter((p) => p.id === myId || p.managerId === myId) : people.filter((p) => p.id === myId);
  const levels: [string, string][] = [
    ...(canCompany ? [['company', 'Azienda'] as [string, string]] : []),
    ...(canTeam ? [['unit', 'Unità'] as [string, string], ['team', 'Team'] as [string, string]] : []),
    ['individual', 'Individuale'],
  ];
  const levelLabel: Record<string, string> = { company: 'Azienda', unit: 'Unità', team: 'Team', individual: 'Individuale' };
  return (
    <>
      <div className="ph">
        <div><h1>Nuovo obiettivo</h1><p>Scegli il periodo, allinealo a un obiettivo padre e definisci come lo misuri con i key result.</p></div>
        <Link href="/objectives" className="btn">Torna agli obiettivi</Link>
      </div>
      <div className="grid" style={{ gridTemplateColumns: canCycles ? '1.6fr 1fr' : '1fr', alignItems: 'start' }}>
        {open.length === 0 ? <div className="card empty">Nessun periodo aperto: {canCycles ? 'creane uno qui a destra.' : 'chiedi all’HR di aprire un periodo.'}</div> : (
          <form action={createObjective} className="card" style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <label>Periodo<select name="cycleId" defaultValue={cycleId} className="input">{open.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.startDate} → {c.endDate}</option>)}</select></label>
              <label>Livello<select name="level" defaultValue="individual" className="input">{levels.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label>Visibilità<select name="visibility" defaultValue="public" className="input"><option value="public">Pubblico</option><option value="team">Solo team</option><option value="private">Privato (io e il mio manager)</option></select></label>
            </div>
            <label>Titolo<input name="title" required maxLength={200} placeholder="Ridurre il tempo di risposta ai ticket P1 sotto le 4 ore" className="input" /></label>
            <label>Descrizione<textarea name="description" rows={2} placeholder="Perché conta e cosa cambia se lo raggiungiamo" className="input" style={{ resize: 'vertical' }} /></label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <label>Owner<select name="ownerPersonId" defaultValue={myId ?? ''} className="input">{owners.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}{p.id === myId ? ' (io)' : ''}</option>)}</select></label>
              {canTeam && <label>Unità (per obiettivi di unità/team)<select name="ownerOrgUnitId" defaultValue="" className="input"><option value="">—</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}
              <label>Scadenza<input name="dueDate" type="date" className="input" /></label>
            </div>
            <label>Allineato a<select name="parentId" defaultValue="" className="input"><option value="">Nessun obiettivo padre</option>{parents.filter((o) => o.status === 'active' || o.status === 'draft').map((o) => <option key={o.id} value={o.id}>[{levelLabel[o.level]}] {o.title}</option>)}</select><div className="sup">Il progresso dei key result risale lungo l&apos;albero di allineamento.</div></label>
            <div><div style={{ fontWeight: 600, marginBottom: 6 }}>Key result</div><KrRows /></div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" name="publish" defaultChecked /> Pubblica subito (altrimenti resta in bozza)</label>
            <div><button className="btn p">Crea obiettivo</button></div>
          </form>
        )}
        {canCycles && (
          <form action={createOkrCycle} className="card" style={{ display: 'grid', gap: 8 }}>
            <h3>Nuovo periodo <small>{cycles.length} esistenti</small></h3>
            <label>Nome<input name="name" required placeholder="Q4 2026" className="input" /></label>
            <div style={{ display: 'flex', gap: 8 }}><label style={{ flex: 1 }}>Dal<input name="startDate" type="date" required className="input" /></label><label style={{ flex: 1 }}>Al<input name="endDate" type="date" required className="input" /></label></div>
            <label>Cadenza check-in (giorni)<input name="checkInCadenceDays" type="number" min={1} max={90} defaultValue={7} className="input" /></label>
            <div><button className="btn">Apri periodo</button></div>
            <div className="sup">I periodi aperti compaiono nella pagina Obiettivi; i promemoria di check-in seguono la cadenza.</div>
          </form>
        )}
      </div>
    </>
  );
}
