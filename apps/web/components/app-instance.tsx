import Link from 'next/link';
import { appActorLabel, appInstanceStatusLabel, appRunStatusLabel, appStageTypeLabel, fmtDate, type AppInstance, type Person } from '@/lib/api';
import { cancelAppInstance, decideAppRun, manageAppRun } from '@/lib/actions';
import { Button, Card, Kpi, Pill, Who } from '@/components/ui';
import { ActionForm } from '@/components/action-form';

const fmtVal = (v: unknown) => (v == null || v === '' ? '—' : Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'sì' : 'no') : String(v));

/** Istanza di un processo: timeline delle fasi con azioni per ruolo, risposte visibili, log (APP-020/022/025/026). */
export function AppInstanceView({ inst, people }: { inst: AppInstance; people: Person[] }) {
  const st = appInstanceStatusLabel[inst.status] ?? { text: inst.status, cls: 'n' };
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="grid kpis">
        <Kpi label="Stato" value={<Pill tone={st.cls as 'g'}>{st.text}</Pill>} detail={inst.outcome ? `esito: ${inst.outcome === 'completed' ? 'completata' : inst.outcome === 'rejected' ? 'respinta' : inst.outcome}` : `avviata il ${fmtDate(inst.startedAt)}`} />
        <Kpi label="Avanzamento" value={`${inst.progress.percent}%`} detail={`${inst.progress.done} fasi su ${inst.progress.total}${inst.progress.active ? ` · ${inst.progress.active} attive` : ''}`} />
        <Kpi label={inst.naming.subjectLabel} value={<span style={{ fontSize: 18 }}>{inst.subject ? `${inst.subject.firstName} ${inst.subject.lastName}` : '—'}</span>} detail={inst.subject?.jobTitle ?? undefined} />
        <Kpi label="Avviata da" value={<span style={{ fontSize: 18 }}>{inst.launcher ? `${inst.launcher.firstName} ${inst.launcher.lastName}` : 'sistema'}</span>} detail={inst.completedAt ? `conclusa il ${fmtDate(inst.completedAt)}` : inst.cancelledAt ? `annullata il ${fmtDate(inst.cancelledAt)}` : undefined} />
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <Card title="Fasi" aside="in ordine; le fasi parallele sono attive insieme">
          {inst.stages.map((s, i) => {
            const r = s.run;
            const rst = r ? (appRunStatusLabel[r.status] ?? { text: r.status, cls: 'n' }) : { text: 'In attesa', cls: 'n' };
            const isCurrent = inst.currentStages.includes(s.key);
            return (
              <div key={s.key} style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--grid)', opacity: r?.status === 'superseded' || r?.status === 'skipped' ? 0.7 : 1 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, background: r?.status === 'done' ? 'var(--good)' : isCurrent ? 'var(--brand)' : r?.status === 'rejected' ? 'var(--crit)' : 'var(--grid)', color: r?.status === 'done' || isCurrent || r?.status === 'rejected' ? '#fff' : 'var(--ink2)' }}>{i + 1}</div>
                <div>
                  <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                    <span><b>{s.name}</b> <span className="sup">· {appStageTypeLabel[s.type]} · {appActorLabel(s.actor)}{s.parallelGroup ? ' · in parallelo' : ''}</span></span>
                    <span className="row" style={{ gap: 6 }}>{r?.overdue && <Pill tone="c">scaduta</Pill>}<Pill tone={rst.cls as 'g'}>{rst.text}{r && r.attempt > 1 ? ` · tentativo ${r.attempt}` : ''}</Pill></span>
                  </div>
                  <div className="sup">{r?.actor ? `${r.actor.firstName} ${r.actor.lastName}` : ''}{r?.dueDate ? ` · entro ${fmtDate(r.dueDate)}` : ''}{r?.completedAt ? ` · ${r.outcome === 'approved' ? 'approvata' : r.outcome === 'rejected' ? 'rimandata' : r.outcome === 'notified' ? 'inviata' : r.outcome === 'executed' ? 'eseguita' : 'consegnata'} il ${fmtDate(r.completedAt)}${r.completedBy ? ` da ${r.completedBy}` : ''}` : ''}</div>
                  {s.description && <div style={{ fontSize: 13, marginTop: 2 }}>{s.description}</div>}
                  {r?.comment && <div className="suggest" style={{ marginTop: 6 }}>«{r.comment}»</div>}
                  {r?.answers && Object.keys(r.answers).length > 0 && (
                    <details style={{ marginTop: 6 }} open={isCurrent || r.status === 'done'}>
                      <summary className="sup" style={{ cursor: 'pointer' }}>Risposte</summary>
                      <table style={{ marginTop: 4 }}><tbody>{Object.entries(r.answers).map(([k, v]) => <tr key={k}><td className="sup" style={{ width: 180 }}>{k}</td><td>{fmtVal(v)}</td></tr>)}</tbody></table>
                    </details>
                  )}
                  {s.history.length > 0 && <div className="sup" style={{ marginTop: 4 }}>Tentativi precedenti: {s.history.map((h) => `#${h.attempt} ${appRunStatusLabel[h.status]?.text ?? h.status}${h.comment ? ` («${h.comment}»)` : ''}`).join(' · ')}</div>}
                  {r?.status === 'active' && (
                    <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
                      {s.type === 'form' && r.isMine && r.formResponseId && <Link href={`/forms/responses/${r.formResponseId}`} className="btn sm p">Compila</Link>}
                      {s.type === 'form' && !r.isMine && r.formResponseId && inst.viewer === 'hr' && <Link href={`/forms/responses/${r.formResponseId}`} className="btn sm">Apri la compilazione</Link>}
                      {s.type === 'approval' && r.canDecide && (
                        <ActionForm action={decideAppRun.bind(null, r.id, inst.id)} className="stack" style={{ gap: 6, width: '100%' }}>
                          <textarea name="comment" className="input" rows={2} placeholder={s.approval?.requireComment ? 'Commento (obbligatorio per rimandare)' : 'Commento (facoltativo)'} />
                          <div className="row" style={{ gap: 8 }}>
                            <button className="btn sm p" name="decision" value="approve">Approva</button>
                            {s.approval?.rejectTo ? <button className="btn sm" name="decision" value="reject">Rimanda a «{inst.stages.find((x) => x.key === s.approval!.rejectTo)?.name ?? s.approval.rejectTo}»</button> : <button className="btn sm danger" name="decision" value="reject">Respingi e chiudi</button>}
                          </div>
                        </ActionForm>
                      )}
                      {inst.can.manage && (
                        <details style={{ width: '100%' }}>
                          <summary className="sup" style={{ cursor: 'pointer' }}>Riassegna o proroga (HR)</summary>
                          <ActionForm action={manageAppRun.bind(null, r.id, inst.id)} className="row" style={{ marginTop: 6, flexWrap: 'wrap' }} inline>
                            <select name="actorPersonId" className="input" style={{ width: 'auto' }} defaultValue=""><option value="">Stesso assegnatario</option>{people.map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>)}</select>
                            <input name="dueDate" type="date" className="input" style={{ width: 'auto' }} />
                            <Button size="sm">Applica</Button>
                          </ActionForm>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {inst.can.cancel && (
            <ActionForm action={cancelAppInstance.bind(null, inst.id)} className="row" style={{ marginTop: 10, flexWrap: 'wrap' }} inline confirm="Annullare l’istanza? Le fasi aperte vengono chiuse.">
              <input name="reason" className="input" placeholder="Motivo (facoltativo)" style={{ minWidth: 220 }} />
              <Button size="sm" variant="ghost">Annulla l’istanza</Button>
            </ActionForm>
          )}
        </Card>
        <div className="stack" style={{ gap: 16 }}>
          {inst.subject && <Card title={inst.naming.subjectLabel}><Who person={inst.subject} /></Card>}
          <Card title="Log" aside="chi ha fatto cosa">
            {inst.events.map((e, i) => (
              <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--grid)', fontSize: 13 }}>
                <span className="sup">{fmtDate(e.at)}</span> · <b>{{ launched: 'avviata', stage_activated: 'fase attivata', submitted: 'consegnata', approved: 'approvata', rejected: 'rimandata', notified: 'notifica inviata', executed: 'azioni eseguite', reopened: 'riaperta', completed: 'conclusa', cancelled: 'annullata', reassigned: 'riassegnata', extended: 'prorogata' }[e.type] ?? e.type}</b>{e.stageKey ? ` · ${inst.stages.find((s) => s.key === e.stageKey)?.name ?? e.stageKey}` : ''} · {e.actor}
                {typeof e.data.comment === 'string' && e.data.comment ? <div className="sup">«{e.data.comment}»</div> : null}
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
}
