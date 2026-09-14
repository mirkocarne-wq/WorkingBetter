import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, apiFetch, fmtDate, reviewStatusLabel, type ReviewCycle, type ReviewProgress } from '@/lib/api';
import { closeReviewCycle, launchReviewCycle, remindReviewCycle } from '@/lib/actions';

interface Population { included: { id: string; firstName: string; lastName: string; jobTitle: string | null }[]; skipped: { firstName: string; lastName: string; reason: string }[]; excluded: number }

export default async function CyclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let c: ReviewCycle & { template: { name: string; managerSeesSelf: string }; progress: ReviewProgress | null };
  try { c = await apiFetch(`/review-cycles/${id}`); } catch (e) { if (e instanceof ApiError && e.status === 404) notFound(); throw e; }
  const pop = c.status === 'draft' ? await apiFetch<Population>(`/review-cycles/${id}/population`) : null;
  const p = c.progress;
  return (
    <>
      <div className="ph">
        <div><h1>{c.name}</h1><p>{c.template.name} · {c.periodStart} → {c.periodEnd} · {c.status === 'draft' ? 'bozza' : c.status === 'active' ? `attivo · self entro ${fmtDate(c.selfDueAt)} · manager entro ${fmtDate(c.managerDueAt)}` : 'chiuso'}</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link href="/reviews?box=cycles" className="btn">Tutti i cicli</Link>
          {c.status === 'draft' && <form action={launchReviewCycle.bind(null, id)}><button className="btn p" disabled={!pop?.included.length}>Lancia ({pop?.included.length ?? 0} persone)</button></form>}
          {c.status === 'active' && <><form action={remindReviewCycle.bind(null, id)}><button className="btn">Sollecita chi è in ritardo</button></form><form action={closeReviewCycle.bind(null, id)}><button className="btn">Chiudi ciclo</button></form></>}
        </div>
      </div>
      {c.status === 'draft' && pop && (
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'start' }}>
          <div className="card"><h3>Popolazione <small>{pop.included.length} incluse · {pop.excluded} escluse</small></h3>{pop.included.map((x) => <div key={x.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--grid)' }}>{x.firstName} {x.lastName} <span style={{ color: 'var(--muted)' }}>· {x.jobTitle ?? ''}</span></div>)}</div>
          <div className="card"><h3>Non verranno incluse <small>{pop.skipped.length}</small></h3>{pop.skipped.length === 0 ? <div className="empty">Tutte le persone hanno un manager.</div> : pop.skipped.map((x, i) => <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid var(--grid)' }}>{x.firstName} {x.lastName} <span className="pill w">{x.reason}</span></div>)}<div className="suggest" style={{ marginTop: 10 }}>Il lancio crea una review per persona con la self-review e la manager review, e avvisa tutti. Al lancio le regole del template vengono congelate per questo ciclo.</div></div>
        </div>
      )}
      {p && (
        <div className="grid" style={{ gridTemplateColumns: '1fr 1.6fr', alignItems: 'start' }}>
          <div style={{ display: 'grid', gap: 16 }}>
            <div className="card"><h3>Avanzamento</h3>
              {Object.entries(reviewStatusLabel).filter(([k]) => p.counts[k]).map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--grid)' }}><span className={`pill ${v.cls}`}>{v.text}</span><b>{p.counts[k]}</b></div>)}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontWeight: 700 }}><span>Totale</span><span>{p.counts.total}</span></div></div>
            <div className="card"><h3>Per manager <small>review in sospeso</small></h3>{p.byManager.map((m) => <div key={m.managerId} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--grid)' }}><span>{m.managerName}</span><span>{m.pending > 0 ? <span className="pill w">{m.pending} su {m.total}</span> : <span className="pill g">0 su {m.total}</span>}</span></div>)}</div>
          </div>
          <div className="card"><h3>Review</h3>
            <table><thead><tr><th>Persona</th><th>Manager</th><th>Stato</th><th>Rating</th><th></th></tr></thead>
              <tbody>{p.reviews.map((r) => { const st = reviewStatusLabel[r.status] ?? { text: r.status, cls: 'n' }; return <tr key={r.id}><td>{r.subject}</td><td>{r.manager}</td><td><span className={`pill ${st.cls}`}>{st.text}</span></td><td>{r.finalRatingLabel ?? '—'}</td><td><Link href={`/reviews/${r.id}`} className="btn sm">Apri</Link></td></tr>; })}</tbody></table>
          </div>
        </div>
      )}
    </>
  );
}
