import { redirect } from 'next/navigation';
import { apiFetch, fmtDate, appInstanceStatusLabel, appStatusLabel, type AppDashboardRow, type AppInstanceSummary, type AppSummary, type AppTemplateLite, type Me, type Person } from '@/lib/api';
import { importApp, installAppTemplate, launchApp } from '@/lib/actions';
import { Button, Card, EmptyState, PageHeader, Pill, Progress, TableWrap, Tabs, Who } from '@/components/ui';
import { ActionForm } from '@/components/action-form';


export default async function AppsPage({ searchParams }: { searchParams: Promise<{ tab?: string; app?: string; status?: string }> }) {
  const sp = await searchParams;
  const me = await apiFetch<Me>('/me');
  const canUse = me.permissions.includes('apps:use') && !!me.person;
  const isHr = me.permissions.includes('apps:manage');
  if (!canUse && !isHr) redirect('/dashboard');
  const isManager = me.permissions.includes('objectives:write:team');
  const tabs = [
    ...(canUse ? [{ key: 'todo', label: 'Da fare', href: '/apps' }, { key: 'mine', label: 'Le mie', href: '/apps?tab=mine' }, { key: 'launched', label: 'Avviate da me', href: '/apps?tab=launched' }] : []),
    ...(isManager && !isHr ? [{ key: 'team', label: 'Il mio team', href: '/apps?tab=team' }] : []),
    { key: 'launch', label: 'Avvia', href: '/apps?tab=launch' },
    ...(isHr ? [{ key: 'studio', label: 'Studio', href: '/apps?tab=studio' }, { key: 'instances', label: 'Istanze', href: '/apps?tab=instances' }] : []),
  ];
  const tab = tabs.some((t) => t.key === sp.tab) ? sp.tab! : tabs[0]!.key;
  const box = tab === 'instances' ? 'all' : tab === 'todo' || tab === 'mine' || tab === 'launched' || tab === 'team' ? tab : null;
  const [instances, apps, templates, dashboard, people] = await Promise.all([
    box ? apiFetch<AppInstanceSummary[]>(`/apps/instances?box=${box}${sp.app ? `&appKey=${encodeURIComponent(sp.app)}` : ''}${sp.status ? `&status=${sp.status}` : box === 'todo' ? '&status=running' : ''}`) : Promise.resolve([] as AppInstanceSummary[]),
    tab === 'launch' || tab === 'studio' || tab === 'instances' ? apiFetch<AppSummary[]>(`/apps?scope=${tab === 'launch' ? 'launchable' : 'all'}`) : Promise.resolve([] as AppSummary[]),
    tab === 'studio' && isHr ? apiFetch<AppTemplateLite[]>('/apps/templates') : Promise.resolve([] as AppTemplateLite[]),
    tab === 'studio' && isHr ? apiFetch<AppDashboardRow[]>('/apps/dashboard') : Promise.resolve([] as AppDashboardRow[]),
    tab === 'launch' ? apiFetch<{ items: Person[] }>('/people?limit=200').then((r) => r.items).catch(() => [] as Person[]) : Promise.resolve([] as Person[]),
  ]);
  const todoCount = tab === 'todo' ? instances.length : null;
  const Rows = ({ rows }: { rows: AppInstanceSummary[] }) => (
    <TableWrap>
      <table>
        <thead><tr><th>Processo</th><th>Soggetto</th><th>Fase attiva</th><th>Avanzamento</th><th>Stato</th><th></th></tr></thead>
        <tbody>
          {rows.map((i) => {
            const st = appInstanceStatusLabel[i.status] ?? { text: i.status, cls: 'n' };
            const mine = i.activeStages.find((s) => s.isMine);
            return (
              <tr key={i.id}>
                <td><b>{i.icon ? `${i.icon} ` : ''}{i.name}</b>{i.title && <div className="sup">{i.title}</div>}<div className="sup">avviata il {fmtDate(i.startedAt)}{i.launcher ? ` da ${i.launcher.firstName} ${i.launcher.lastName}` : ''}</div></td>
                <td>{i.subject ? <Who person={i.subject} /> : '—'}</td>
                <td>{i.activeStages.length === 0 ? <span className="sup">—</span> : i.activeStages.map((s) => <div key={s.key}>{s.name} <span className="sup">· {s.actor ? `${s.actor.firstName} ${s.actor.lastName}` : '—'}{s.dueDate ? ` · entro ${fmtDate(s.dueDate)}` : ''}</span> {s.overdue && <Pill tone="c">scaduta</Pill>}</div>)}</td>
                <td><div className="row"><Progress value={i.progress.percent / 100} tone={i.activeStages.some((s) => s.overdue) ? 'w' : 'g'} /><span className="sup">{i.progress.percent}%</span></div></td>
                <td><Pill tone={st.cls as 'g'}>{st.text}</Pill></td>
                <td>{mine?.type === 'form' && mine.formResponseId ? <Button href={`/forms/responses/${mine.formResponseId}`} size="sm" variant="primary">Compila</Button> : <Button href={`/apps/instances/${i.id}`} size="sm" variant={mine ? 'primary' : 'default'}>{mine ? 'Decidi' : 'Apri'}</Button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
  return (
    <>
      <PageHeader title="Processi" subtitle={todoCount != null ? `${todoCount} ${todoCount === 1 ? 'fase in attesa di te' : 'fasi in attesa di te'}` : 'Richieste, approvazioni e processi HR costruiti in App Studio'} actions={isHr ? <Button href="/apps/new">Nuova app</Button> : undefined} />
      {tabs.length > 1 && <Tabs items={tabs} current={tab} />}
      {(tab === 'todo' || tab === 'mine' || tab === 'launched' || tab === 'team') && (
        <Card title={tab === 'todo' ? 'Da fare' : tab === 'mine' ? 'Processi su di me' : tab === 'launched' ? 'Avviati da me' : 'Processi del mio team'}>
          {instances.length === 0 ? <EmptyState title={tab === 'todo' ? 'Niente da fare' : 'Nessun processo'} hint={tab === 'todo' ? 'Quando una fase sarà assegnata a te la troverai qui con la scadenza.' : 'Avvia un processo dalla scheda «Avvia».'} action={<Button href="/apps?tab=launch">Avvia un processo</Button>} /> : <Rows rows={instances} />}
        </Card>
      )}
      {tab === 'launch' && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          {apps.length === 0 && <Card><EmptyState title="Nessun processo avviabile" hint={isHr ? 'Installa un template dallo Studio e pubblicalo.' : 'L’HR non ha ancora pubblicato processi che puoi avviare.'} /></Card>}
          {apps.map((a) => (
            <Card key={a.id} title={<>{a.definition.icon ? `${a.definition.icon} ` : ''}{a.name}</>} aside={`v${a.version}`}>
              {a.definition.description && <p style={{ marginTop: 0, fontSize: 13 }}>{a.definition.description}</p>}
              <div className="sup" style={{ marginBottom: 8 }}>{a.definition.stages.length} fasi: {a.definition.stages.map((s) => s.name).join(' → ')}</div>
              <ActionForm action={launchApp} className="stack" style={{ gap: 6 }}>
                <input type="hidden" name="appKey" value={a.key} />
                {a.canLaunchForOthers ? (
                  <select name="subjectPersonId" className="input" required defaultValue={a.canLaunchForSelf ? me.person?.id ?? '' : ''}><option value="">{a.definition.naming.subjectLabel}…</option>{people.filter((p) => isHr || p.managerId === me.person?.id || p.id === me.person?.id).map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}{p.id === me.person?.id ? ' (io)' : ''}</option>)}</select>
                ) : <input type="hidden" name="subjectPersonId" value={me.person?.id ?? ''} />}
                <input name="title" className="input" placeholder="Titolo (facoltativo)" />
                <div><Button variant="primary" size="sm">{a.definition.naming.launchVerb}</Button></div>
              </ActionForm>
            </Card>
          ))}
        </div>
      )}
      {tab === 'studio' && isHr && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', alignItems: 'start' }}>
          <div className="stack" style={{ gap: 16 }}>
            <Card title="Le app del tenant" aside="bozze, pubblicate e archiviate">
              {apps.length === 0 ? <EmptyState title="Nessuna app" hint="Installa un template a destra o crea un’app da zero." /> : (
                <TableWrap>
                  <table>
                    <thead><tr><th>App</th><th>Versione</th><th>Stato</th><th className="num">Fasi</th><th>Istanze</th><th></th></tr></thead>
                    <tbody>{apps.map((a) => { const st = appStatusLabel[a.status] ?? { text: a.status, cls: 'n' }; return <tr key={a.id}><td><b>{a.definition.icon ? `${a.definition.icon} ` : ''}{a.name}</b><div className="sup">{a.key}{a.templateKey ? ` · da template` : ''}</div></td><td className="num">v{a.version}</td><td><Pill tone={st.cls as 'g'}>{st.text}</Pill></td><td className="num">{a.definition.stages.length}</td><td className="sup">{Object.entries(a.instances).map(([k, n]) => `${appInstanceStatusLabel[k]?.text ?? k} ${n}`).join(' · ') || '—'}</td><td><Button href={`/apps/${a.id}`} size="sm">Apri</Button></td></tr>; })}</tbody>
                  </table>
                </TableWrap>
              )}
            </Card>
            {dashboard.length > 0 && (
              <Card title="Avanzamento per app e fase" aside="istanze attive e scadute">
                {dashboard.map((d) => (
                  <div key={d.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--grid)' }}>
                    <div className="row" style={{ justifyContent: 'space-between' }}><b>{d.icon ? `${d.icon} ` : ''}{d.name}</b><span className="sup">{d.counts.running} in corso · {d.counts.completed} concluse{d.counts.cancelled ? ` · ${d.counts.cancelled} annullate` : ''}{d.avgDays != null ? ` · ${d.avgDays} gg medi` : ''}</span></div>
                    <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginTop: 4 }}>{d.stages.map((s) => <Pill key={s.key} tone={s.overdue ? 'c' : s.active ? 'g' : 'n'}>{s.name}: {s.active}{s.overdue ? ` (${s.overdue} scadute)` : ''}</Pill>)}</div>
                  </div>
                ))}
              </Card>
            )}
          </div>
          <div className="stack" style={{ gap: 16 }}>
            <Card title="Template pronti" aside="installa e adatta">
              {templates.map((t) => (
                <div key={t.key} style={{ padding: '8px 0', borderBottom: '1px solid var(--grid)' }}>
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div><b>{t.icon ? `${t.icon} ` : ''}{t.name}</b> <span className="sup">· {t.category} · {t.stages} fasi</span><div style={{ fontSize: 13 }}>{t.description}</div></div>
                    <ActionForm action={installAppTemplate} inline><input type="hidden" name="key" value={t.key} /><Button size="sm">Installa</Button></ActionForm>
                  </div>
                </div>
              ))}
            </Card>
            <Card title="Importa da JSON" aside="esportato da un’altra app o tenant">
              <ActionForm action={importApp} className="stack" style={{ gap: 6 }}>
                <textarea name="json" className="input" rows={5} placeholder='{"app": {...}, "forms": [...]}' required style={{ fontFamily: 'monospace', fontSize: 12 }} />
                <div><Button size="sm">Importa</Button></div>
              </ActionForm>
            </Card>
          </div>
        </div>
      )}
      {tab === 'instances' && isHr && (
        <Card title="Tutte le istanze" aside={<a href={`/api/export?report=app-instances&box=all${sp.app ? `&appKey=${encodeURIComponent(sp.app)}` : ''}${sp.status ? `&status=${sp.status}` : ''}`}>Esporta CSV</a>}>
          <form className="row" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
            <input type="hidden" name="tab" value="instances" />
            <select name="app" className="input" style={{ width: 'auto' }} defaultValue={sp.app ?? ''}><option value="">Tutte le app</option>{[...new Map(apps.map((a) => [a.key, a])).values()].map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}</select>
            <select name="status" className="input" style={{ width: 'auto' }} defaultValue={sp.status ?? ''}><option value="">Ogni stato</option><option value="running">In corso</option><option value="completed">Concluse</option><option value="cancelled">Annullate</option></select>
            <Button size="sm">Filtra</Button>
          </form>
          {instances.length === 0 ? <EmptyState title="Nessuna istanza" /> : <Rows rows={instances} />}
        </Card>
      )}
    </>
  );
}
