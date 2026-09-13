import Link from 'next/link';
import { apiFetch, fmtDate, type FormDefinitionSummary, type FormResponseSummary, type Me } from '@/lib/api';
import { startFormResponse } from '@/lib/actions';

export default async function FormsPage() {
  const me = await apiFetch<Me>('/me');
  const canManage = me.permissions.includes('forms:manage');
  const [forms, mine] = await Promise.all([apiFetch<FormDefinitionSummary[]>('/forms?latest=true'), apiFetch<FormResponseSummary[]>('/form-responses?mine=true')]);
  const published = forms.filter((f) => f.status === 'published');
  return (
    <>
      <div className="ph"><div><h1>Form</h1><p>{mine.filter((r) => r.status === 'draft').length} da compilare · {mine.filter((r) => r.status === 'submitted').length} inviati</p></div></div>
      <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', alignItems: 'start' }}>
        <div className="card">
          <h3>Le mie compilazioni</h3>
          {mine.length === 0 ? <div className="empty">Nulla da compilare.</div> : (
            <table><thead><tr><th>Form</th><th>Stato</th><th>Scadenza</th><th>Punteggio</th><th></th></tr></thead>
              <tbody>{mine.map((r) => <tr key={r.id}><td>{r.form?.name ?? '—'}</td><td><span className={`pill ${r.status === 'submitted' ? 'g' : 'w'}`}>{r.status === 'submitted' ? 'inviato' : 'bozza'}</span></td><td>{fmtDate(r.dueDate)}</td><td>{r.score == null ? '—' : `${Math.round(r.score * 100)}%`}</td><td><Link href={`/forms/responses/${r.id}`} className="btn sm">{r.status === 'submitted' ? 'Vedi' : 'Compila'}</Link></td></tr>)}</tbody></table>
          )}
        </div>
        <div className="card">
          <h3>Form disponibili <small>{canManage ? 'tutte le versioni correnti' : 'pubblicati'}</small></h3>
          {(canManage ? forms : published).map((f) => (
            <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--grid)' }}>
              <div><div style={{ fontWeight: 600 }}>{f.name}</div><div style={{ fontSize: 12, color: 'var(--muted)' }}>{f.kind} · v{f.version} · {f.sections} sezioni · {f.fields} campi · <span className={`pill ${f.status === 'published' ? 'g' : 'n'}`}>{f.status}</span></div></div>
              {f.status === 'published' && f.kind === 'request' && <form action={startFormResponse.bind(null, f.key)}><button className="btn sm">Compila</button></form>}
            </div>
          ))}
          {canManage && <div className="suggest" style={{ marginTop: 12 }}>Le definizioni si creano via API (<code>POST /api/v1/forms</code>) con lo schema dichiarativo; l&apos;editor visuale arriva con l&apos;App Studio.</div>}
        </div>
      </div>
    </>
  );
}
