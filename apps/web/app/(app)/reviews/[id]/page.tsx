import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, apiFetch, fmtDate, pct, reviewStatusLabel, type FormResponse, type ReviewContext, type ReviewDetail } from '@/lib/api';
import { markConversation, shareReview, signReview } from '@/lib/actions';
import { FormRunner } from '@/components/form-runner';


function AnswersView({ response, title }: { response: FormResponse; title: string }) {
  return (
    <div>
      <h3 style={{ margin: '0 0 8px' }}>{title} <small style={{ color: 'var(--muted)', fontWeight: 500 }}>{response.submittedAt ? `inviata il ${fmtDate(response.submittedAt)}` : 'non inviata'}</small></h3>
      {response.form.schema.sections.map((s) => (
        <div key={s.key} style={{ marginBottom: 12 }}>
          <div className="lvl" style={{ marginBottom: 6 }}>{s.title}</div>
          {s.fields.filter((f) => f.type !== 'info' && response.answers[f.key] != null && response.answers[f.key] !== '').map((f) => {
            const v = response.answers[f.key];
            const shown = f.type === 'scale' ? `${v}${f.scale?.labels?.[String(v)] ? ` · ${f.scale.labels[String(v)]}` : ''}` : f.type === 'single_choice' ? (f.options?.find((o) => o.value === v)?.label ?? String(v)) : Array.isArray(v) ? v.map((x) => f.options?.find((o) => o.value === x)?.label ?? x).join(', ') : typeof v === 'boolean' ? (v ? 'Sì' : 'No') : String(v);
            return <div key={f.key} style={{ padding: '6px 0', borderBottom: '1px solid var(--grid)' }}><div style={{ fontSize: 12, color: 'var(--muted)' }}>{f.label}</div><div>{shown}</div></div>;
          })}
        </div>
      ))}
    </div>
  );
}

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let r: ReviewDetail;
  try { r = await apiFetch<ReviewDetail>(`/reviews/${id}`); } catch (e) { if (e instanceof ApiError && e.status === 404) notFound(); throw e; }
  const ctx = await apiFetch<ReviewContext>(`/reviews/${id}/context`);
  const [selfResp, mgrResp] = await Promise.all([
    r.selfResponse && r.canSeeSelf ? apiFetch<FormResponse>(`/form-responses/${r.selfResponse.id}`).catch(() => null) : null,
    r.managerResponse && r.canSeeManager ? apiFetch<FormResponse>(`/form-responses/${r.managerResponse.id}`).catch(() => null) : null,
  ]);
  const st = reviewStatusLabel[r.status] ?? { text: r.status, cls: 'n' };
  const who = r.isSubject ? `con ${r.manager?.firstName ?? 'il manager'}` : `di ${r.subject?.firstName} ${r.subject?.lastName}`;
  return (
    <>
      <div className="ph">
        <div><h1>Review {who}</h1><p>{r.cycle?.name} · {r.cycle?.periodStart} → {r.cycle?.periodEnd} · <span className={`pill ${st.cls}`}>{st.text}</span>{r.finalRatingLabel && r.canSeeManager ? ` · rating ${r.finalRating} · ${r.finalRatingLabel}` : ''}</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/reviews" className="btn">Tutte le review</Link>
          <a href={`/api/export?report=review-pdf&id=${id}`} className="btn" title="Esporta la review in PDF (REV-054)">Esporta PDF</a>
          {r.isHr && r.appInstanceId && <Link href={`/apps/instances/${r.appInstanceId}`} className="btn" title="Istanza del processo sul motore dei workflow">Processo</Link>}
          {r.canShare && <form action={shareReview.bind(null, id)}><button className="btn p">Condividi con {r.subject?.firstName}</button></form>}
          {(r.isManager || r.isHr) && r.status === 'shared' && !r.conversationAt && <form action={markConversation.bind(null, id)}><button className="btn">Colloquio fatto</button></form>}
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 340px', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          {r.canFillSelf && selfResp && <div><div className="suggest" style={{ marginBottom: 10 }}>La tua self-review: {r.template.managerSeesSelf === 'immediately' ? 'il manager la vede subito' : r.template.managerSeesSelf === 'after_submit' ? 'il manager la vedrà solo dopo aver inviato la propria' : 'il manager non la vedrà'}. Scadenza {fmtDate(r.cycle?.selfDueAt)}.</div><FormRunner response={selfResp} /></div>}
          {r.canFillManager && mgrResp && <div><div className="suggest" style={{ marginBottom: 10 }}>Manager review per {r.subject?.firstName}: usa il pannello di contesto a destra. Dopo l&apos;invio potrai condividerla. Scadenza {fmtDate(r.cycle?.managerDueAt)}.</div><FormRunner response={mgrResp} /></div>}
          {!r.canFillManager && mgrResp && r.canSeeManager && mgrResp.status === 'submitted' && <div className="card"><AnswersView response={mgrResp} title="Manager review" />{r.ratingOverrideNote && <div className="suggest">Rating corretto da HR: {r.ratingOverrideNote}</div>}</div>}
          {!r.canFillSelf && selfResp && r.canSeeSelf && selfResp.status === 'submitted' && <div className="card"><AnswersView response={selfResp} title="Self-review" /></div>}
          {r.isManager && !r.canSeeSelf && r.selfResponse && <div className="card" style={{ color: 'var(--muted)' }}>La self-review di {r.subject?.firstName} sarà visibile dopo l&apos;invio della tua review ({r.selfResponse.submittedAt ? 'già inviata' : 'non ancora inviata'}).</div>}
          {r.isSubject && !r.canSeeManager && <div className="card" style={{ color: 'var(--muted)' }}>La review del manager sarà visibile quando verrà condivisa con te.</div>}
          {r.canSign && (
            <form action={signReview.bind(null, id)} className="card" style={{ display: 'grid', gap: 8 }}>
              <h3>Presa visione</h3>
              <textarea name="comment" rows={3} placeholder="Commento facoltativo" className="input" style={{ resize: 'vertical' }} />
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" name="disagree" /> Non concordo con la valutazione</label>
              <div><button className="btn p">Firma</button></div>
            </form>
          )}
          {r.signedAt && <div className="card"><b>Firmata il {fmtDate(r.signedAt)}</b>{r.disagreed && <span className="pill c" style={{ marginLeft: 8 }}>dissenso espresso</span>}{r.signComment && <p style={{ margin: '6px 0 0', color: 'var(--ink2)' }}>“{r.signComment}”</p>}</div>}
        </div>
        <div className="card ctx">
          <h3>Contesto <small>{r.subject?.firstName} · periodo</small></h3>
          <h4>Obiettivi ({ctx.objectives.length})</h4>
          {ctx.objectives.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Nessun obiettivo nel periodo</div> : ctx.objectives.map((o) => <div key={o.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--grid)', fontSize: 13 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span>{o.title}</span><b>{pct(o.progress)}</b></div><div className={`bar ${o.confidence === 'off_track' ? 'c' : o.confidence === 'at_risk' ? 'w' : 'g'}`} style={{ marginTop: 4 }}><i style={{ width: `${Math.round((o.progress ?? 0) * 100)}%` }} /></div></div>)}
          <h4>Feedback condivisi ({ctx.feedback.length})</h4>
          {ctx.feedback.slice(0, 5).map((f) => <div key={f.id} className="fb" style={{ borderLeft: `3px solid ${f.kind === 'praise' ? 'var(--good)' : 'var(--warn)'}`, padding: '6px 10px', margin: '6px 0', background: '#fff', fontSize: 13 }}>“{f.body}”<div style={{ fontSize: 11, color: 'var(--muted)' }}>{f.from} · {fmtDate(f.createdAt)}</div></div>)}
          <h4>Riconoscimenti ({ctx.recognitions.length})</h4>
          {ctx.recognitions.slice(0, 3).map((x) => <div key={x.id} style={{ fontSize: 13, padding: '4px 0' }}>🏅 {x.message} <span style={{ color: 'var(--muted)' }}>· {x.from}</span></div>)}
          <h4>1:1 nel periodo</h4>
          <div style={{ fontSize: 13 }}>{ctx.oneOnOnesDone} incontri conclusi</div>
          <h4>Review precedenti</h4>
          {ctx.previousReviews.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Prima review</div> : ctx.previousReviews.map((x) => <div key={x.id} style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between' }}><span>{x.cycleName}</span><b>{x.finalRatingLabel ?? '—'}</b></div>)}
        </div>
      </div>
    </>
  );
}
