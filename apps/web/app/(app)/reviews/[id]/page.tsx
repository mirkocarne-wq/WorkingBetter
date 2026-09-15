import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, apiFetch, fmtDate, pct, reviewStatusLabel, type FormResponse, type ReviewContext, type ReviewDetail } from '@/lib/api';
import { approveReview, markConversation, shareReview, signReview } from '@/lib/actions';
import { FormRunner } from '@/components/form-runner';
import { ActionForm } from '@/components/action-form';
import { Avatar, Pill, Stepper, type StepState } from '@/components/ui';


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
            return <div key={f.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 200px) minmax(0, 1fr)', gap: 16, padding: '12px 0', borderTop: '1px solid var(--grid)' }}><div style={{ fontSize: 13, color: 'var(--muted)' }}>{f.label}</div><div style={{ lineHeight: 1.5 }}>{shown}</div></div>;
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
  const counterpart = r.isSubject ? r.manager : r.subject;
  // fasi del processo (stepper): self → manager → approvazioni → condivisione → firma
  const order = ['pending_self', 'pending_manager', 'pending_approval', 'pending_share', 'shared', 'signed', 'closed'];
  const pos = order.indexOf(r.status);
  const stateFor = (idx: number): StepState => (r.status === 'cancelled' ? 'todo' : pos > idx ? 'done' : pos === idx ? 'current' : 'todo');
  const steps: { label: string; sub?: string; state: StepState }[] = [];
  if (r.selfResponse) steps.push({ label: 'Self-review', sub: r.selfSubmittedAt ? `inviata ${fmtDate(r.selfSubmittedAt)}` : r.cycle?.selfDueAt ? `entro ${fmtDate(r.cycle.selfDueAt)}` : undefined, state: r.selfSubmittedAt ? 'done' : stateFor(0) });
  steps.push({ label: 'Manager review', sub: r.managerSubmittedAt ? `inviata ${fmtDate(r.managerSubmittedAt)}` : `${r.manager?.firstName ?? 'manager'}${r.cycle?.managerDueAt ? ` · entro ${fmtDate(r.cycle.managerDueAt)}` : ''}`, state: r.managerSubmittedAt ? 'done' : stateFor(1) });
  for (const a of r.approvals) steps.push({ label: a.label, sub: a.actor ? `${a.actor.firstName} ${a.actor.lastName}` : undefined, state: a.status === 'done' ? 'done' : a.status === 'active' ? 'current' : a.status === 'rejected' ? 'rejected' : 'todo' });
  steps.push({ label: 'Condivisione', sub: r.sharedAt ? fmtDate(r.sharedAt) : undefined, state: r.sharedAt ? 'done' : stateFor(3) });
  if (r.template.requireSignature) steps.push({ label: 'Firma', sub: r.signedAt ? fmtDate(r.signedAt) : undefined, state: r.signedAt ? 'done' : r.sharedAt ? 'current' : 'todo' });
  return (
    <>
      <div className="ph">
        <div>
          <h1 className="row" style={{ gap: 10 }}>{r.cycle?.name ?? 'Review'}<Pill tone={st.cls as 'w' | 's' | 'b' | 'g' | 'n'} dot>{st.text}</Pill></h1>
          <p className="row" style={{ gap: 8 }}>{r.isSubject ? 'con' : 'di'} {counterpart && <Avatar person={counterpart} small />}{counterpart ? `${counterpart.firstName} ${counterpart.lastName}` : '—'} · template «{r.template.name}» · periodo {r.cycle?.periodStart} → {r.cycle?.periodEnd}{r.finalRatingLabel && r.canSeeManager ? ` · rating ${r.finalRating} · ${r.finalRatingLabel}` : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/reviews" className="btn ghost">Tutte le review</Link>
          <a href={`/api/export?report=review-pdf&id=${id}`} className="btn" title="Esporta la review in PDF (REV-054)">Esporta PDF</a>
          {r.isHr && r.appInstanceId && <Link href={`/apps/instances/${r.appInstanceId}`} className="btn" title="Istanza del processo sul motore dei workflow">Processo</Link>}
          {r.canShare && <form action={shareReview.bind(null, id)}><button className="btn p">Condividi con {r.subject?.firstName}</button></form>}
          {(r.isManager || r.isHr) && r.status === 'shared' && !r.conversationAt && <form action={markConversation.bind(null, id)}><button className="btn">Colloquio fatto</button></form>}
        </div>
      </div>
      <div className="card flush" style={{ marginBottom: 24 }}><Stepper steps={steps} /></div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 340px', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 24 }}>
          {r.inCalibration && (r.isManager || r.isHr) && <div className="suggest">Questa review è in una sessione di calibrazione aperta{r.calibrationSessionId && r.isHr ? <> (<Link href={`/reviews/calibration/${r.calibrationSessionId}`} style={{ color: 'var(--brand-2)' }}>apri la sessione</Link>)</> : ''}: il rating può ancora cambiare e la condivisione è sospesa finché la sessione non viene bloccata.</div>}
          {r.approvals.length > 0 && (
            <div className="card">
              <h3>Catena di approvazione <small>{r.approvals.filter((a) => a.status === 'done').length}/{r.approvals.length} approvati</small></h3>
              <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
                {r.approvals.map((a) => {
                  const tone = a.status === 'done' ? 'g' : a.status === 'active' ? 'w' : a.status === 'rejected' ? 'c' : 'n';
                  const text = a.status === 'done' ? 'approvato' : a.status === 'active' ? 'in attesa' : a.status === 'rejected' ? 'rimandato' : a.status === 'skipped' ? 'saltato' : 'da fare';
                  return (
                    <li key={a.step} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--grid)', flexWrap: 'wrap' }}>
                      <span className={`pill ${tone}`}>{a.step}. {text}</span>
                      <b>{a.label}</b>
                      <span style={{ color: 'var(--muted)', fontSize: 13 }}>{a.actor ? `${a.actor.firstName} ${a.actor.lastName}` : '—'}{a.decidedAt ? ` · ${fmtDate(a.decidedAt)}` : a.dueDate && a.status === 'active' ? ` · entro ${fmtDate(a.dueDate)}` : ''}</span>
                      {a.comment && <span style={{ fontSize: 13, color: 'var(--ink2)', width: '100%' }}>“{a.comment}”</span>}
                    </li>
                  );
                })}
              </ol>
              {r.canApprove && (
                <ActionForm action={approveReview.bind(null, id)} style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                  <div className="suggest">Sei l&apos;approvatore di questo passo{r.isHr && !r.isApprover ? ' (come HR puoi decidere al posto dell’approvatore)' : ''}. Se rimandi, la manager review torna in bozza a {r.manager?.firstName ?? 'chi l’ha scritta'} con il tuo commento.</div>
                  <label>Decisione<select name="decision" className="input" defaultValue="approve"><option value="approve">Approva</option><option value="return">Rimanda al manager</option></select></label>
                  <label>Commento <span className="sup">(obbligatorio se rimandi)</span><textarea name="comment" rows={3} className="input" style={{ resize: 'vertical' }} placeholder="Cosa va rivisto o perché approvi" /></label>
                  <div><button className="btn p">Conferma</button></div>
                </ActionForm>
              )}
            </div>
          )}
          {r.canFillSelf && selfResp && <div><div className="suggest" style={{ marginBottom: 10 }}>La tua self-review: {r.template.managerSeesSelf === 'immediately' ? 'il manager la vede subito' : r.template.managerSeesSelf === 'after_submit' ? 'il manager la vedrà solo dopo aver inviato la propria' : 'il manager non la vedrà'}. Scadenza {fmtDate(r.cycle?.selfDueAt)}.</div><FormRunner response={selfResp} /></div>}
          {r.canFillManager && mgrResp && <div><div className="suggest" style={{ marginBottom: 10 }}>Manager review per {r.subject?.firstName}: usa il pannello di contesto a destra. Dopo l&apos;invio potrai condividerla. Scadenza {fmtDate(r.cycle?.managerDueAt)}.</div><FormRunner response={mgrResp} /></div>}
          {!r.canFillManager && mgrResp && r.canSeeManager && mgrResp.status === 'submitted' && <div className="card"><AnswersView response={mgrResp} title="Manager review" />{r.ratingOverrideNote && <div className="suggest">{r.calibratedAt ? 'Rating calibrato' : 'Rating corretto da HR'}: {r.ratingOverrideNote}</div>}</div>}
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
          {r.ratingHistory.length > 0 && (
            <div className="card">
              <h3>Storico del rating <small>calibrazione e correzioni HR (REV-043)</small></h3>
              <table><thead><tr><th>Quando</th><th>Rating</th><th>Potenziale</th><th>Motivazione</th><th>Chi</th></tr></thead>
                <tbody>{r.ratingHistory.map((h, i) => <tr key={i}><td>{fmtDate(h.at)}</td><td>{h.fromRating ?? '—'} → <b>{h.toRating ?? '—'}</b></td><td>{h.fromPotential === h.toPotential ? '—' : `${h.fromPotential ?? '—'} → ${h.toPotential ?? '—'}`}</td><td>{h.note}{h.inSession && <span className="pill s" style={{ marginLeft: 6 }}>sessione</span>}</td><td>{h.by}</td></tr>)}</tbody></table>
            </div>
          )}
          {r.signedAt && <div className="card"><b>Firmata il {fmtDate(r.signedAt)}</b>{r.disagreed && <span className="pill c" style={{ marginLeft: 8 }}>dissenso espresso</span>}{r.signComment && <p style={{ margin: '6px 0 0', color: 'var(--ink2)' }}>“{r.signComment}”</p>}</div>}
        </div>
        <div className="card ctx">
          <h3>Contesto del periodo <small>{r.cycle?.periodStart} → {r.cycle?.periodEnd}</small></h3>
          <h4>Obiettivi ({ctx.objectives.length})</h4>
          {ctx.objectives.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Nessun obiettivo nel periodo</div> : ctx.objectives.map((o) => <div key={o.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--grid)', fontSize: 13 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span>{o.title}</span><b>{pct(o.progress)}</b></div><div className={`bar ${o.confidence === 'off_track' ? 'c' : o.confidence === 'at_risk' ? 'w' : 'g'}`} style={{ marginTop: 4 }}><i style={{ width: `${Math.round((o.progress ?? 0) * 100)}%` }} /></div></div>)}
          <h4>Feedback condivisi ({ctx.feedback.length})</h4>
          {ctx.feedback.slice(0, 5).map((f) => <div key={f.id} className="fb" style={{ display: 'flex', gap: 10, margin: '8px 0', fontSize: 13 }}><span style={{ width: 3, borderRadius: 2, background: f.kind === 'praise' ? 'var(--good)' : 'var(--warn)', flex: 'none' }} /><div><div style={{ lineHeight: 1.45 }}>“{f.body}”</div><div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{f.from} · {fmtDate(f.createdAt)}</div></div></div>)}
          <h4>Riconoscimenti ({ctx.recognitions.length})</h4>
          {ctx.recognitions.slice(0, 3).map((x) => <div key={x.id} style={{ fontSize: 13, padding: '4px 0', lineHeight: 1.45 }}>{x.message} <span style={{ color: 'var(--muted)' }}>· {x.from}</span></div>)}
          <h4>1:1 nel periodo</h4>
          <div style={{ fontSize: 13 }}>{ctx.oneOnOnesDone} incontri conclusi</div>
          <h4>Review precedenti</h4>
          {ctx.previousReviews.length === 0 ? <div style={{ color: 'var(--muted)', fontSize: 13 }}>Prima review</div> : ctx.previousReviews.map((x) => <div key={x.id} style={{ fontSize: 13, display: 'flex', justifyContent: 'space-between' }}><span>{x.cycleName}</span><b>{x.finalRatingLabel ?? '—'}</b></div>)}
        </div>
      </div>
    </>
  );
}
