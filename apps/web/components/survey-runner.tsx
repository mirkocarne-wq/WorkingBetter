'use client';
import { useActionState, useState } from 'react';
import type { FormSchemaDef } from '@/lib/api';
import { respondSurvey } from '@/lib/actions';
import { Field, visibleIf } from './form-fields';

/** Compilazione survey: stato solo nel browser fino all'invio (nessuna bozza lato server nelle survey anonime). */
export function SurveyRunner({ surveyId, schema, anonymous }: { surveyId: string; schema: FormSchemaDef; anonymous: boolean }) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [state, submit, pending] = useActionState(respondSurvey.bind(null, surveyId), {});
  const errors = new Map((state?.errors ?? []).map((e) => [e.field, e.message]));
  const set = (k: string, v: unknown) => setAnswers((a) => ({ ...a, [k]: v }));
  const total = schema.sections.flatMap((s) => s.fields.filter((f) => f.type !== 'info')).length;
  const answered = schema.sections.flatMap((s) => s.fields).filter((f) => answers[f.key] != null && answers[f.key] !== '').length;
  return (
    <form action={submit}>
      <input type="hidden" name="answers" value={JSON.stringify(answers)} />
      <div className="suggest" style={{ marginBottom: 16 }}>
        {anonymous ? <><b>Le risposte sono anonime.</b> Salviamo solo le risposte e il gruppo di appartenenza (unità, manager, anzianità); nessuno, nemmeno l’HR, può risalire a chi ha risposto. I gruppi con meno persone della soglia non vengono mai mostrati.</> : <><b>Questa survey è nominale:</b> le risposte saranno associate al tuo nome, come dichiarato dall’HR.</>}
      </div>
      {schema.sections.filter((s) => visibleIf(s, answers)).map((s) => (
        <div className="card" key={s.key} style={{ marginBottom: 16 }}>
          <h3>{s.title}</h3>
          {s.fields.filter((f) => visibleIf(f, answers)).map((f) => (
            <div key={f.key} style={{ padding: '12px 0', borderBottom: '1px solid var(--grid)' }}>
              {f.type !== 'info' && <div style={{ fontWeight: 600, marginBottom: 6 }}>{f.label}{f.required && <span style={{ color: 'var(--crit-text)' }}> *</span>}</div>}
              {f.help && <div className="sup" style={{ marginBottom: 6 }}>{f.help}</div>}
              <Field f={f} value={answers[f.key]} onChange={(v) => set(f.key, v)} readOnly={false} />
              {errors.get(f.key) && <div className="error" style={{ marginTop: 4 }}>{errors.get(f.key)}</div>}
            </div>
          ))}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button className="btn p" disabled={pending}>{pending ? 'Invio…' : 'Invia le risposte'}</button>
        <span className="sup">{answered} su {total} domande</span>
        {state?.error && <span className="error">{state.error}</span>}
        {errors.size > 0 && <span className="error">{errors.size} domande da completare</span>}
      </div>
    </form>
  );
}
