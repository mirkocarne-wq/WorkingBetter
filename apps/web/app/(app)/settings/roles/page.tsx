import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BuiltInRoleLabels, BuiltInRoles, PermissionCatalog, ProtectedPermissions, TenantModuleLabels, isModuleEnabled, type TenantModule } from '@wb/shared';
import { apiFetch, type Me, type RoleView, type Tenant } from '@/lib/api';
import { createRole, resetRole, saveRolePermissions, setRoleArchived } from '@/lib/actions';
import { ActionForm } from '@/components/action-form';
import { Button, PageHeader, Pill } from '@/components/ui';

/** Griglia dei permessi per modulo (CORE-043): i moduli spenti nel tenant sono segnalati ma restano modificabili. */
function PermissionGrid({ selected, disabled, modules, protectedKeys }: { selected: Set<string>; disabled?: boolean; modules: Tenant['settings']['modules']; protectedKeys?: Set<string> }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {PermissionCatalog.map((g) => {
        const off = g.module !== 'core' && g.module !== 'forms' && !isModuleEnabled({ modules }, g.module as TenantModule);
        return (
          <fieldset key={g.module} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            <div className="lvl" style={{ marginBottom: 6 }}>{g.title}{off && <Pill tone="w">modulo spento</Pill>}</div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '4px 12px' }}>
              {g.items.map((i) => {
                const locked = protectedKeys?.has(i.key);
                return (
                  <label key={i.key} className="check" title={i.key}>
                    {/* la chiave cambia con lo stato salvato: dopo salva/ripristina la casella riparte dal valore del server */}
                    <input key={`${i.key}:${selected.has(i.key) || locked}`} type="checkbox" name="permissions" value={i.key} defaultChecked={selected.has(i.key) || locked} disabled={disabled || locked} />
                    {locked && <input type="hidden" name="permissions" value={i.key} />}
                    <span>{i.label}{locked && <span className="sup"> · sempre attivo</span>}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

/** Impostazioni → Ruoli e permessi (CORE-041/043): predefiniti personalizzabili per modulo e ruoli custom. */
export default async function RolesPage({ searchParams }: { searchParams: Promise<{ role?: string; archived?: string }> }) {
  const me = await apiFetch<Me>('/me');
  if (!me.permissions.includes('roles:manage')) redirect('/settings');
  const sp = await searchParams;
  const [roles, tenant] = await Promise.all([apiFetch<RoleView[]>('/roles?includeArchived=true'), apiFetch<Tenant>('/tenant').catch(() => null)]);
  const modules = tenant?.settings?.modules;
  const isNew = sp.role === 'new';
  const current = isNew ? null : roles.find((r) => r.key === sp.role) ?? roles.find((r) => r.key === 'manager') ?? roles[0]!;
  const custom = roles.filter((r) => !r.builtIn);
  const customized = roles.filter((r) => r.builtIn && r.customized).length;
  const modulesOn = Object.entries(TenantModuleLabels).filter(([k]) => isModuleEnabled({ modules }, k as TenantModule)).length;
  return (
    <>
      <PageHeader title="Ruoli e permessi" subtitle={`${BuiltInRoles.length} ruoli predefiniti${customized ? ` (${customized} personalizzati)` : ''} · ${custom.filter((r) => !r.archivedAt).length} ruoli custom · ${modulesOn} moduli attivi`} actions={<><Button href="/people/users" variant="ghost">Utenti e accessi</Button><Button href="/settings" variant="ghost">Impostazioni</Button></>} />
      <div className="grid" style={{ gridTemplateColumns: '280px minmax(0, 1fr)', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card flush">
            <div className="hd"><h3>Predefiniti</h3></div>
            {roles.filter((r) => r.builtIn).map((r) => (
              <Link key={r.key} href={`/settings/roles?role=${r.key}`} className="rowi" style={{ justifyContent: 'space-between', background: current?.key === r.key ? 'var(--brand-soft)' : undefined }}>
                <span><b style={{ fontWeight: 600 }}>{r.name}</b><span className="sup" style={{ display: 'block' }}>{r.permissions.length} permessi{r.customized ? ' · personalizzato' : ''}</span></span>
                <span className="sup">{r.assignedUsers}</span>
              </Link>
            ))}
          </div>
          <div className="card flush">
            <div className="hd"><h3>Custom</h3><Link href="/settings/roles?role=new" className="more">+ Nuovo ruolo</Link></div>
            {custom.length === 0 && <div className="empty" style={{ padding: '18px 16px' }}>Nessun ruolo custom: componi i permessi sopra un ruolo base.</div>}
            {custom.filter((r) => !r.archivedAt || sp.archived === '1').map((r) => (
              <Link key={r.key} href={`/settings/roles?role=${r.key}`} className="rowi" style={{ justifyContent: 'space-between', background: current?.key === r.key ? 'var(--brand-soft)' : undefined, opacity: r.archivedAt ? 0.6 : 1 }}>
                <span><b style={{ fontWeight: 600 }}>{r.name}</b><span className="sup" style={{ display: 'block' }}><code>{r.key}</code> · base {BuiltInRoleLabels[r.baseRole as keyof typeof BuiltInRoleLabels] ?? r.baseRole}{r.archivedAt ? ' · archiviato' : ''}</span></span>
                <span className="sup">{r.assignedUsers}</span>
              </Link>
            ))}
            {custom.some((r) => r.archivedAt) && <div style={{ padding: '8px 16px' }}><Link href={sp.archived === '1' ? '/settings/roles' : '/settings/roles?archived=1'} className="sup">{sp.archived === '1' ? 'Nascondi archiviati' : 'Mostra archiviati'}</Link></div>}
          </div>
        </div>
        <div className="card">
          {isNew ? (
            <>
              <h3>Nuovo ruolo custom <small>permessi atomici sopra un ruolo base</small></h3>
              <ActionForm action={createRole} style={{ display: 'grid', gap: 12 }}>
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <label className="field"><span className="lab">Chiave</span><input name="key" className="input" required pattern="[a-z][a-z0-9_]{1,40}" placeholder="es. people_ops" /></label>
                  <label className="field"><span className="lab">Nome</span><input name="name" className="input" required maxLength={80} placeholder="es. People Ops" /></label>
                  <label className="field"><span className="lab">Ruolo base (perimetro)</span><select name="baseRole" className="input" defaultValue="employee">{BuiltInRoles.map((k) => <option key={k} value={k}>{BuiltInRoleLabels[k]}</option>)}</select></label>
                </div>
                <label className="field"><span className="lab">Descrizione</span><input name="description" className="input" maxLength={300} placeholder="A cosa serve, chi lo riceve" /></label>
                <p className="sup" style={{ margin: 0 }}>Il ruolo base decide il perimetro (team del manager, perimetro HR, profilo della Guida); i permessi sono solo quelli spuntati qui sotto.</p>
                <PermissionGrid selected={new Set()} modules={modules} />
                <div><Button variant="primary">Crea ruolo</Button></div>
              </ActionForm>
            </>
          ) : current && (
            <>
              <h3>{current.name} <small>{current.builtIn ? `ruolo predefinito · ${current.assignedUsers} ${current.assignedUsers === 1 ? 'utente' : 'utenti'}` : <><code>{current.key}</code> · base {BuiltInRoleLabels[current.baseRole as keyof typeof BuiltInRoleLabels] ?? current.baseRole} · {current.assignedUsers} {current.assignedUsers === 1 ? 'utente' : 'utenti'}</>}</small></h3>
              {current.builtIn && current.customized && <div className="suggest" style={{ marginBottom: 10 }}>Permessi personalizzati rispetto allo standard della piattaforma. <form action={resetRole.bind(null, current.key)} style={{ display: 'inline' }}><button className="btn sm ghost">Ripristina i default</button></form></div>}
              {current.archivedAt && <div className="suggest" style={{ marginBottom: 10 }}>Ruolo archiviato: non è più assegnabile e non concede permessi. <ActionForm action={setRoleArchived.bind(null, current.key, false)} inline><button className="btn sm">Riattiva</button></ActionForm></div>}
              <ActionForm action={saveRolePermissions.bind(null, current.key)} style={{ display: 'grid', gap: 12 }}>
                {!current.builtIn && (
                  <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <label className="field"><span className="lab">Nome</span><input name="name" className="input" required maxLength={80} defaultValue={current.name} /></label>
                    <label className="field"><span className="lab">Ruolo base (perimetro)</span><select name="baseRole" className="input" defaultValue={current.baseRole ?? 'employee'}>{BuiltInRoles.map((k) => <option key={k} value={k}>{BuiltInRoleLabels[k]}</option>)}</select></label>
                    <label className="field" style={{ gridColumn: '1 / -1' }}><span className="lab">Descrizione</span><input name="description" className="input" maxLength={300} defaultValue={current.description ?? ''} /></label>
                  </div>
                )}
                <PermissionGrid selected={new Set(current.permissions)} modules={modules} disabled={!!current.archivedAt} protectedKeys={current.key === 'tenant_admin' ? new Set(ProtectedPermissions) : undefined} />
                {!current.archivedAt && <div><Button variant="primary">Salva permessi</Button></div>}
              </ActionForm>
              {!current.builtIn && !current.archivedAt && sp.role === current.key && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--grid)' }}>
                  <ActionForm action={setRoleArchived.bind(null, current.key, true)} inline confirm={`Archiviare il ruolo «${current.name}»? Non sarà più assegnabile.`}><span className="sup">Un ruolo assegnato a qualcuno non si archivia: prima rimuovilo dagli utenti.</span> <button className="btn sm ghost" disabled={current.assignedUsers > 0}>Archivia ruolo</button></ActionForm>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
