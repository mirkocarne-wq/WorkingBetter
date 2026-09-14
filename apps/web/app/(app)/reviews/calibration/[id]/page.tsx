import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, apiFetch, fmtDate, reviewStatusLabel, type CalibrationSession } from '@/lib/api';
import { calibrationSessionAction, setCalibrationRating } from '@/lib/actions';
import { ActionForm } from '@/components/action-form';

const perfLabel: Record<number, string> = { 1: 'Perf. bassa', 2: 'Perf. media', 3: 'Perf. alta' };
const potLabel: Record<number, string> = { 1: 'Pot. basso', 2: 'Pot. medio', 3: 'Pot. alto' };

/** Sessione di calibrazione (REV-040…045): tabella dei rating, distribuzione vs attesa, medie per manager con outlier, 9-box, blocco. */
export default async function CalibrationSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let s: CalibrationSession;
  try { s = await apiFetch<CalibrationSession>(`/calibration-sessions/${id}`); } catch (e) { if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound(); throw e; }
  const values = Array.from({ length: s.scale.max - s.scale.min + 1 }, (_, i) => s.scale.min + i);
  const maxPct = Math.max(1, ...s.distribution.map((d) => Math.max(d.pct, d.expectedPct ?? 0)));
  const open = s.status === 'open';
  return (
    <>
      <div className="ph">
        <div>
          <h1>{s.name}</h1>
          <p>{s.cycle.name} · {s.orgUnits.length ? s.orgUnits.map((u) => u.name).join(', ') : 'tutto il ciclo'} · {s.items.length} review · <span className={`pill ${open ? 'w' : 'g'}`}>{open ? 'aperta' : `bloccata il ${fmtDate(s.lockedAt)}${s.lockedBy ? ` da ${s.lockedBy.name}` : ''}`}</span></p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href={s.isHr ? `/reviews/cycles/${s.cycleId}` : '/reviews?box=calibration'} className="btn">{s.isHr ? 'Ciclo' : 'Le sessioni'}</Link>
          {s.canLock && <ActionForm action={calibrationSessionAction.bind(null, id, 'lock')} inline confirm="Bloccare la sessione? I rating diventano definitivi e le review potranno essere condivise."><button className="btn p">Blocca sessione</button></ActionForm>}
          {s.canUnlock && <ActionForm action={calibrationSessionAction.bind(null, id, 'unlock')} inline><button className="btn">Riapri</button></ActionForm>}
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.7fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card">
            <h3>Review nel perimetro <small>solo con manager review inviata · media {s.overallAvg ?? '—'}</small></h3>
            {s.items.length === 0 ? <div className="empty">Nessuna review con rating nel perimetro: le manager review non sono ancora state inviate.</div> : (
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead><tr><th>Persona</th><th>Manager</th><th>Stato</th><th>Proposto</th><th>Rating</th><th>Potenziale</th>{s.canEdit && <th>Motivazione</th>}<th></th></tr></thead>
                  <tbody>
                    {s.items.map((i) => {
                      const st = reviewStatusLabel[i.status] ?? { text: i.status, cls: 'n' };
                      const changed = i.rating !== i.proposedRating;
                      const row = (
                        <>
                          <td><Link href={`/reviews/${i.reviewId}`} style={{ fontWeight: 600 }}>{i.subject?.name ?? '—'}</Link><div className="sup">{i.orgUnit?.name ?? ''}{i.subject?.jobTitle ? ` · ${i.subject.jobTitle}` : ''}</div></td>
                          <td>{i.manager?.name ?? '—'}</td>
                          <td><span className={`pill ${st.cls}`}>{st.text}</span>{i.changes > 0 && <div className="sup">{i.changes} {i.changes === 1 ? 'modifica' : 'modifiche'}</div>}</td>
                          <td>{i.proposedRating ?? '—'}</td>
                        </>
                      );
                      if (!s.canEdit) return <tr key={i.reviewId}>{row}<td><b>{i.rating ?? '—'}</b>{changed && i.rating != null ? <span className="pill s" style={{ marginLeft: 6 }}>calibrato</span> : ''}<div className="sup">{i.ratingLabel ?? ''}</div></td><td>{i.potential ?? '—'}{i.nineBox ? <div className="sup">{i.nineBox}</div> : null}</td><td><Link href={`/reviews/${i.reviewId}`} className="btn sm">Apri</Link></td></tr>;
                      return (
                        <tr key={i.reviewId}>
                          {row}
                          <td colSpan={4}>
                            <ActionForm action={setCalibrationRating.bind(null, id, i.reviewId)} inline>
                              <select name="rating" defaultValue={i.rating ?? ''} className="input" style={{ width: 150 }} aria-label="Rating">{values.map((v) => <option key={v} value={v}>{v} · {s.scale.labels[String(v)] ?? ''}</option>)}</select>
                              <select name="potential" defaultValue={i.potential ?? ''} className="input" style={{ width: 130 }} aria-label="Potenziale"><option value="">Potenziale —</option><option value="1">1 · basso</option><option value="2">2 · medio</option><option value="3">3 · alto</option></select>
                              <input name="note" placeholder="Motivazione" className="input" style={{ width: 180 }} />
                              <button className="btn sm">Salva</button>
                              {changed && i.rating != null && <span className="pill s">calibrato</span>}
                            </ActionForm>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {open && <div className="sup" style={{ marginTop: 8 }}>Ogni modifica è tracciata con motivazione nello storico della review (REV-043); il potenziale alimenta la 9-box del modulo Sviluppo. Finché la sessione è aperta queste review non possono essere condivise.</div>}
          </div>
          <div className="card">
            <h3>9-box <small>performance dal rating × potenziale · {s.nineBox.unplaced} non posizionate</small></h3>
            <div style={{ display: 'grid', gridTemplateColumns: '90px repeat(3, 1fr)', gap: 6 }}>
              {[3, 2, 1].map((perf) => (
                <div key={perf} style={{ display: 'contents' }}>
                  <div className="sup" style={{ alignSelf: 'center', fontSize: 11 }}>{perfLabel[perf]}</div>
                  {[1, 2, 3].map((pot) => {
                    const items = s.items.filter((i) => i.performance === perf && i.potential === pot);
                    const tone = perf + pot >= 5 ? 'var(--good-soft)' : perf + pot <= 3 ? 'var(--crit-soft)' : 'var(--warn-soft)';
                    return <div key={pot} style={{ background: tone, borderRadius: 8, minHeight: 64, padding: 8 }}><div className="lvl" style={{ marginBottom: 4 }}>{items[0]?.nineBox ?? ''}</div>{items.map((i) => <Link key={i.reviewId} href={`/reviews/${i.reviewId}`} style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>{i.subject?.name}</Link>)}</div>;
                  })}
                  {perf === 1 && <><div /> {[1, 2, 3].map((pot) => <div key={pot} className="sup" style={{ textAlign: 'center', fontSize: 11 }}>{potLabel[pot]}</div>)}</>}
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card">
            <h3>Distribuzione <small>osservata vs attesa (REV-041)</small></h3>
            {s.distribution.map((d) => (
              <div key={d.rating} style={{ padding: '6px 0', borderBottom: '1px solid var(--grid)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span><b>{d.rating}</b> · {d.label}</span><span>{d.count} · {d.pct}%{d.expectedPct != null && <span style={{ color: Math.abs(d.delta ?? 0) >= 10 ? 'var(--warn-text)' : 'var(--muted)' }}> (attesa {d.expectedPct}%)</span>}</span></div>
                <div className="bar b" style={{ marginTop: 4 }}><i style={{ width: `${Math.round((d.pct / maxPct) * 100)}%` }} /></div>
                {d.expectedPct != null && <div className="bar n" style={{ marginTop: 2, opacity: 0.6 }}><i style={{ width: `${Math.round((d.expectedPct / maxPct) * 100)}%` }} /></div>}
              </div>
            ))}
            {!s.expectedDistribution && <div className="sup" style={{ marginTop: 8 }}>Nessuna distribuzione attesa impostata per questa sessione.</div>}
          </div>
          <div className="card">
            <h3>Per manager <small>media e scostamento dalla sessione (REV-042)</small></h3>
            {s.managers.length === 0 ? <div className="empty">Nessun rating.</div> : (
              <table><thead><tr><th>Manager</th><th>N</th><th>Media</th><th>Δ</th></tr></thead>
                <tbody>{s.managers.map((m) => <tr key={m.managerId}><td>{m.manager}</td><td>{m.count}</td><td><b>{m.avg}</b></td><td>{m.outlier ? <span className="pill w" title="Scostamento ≥ 0,75 punti dalla media della sessione">{m.delta > 0 ? '+' : ''}{m.delta} outlier</span> : <span style={{ color: 'var(--muted)' }}>{m.delta > 0 ? '+' : ''}{m.delta}</span>}</td></tr>)}</tbody></table>
            )}
          </div>
          <div className="card">
            <h3>Sessione</h3>
            <div style={{ fontSize: 13, display: 'grid', gap: 4 }}>
              <div><span className="sup">Facilitatore</span><br />{s.facilitator?.name ?? '—'}</div>
              <div><span className="sup">Partecipanti</span><br />{s.participants.length ? s.participants.map((p) => p.name).join(', ') : '—'}</div>
              {s.notes && <div><span className="sup">Note</span><br />{s.notes}</div>}
              <div><span className="sup">Creata</span><br />{fmtDate(s.createdAt)}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
