import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PersonFieldVisibilityLabels } from '@wb/shared';
import { ApiError, apiFetch, fmtDate, type Me, type Person, type PersonFieldDef } from '@/lib/api';
import { savePersonCustomFields } from '@/lib/actions';
import { ActionForm } from '@/components/action-form';
import { Avatar, Button, Pill } from '@/components/ui';

interface OrgUnit { id: string; name: string; parentId: string | null; children: OrgUnit[] }
const statusLabel: Record<string, { text: string; tone: 'g' | 'n' | 'w' | 'c' }> = { active: { text: 'Attiva', tone: 'g' }, invited: { text: 'Invitata', tone: 'w' }, leaving: { text: 'In uscita', tone: 'w' }, terminated: { text: 'Cessata', tone: 'n' }, suspended: { text: 'Sospesa', tone: 'c' } };

const show = (d: PersonFieldDef, v: unknown) => {
  if (v == null || v === '') return '—';
  if (d.type === 'boolean') return v === true ? 'Sì' : 'No';
  if (d.type === 'single_choice') return d.options.find((o) => o.value === v)?.label ?? String(v);
  if (d.type === 'date') return fmtDate(String(v));
  return String(v);
};

/** Scheda persona (CORE-011): anagrafica e campi custom visibili a chi legge; l'HR li compila. */
export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let p: Person;
  try { p = await apiFetch<Person>(`/people/${id}`); } catch (e) { if (e instanceof ApiError && e.status === 404) notFound(); throw e; }
  const [me, defs, { items: people }, tree] = await Promise.all([
    apiFetch<Me>('/me'), apiFetch<PersonFieldDef[]>('/person-fields'), apiFetch<{ items: Person[] }>('/people?limit=200'), apiFetch<OrgUnit[]>('/org-units?tree=true').catch(() => [] as OrgUnit[]),
  ]);
  const canEdit = me.permissions.includes('people:write');
  const isSelf = me.person?.id === p.id;
  const manager = p.managerId ? people.find((x) => x.id === p.managerId) : undefined;
  const reports = people.filter((x) => x.managerId === p.id);
  const unitName = new Map<string, string>();
  const walk = (n: OrgUnit[]) => n.forEach((u) => { unitName.set(u.id, u.name); walk(u.children); });
  walk(tree);
  const values = p.customFields ?? {};
  // l'API restituisce solo i valori visibili: qui mostriamo i campi del catalogo che l'osservatore può vedere (l'HR tutti)
  const visible = defs.filter((d) => canEdit || d.visibility === 'all' || (d.visibility === 'manager' && manager?.id === me.person?.id) || d.key in values);
  const sections = [...new Set(visible.map((d) => d.section ?? ''))];
  const st = statusLabel[p.status] ?? { text: p.status, tone: 'n' as const };
  return (
    <>
      <div className="ph">
        <div className="who" style={{ gap: 14 }}>
          <Avatar person={p} large />
          <div>
            <h1 style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{p.firstName} {p.lastName} {isSelf && <Pill tone="b">tu</Pill>}<Pill tone={st.tone} dot>{st.text}</Pill></h1>
            <p>{[p.jobTitle, p.jobLevel, p.orgUnitId ? unitName.get(p.orgUnitId) : null, p.location].filter(Boolean).join(' · ') || 'Nessun ruolo indicato'}</p>
          </div>
        </div>
        <div className="actions">
          <Button href="/people" variant="ghost">Persone</Button>
          {me.permissions.includes('development:use') && <Button href={`/development/people/${p.id}`} variant="ghost">Profilo di sviluppo</Button>}
          {canEdit && <Button href="/settings/person-fields" variant="ghost">Campi persona</Button>}
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: '320px minmax(0, 1fr)', alignItems: 'start' }}>
        <div className="card">
          <h3>Anagrafica</h3>
          <dl className="kv">
            <dt>Email</dt><dd>{p.email ?? '—'}</dd>
            <dt>Manager</dt><dd>{manager ? <Link href={`/people/${manager.id}`}>{manager.firstName} {manager.lastName}</Link> : '—'}</dd>
            <dt>Unità</dt><dd>{p.orgUnitId ? <Link href={`/people?unit=${p.orgUnitId}`}>{unitName.get(p.orgUnitId) ?? '—'}</Link> : '—'}</dd>
            <dt>Sede</dt><dd>{p.location ?? '—'}</dd>
            <dt>In azienda dal</dt><dd>{p.hireDate ? fmtDate(p.hireDate) : '—'}</dd>
            {canEdit && <><dt>Matricola</dt><dd>{p.employeeNumber ?? '—'}</dd></>}
            {reports.length > 0 && <><dt>Riporti diretti</dt><dd>{reports.map((r) => <Link key={r.id} href={`/people/${r.id}`} style={{ display: 'block' }}>{r.firstName} {r.lastName}</Link>)}</dd></>}
          </dl>
        </div>
        <div className="card">
          <h3>Dati aziendali <small>{canEdit ? 'campi definiti in Impostazioni → Campi persona' : visible.length ? 'i campi che puoi vedere' : ''}</small></h3>
          {defs.length === 0 ? <div className="empty" style={{ padding: '20px 0' }}><b>Nessun campo custom definito</b>{canEdit ? <Link href="/settings/person-fields" style={{ color: 'var(--brand-2)' }}>Definisci il catalogo</Link> : null}</div>
            : visible.length === 0 ? <div className="sup">Nessun dato visibile per il tuo profilo.</div>
            : canEdit ? (
              <ActionForm action={savePersonCustomFields.bind(null, p.id)} style={{ display: 'grid', gap: 12 }}>
                {sections.map((sec) => (
                  <div key={sec} style={{ display: 'grid', gap: 8 }}>
                    {sec && <div className="lvl">{sec}</div>}
                    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                      {visible.filter((d) => (d.section ?? '') === sec).map((d) => {
                        const v = values[d.key];
                        return (
                          <label key={d.key} className="field">
                            <span className="lab row" style={{ gap: 6 }}>{d.label}{d.required && <span style={{ color: 'var(--crit-text)' }}>*</span>}<span className="sup" title={PersonFieldVisibilityLabels[d.visibility]}>{d.visibility === 'hr' ? '· solo HR' : d.visibility === 'manager' ? '· manager' : ''}</span></span>
                            <input type="hidden" name="keys" value={d.key} /><input type="hidden" name={`type.${d.key}`} value={d.type} />
                            {d.type === 'single_choice' ? <select name={`cf.${d.key}`} className="input" defaultValue={v == null ? '' : String(v)}><option value="">—</option>{d.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                              : d.type === 'boolean' ? <select name={`cf.${d.key}`} className="input" defaultValue={v === true ? 'true' : v === false ? 'false' : ''}><option value="">—</option><option value="true">Sì</option><option value="false">No</option></select>
                              : <input name={`cf.${d.key}`} className="input" type={d.type === 'date' ? 'date' : d.type === 'number' ? 'number' : 'text'} step={d.type === 'number' ? 'any' : undefined} defaultValue={v == null ? '' : String(v)} placeholder={d.help ?? ''} />}
                            {d.help && <span className="sup">{d.help}</span>}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <div><Button variant="primary">Salva</Button></div>
              </ActionForm>
            ) : (
              <dl className="kv">{visible.map((d) => <span key={d.key} style={{ display: 'contents' }}><dt>{d.label}</dt><dd>{show(d, values[d.key])}</dd></span>)}</dl>
            )}
        </div>
      </div>
    </>
  );
}
