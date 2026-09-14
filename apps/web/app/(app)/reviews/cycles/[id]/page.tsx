import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, apiFetch, fmtDate, reviewStatusLabel, type CalibrationSessionLite, type ReviewCycle, type ReviewProgress } from '@/lib/api';
import { closeReviewCycle, createCalibrationSession, launchReviewCycle, remindReviewCycle } from '@/lib/actions';
import { ActionForm } from '@/components/action-form';

interface Population { included: { id: string; firstName: string; lastName: string; jobTitle: string | null }[]; skipped: { firstName: string; lastName: string; reason: string }[]; excluded: number }

export default async function CyclePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let c: ReviewCycle & { template: { name: string; managerSeesSelf: string }; progress: ReviewProgress | null };
  try { c = await apiFetch(`/review-cycles/${id}`); } catch (e) { if (e instanceof ApiError && e.status === 404) notFound(); throw e; }
  const pop = c.status === 'draft' ? await apiFetch<Population>(`/review-cycles/${id}/population`) : null;
  const p = c.progress;
  const [sessions, units, people] = c.status === 'draft' ? [[], [], []] : await Promise.all([
    apiFetch<CalibrationSessionLite[]>(`/calibration-sessions?cycleId=${id}`).catch(() => [] as CalibrationSessionLite[]),
    apiFetch<{ id: string; name: string }[]>('/org-units').catch(() => [] as { id: string; name: string }[]),
    apiFetch<{ items: { id: string; firstName: string; lastName: string; jobTitle: string | null }[] }>('/people?limit=200').then((r) => r.items).catch(() => [] as { id: string; firstName: string; lastName: string; jobTitle: string | null }[]),
  ]);
  const managerIds = new Set(p?.byManager.map((m) => m.managerId) ?? []);
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
          <div style={{ display: 'grid', gap: 16 }}>
          <div className="card"><h3>Review</h3>
            <table><thead><tr><th>Persona</th><th>Manager</th><th>Stato</th><th>Rating</th><th></th></tr></thead>
              <tbody>{p.reviews.map((r) => { const st = reviewStatusLabel[r.status] ?? { text: r.status, cls: 'n' }; return <tr key={r.id}><td>{r.subject}</td><td>{r.manager}</td><td><span className={`pill ${st.cls}`}>{st.text}</span></td><td>{r.finalRatingLabel ?? '—'}</td><td><Link href={`/reviews/${r.id}`} className="btn sm">Apri</Link></td></tr>; })}</tbody></table>
          </div>
          <div className="card">
            <h3>Calibrazione <small>{sessions.length} sessioni · REV-040</small></h3>
            {sessions.length > 0 && <table style={{ marginBottom: 12 }}><thead><tr><th>Sessione</th><th>Review</th><th>Stato</th><th></th></tr></thead><tbody>{sessions.map((s) => <tr key={s.id}><td><b>{s.name}</b></td><td>{s.reviewCount}</td><td><span className={`pill ${s.status === 'open' ? 'w' : 'g'}`}>{s.status === 'open' ? 'aperta' : 'bloccata'}</span></td><td><Link href={`/reviews/calibration/${s.id}`} className="btn sm">Apri</Link></td></tr>)}</tbody></table>}
            {c.status === 'active' && (
              <ActionForm action={createCalibrationSession.bind(null, id)} style={{ display: 'grid', gap: 8 }}>
                <div className="suggest">Una sessione raccoglie le review con manager review inviata di un perimetro (unità e sotto-unità). Finché è aperta, quelle review non si condividono; al blocco i rating diventano definitivi.</div>
                <label>Nome<input name="name" required placeholder="Calibrazione Q4 · Tech" className="input" /></label>
                <label>Perimetro <span className="sup">(nessuna selezione = tutto il ciclo)</span><select name="orgUnitIds" multiple className="input" size={Math.min(5, Math.max(2, units.length))}>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
                <label>Partecipanti <span className="sup">(manager del perimetro; possono cambiare i rating)</span><select name="participantPersonIds" multiple className="input" size={4}>{people.filter((x) => managerIds.has(x.id)).map((x) => <option key={x.id} value={x.id}>{x.firstName} {x.lastName}</option>)}</select></label>
                <label>Facilitatore <span className="sup">(vuoto = tu)</span><select name="facilitatorPersonId" className="input"><option value="">Io</option>{people.map((x) => <option key={x.id} value={x.id}>{x.firstName} {x.lastName}</option>)}</select></label>
                <label>Distribuzione attesa <span className="sup">(rating=percentuale)</span><input name="expectedDistribution" placeholder="1=5, 2=15, 3=50, 4=25, 5=5" className="input" /></label>
                <div><button className="btn p">Apri sessione</button></div>
              </ActionForm>
            )}
          </div>
          </div>
        </div>
      )}
    </>
  );
}
