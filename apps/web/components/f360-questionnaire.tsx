'use client';
import { useActionState, useState } from 'react';
import type { ActionState } from '@/lib/actions';
import type { F360Questionnaire } from '@/lib/api';

/** Questionario 360° (F360-001/006/013): scala per competenza con descrittori, commento, domande aperte; bozza e invio. */
export function F360QuestionnaireForm({ q, action, declineAction }: { q: F360Questionnaire; action: (prev: ActionState | undefined, form: FormData) => Promise<ActionState>; declineAction?: (prev: ActionState | undefined, form: FormData) => Promise<ActionState> }) {
  const [state, run, pending] = useActionState(action, undefined);
  const [decState, runDecline, decPending] = useActionState<ActionState | undefined, FormData>(declineAction ?? (async () => ({})), undefined);
  const [answered, setAnswered] = useState<Record<string, boolean>>(Object.fromEntries(Object.entries(q.draft?.ratings ?? {}).map(([k, v]) => [k, v != null])));
  const done = Object.values(answered).filter(Boolean).length;
  const levels = Array.from({ length: q.scale.max - q.scale.min + 1 }, (_, i) => q.scale.min + i);
  const who = q.category === 'self' ? 'te' : q.subject ? `${q.subject.firstName} ${q.subject.lastName}` : 'la persona';
  return (
    <>
      <form action={run}>
        <div className="suggest" style={{ marginBottom: 16 }}>
          {q.anonymous ? <><b>Le tue risposte sono anonime.</b> Vengono mostrate solo in forma aggregata con almeno {q.campaign.anonymityThreshold} risposte per categoria; i commenti non sono attribuiti e compaiono in ordine casuale.</> : q.category === 'self' ? <><b>Autovalutazione.</b> Le tue risposte saranno confrontate con quelle degli altri nel tuo report.</> : <><b>Risposta come manager.</b> Le tue valutazioni e i tuoi commenti sono attribuiti a te nel report.</>}
          {' '}Per ogni comportamento indica con che frequenza lo osservi{q.category === 'self' ? '' : ` in ${who}`}; se non hai elementi scegli «non so».
        </div>
        {q.competencies.map((c) => {
          const current = q.draft?.ratings?.[c.key] ?? null;
          return (
            <div className="card" key={c.key} style={{ marginBottom: 12 }}>
              <input type="hidden" name="competencyKey" value={c.key} />
              <h3 style={{ marginBottom: 4 }}>{c.name}</h3>
              {c.description && <div className="sup" style={{ marginBottom: 8 }}>{c.description}</div>}
              <div className="row" role="radiogroup" aria-label={c.name} style={{ flexWrap: 'wrap', gap: 6 }}>
                {levels.map((l) => (
                  <label key={l} className="check" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '6px 10px' }}>
                    <input type="radio" name={`rating_${c.key}`} value={l} defaultChecked={current === l} onChange={() => setAnswered((a) => ({ ...a, [c.key]: true }))} /> <span><b>{l}</b>{q.scale.labels[String(l)] ? ` · ${q.scale.labels[String(l)]}` : ''}</span>
                  </label>
                ))}
                <label className="check" style={{ padding: '6px 10px' }}><input type="radio" name={`rating_${c.key}`} value="" defaultChecked={current == null} onChange={() => setAnswered((a) => ({ ...a, [c.key]: false }))} /> <span className="sup">non so</span></label>
              </div>
              {c.levels.length > 0 && <details style={{ marginTop: 6 }}><summary className="sup" style={{ cursor: 'pointer' }}>Cosa significa ogni livello di padronanza</summary><ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: 13 }}>{c.levels.map((l) => <li key={l.level}><b>{l.level} · {l.label}</b> <span className="sup">{l.descriptor}</span></li>)}</ul></details>}
              <textarea name={`comment_${c.key}`} className="input" rows={2} placeholder={`Un esempio concreto su ${c.name.toLowerCase()} (facoltativo)`} defaultValue={q.draft?.comments?.[c.key] ?? ''} style={{ marginTop: 8 }} />
            </div>
          );
        })}
        {q.openQuestions.length > 0 && (
          <div className="card" style={{ marginBottom: 12 }}>
            <h3>Domande aperte</h3>
            {q.openQuestions.map((oq) => (
              <label key={oq.key} className="field"><span className="lab">{oq.label}</span><input type="hidden" name="openKey" value={oq.key} /><textarea name={`open_${oq.key}`} className="input" rows={2} defaultValue={q.draft?.openAnswers?.[oq.key] ?? ''} /></label>
            ))}
          </div>
        )}
        <div className="row" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn p" name="mode" value="submit" disabled={pending}>{pending ? 'Invio…' : 'Invia le risposte'}</button>
          <button className="btn" name="mode" value="draft" disabled={pending}>Salva bozza</button>
          <span className="sup">{done} su {q.competencies.length} competenze valutate</span>
          {state?.error && <span className="error" role="alert">{state.error}</span>}
          {state?.ok && <span className="sup" role="status" style={{ color: 'var(--good-text)' }}>{state.message}</span>}
        </div>
      </form>
      {declineAction && q.category !== 'self' && q.category !== 'manager' && (
        <details style={{ marginTop: 20 }}>
          <summary className="sup" style={{ cursor: 'pointer' }}>Non posso dare un feedback utile: declina la richiesta</summary>
          <form action={runDecline} className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
            <input name="reason" className="input" placeholder="Motivo (facoltativo, visibile a chi ti ha nominato)" style={{ minWidth: 260, flex: 1 }} />
            <button className="btn" disabled={decPending}>Declina</button>
            {decState?.error && <span className="error">{decState.error}</span>}
          </form>
        </details>
      )}
    </>
  );
}
