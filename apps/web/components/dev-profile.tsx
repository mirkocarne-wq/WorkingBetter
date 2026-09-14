import Link from 'next/link';
import { fmtDate, actionKindLabel, devPlanStatusLabel, type DevProfile } from '@/lib/api';
import { addDevAction, createDevPlan, setDevActionStatus, setDevPlanStatus, setPotential, submitAssessment } from '@/lib/actions';
import { Button, Card, EmptyState, Pill, Progress } from '@/components/ui';
import { CompetencyRadar } from '@/components/competency-radar';

/** Vista del profilo di sviluppo di una persona: usata da /development (io) e /development/people/[id] (manager/HR). */
export function DevProfileView({ d, backPath }: { d: DevProfile; backPath: string }) {
  const names = Object.fromEntries(d.competencies.map((c) => [c.key, c.name]));
  const plan = d.plan;
  const isSelf = d.viewer === 'self';
  const todayIso = new Date().toISOString().slice(0, 10);
  const assessable = d.competencies.filter((c) => (d.profile?.expected ?? []).some((e) => e.competencyKey === c.key) || d.gaps.some((g) => g.competencyKey === c.key)).concat(d.competencies.filter((c) => !(d.profile?.expected ?? []).some((e) => e.competencyKey === c.key) && !d.gaps.some((g) => g.competencyKey === c.key)));
  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', alignItems: 'start' }}>
      <div className="stack" style={{ gap: 16 }}>
        <Card title={<>Profilo competenze <small>{d.profile ? `${d.profile.title}${d.profile.level ? ` · ${d.profile.level}` : ''}` : 'nessun job profile assegnato'}</small></>}>
          {!d.profile && d.gaps.length === 0 ? <EmptyState title="Nessun profilo di ruolo" hint={isSelf ? 'Chiedi all’HR di assegnarti un job profile: da lì partono livelli attesi e gap.' : 'Assegna un job profile da Sviluppo → Amministrazione.'} /> : (
            <>
              <CompetencyRadar gaps={d.gaps} names={names} />
              <table style={{ marginTop: 8 }}>
                <thead><tr><th>Competenza</th><th className="num">Atteso</th><th className="num">Auto</th><th className="num">Manager</th><th className="num">Gap</th></tr></thead>
                <tbody>
                  {d.gaps.map((g) => (
                    <tr key={g.competencyKey}>
                      <td><b>{names[g.competencyKey] ?? g.competencyKey}</b><div className="sup">{d.competencies.find((c) => c.key === g.competencyKey)?.description}</div></td>
                      <td className="num">{g.expected ?? <span className="sup">—</span>}</td>
                      <td className="num">{g.bySource.self ?? <span className="sup">—</span>}</td>
                      <td className="num">{g.bySource.manager ?? <span className="sup">—</span>}</td>
                      <td className="num">{g.gap == null ? <span className="sup">—</span> : g.gap > 0 ? <Pill tone={g.gap >= 2 ? 'c' : 'w'}>−{g.gap}</Pill> : g.gap < 0 ? <Pill tone="g">+{Math.abs(g.gap)}</Pill> : <Pill tone="g">ok</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="sup" style={{ marginTop: 6 }}>Il gap usa il livello del manager; in mancanza, 360°, review o autovalutazione. Ultima autovalutazione: {fmtDate(d.lastAssessment.self)} · ultima del manager: {fmtDate(d.lastAssessment.manager)}.</div>
            </>
          )}
        </Card>

        {d.nextProfile && (
          <Card title={<>Cosa manca per {d.nextProfile.title} <small>ruolo successivo</small></>}>
            {d.nextGaps.length === 0 ? <div className="sup">Il ruolo successivo non ha competenze attese configurate.</div> : (
              <div className="stack" style={{ gap: 6 }}>
                {d.nextGaps.map((g) => (
                  <div key={g.competencyKey} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 80px', gap: 10, alignItems: 'center' }}>
                    <span>{names[g.competencyKey] ?? g.competencyKey} <span className="sup">atteso {g.expected}</span></span>
                    <Progress value={g.assessed != null && g.expected ? g.assessed / g.expected : 0} tone={g.gap != null && g.gap <= 0 ? 'g' : g.gap != null && g.gap >= 2 ? 'c' : 'w'} />
                    <span className="num sup">{g.assessed ?? '—'} / {g.expected}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {(d.can.assessSelf || d.can.assessAsManager) && d.competencies.length > 0 && (
          <Card title={<>{isSelf ? 'Autovalutazione' : `Valutazione del manager per ${d.person.firstName}`} <small>on demand, fuori ciclo</small></>}>
            <form action={submitAssessment.bind(null, d.person.id, isSelf ? 'self' : 'manager', backPath)} className="stack" style={{ gap: 8 }}>
              {assessable.map((c) => {
                const current = d.gaps.find((g) => g.competencyKey === c.key)?.bySource[isSelf ? 'self' : 'manager'];
                return (
                  <details key={c.key} style={{ borderBottom: '1px solid var(--grid)', padding: '6px 0' }}>
                    <summary style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 8 }}><span><b>{c.name}</b> <span className="sup">{current != null ? `attuale: ${current}` : 'non valutata'}</span></span></summary>
                    <input type="hidden" name="competencyKey" value={c.key} />
                    <div className="stack" style={{ gap: 4, marginTop: 6 }}>
                      <label className="check"><input type="radio" name={`level_${c.key}`} value="" defaultChecked={current == null} /> <span className="sup">non valuto</span></label>
                      {c.levels.map((l) => <label key={l.level} className="check"><input type="radio" name={`level_${c.key}`} value={l.level} defaultChecked={current === l.level} /> <span><b>{l.level} · {l.label}</b> <span className="sup">{l.descriptor}</span></span></label>)}
                      <input name={`note_${c.key}`} placeholder="Nota o esempio (facoltativa)" className="input" />
                    </div>
                  </details>
                );
              })}
              <div><Button variant="primary">Salva valutazione</Button></div>
            </form>
          </Card>
        )}
      </div>

      <div className="stack" style={{ gap: 16 }}>
        <Card title={<>Piano di sviluppo {plan && <small><Pill tone={devPlanStatusLabel[plan.status]?.cls as 'g'}>{devPlanStatusLabel[plan.status]?.text}</Pill></small>}</>}>
          {!plan ? (
            <form action={createDevPlan.bind(null, isSelf ? null : d.person.id, backPath)} className="stack" style={{ gap: 8 }}>
              <div className="sup">Obiettivi di sviluppo e azioni concrete (formazione, mentoring, esperienze). Il manager può approvarlo.</div>
              <input name="title" defaultValue={`Piano di sviluppo ${new Date().getFullYear()}`} className="input" />
              <div className="row"><input name="periodEnd" type="date" className="input" style={{ width: 'auto' }} /><Button variant="primary">Crea il piano</Button></div>
            </form>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}><b>{plan.title}</b><span className="sup">{plan.periodEnd ? `entro ${fmtDate(plan.periodEnd)}` : ''}</span></div>
              <div className="row" style={{ margin: '6px 0 10px' }}><Progress value={plan.progress.percent / 100} tone={plan.progress.overdue ? 'w' : 'g'} /><span className="sup">{plan.progress.done}/{plan.progress.total} azioni{plan.progress.overdue ? ` · ${plan.progress.overdue} scadute` : ''}</span></div>
              {plan.managerNote && <div className="suggest" style={{ marginBottom: 8 }}>Nota del manager: {plan.managerNote}</div>}
              {plan.actions.length === 0 && <div className="sup">Nessuna azione: aggiungine una qui sotto o dai suggerimenti.</div>}
              {plan.actions.map((a) => (
                <div key={a.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--grid)', alignItems: 'flex-start' }}>
                  <form action={setDevActionStatus.bind(null, a.id, a.status === 'done' ? 'open' : 'done', backPath)}><button title={a.status === 'done' ? 'Riapri' : 'Segna come fatta'} disabled={a.status === 'cancelled'} style={{ width: 18, height: 18, borderRadius: 4, border: '1.5px solid var(--line)', background: a.status === 'done' ? 'var(--brand)' : '#fff', cursor: 'pointer', marginTop: 2 }} /></form>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ textDecoration: a.status !== 'open' ? 'line-through' : 'none', color: a.status !== 'open' ? 'var(--muted)' : 'inherit' }}>{a.title}</div>
                    <div className="sup">{actionKindLabel[a.kind]}{a.competencyKey ? ` · ${names[a.competencyKey] ?? a.competencyKey}` : ''}{a.dueDate ? ` · entro ${fmtDate(a.dueDate)}` : ''}{a.status === 'open' && a.dueDate && a.dueDate < todayIso ? <Pill tone="c">scaduta</Pill> : null}{a.evidence ? ` · evidenza: ${a.evidence}` : ''}</div>
                  </div>
                  {a.status === 'open' && <form action={setDevActionStatus.bind(null, a.id, 'cancelled', backPath)}><button className="btn sm ghost" title="Annulla azione">✕</button></form>}
                </div>
              ))}
              {plan.status !== 'completed' && plan.status !== 'archived' && (
                <form action={addDevAction.bind(null, plan.id, backPath)} className="stack" style={{ gap: 6, marginTop: 10 }}>
                  <input name="title" placeholder="Nuova azione…" className="input" required />
                  <div className="row">
                    <select name="kind" className="select" style={{ width: 'auto' }}>{Object.entries(actionKindLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                    <select name="competencyKey" className="select" style={{ width: 'auto', maxWidth: 200 }}><option value="">Competenza…</option>{d.competencies.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}</select>
                    <input name="dueDate" type="date" className="input" style={{ width: 'auto' }} />
                    <button className="btn sm">＋</button>
                  </div>
                </form>
              )}
              <div className="row" style={{ marginTop: 12 }}>
                {plan.status === 'draft' && isSelf && <form action={setDevPlanStatus.bind(null, plan.id, 'pending_approval', backPath)}><Button variant="primary" size="sm">Invia al manager</Button></form>}
                {plan.status === 'draft' && isSelf && <form action={setDevPlanStatus.bind(null, plan.id, 'active', backPath)}><Button size="sm">Attiva senza approvazione</Button></form>}
                {plan.status === 'pending_approval' && d.can.approve && <form action={setDevPlanStatus.bind(null, plan.id, 'active', backPath)} className="row"><input name="managerNote" placeholder="Nota per la persona (facoltativa)" className="input" style={{ width: 220 }} /><Button variant="primary" size="sm">Approva</Button></form>}
                {plan.status === 'pending_approval' && d.can.approve && <form action={setDevPlanStatus.bind(null, plan.id, 'draft', backPath)}><Button size="sm">Rimanda in bozza</Button></form>}
                {plan.status === 'active' && <form action={setDevPlanStatus.bind(null, plan.id, 'completed', backPath)}><Button size="sm">Segna completato</Button></form>}
                {plan.status === 'completed' && <form action={setDevPlanStatus.bind(null, plan.id, 'archived', backPath)}><Button size="sm">Archivia</Button></form>}
              </div>
            </>
          )}
        </Card>

        {d.suggestions.length > 0 && (
          <Card title={<>Azioni suggerite <small>dai gap più ampi</small></>}>
            {d.suggestions.map((s) => (
              <div key={s.title} style={{ padding: '8px 0', borderBottom: '1px solid var(--grid)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <div><b>{s.title}</b><div className="sup">{actionKindLabel[s.kind]} · {names[s.competencyKey] ?? s.competencyKey}{s.targetLevel ? ` · verso il livello ${s.targetLevel}` : ''}</div><div style={{ fontSize: 13 }}>{s.description}</div></div>
                  {plan && plan.status !== 'completed' && plan.status !== 'archived' && !s.alreadyInPlan ? (
                    <form action={addDevAction.bind(null, plan.id, backPath)}><input type="hidden" name="title" value={s.title} /><input type="hidden" name="description" value={s.description} /><input type="hidden" name="kind" value={s.kind} /><input type="hidden" name="competencyKey" value={s.competencyKey} /><input type="hidden" name="source" value="gap" /><Button size="sm">Aggiungi</Button></form>
                  ) : s.alreadyInPlan ? <Pill tone="g">nel piano</Pill> : null}
                </div>
              </div>
            ))}
            {!plan && <div className="sup" style={{ marginTop: 6 }}>Crea un piano per aggiungere le azioni.</div>}
          </Card>
        )}

        {d.can.talent && d.talent && (
          <Card title={<>Talent review <small>riservato a manager e HR</small></>}>
            <div className="row" style={{ marginBottom: 8 }}>
              <Pill tone="n">Performance: {d.talent.performance ? ['', 'bassa', 'media', 'alta'][d.talent.performance] : 'nessuna review con rating'}</Pill>
              <Pill tone={d.talent.potential ? 'b' : 'n'}>Potenziale: {d.talent.potential ? ['', 'limitato', 'in crescita', 'alto'][d.talent.potential] : 'da valutare'}</Pill>
              {d.talent.label && <Pill tone="g">{d.talent.label}</Pill>}
            </div>
            {d.talent.note && <div className="sup" style={{ marginBottom: 8 }}>«{d.talent.note}» · {d.talent.session ?? ''} {fmtDate(d.talent.at)}</div>}
            <form action={setPotential.bind(null, d.person.id, backPath)} className="stack" style={{ gap: 6 }}>
              <div className="row">{[1, 2, 3].map((v) => <label key={v} className="check"><input type="radio" name="potential" value={v} defaultChecked={d.talent!.potential === v} required /> <span>{['', 'Limitato', 'In crescita', 'Alto'][v]}</span></label>)}</div>
              <input name="note" placeholder="Motivazione (obbligatoria, tracciata)" className="input" required minLength={3} />
              <div className="row"><input name="session" placeholder="Sessione (es. 2026-H2)" className="input" style={{ width: 160 }} /><Button size="sm">Registra</Button></div>
            </form>
          </Card>
        )}
        {!isSelf && <div className="sup">Vedi anche: <Link href={`/one-on-ones`}>1:1</Link> · <Link href="/development/admin">9-box e framework</Link></div>}
      </div>
    </div>
  );
}
