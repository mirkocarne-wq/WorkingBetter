import Link from 'next/link';
import { apiFetch, fmtDate, surveyKindLabel, surveyStatusLabel, type Me, type SurveyAdmin, type SurveyMine } from '@/lib/api';
import { createSurvey } from '@/lib/actions';

const TEMPLATES: [string, string, string][] = [
  ['engagement', 'Engagement completa', '14 domande su 7 driver, eNPS e commento'],
  ['pulse', 'Pulse', '5 domande a rotazione + eNPS'],
  ['enps', 'eNPS', 'Solo eNPS e commento'],
  ['wellbeing', 'Benessere', 'Carico, equilibrio, riconoscimento'],
];

export default async function SurveysPage({ searchParams }: { searchParams: Promise<{ box?: string }> }) {
  const sp = await searchParams;
  const me = await apiFetch<Me>('/me');
  const isHr = me.permissions.includes('surveys:manage');
  const box = sp.box ?? (isHr ? 'manage' : 'mine');
  const [mine, all, units] = await Promise.all([
    apiFetch<SurveyMine[]>('/surveys?box=mine'),
    isHr ? apiFetch<SurveyAdmin[]>('/surveys?box=all') : Promise.resolve([] as SurveyAdmin[]),
    isHr ? apiFetch<{ id: string; name: string }[]>('/org-units') : Promise.resolve([] as { id: string; name: string }[]),
  ]);
  const todo = mine.filter((s) => s.canRespond).length;
  const inTwoWeeks = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  return (
    <>
      <div className="ph"><div><h1>Survey</h1><p>{todo ? `${todo} survey da compilare` : 'Nessuna survey in attesa di risposta'}</p></div></div>
      {isHr && <div className="tabs"><Link href="/surveys?box=mine" className={box === 'mine' ? 'on' : ''}>Le mie ({mine.length})</Link><Link href="/surveys?box=manage" className={box === 'manage' ? 'on' : ''}>Gestione ({all.length})</Link></div>}
      {box === 'mine' && (
        <div className="card">
          {mine.length === 0 ? <div className="empty">Nessuna survey ti riguarda al momento.</div> : (
            <table><thead><tr><th>Survey</th><th>Tipo</th><th>Stato</th><th>Chiusura</th><th></th></tr></thead>
              <tbody>{mine.map((s) => <tr key={s.id}><td><b>{s.title}</b><div className="sup">{s.anonymous ? 'anonima' : 'nominale'}</div></td><td>{surveyKindLabel[s.kind] ?? s.kind}</td><td><span className={`pill ${s.responded ? 'g' : s.status === 'open' ? 'w' : 'n'}`}>{s.responded ? 'Risposto' : s.status === 'open' ? 'Da compilare' : surveyStatusLabel[s.status]?.text}</span></td><td>{fmtDate(s.closesAt)}</td><td>{s.canRespond ? <Link href={`/surveys/${s.id}`} className="btn sm p">Rispondi</Link> : s.canReadSummary ? <Link href={`/surveys/${s.id}`} className="btn sm">Leggi i risultati</Link> : null}</td></tr>)}</tbody></table>
          )}
        </div>
      )}
      {box === 'manage' && isHr && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', alignItems: 'start' }}>
          <div className="card">
            <h3>Survey dell’organizzazione</h3>
            {all.length === 0 ? <div className="empty">Nessuna survey: creane una a destra.</div> : (
              <table><thead><tr><th>Survey</th><th>Stato</th><th>Risposte</th><th>Chiusura</th><th></th></tr></thead>
                <tbody>{all.map((s) => { const st = surveyStatusLabel[s.status]!; return <tr key={s.id}><td><b>{s.title}</b><div className="sup">{surveyKindLabel[s.kind] ?? s.kind} · {s.anonymous ? `anonima · soglia ${s.anonymityThreshold}` : 'nominale'}</div></td><td><span className={`pill ${st.cls}`}>{st.text}</span></td><td>{s.counts ? <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><div className="bar g"><i style={{ width: `${Math.round((s.counts.rate ?? 0) * 100)}%` }} /></div><span className="sup">{s.counts.responded}/{s.counts.invited}</span></div> : '—'}</td><td>{fmtDate(s.closesAt)}</td><td><Link href={`/surveys/${s.id}/results`} className="btn sm">{s.status === 'draft' ? 'Apri' : 'Risultati'}</Link></td></tr>; })}</tbody></table>
            )}
          </div>
          <form action={createSurvey} className="card" style={{ display: 'grid', gap: 8 }}>
            <h3>Nuova survey</h3>
            <label>Titolo<input name="title" required placeholder="Engagement autunno 2026" className="input" /></label>
            <label>Template<select name="template" className="input">{TEMPLATES.map(([v, l, d]) => <option key={v} value={v}>{l} · {d}</option>)}</select></label>
            <label>Messaggio introduttivo<textarea name="description" rows={2} placeholder="Perché la facciamo e cosa faremo con i risultati" className="input" style={{ resize: 'vertical' }} /></label>
            <label>Popolazione<select name="orgUnitId" className="input"><option value="">Tutta l’azienda</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name} (e sotto-unità)</option>)}</select></label>
            <div style={{ display: 'flex', gap: 8 }}><label style={{ flex: 1 }}>Chiude il<input name="closesAt" type="date" defaultValue={inTwoWeeks} className="input" /></label><label style={{ flex: 1 }}>Soglia anonimato<input name="anonymityThreshold" type="number" min={3} max={50} defaultValue={5} className="input" /></label></div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" name="anonymous" defaultChecked value="on" /> Anonima (consigliato)</label>
            <input type="hidden" name="rotation" value={all.filter((s) => s.kind === 'pulse').length} />
            <div><button className="btn p">Crea bozza</button></div>
            <div className="sup">Il questionario viene creato e pubblicato dalla libreria. Le risposte anonime non sono mai collegate alla persona; i segmenti sotto soglia non vengono mostrati.</div>
          </form>
        </div>
      )}
    </>
  );
}
