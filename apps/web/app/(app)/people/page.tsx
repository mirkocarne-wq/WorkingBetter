import Link from 'next/link';
import { apiFetch, type Me, type Person } from '@/lib/api';
import { createOrgUnit } from '@/lib/actions';
import { ActionForm } from '@/components/action-form';
import { Avatar, Button, Pill, SearchField, Toolbar } from '@/components/ui';
import { Icon } from '@/components/icons';

interface OrgUnit { id: string; name: string; parentId: string | null; children: OrgUnit[] }
const statusLabel: Record<string, { text: string; tone: 'g' | 'n' | 'w' | 'c' }> = { active: { text: 'Attiva', tone: 'g' }, invited: { text: 'Invitata', tone: 'w' }, leaving: { text: 'In uscita', tone: 'w' }, terminated: { text: 'Cessata', tone: 'n' }, suspended: { text: 'Sospesa', tone: 'c' } };
const fmtShort = new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'short' });

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ q?: string; unit?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();
  const [{ items: all }, tree, me] = await Promise.all([apiFetch<{ items: Person[] }>('/people?limit=200'), apiFetch<OrgUnit[]>('/org-units?tree=true'), apiFetch<Me>('/me')]);
  const canWriteOrg = me.permissions.includes('org:write');
  const byId = new Map(all.map((p) => [p.id, p]));
  const unitName = new Map<string, string>();
  const walk = (n: OrgUnit[]) => n.forEach((u) => { unitName.set(u.id, u.name); walk(u.children); });
  walk(tree);
  const needle = q.toLowerCase();
  const items = all.filter((p) => (!sp.unit || p.orgUnitId === sp.unit) && (!needle || `${p.firstName} ${p.lastName} ${p.email ?? ''} ${p.jobTitle ?? ''}`.toLowerCase().includes(needle)));
  const recent = (p: Person) => p.hireDate && Date.now() - new Date(p.hireDate).getTime() < 60 * 86400000;
  const newcomers = all.filter(recent).length;
  const renderTree = (nodes: OrgUnit[], depth = 0) => nodes.map((u) => (
    <div key={u.id}>
      <Link href={`/people${u.id === sp.unit ? '' : `?unit=${u.id}`}`} className="row" style={{ justifyContent: 'space-between', padding: `7px 10px 7px ${10 + depth * 16}px`, borderRadius: 8, background: u.id === sp.unit ? 'var(--brand-soft)' : depth === 0 ? 'var(--surface-2)' : undefined, color: u.id === sp.unit ? 'var(--brand-2)' : undefined, fontSize: 13.5, flexWrap: 'nowrap' }}>
        <span className="row" style={{ gap: 8, flexWrap: 'nowrap', minWidth: 0 }}>{depth === 0 ? <Icon name="building" size={14} /> : <span style={{ width: 14 }} />}<span style={{ fontWeight: depth === 0 ? 600 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span></span>
        <span className="sup" style={{ fontVariantNumeric: 'tabular-nums' }}>{all.filter((p) => p.orgUnitId === u.id).length}</span>
      </Link>
      {u.children.length > 0 && renderTree(u.children, depth + 1)}
    </div>
  ));
  return (
    <>
      <div className="ph">
        <div><h1>Persone</h1><p>{all.length} persone · {unitName.size} unità organizzative{newcomers ? ` · ${newcomers} ${newcomers === 1 ? 'ingresso' : 'ingressi'} negli ultimi 60 giorni` : ''}</p></div>
        <div className="actions">
          <Button href="/people/users" variant="ghost">Utenti e accessi</Button>
          <Button href="/people/import">Importa da CSV</Button>
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 280px', alignItems: 'start' }}>
        <div className="card flush">
          <Toolbar hint={items.length !== all.length ? `${items.length} di ${all.length}` : 'ordinate per unità, poi cognome'}>
            <SearchField defaultValue={q} placeholder="Cerca per nome, email, ruolo…" action="/people" />
            {sp.unit && <Link href={q ? `/people?q=${encodeURIComponent(q)}` : '/people'} className="pill b">{unitName.get(sp.unit) ?? 'Unità'} <Icon name="x" size={12} stroke={2.2} /></Link>}
          </Toolbar>
          <div className="tbl">
            <table>
              <thead><tr><th>Persona</th><th>Ruolo</th><th>Unità</th><th>Manager</th><th style={{ textAlign: 'right' }}>Stato</th></tr></thead>
              <tbody>
                {items.length === 0 && <tr><td colSpan={5} className="empty">Nessuna persona corrisponde alla ricerca.</td></tr>}
                {items.map((p) => {
                  const m = p.managerId ? byId.get(p.managerId) : undefined;
                  const st = statusLabel[p.status] ?? { text: p.status, tone: 'n' as const };
                  return (
                    <tr key={p.id}>
                      <td><div className="who"><Avatar person={p} /><div style={{ minWidth: 0 }}><div className="n row" style={{ gap: 8, flexWrap: 'nowrap' }}><Link href={`/people/${p.id}`}>{p.firstName} {p.lastName}</Link>{me.person?.id === p.id && <Pill tone="b">tu</Pill>}{recent(p) && p.hireDate && <Pill>dal {fmtShort.format(new Date(p.hireDate))}</Pill>}</div><div className="r" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.email ?? '—'}</div></div></div></td>
                      <td>{p.jobTitle ?? '—'}</td>
                      <td>{p.orgUnitId ? <Link href={`/people?unit=${p.orgUnitId}`} className="pill n">{unitName.get(p.orgUnitId) ?? '—'}</Link> : '—'}</td>
                      <td style={{ color: 'var(--ink2)' }}>{m ? `${m.firstName} ${m.lastName}` : '—'}</td>
                      <td style={{ textAlign: 'right' }}><Pill tone={st.tone} dot>{st.text}</Pill></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 24 }}>
          <div className="card" style={{ padding: '14px 10px' }}>
            <h3 style={{ padding: '0 10px' }}>Organigramma {sp.unit && <small><Link href="/people">tutte</Link></small>}</h3>
            <div style={{ display: 'grid', gap: 2 }}>{renderTree(tree)}</div>
          </div>
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
