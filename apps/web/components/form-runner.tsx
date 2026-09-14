'use client';
import { useActionState, useState } from 'react';
import type { FormFieldDef, FormResponse, FormSchemaDef } from '@/lib/api';
import { Field } from './form-fields';
import { saveFormDraft, submitForm } from '@/lib/actions';

function visible(def: { showIf?: FormFieldDef['showIf'] }, answers: Record<string, unknown>) {
  const c = def.showIf;
  if (!c) return true;
  const v = answers[c.field];
  const empty = v == null || v === '' || (Array.isArray(v) && v.length === 0);
  if (c.notEmpty !== undefined) return c.notEmpty ? !empty : empty;
  if (c.in) return Array.isArray(v) ? v.some((x) => c.in!.includes(x)) : c.in.includes(v);
  if (c.equals !== undefined) return v === c.equals;
  return true;
}

export function FormRunner({ response }: { response: FormResponse }) {
  const schema: FormSchemaDef = response.form.schema;
  const [answers, setAnswers] = useState<Record<string, unknown>>(response.answers ?? {});
  const [state, submit, pending] = useActionState(submitForm.bind(null, response.id, schema), {});
  const errors = new Map((state?.errors ?? []).map((e) => [e.field, e.message]));
  const readOnly = !response.canEdit;
  const set = (k: string, v: unknown) => setAnswers((a) => ({ ...a, [k]: v }));
  const draft = saveFormDraft.bind(null, response.id, schema);
  return (
    <form action={submit}>
      {schema.sections.filter((s) => visible(s, answers)).map((s) => (
        <div className="card" key={s.key} style={{ marginBottom: 16 }}>
          <h3>{s.title}</h3>
          {s.description && <p style={{ color: 'var(--ink2)', marginTop: -6 }}>{s.description}</p>}
          {s.fields.filter((f) => visible(f, answers)).map((f) => (
            <div key={f.key} style={{ padding: '12px 0', borderBottom: '1px solid var(--grid)' }}>
              {f.type !== 'info' && <div style={{ fontWeight: 600, marginBottom: 4 }}>{f.label}{f.required && <span style={{ color: 'var(--crit-text)' }}> *</span>}</div>}
              {f.help && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{f.help}</div>}
              <Field f={f} value={answers[f.key]} onChange={(v) => set(f.key, v)} readOnly={readOnly} />
              {errors.get(f.key) && <div className="error" style={{ marginTop: 4 }}>{errors.get(f.key)}</div>}
            </div>
          ))}
        </div>
      ))}
      {!readOnly && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" formAction={draft} disabled={pending}>Salva bozza</button>
          <button className="btn p" disabled={pending}>{pending ? 'Invio…' : 'Invia'}</button>
          {errors.size > 0 && <span className="error" style={{ alignSelf: 'center' }}>{errors.size} campi da correggere</span>}
        </div>
      )}
    </form>
  );
}
