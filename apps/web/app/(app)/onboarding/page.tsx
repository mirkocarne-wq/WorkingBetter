import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch, fmtDate, onboardingKindLabel, onboardingRoleLabel, onboardingStatusLabel, type BuddySuggestion, type Me, type OnboardingDashboard, type OnboardingJourneySummary, type OnboardingMe, type OnboardingTemplate, type Person } from '@/lib/api';
import { autoStartOnboarding, loadOnboardingPresets, startOnboarding } from '@/lib/actions';
import { Button, Card, EmptyState, Kpi, PageHeader, Pill, Progress, TableWrap, Tabs, Who } from '@/components/ui';
import { ActionForm } from '@/components/action-form';
import { OnboardingJourneyView } from '@/components/onboarding-journey';
import { OnboardingTaskRow } from '@/components/onboarding-task';

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const me = await apiFetch<Me>('/me');
  const canUse = me.permissions.includes('onboarding:use') && !!me.person;
  const isTeam = me.permissions.includes('onboarding:team') || me.permissions.includes('onboarding:manage');
  const isHr = me.permissions.includes('onboarding:manage');
  if (!canUse && !isHr) redirect('/dashboard');
  const mine = canUse ? await apiFetch<OnboardingMe>('/onboarding/me') : { journey: null, tasks: [] };
  const tabs = [
    ...(mine.journey ? [{ key: 'me', label: 'Il mio percorso', href: '/onboarding' }] : []),
    ...(canUse ? [{ key: 'tasks', label: `I miei task (${mine.tasks.length})`, href: '/onboarding?tab=tasks' }] : []),
    ...(isTeam ? [{ key: 'team', label: isHr ? 'Persone' : 'Il mio team', href: '/onboarding?tab=team' }] : []),
    ...(isTeam ? [{ key: 'templates', label: 'Percorsi', href: '/onboarding?tab=templates' }] : []),
  ];
  const tab = tabs.some((t) => t.key === sp.tab) ? sp.tab! : (tabs[0]?.key ?? 'tasks');
  const [dash, templates, people] = await Promise.all([
    tab === 'team' && isTeam ? apiFetch<OnboardingDashboard>('/onboarding/dashboard') : Promise.resolve(null),
    (tab === 'team' || tab === 'templates') && isTeam ? apiFetch<OnboardingTemplate[]>('/onboarding/templates') : Promise.resolve([] as OnboardingTemplate[]),
    tab === 'team' && isTeam ? apiFetch<{ items: Person[] }>('/people?limit=200').then((r) => r.items) : Promise.resolve([] as Person[]),
  ]);
  const startable = people.filter((p) => (isHr || p.managerId === me.person?.id) && p.id !== me.person?.id && p.status !== 'terminated');
  const JourneyRows = ({ rows }: { rows: OnboardingJourneySummary[] }) => (
    <TableWrap>
      <table>
        <thead><tr><th>Persona</th><th>Percorso</th><th>Giorno</th><th>Avanzamento</th><th>Survey</th><th></th></tr></thead>
        <tbody>
          {rows.map((j) => {
            const st = onboardingStatusLabel[j.status] ?? { text: j.status, cls: 'n' };
            return (
              <tr key={j.id}>
                <td>{j.person ? <Who person={j.person} role={j.manager ? `manager ${j.manager.firstName} ${j.manager.lastName}${j.buddy ? ` · buddy ${j.buddy.firstName}` : ''}` : undefined} /> : '—'}</td>
                <td>{j.templateName}<div className="sup">{onboardingKindLabel[j.kind]} · {fmtDate(j.anchorDate)} · <Pill tone={st.cls as 'g'}>{st.text}</Pill></div></td>
                <td className="num">{j.day >= 0 ? j.day : `−${-j.day}`}</td>
                <td><div className="row"><Progress value={j.progress.percent / 100} tone={j.progress.overdue ? 'w' : 'g'} /><span className="sup">{j.progress.percent}%{j.progress.overdue ? ` · ${j.progress.overdue} scaduti` : ''}</span></div></td>
                <td>{j.surveys.length ? j.surveys.map((s) => <Pill key={s.key} tone={s.low ? 'c' : 'g'} title={s.key}>{s.key} {s.score?.toFixed(1) ?? '—'}</Pill>) : <span className="sup">—</span>}</td>
                <td><Button href={`/onboarding/journeys/${j.id}`} size="sm">Apri</Button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
  return (
    <>
      <PageHeader title="Onboarding" subtitle={mine.journey ? `${mine.journey.templateName} · giorno ${mine.journey.day} · ${mine.journey.progress.percent}% completato` : `${mine.tasks.length} task assegnati a te`} />
      {tabs.length > 1 && <Tabs items={tabs} current={tab} />}
      {tab === 'me' && mine.journey && <OnboardingJourneyView j={mine.journey} backPath="/onboarding" buddies={[] as BuddySuggestion[]} people={[]} />}
      {tab === 'tasks' && (
        <Card title="I miei task di onboarding" aside="come persona, manager, buddy, HR o IT">
          {mine.tasks.length === 0 ? <EmptyState title="Nessun task aperto" hint="Quando accompagnerai un nuovo collega o inizierai un percorso, i task compariranno qui con le scadenze." /> : mine.tasks.map((t) => <OnboardingTaskRow key={t.id} t={t} backPath="/onboarding?tab=tasks" canManage={false} showPerson />)}
        </Card>
      )}
      {tab === 'team' && dash && (
        <>
          <div className="grid kpis" style={{ marginBottom: 16 }}>
            <Kpi label="Percorsi in corso" value={dash.totals.active} detail={`${dash.totals.completed} completati · avanzamento medio ${dash.totals.avgPercent ?? '—'}%`} />
            <Kpi label="Task scaduti" value={dash.totals.overdueTasks} detail={Object.entries(dash.overdueByRole).map(([r, n]) => `${onboardingRoleLabel[r as keyof typeof onboardingRoleLabel] ?? r} ${n}`).join(' · ') || 'nessuno'} />
            <Kpi label="Segnali dalle survey" value={dash.totals.lowSurveys} detail={dash.surveys.filter((s) => s.n).map((s) => `${s.key} ${s.avg?.toFixed(1)} (${s.n})`).join(' · ') || 'nessuna risposta'} />
            <Kpi label="Perimetro" value={dash.scope === 'all' ? 'Azienda' : 'Team'} detail={dash.scope === 'all' ? 'tutti i percorsi' : 'i tuoi riporti diretti'} />
          </div>
          <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', alignItems: 'start' }}>
            <Card title="Percorsi" aside="persona, avanzamento, survey">
              {dash.journeys.length === 0 ? <EmptyState title="Nessun percorso" hint="Avvia un onboarding a destra oppure lascia che parta da solo per i nuovi ingressi con data." /> : <JourneyRows rows={dash.journeys} />}
            </Card>
            <div className="stack" style={{ gap: 16 }}>
              <Card title="Avvia un percorso">
                {templates.length === 0 ? <div className="suggest">Nessun template: carica i percorsi predefiniti nella scheda <Link href="/onboarding?tab=templates">Percorsi</Link>.</div> : (
                  <ActionForm action={startOnboarding} className="stack" style={{ gap: 6 }}>
                    <label className="field"><span className="lab">Persona</span><select name="personId" className="input" required><option value="">Scegli…</option>{startable.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}{p.jobTitle ? ` · ${p.jobTitle}` : ''}</option>)}</select></label>
                    <label className="field"><span className="lab">Percorso</span><select name="templateId" className="input"><option value="">Automatico dalle regole (onboarding)</option>{templates.filter((t) => t.active).map((t) => <option key={t.id} value={t.id}>{t.name} · {onboardingKindLabel[t.kind]}</option>)}</select></label>
                    <label className="field"><span className="lab">Data di riferimento <span className="sup">(vuota = data di ingresso o di uscita della persona)</span></span><input name="anchorDate" type="date" className="input" /></label>
                    <div><Button variant="primary">Avvia</Button></div>
                  </ActionForm>
                )}
                {isHr && <ActionForm action={autoStartOnboarding} inline style={{ marginTop: 10 }}><Button size="sm">Avvia i percorsi mancanti (ingressi recenti e uscite)</Button></ActionForm>}
              </Card>
              {dash.overdueByAssignee.length > 0 && (
                <Card title="Chi ha task scaduti" aside="per assegnatario">
                  {dash.overdueByAssignee.map((o, i) => <div key={i} className="row" style={{ justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--grid)' }}><span>{o.person ? `${o.person.firstName} ${o.person.lastName}` : '—'} <span className="sup">· {onboardingRoleLabel[o.role as keyof typeof onboardingRoleLabel] ?? o.role}</span></span><Pill tone="w">{o.n}</Pill></div>)}
                </Card>
              )}
            </div>
          </div>
        </>
      )}
      {tab === 'templates' && (
        <Card title="Percorsi" aside="template con fasi, task per ruolo e regole di assegnazione" >
          {templates.length === 0 ? <EmptyState title="Nessun percorso" hint="Carica i predefiniti: generico, manager, remoto, cambio ruolo interno, offboarding. Poi adattali." action={isHr ? <form action={loadOnboardingPresets}><Button variant="primary">Carica i percorsi predefiniti</Button></form> : undefined} /> : (
            <>
              <TableWrap>
                <table>
                  <thead><tr><th>Percorso</th><th>Tipo</th><th className="num">Fasi</th><th className="num">Task</th><th>Regole</th><th className="num">Avviati</th><th></th></tr></thead>
                  <tbody>{templates.map((t) => <tr key={t.id}><td><b>{t.name}</b>{t.isDefault && <Pill tone="b">default</Pill>}{!t.active && <Pill tone="n">disattivo</Pill>}<div className="sup">{t.description}</div></td><td>{onboardingKindLabel[t.kind]}</td><td className="num">{t.phases.length}</td><td className="num">{t.tasks.length}</td><td className="sup">{[t.rules.jobTitleKeywords?.length ? `ruolo: ${t.rules.jobTitleKeywords.join(', ')}` : '', t.rules.locations?.length ? `sede: ${t.rules.locations.join(', ')}` : '', t.rules.orgUnitIds?.length ? `${t.rules.orgUnitIds.length} unità` : ''].filter(Boolean).join(' · ') || '—'}</td><td className="num">{t.journeys ?? 0}</td><td>{isHr && <Button href={`/onboarding/templates/${t.id}`} size="sm">Modifica</Button>}</td></tr>)}</tbody>
                </table>
              </TableWrap>
              {isHr && <div className="row" style={{ marginTop: 10 }}><Button href="/onboarding/templates/new">Nuovo percorso</Button><form action={loadOnboardingPresets}><Button size="sm" variant="ghost">Ricarica i predefiniti mancanti</Button></form></div>}
            </>
          )}
        </Card>
      )}
    </>
  );
}
