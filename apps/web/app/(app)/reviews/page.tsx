import Link from 'next/link';
import { apiFetch, fmtDate, initials, reviewStatusLabel, type Cycle, type Me, type ReviewCycle, type ReviewSummary, type ReviewTemplate } from '@/lib/api';
import { createReviewCycle, createReviewTemplate } from '@/lib/actions';


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
  const reviewForms = isHr ? await apiFetch<{ id: string; key: string; name: string; status: string }[]>('/forms?kind=review&status=published&latest=true') : [];
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
          <div style={{ display: 'grid', gap: 16 }}>
          <div className="card">
            <h3>Nuovo ciclo</h3>
            {templates.length === 0 ? <div className="suggest">Nessun template: creane uno qui sotto collegando i questionari pubblicati di tipo review.</div> : (
              <form action={createReviewCycle} style={{ display: 'grid', gap: 8 }}>
                <label>Template<select name="templateId" className="input">{templates.map((t) => <option key={t.id} value={t.id}>{t.name} · self {t.selfDueDays} gg · manager {t.managerDueDays} gg</option>)}</select></label>
                <label>Nome<input name="name" required placeholder="Review Q4 2026" className="input" /></label>
                <div style={{ display: 'flex', gap: 8 }}><label style={{ flex: 1 }}>Periodo dal<input name="periodStart" type="date" required className="input" /></label><label style={{ flex: 1 }}>al<input name="periodEnd" type="date" required className="input" /></label></div>
                <label>Periodo obiettivi da mostrare<select name="okrCycleId" className="input"><option value="">Tutti gli obiettivi attivi</option>{okrCycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                <label>Popolazione<select name="orgUnitId" className="input"><option value="">Tutta l&apos;azienda</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name} (e sotto-unità)</option>)}</select></label>
                <div><button className="btn p">Crea bozza</button></div>
              </form>
            )}
          </div>
          <div className="card">
            <h3>Nuovo template <small>{templates.length} esistenti</small></h3>
            {reviewForms.length === 0 ? <div className="suggest">Prima crea e pubblica almeno un questionario di tipo review in <Link href="/forms/new?kind=review" style={{ color: 'var(--brand-2)' }}>Form → Nuovo questionario</Link>.</div> : (
              <form action={createReviewTemplate} style={{ display: 'grid', gap: 8 }}>
                <label>Nome<input name="name" required placeholder="Review trimestrale" className="input" /></label>
                <label>Questionario del manager<select name="managerFormKey" className="input">{reviewForms.map((f) => <option key={f.id} value={f.key}>{f.name}</option>)}</select></label>
                <label>Self-review<select name="selfFormKey" className="input"><option value="">Nessuna self-review</option>{reviewForms.map((f) => <option key={f.id} value={f.key}>{f.name}</option>)}</select></label>
                <div style={{ display: 'flex', gap: 8 }}><label style={{ flex: 1 }}>Self entro (gg)<input name="selfDueDays" type="number" min={1} defaultValue={14} className="input" /></label><label style={{ flex: 1 }}>Manager entro (gg)<input name="managerDueDays" type="number" min={1} defaultValue={21} className="input" /></label></div>
                <label>Il manager vede la self-review<select name="managerSeesSelf" defaultValue="after_submit" className="input"><option value="after_submit">Dopo aver inviato la propria</option><option value="immediately">Subito</option><option value="never">Mai</option></select></label>
                <div style={{ display: 'flex', gap: 8 }}><label style={{ flex: 1 }}>Rating da<input name="ratingMin" type="number" defaultValue={1} className="input" /></label><label style={{ flex: 1 }}>a<input name="ratingMax" type="number" defaultValue={5} className="input" /></label></div>
                <label>Etichette del rating<textarea name="ratingLabels" rows={3} defaultValue={'1=Non soddisfa\n2=Parzialmente\n3=Soddisfa\n4=Supera\n5=Eccezionale'} className="input" style={{ fontSize: 12 }} /></label>
                <label>Campo del questionario da usare come rating complessivo <span className="sup">(vuoto = derivato dal punteggio)</span><input name="overallRatingField" placeholder="es. rating_complessivo" className="input" /></label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" name="requireSignature" defaultChecked /> Richiedi la presa visione del collaboratore</label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" name="includeObjectives" defaultChecked /> Mostra gli obiettivi nel pannello di contesto</label>
                <div><button className="btn">Crea template</button></div>
              </form>
            )}
          </div>
          </div>
        </div>
      )}
    </>
  );
}
