import Link from 'next/link';
import { apiFetch, confidenceLabel, fmtDate, pct, qs, type AlertsResult, type Cycle, type GuideSummary, type Me, type Objective, type OverviewResult, type Person, type Todo, type TodoItem } from '@/lib/api';
import { dismissGuide } from '@/lib/actions';
import { moduleOn, getNaming } from '@/lib/tenant';
import { Avatar, Button, KpiBand, Pill, Ring, Who } from '@/components/ui';
import { Icon, type IconName } from '@/components/icons';
import { BarList, Distribution, StatTile } from '@/components/charts';

const KIND_ICON: Record<TodoItem['kind'], IconName> = { action: 'check', check_in: 'target', review: 'review', approval: 'review', onboarding: 'onb', process: 'flow', survey: 'survey', f360: 'f360' };
const fmtDay = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' });
const fmtLong = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const words = ['nessuna', 'una', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove'];

/** Scadenza in parole e tono della voce «Da fare». */
function dueText(t: TodoItem): { text: string | null; tone: 'c' | 'w' | 'b' | 'n' } {
  if (t.overdue) return { text: t.kind === 'check_in' ? `in ritardo di ${t.daysDelta} ${t.daysDelta === 1 ? 'giorno' : 'giorni'}` : `scaduta da ${t.daysDelta} ${t.daysDelta === 1 ? 'giorno' : 'giorni'}`, tone: 'c' };
  if (t.daysDelta != null) {
    const d = -t.daysDelta;
    const text = d === 0 ? 'entro oggi' : d === 1 ? 'entro domani' : `entro ${d} giorni`;
    return { text, tone: d <= 3 ? 'w' : t.kind === 'survey' || t.kind === 'f360' ? 'b' : 'n' };
  }
  return { text: null, tone: t.kind === 'survey' || t.kind === 'f360' ? 'b' : 'n' };
}

export default async function Dashboard() {
  const me = await apiFetch<Me>('/me');
  // moduli disattivati dal tenant (CORE-004) e glossario (CORE-003)
  const [okrOn, oooOn, fbOn, revOn, anaOn, naming] = await Promise.all([moduleOn('okr'), moduleOn('one_on_ones'), moduleOn('feedback'), moduleOn('reviews'), moduleOn('analytics'), getNaming()]);
  const objectives = naming.objective.plural;
  const objectivesLc = objectives.toLowerCase();
  const cycle = okrOn ? await apiFetch<Cycle | null>('/cycles/current') : null;
  const cycleId = cycle?.id;
  const isManager = me.permissions.includes('objectives:write:team');
  const isHr = me.permissions.includes('analytics:query');
  const canAnalytics = anaOn && (isHr || me.permissions.includes('analytics:query:team'));
  // panoramica (ANA-006): fino a 4 indicatori dei moduli attivi, con variazione e sparkline sugli ultimi 14 giorni
  const overviewKeys = [...(okrOn ? ['people_with_objectives_share', 'objective_progress_avg'] : []), ...(oooOn ? ['one_on_one_coverage_30d'] : []), ...(fbOn ? ['feedback_per_person_30d'] : []), ...(revOn ? ['review_completion'] : []), 'headcount'].slice(0, 4);
  const [guide, todo, mine, team, people, overview, alerts] = await Promise.all([
    apiFetch<GuideSummary>('/guides/me/summary').catch(() => null),
    apiFetch<Todo>('/me/todo').catch(() => ({ items: [], nextOneOnOne: null, generatedAt: '' }) as Todo),
    okrOn ? apiFetch<Objective[]>(`/objectives${qs({ cycleId, mine: true })}`) : Promise.resolve([] as Objective[]),
    okrOn && isManager ? apiFetch<Objective[]>(`/objectives${qs({ cycleId, team: true })}`) : Promise.resolve([] as Objective[]),
    me.permissions.includes('people:read') ? apiFetch<{ items: Person[] }>('/people?limit=200').then((r) => r.items) : Promise.resolve([] as Person[]),
    canAnalytics ? apiFetch<OverviewResult>(`/analytics/overview?metrics=${overviewKeys.join(',')}&days=14`).catch(() => null) : Promise.resolve(null),
    canAnalytics && isHr ? apiFetch<AlertsResult>('/analytics/alerts').catch(() => null) : Promise.resolve(null),
  ]);
  const byId = new Map(people.map((p) => [p.id, p]));
  const reports = me.person ? people.filter((p) => p.managerId === me.person!.id) : [];
  const atRisk = [...mine, ...team].filter((o) => o.confidence === 'off_track' || o.confidence === 'at_risk');
  const stale = [...mine, ...team].filter((o) => o.stale);
  const hour = new Date().getHours();
  const greet = hour < 13 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera';
  const overdue = todo.items.filter((t) => t.overdue).length;
  const n = todo.items.length;
  const summary = n === 0 ? 'niente in sospeso.' : `${words[n] ?? n} ${n === 1 ? 'cosa da fare' : 'cose da fare'}${overdue ? `, ${overdue === 1 ? 'una in ritardo' : `${overdue} in ritardo`}` : ''}.`;
  const next = todo.nextOneOnOne;
  const showGuide = guide && !guide.complete && !guide.dismissedAt;
  const myRisk = mine.find((o) => o.confidence === 'off_track') ?? mine.find((o) => o.confidence === 'at_risk');
  // salute degli obiettivi visibili (miei + team): confidenza e KR entro la cadenza
  const all = [...mine, ...team.filter((t) => !mine.some((m) => m.id === t.id))];
  const health = { on: all.filter((o) => o.confidence === 'on_track').length, at: all.filter((o) => o.confidence === 'at_risk').length, off: all.filter((o) => o.confidence === 'off_track').length };
  const noCheck = all.length - health.on - health.at - health.off;
  const krs = all.flatMap((o) => o.keyResults);
  const krFresh = all.filter((o) => !o.stale).flatMap((o) => o.keyResults).length;
  const openAlerts = (alerts?.alerts ?? []).filter((a) => a.count > 0).sort((a, b) => b.count - a.count);

  return (
    <>
      <div className="ph">
        <div>
          <h1>{greet}{me.person ? `, ${me.person.firstName}` : ''}</h1>
          <p>{cap(fmtLong.format(new Date()))} · {summary}</p>
        </div>
        <div className="actions">
          {okrOn && me.permissions.includes('objectives:write:own') && <Button href={`/objectives/new${cycleId ? `?cycle=${cycleId}` : ''}`} icon="plus">{`Nuovo ${naming.objective.singular.toLowerCase()}`}</Button>}
          {okrOn ? <Button href="/objectives" variant="primary" iconRight="arrow">{`Vai a ${objectivesLc}`}</Button> : <Button href="/notifications" variant="primary" iconRight="arrow">Notifiche</Button>}
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <KpiBand items={[
          ...(okrOn ? [
            { icon: 'target' as const, label: `${objectives} attivi`, value: mine.filter((o) => o.status === 'active').length, detail: `progresso medio ${pct(avg(mine))}`, aside: <Ring value={avg(mine)} /> },
            { icon: 'alert' as const, label: `${objectives} a rischio`, value: atRisk.length, tone: atRisk.length ? ('crit' as const) : undefined, detail: myRisk ? truncate(myRisk.title, 34) : isManager ? 'tuoi e del team' : 'nessuno, per ora' },
            { icon: 'clock' as const, label: `${naming.check_in.plural} in ritardo`, value: stale.length, detail: stale.length ? 'oltre la cadenza del periodo' : 'tutti entro la cadenza' },
          ] : [
            { icon: 'check' as const, label: 'Da fare', value: n, detail: overdue ? `${overdue} in ritardo` : 'niente in ritardo' },
          ]),
          reports.length
            ? { icon: 'people' as const, label: 'Riporti diretti', value: reports.length, detail: okrOn ? `${team.length} ${objectivesLc} di team` : 'il tuo team' }
            : oooOn && next
              ? { icon: 'one' as const, label: `Prossimo ${naming.one_on_one.singular}`, value: fmtDay.format(new Date(next.scheduledAt)).replace('.', ''), detail: `con ${next.other.firstName} · ${fmtTime.format(new Date(next.scheduledAt))}` }
              : oooOn
                ? { icon: 'one' as const, label: `Prossimo ${naming.one_on_one.singular}`, value: '—', detail: 'nessun incontro in calendario' }
                : { icon: 'guide' as const, label: 'Guida', value: guide ? `${guide.done}/${guide.total}` : '—', detail: 'passi del tuo profilo' },
        ]} />
      </div>

      {overview && overview.items.length > 0 && (
        <section className="card flush" style={{ marginBottom: 24 }} aria-label="Panoramica">
          <div className="hd"><h3>Panoramica<span className="count">{isHr ? 'tutta l’azienda' : 'il tuo team'} · ultimi 14 giorni</span></h3><Link href="/analytics" className="more">Apri i report<Icon name="chev" size={14} stroke={2} /></Link></div>
          <div className="stats" style={{ borderTop: '1px solid var(--grid)' }}>
            {overview.items.map((it) => (
              <StatTile key={it.metric.key} metricKey={it.metric.key} label={it.metric.name} value={it.value} format={it.metric.format} delta={it.delta} points={it.points} href={`/analytics?trend=${it.metric.key}`} hint={it.value == null ? 'nessuno snapshot' : it.previousDate ? `dal ${fmtDate(it.previousDate)}` : 'primo snapshot'} />
            ))}
          </div>
        </section>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 320px', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 24 }}>
          <section className="card flush todo">
            <div className="hd"><h3>Da fare<span className="count">{n}</span></h3><Link href="/notifications" className="more">Tutte le notifiche</Link></div>
            {n === 0 ? <div className="empty" style={{ padding: '28px 20px' }}><b>Niente in sospeso</b>Quando ci sarà qualcosa da fare (un check-in, una review, una survey) comparirà qui.</div>
              : todo.items.slice(0, 8).map((t, i) => {
                const d = dueText(t);
                return (
                  <div className="rowi" key={i}>
                    <span className={`ic ${d.tone === 'n' ? '' : d.tone}`}><Icon name={KIND_ICON[t.kind]} size={17} stroke={1.9} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className={`k ${d.tone === 'n' ? '' : d.tone}`}>{t.kicker}{d.text ? ` · ${d.text}` : ''}</div>
                      <div className="t">{t.title}</div>
                      {t.detail && <div className="s">{t.detail}</div>}
                    </div>
                    <Button href={t.href} size="sm">{t.action}</Button>
                  </div>
                );
              })}
            {n > 8 && <div className="rowi" style={{ justifyContent: 'center' }}><span className="sup">e altre {n - 8} voci</span></div>}
          </section>

          {okrOn && reports.length > 0 && (
            <section className="card flush">
              <div className="hd"><h3>Il tuo team<span className="count">{objectivesLc} del periodo</span></h3><Link href="/objectives?view=team" className="more">{objectives} del team<Icon name="chev" size={14} stroke={2} /></Link></div>
              <div className="tbl">
                <table>
                  <thead><tr><th>Persona</th><th>Obiettivi</th><th>Progresso</th><th>Segnali</th></tr></thead>
                  <tbody>
                    {reports.map((p) => {
                      const objs = team.filter((o) => o.ownerPersonId === p.id);
                      const worst = objs.find((o) => o.confidence === 'off_track') ?? objs.find((o) => o.confidence === 'at_risk');
                      const st = objs.filter((o) => o.stale).length;
                      return (
                        <tr key={p.id}>
                          <td><Who person={p} /></td>
                          <td className="num">{objs.length}</td>
                          <td><div className={`bar ${worst ? (worst.confidence === 'off_track' ? 'c' : 'w') : 'g'}`}><i style={{ width: `${Math.round((avg(objs) ?? 0) * 100)}%` }} /></div></td>
                          <td>
                            {worst ? <Pill tone={confidenceLabel[worst.confidence!].cls as 'c' | 'w'} dot>{worst.confidence === 'off_track' ? '1 obiettivo off track' : 'a rischio'}</Pill>
                              : st ? <Pill tone="s" dot>{st} senza check-in</Pill>
                              : objs.length ? <Pill tone="g" dot>Tutto ok</Pill> : <Pill>Nessun obiettivo</Pill>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {okrOn && <section className="card flush">
            <div className="hd"><h3>{`I miei ${objectivesLc}`}<span className="count">{mine.length}</span></h3><Link href="/objectives?view=tree" className="more">Albero di allineamento<Icon name="chev" size={14} stroke={2} /></Link></div>
            {mine.length === 0 ? <div className="empty" style={{ padding: '28px 20px' }}><b>{`Nessun ${naming.objective.singular.toLowerCase()} nel periodo`}</b><Link href="/objectives/new" style={{ color: 'var(--brand-2)' }}>Crea il primo</Link></div> : mine.map((o) => {
              const parent = o.parentId ? [...mine, ...team].find((x) => x.id === o.parentId) : null;
              return (
                <div className="rowi" key={o.id} style={{ justifyContent: 'space-between' }}>
                  <div style={{ minWidth: 0 }}>
                    <Link href={`/objectives?view=mine`} style={{ fontWeight: 500 }}>{o.title}</Link>
                    <div className="sup" style={{ marginTop: 2 }}>{o.keyResults.length} KR{parent ? ` · contribuisce a «${truncate(parent.title, 40)}»` : o.visibility === 'private' ? ' · obiettivo personale' : ''}{byId.size ? '' : ''}</div>
                  </div>
                  {o.progress == null && !o.confidence ? <Pill>{o.visibility === 'private' ? 'privato' : 'nessun check-in'}</Pill> : (
                    <div className="row" style={{ flexWrap: 'nowrap', gap: 12 }}>
                      <div className={`bar ${o.confidence === 'off_track' ? 'c' : o.confidence === 'at_risk' ? 'w' : o.confidence === 'on_track' ? 'g' : ''}`} style={{ width: 120 }}><i style={{ width: `${Math.round((o.progress ?? 0) * 100)}%` }} /></div>
                      <span className="pct" style={{ width: 40 }}>{pct(o.progress)}</span>
                      {o.confidence ? <Pill tone={confidenceLabel[o.confidence].cls as 'g' | 'w' | 'c'} dot>{confidenceLabel[o.confidence].text}</Pill> : <Pill>Nessun check-in</Pill>}
                    </div>
                  )}
                </div>
              );
            })}
          </section>}
        </div>

        <div style={{ display: 'grid', gap: 24 }}>
          {okrOn && all.length > 0 && (
            <section className="card" aria-label="Salute degli obiettivi">
              <h3>Salute <small>{all.length} {all.length === 1 ? naming.objective.singular.toLowerCase() : objectivesLc} nel periodo</small></h3>
              <Distribution segments={[
                { key: 'on', label: 'On track', value: health.on, color: 'var(--good)' },
                { key: 'at', label: 'A rischio', value: health.at, color: 'var(--warn)' },
                { key: 'off', label: 'Off track', value: health.off, color: 'var(--crit)' },
                { key: 'none', label: `Senza ${naming.check_in.singular.toLowerCase()}`, value: noCheck, color: 'var(--line)' },
              ]} />
              <div className="row" style={{ marginTop: 12, gap: 20 }}>
                <div className="stat"><div className="l">Progresso medio</div><div className="v sm">{pct(avg(all))}</div></div>
                <div className="stat"><div className="l">KR entro la cadenza</div><div className="v sm">{krs.length ? `${krFresh}/${krs.length}` : '—'}</div></div>
              </div>
            </section>
          )}
          {isHr && alerts && (
            <section className="card" aria-label="Segnali">
              <h3>Segnali <small>{openAlerts.length ? 'persone coinvolte' : alerts.snapshotDate ? 'nessuno aperto' : 'nessuno snapshot'}</small></h3>
              {openAlerts.length === 0 ? <div className="sup">{alerts.snapshotDate ? 'Nessun segnale aperto: obiettivi, 1:1 e review sono in regola.' : 'Aggiorna i dati dalla pagina Report per calcolare i segnali.'}</div>
                : <BarList format="count" rows={openAlerts.slice(0, 5).map((a) => ({ key: a.key, label: a.label, value: a.count, hint: a.people.slice(0, 3).map((x) => x.name).join(', ') + (a.people.length > 3 ? '…' : ''), href: '/analytics' }))} color="var(--serious)" />}
              <div style={{ marginTop: 10 }}><Button href="/analytics" size="sm" iconRight="chev">Tutti i segnali</Button></div>
            </section>
          )}
          {oooOn && next && (
            <section className="card">
              <h3>{`Prossimo ${naming.one_on_one.singular}`} <small><Pill>{fmtDay.format(new Date(next.scheduledAt)).replace('.', '')} · {fmtTime.format(new Date(next.scheduledAt))}</Pill></small></h3>
              <div className="who" style={{ marginBottom: 12 }}><Avatar person={next.other} /><div><div className="n">{next.other.firstName} {next.other.lastName}</div><div className="r">{next.other.jobTitle ?? ''}{next.cadenceDays ? ` · ogni ${next.cadenceDays} giorni` : ''}</div></div></div>
              <div className="lvl" style={{ marginBottom: 6 }}>Agenda · {next.agendaCount} {next.agendaCount === 1 ? 'punto' : 'punti'}</div>
              {next.agenda.length === 0 ? <div className="sup">Nessun punto ancora: aggiungine uno.</div> : <ul style={{ margin: 0, padding: '0 0 0 16px', color: 'var(--ink2)', fontSize: 13, display: 'grid', gap: 4 }}>{next.agenda.map((a, i) => <li key={i}>{a}</li>)}</ul>}
              <div className="row" style={{ marginTop: 14, flexWrap: 'nowrap' }}>
                <Button href={`/one-on-ones/${next.relationId}?meeting=${next.meetingId}`} size="sm">Apri l’incontro</Button>
                {next.meetingUrl && <a href={next.meetingUrl} target="_blank" rel="noreferrer" className="btn sm ghost"><Icon name="external" size={14} />Collegati</a>}
              </div>
            </section>
          )}
          {showGuide && guide && (
            <section className="card">
              <h3>{guide.title} <small>{guide.done} di {guide.total}</small></h3>
              <div className="bar" style={{ marginBottom: 12 }}><i style={{ width: `${guide.total ? Math.round((guide.done / guide.total) * 100) : 0}%` }} /></div>
              {guide.next && <div style={{ fontSize: 13, color: 'var(--ink2)', marginBottom: 12 }}>Prossimo passo: <b style={{ color: 'var(--ink)', fontWeight: 500 }}>{guide.next}</b></div>}
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <Button href="/inizia" size="sm" iconRight="chev">Apri la guida</Button>
                <form action={dismissGuide.bind(null, true)}><button className="btn sm ghost" title="Puoi riattivarlo dalla pagina Guida">Nascondi</button></form>
              </div>
            </section>
          )}
          {!next && !showGuide && (
            <section className="card">
              <h3>Scorciatoie</h3>
              <div style={{ display: 'grid', gap: 6 }}>
                {fbOn && me.permissions.includes('feedback:give') && <Button href="/feedback" variant="ghost" icon="chat">{`Dai un ${naming.feedback.singular.toLowerCase()}`}</Button>}
                {oooOn && me.permissions.includes('one_on_ones:participate') && <Button href="/one-on-ones" variant="ghost" icon="one">{`Prepara un ${naming.one_on_one.singular}`}</Button>}
                <Button href="/inizia" variant="ghost" icon="guide">Guida per il tuo profilo</Button>
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function avg(objs: Objective[]): number | null {
  const v = objs.map((o) => o.progress).filter((p): p is number => p != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
