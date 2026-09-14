'use client';
import { useActionState, useState } from 'react';
import type { FormSchemaDef, OnboardingExternal, OnboardingExternalTask } from '@/lib/api';

const fmtDate = (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium' }).format(new Date(iso)) : '—');
import { completeOnboardingExternalTask, submitOnboardingExternalForm } from '@/lib/actions';
import { ActionForm } from '@/components/action-form';
import { Card, Pill } from '@/components/ui';
import { Field, visibleIf } from '@/components/form-fields';

/** Modulo di pre-boarding compilato dal link esterno: stessi campi del form engine, invio tramite l'endpoint pubblico. */
function ExternalForm({ token, task }: { token: string; task: OnboardingExternalTask }) {
  const schema: FormSchemaDef = task.form!.schema;
  const [answers, setAnswers] = useState<Record<string, unknown>>(task.form!.answers ?? {});
  const [state, run, pending] = useActionState(submitOnboardingExternalForm.bind(null, token, task.id, schema), undefined);
  const set = (k: string, v: unknown) => setAnswers((a) => ({ ...a, [k]: v }));
  return (
    <form action={run} className="stack" style={{ gap: 8 }}>
      {schema.sections.filter((s) => visibleIf(s, answers)).map((s) => (
        <div key={s.key}>
          <div className="lvl" style={{ margin: '6px 0' }}>{s.title}</div>
          {s.fields.filter((f) => visibleIf(f, answers)).map((f) => (
            <div key={f.key} style={{ padding: '8px 0', borderBottom: '1px solid var(--grid)' }}>
              {f.type !== 'info' && <div style={{ fontWeight: 600, marginBottom: 4 }}>{f.label}{f.required && <span style={{ color: 'var(--crit-text)' }}> *</span>}</div>}
              {f.help && <div className="sup" style={{ marginBottom: 6 }}>{f.help}</div>}
              <Field f={f} value={answers[f.key]} onChange={(v) => set(f.key, v)} readOnly={false} />
            </div>
          ))}
        </div>
      ))}
      {state?.error && <div className="error">{state.error}</div>}
      <div><button className="btn p" disabled={pending}>{pending ? 'Invio…' : 'Invia il modulo'}</button></div>
    </form>
  );
}

export function OnboardingExternalView({ token, j }: { token: string; j: OnboardingExternal }) {
  const byPhase = j.phases.map((ph) => ({ ph, tasks: j.tasks.filter((t) => t.phase === ph.key) })).filter((x) => x.tasks.length);
  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="suggest">Prima del tuo primo giorno ci sono {j.progress.total} attività: {j.progress.done} già fatte. Questo link è personale e non richiede una password; dal primo giorno userai il tuo account.</div>
      {byPhase.map(({ ph, tasks }) => (
        <Card key={ph.key} title={ph.label} aside={`${tasks.filter((t) => t.status !== 'open').length}/${tasks.length} completati`}>
          <div className="stack" style={{ gap: 10 }}>
            {tasks.map((t) => (
              <div key={t.id} style={{ border: '1px solid var(--grid)', borderRadius: 10, padding: '10px 12px' }}>
                <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div><b>{t.title}</b> <span className="sup">· {t.kindLabel}{t.dueDate ? ` · entro ${fmtDate(t.dueDate)}` : ''}{t.required ? '' : ' · facoltativo'}</span>{t.description && <div className="sup" style={{ marginTop: 4 }}>{t.description}</div>}</div>
                  <Pill tone={t.status === 'done' ? 'g' : t.status === 'skipped' ? 'n' : t.overdue ? 'c' : 'b'}>{t.status === 'done' ? 'Fatto' : t.status === 'skipped' ? 'Saltato' : t.overdue ? 'In ritardo' : 'Da fare'}</Pill>
                </div>
                {t.status === 'open' && t.kind === 'form' && t.form && <div style={{ marginTop: 10 }}><ExternalForm token={token} task={t} /></div>}
                {t.status === 'open' && t.kind !== 'form' && t.kind !== 'survey' && (
                  <ActionForm action={completeOnboardingExternalTask.bind(null, token, t.id)} className="row" style={{ marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
                    {t.link && /^https?:/.test(t.link) && <a className="btn sm" href={t.link} target="_blank" rel="noreferrer">Apri il documento</a>}
                    {t.kind === 'sign' && <label className="check"><input type="checkbox" name="acknowledged" required /> <span className="sup">Confermo di aver letto e compreso</span></label>}
                    <input name="note" className="input" placeholder="Nota (facoltativa)" style={{ width: 220 }} />
                    <button className="btn sm p">{t.kind === 'sign' ? 'Confermo' : 'Fatto'}</button>
                  </ActionForm>
                )}
                {t.status === 'done' && t.note && <div className="sup" style={{ marginTop: 6 }}>{t.note}</div>}
              </div>
            ))}
          </div>
        </Card>
      ))}
      {j.progress.done === j.progress.total && <div className="card"><div className="empty"><b>Tutto pronto!</b> Ci vediamo il {fmtDate(j.anchorDate)}.</div></div>}
    </div>
  );
}
