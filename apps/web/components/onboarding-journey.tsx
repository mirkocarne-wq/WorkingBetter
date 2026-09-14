import { fmtDate, onboardingKindLabel, onboardingStatusLabel, type OnboardingJourney, type BuddySuggestion, type Person } from '@/lib/api';
import { addOnboardingTask, submitOnboardingSurvey, updateOnboardingJourney } from '@/lib/actions';
import { Button, Card, Kpi, Pill, Progress, Who } from '@/components/ui';
import { ActionForm } from '@/components/action-form';
import { OnboardingTaskRow } from '@/components/onboarding-task';

/** Vista del percorso: timeline per fase con i task, persone chiave, survey, avanzamento (ONB-012/016). */
export function OnboardingJourneyView({ j, backPath, buddies, people }: { j: OnboardingJourney; backPath: string; buddies: BuddySuggestion[]; people: Person[] }) {
  const isSelf = j.viewer === 'self';
  const canManage = j.can.edit;
  const st = onboardingStatusLabel[j.status] ?? { text: j.status, cls: 'n' };
  const currentPhase = j.phases.find((p) => j.day >= p.fromDay && j.day <= p.toDay)?.key ?? (j.day > (j.phases.at(-1)?.toDay ?? 0) ? j.phases.at(-1)?.key : j.phases[0]?.key);
  const pendingSurveys = j.tasks.filter((t) => t.kind === 'survey' && t.status === 'open' && t.isMine && t.surveyKey);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="grid kpis">
        <Kpi label="Avanzamento" value={`${j.progress.percent}%`} detail={`${j.progress.done} su ${j.progress.total - j.progress.skipped} task${j.progress.overdue ? ` · ${j.progress.overdue} scaduti` : ''}`} />
        <Kpi label={j.kind === 'offboarding' ? 'Ultimo giorno' : 'Data di ingresso'} value={fmtDate(j.anchorDate)} detail={j.day >= 0 ? `giorno ${j.day}` : `tra ${-j.day} giorni`} />
        <Kpi label="Stato" value={<Pill tone={st.cls as 'g'}>{st.text}</Pill>} detail={`${onboardingKindLabel[j.kind]} · ${j.templateName}`} />
        <Kpi label="Persone chiave" value={<span style={{ fontSize: 16 }}>{[j.manager && `manager ${j.manager.firstName}`, j.buddy && `buddy ${j.buddy.firstName}`, j.hr && `HR ${j.hr.firstName}`].filter(Boolean).join(' · ') || '—'}</span>} detail={!j.buddy && canManage ? 'buddy da assegnare' : undefined} />
      </div>

      {pendingSurveys.map((t) => {
        const def = j.surveyDefs[t.surveyKey!];
        if (!def) return null;
        return (
          <Card key={t.id} title={<span id={`survey-${t.surveyKey}`}>{def.title} <small>survey di onboarding · nominale</small></span>}>
            <div className="suggest" style={{ marginBottom: 10 }}>Questa survey <b>non è anonima</b>: le risposte sono visibili al tuo manager e all’HR proprio per poter intervenire subito se qualcosa non va. Scala 1 (per niente d’accordo) – 5 (completamente d’accordo).</div>
            <ActionForm action={submitOnboardingSurvey.bind(null, j.id, t.surveyKey!)} className="stack" style={{ gap: 8 }}>
              {def.questions.map((q) => (
                <div key={q.key} style={{ padding: '6px 0', borderBottom: '1px solid var(--grid)' }}>
                  <input type="hidden" name="questionKey" value={q.key} />
                  <div style={{ marginBottom: 4 }}>{q.text}</div>
                  <div className="row" role="radiogroup" aria-label={q.text}>{[1, 2, 3, 4, 5].map((v) => <label key={v} className="check"><input type="radio" name={`q_${q.key}`} value={v} required /> <span>{v}</span></label>)}</div>
                </div>
              ))}
              <textarea name="comment" className="input" rows={2} placeholder="Qualcosa che vuoi aggiungere (facoltativo)" />
              <div><Button variant="primary">Invia</Button></div>
            </ActionForm>
          </Card>
        );
      })}

      <div className="grid" style={{ gridTemplateColumns: canManage || j.surveys.length ? 'minmax(0, 1.5fr) minmax(0, 1fr)' : '1fr', alignItems: 'start' }}>
        <Card title="Percorso" aside={isSelf ? 'i tuoi task e quelli di chi ti accompagna' : j.viewer === 'participant' ? 'solo i tuoi task' : 'tutti i task per fase'}>
          {j.phases.map((ph) => {
            const rows = j.tasks.filter((t) => t.phase === ph.key);
            if (!rows.length && j.viewer === 'participant') return null;
            const done = rows.filter((t) => t.status !== 'open').length;
            return (
              <div key={ph.key} style={{ marginBottom: 14 }}>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0 }}>{ph.label} <small>giorni {ph.fromDay}–{ph.toDay}{ph.key === currentPhase && j.status === 'active' ? ' · adesso' : ''}</small></h3>
                  <div className="row" style={{ gap: 8 }}><Progress value={rows.length ? done / rows.length : 0} tone={rows.some((t) => t.overdue) ? 'w' : 'g'} /><span className="sup">{done}/{rows.length}</span></div>
                </div>
                {rows.length === 0 ? <div className="sup">Nessun task in questa fase.</div> : rows.map((t) => <OnboardingTaskRow key={t.id} t={t} backPath={backPath} canManage={canManage} />)}
              </div>
            );
          })}
          {canManage && j.status === 'active' && (
            <details style={{ marginTop: 8 }}>
              <summary className="sup" style={{ cursor: 'pointer' }}>Aggiungi un task a questo percorso</summary>
              <ActionForm action={addOnboardingTask.bind(null, j.id)} className="stack" style={{ gap: 6, marginTop: 8 }}>
                <input name="title" className="input" placeholder="Titolo del task" required />
                <div className="row" style={{ flexWrap: 'wrap' }}>
                  <select name="phase" className="input" style={{ width: 'auto' }} defaultValue={currentPhase}>{j.phases.map((ph) => <option key={ph.key} value={ph.key}>{ph.label}</option>)}</select>
                  <select name="role" className="input" style={{ width: 'auto' }}><option value="newcomer">Persona</option><option value="manager">Manager</option><option value="buddy">Buddy</option><option value="hr">HR</option><option value="it">IT</option></select>
                  <select name="kind" className="input" style={{ width: 'auto' }}><option value="todo">Da fare</option><option value="read">Da leggere</option><option value="sign">Presa visione</option><option value="meeting">Incontro</option></select>
                  <input name="dueDate" type="date" className="input" style={{ width: 'auto' }} />
                  <input name="link" className="input" placeholder="Link (facoltativo)" style={{ width: 180 }} />
                  <Button size="sm">Aggiungi</Button>
                </div>
              </ActionForm>
            </details>
          )}
        </Card>
        <div className="stack" style={{ gap: 16 }}>
          {canManage && (
            <Card title="Buddy e date" aside="manager e HR">
              <ActionForm action={updateOnboardingJourney.bind(null, j.id)} className="stack" style={{ gap: 6 }}>
                <label className="field"><span className="lab">Buddy</span>
                  <select name="buddyPersonId" className="input" defaultValue={j.buddy?.id ?? ''}>
                    <option value="">Nessuno (i task del buddy vanno al manager)</option>
                    {buddies.length > 0 && <optgroup label="Suggeriti">{buddies.map((b) => <option key={b.id} value={b.id}>{b.firstName} {b.lastName} · {b.reason}{b.activeBuddies ? ` · già buddy di ${b.activeBuddies}` : ''}</option>)}</optgroup>}
                    <optgroup label="Tutti">{people.filter((p) => p.id !== j.person?.id && !buddies.some((b) => b.id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}{p.jobTitle ? ` · ${p.jobTitle}` : ''}</option>)}</optgroup>
                  </select>
                </label>
                <label className="field"><span className="lab">Referente IT <span className="sup">(riceve i task IT)</span></span><select name="itPersonId" className="input" defaultValue={j.it?.id ?? ''}><option value="">Nessuno (vanno all’HR o al manager)</option>{people.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}</select></label>
                <label className="field"><span className="lab">{j.kind === 'offboarding' ? 'Ultimo giorno' : 'Data di ingresso'} <span className="sup">(ricalcola le scadenze aperte)</span></span><input name="anchorDate" type="date" className="input" defaultValue={j.anchorDate} /></label>
                <div className="row"><Button variant="primary" size="sm">Salva</Button></div>
              </ActionForm>
              {j.status === 'active' && <ActionForm action={updateOnboardingJourney.bind(null, j.id)} inline style={{ marginTop: 8 }} confirm="Annullare il percorso? I task restano visibili ma non più modificabili."><input type="hidden" name="status" value="cancelled" /><Button size="sm" variant="ghost">Annulla il percorso</Button></ActionForm>}
              {j.status !== 'active' && <ActionForm action={updateOnboardingJourney.bind(null, j.id)} inline style={{ marginTop: 8 }}><input type="hidden" name="status" value="active" /><Button size="sm">Riattiva</Button></ActionForm>}
            </Card>
          )}
          {j.surveys.length > 0 && (
            <Card title="Survey di onboarding" aside="nominali, per intervenire in tempo">
              {j.surveys.map((s) => (
                <div key={s.key} style={{ padding: '6px 0', borderBottom: '1px solid var(--grid)' }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}><b>{s.title}</b><Pill tone={s.low ? 'c' : 'g'}>{s.score?.toFixed(1) ?? '—'} / 5{s.low ? ' · segnale' : ''}</Pill></div>
                  {s.answers && <div className="sup">{Object.entries(s.answers).map(([k, v]) => `${j.surveyDefs[s.key]?.questions.find((q) => q.key === k)?.text ?? k}: ${v}`).join(' · ')}</div>}
                  {s.comment && <div className="sup">«{s.comment}»</div>}
                  <div className="sup">{fmtDate(s.submittedAt)}</div>
                </div>
              ))}
            </Card>
          )}
          {j.person && !isSelf && <Card title="Persona"><Who person={j.person} role={j.manager ? `manager: ${j.manager.firstName} ${j.manager.lastName}` : undefined} /></Card>}
        </div>
      </div>
    </div>
  );
}
