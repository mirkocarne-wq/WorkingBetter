import Link from 'next/link';
import { apiFetch, fmtDate, initials, reviewStatusLabel, type Cycle, type Me, type ReviewCycle, type ReviewSummary, type ReviewTemplate } from '@/lib/api';
import { createReviewCycle } from '@/lib/actions';

const input = { width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, font: 'inherit', background: '#fff' } as const;

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ box?: string }> }) {
  const sp = await searchParams;
  const me = await apiFetch<Me>('/me');
  const isHr = me.permissions.includes('reviews:manage');
  const isManager = me.permissions.includes('objectives:write:team');
  const box = sp.box ?? (isHr ? 'cycles' : 'mine');
  const [mine, team, cycles, templates, okrCycles, units] = await Promise.all([
    apiFetch<ReviewSummary[]>('/reviews?box=mine'),
    isManager ? apiFetch<ReviewSummary[]>('/reviews?box=team') : Promise.resolve([] as ReviewSummary[]),
    isHr ? apiFetch<ReviewCycle[]>('/review-cycles') : Promise.resolve([] as ReviewCycle[]),
    isHr ? apiFetch<ReviewTemplate[]>('/review-templates') : Promise.resolve([] as ReviewTemplate[]),
    isHr ? apiFetch<Cycle[]>('/cycles') : Promise.resolve([] as Cycle[]),
    isHr ? apiFetch<{ id: string; name: string }[]>('/org-units') : Promise.resolve([] as { id: string; name: string }[]),
  ]);
  const todo = mine.filter((r) => r.canFillSelf || r.canSign).length + team.filter((r) => r.canFillManager || r.canShare).length;
  const tabs = [['mine', `Le mie (${mine.length})`], ...(isManager ? [['team', `Il mio team (${team.length})`]] : []), ...(isHr ? [['cycles', `Cicli (${cycles.length})`]] : [])];
  const Row = ({ r, who }: { r: ReviewSummary; who: 'subject' | 'manager' }) => {
    const p = who === 'subject' ? r.subject : r.manager;
    const st = reviewStatusLabel[r.status] ?? { text: r.status, cls: 'n' };
    const action = r.canFillSelf ? 'Compila self-review' : r.canFillManager ? 'Scrivi la review' : r.canShare ? 'Condividi' : r.canSign ? 'Leggi e firma' : 'Apri';
    return (
      <tr>
        <td><div className="who"><span className="av s">{p ? initials(p) : '?'}</span><div><div className="n">{p ? `${p.firstName} ${p.lastName}` : '—'}</div><div className="r">{r.cycle?.name}</div></div></div></td>
        <td><span className={`pill ${st.cls}`}>{st.text}</span></td>
        <td>{r.status === 'pending_self' ? fmtDate(r.cycle?.selfDueAt) : r.status.startsWith('pending') ? fmtDate(r.cycle?.managerDueAt) : '—'}</td>
        <td>{r.finalRatingLabel ?? '—'}</td>
        <td><Link href={`/reviews/${r.id}`} className={`btn sm ${r.canFillSelf || r.canFillManager || r.canShare || r.canSign ? 'p' : ''}`}>{action}</Link></td>
      </tr>
    );
  };
  return (
    <>
      <div className="ph"><div><h1>Review</h1><p>{todo} azioni in attesa da parte tua</p></div></div>
      <div className="tabs">{tabs.map(([k, l]) => <Link key={k} href={`/reviews?box=${k}`} className={box === k ? 'on' : ''}>{l}</Link>)}</div>
      {box === 'mine' && <div className="card">{mine.length === 0 ? <div className="empty">Nessuna review ti riguarda al momento.</div> : <table><thead><tr><th>Manager</th><th>Stato</th><th>Scadenza</th><th>Rating</th><th></th></tr></thead><tbody>{mine.map((r) => <Row key={r.id} r={r} who="manager" />)}</tbody></table>}</div>}
      {box === 'team' && <div className="card">{team.length === 0 ? <div className="empty">Nessuna review da scrivere.</div> : <table><thead><tr><th>Persona</th><th>Stato</th><th>Scadenza</th><th>Rating</th><th></th></tr></thead><tbody>{team.map((r) => <Row key={r.id} r={r} who="subject" />)}</tbody></table>}</div>}
      {box === 'cycles' && isHr && (
        <div className="grid" style={{ gridTemplateColumns: '1.5fr 1fr', alignItems: 'start' }}>
          <div className="card">
            <h3>Cicli di review</h3>
            {cycles.length === 0 ? <div className="empty">Nessun ciclo. Creane uno a destra.</div> : (
              <table><thead><tr><th>Ciclo</th><th>Periodo</th><th>Stato</th><th>Avanzamento</th><th></th></tr></thead>
                <tbody>{cycles.map((c) => {
                  const p = c.progress; const done = p ? (p.shared ?? 0) + (p.signed ?? 0) + (p.closed ?? 0) : 0;
                  return <tr key={c.id}><td><b>{c.name}</b></td><td>{c.periodStart} → {c.periodEnd}</td><td><span className={`pill ${c.status === 'active' ? 'g' : c.status === 'closed' ? 'n' : 'w'}`}>{c.status === 'draft' ? 'bozza' : c.status === 'active' ? 'attivo' : 'chiuso'}</span></td><td>{p ? <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><div className="bar g"><i style={{ width: `${p.total ? Math.round((done / p.total) * 100) : 0}%` }} /></div><span style={{ fontSize: 12 }}>{done}/{p.total}</span></div> : '—'}</td><td><Link href={`/reviews/cycles/${c.id}`} className="btn sm">Apri</Link></td></tr>;
                })}</tbody></table>
            )}
          </div>
          <div className="card">
            <h3>Nuovo ciclo</h3>
            {templates.length === 0 ? <div className="suggest">Nessun template: creane uno via API (<code>POST /api/v1/review-templates</code>) collegando due form pubblicati di tipo review.</div> : (
              <form action={createReviewCycle} style={{ display: 'grid', gap: 8 }}>
                <label>Template<select name="templateId" style={input}>{templates.map((t) => <option key={t.id} value={t.id}>{t.name} · self {t.selfDueDays} gg · manager {t.managerDueDays} gg</option>)}</select></label>
                <label>Nome<input name="name" required placeholder="Review Q4 2026" style={input} /></label>
                <div style={{ display: 'flex', gap: 8 }}><label style={{ flex: 1 }}>Periodo dal<input name="periodStart" type="date" required style={input} /></label><label style={{ flex: 1 }}>al<input name="periodEnd" type="date" required style={input} /></label></div>
                <label>Periodo obiettivi da mostrare<select name="okrCycleId" style={input}><option value="">Tutti gli obiettivi attivi</option>{okrCycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                <label>Popolazione<select name="orgUnitId" style={input}><option value="">Tutta l&apos;azienda</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name} (e sotto-unità)</option>)}</select></label>
                <div><button className="btn p">Crea bozza</button></div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
