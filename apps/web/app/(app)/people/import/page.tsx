'use client';
import { useActionState } from 'react';
import { importPeople } from '@/lib/actions';

export default function ImportPage() {
  const [state, action, pending] = useActionState(importPeople, {});
  const r = state?.report;
  return (
    <>
      <div className="ph"><div><h1>Import persone da CSV</h1><p>Colonne: first_name, last_name, email (obbligatorie), employee_number, job_title, job_level, location, hire_date, org_unit, manager_email, status. Separatore virgola o punto e virgola.</p></div><a className="btn" href={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/v1/people/import/template`} target="_blank">Scarica template</a></div>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1.4fr', alignItems: 'start' }}>
        <form action={action} className="card" style={{ display: 'grid', gap: 10 }}>
          <label>File CSV<br /><input type="file" name="file" accept=".csv,text/csv" /></label>
          <label>…oppure incolla il contenuto<br /><textarea name="csv" rows={8} defaultValue={state?.csv ?? ''} style={{ width: '100%', border: '1px solid var(--line)', borderRadius: 8, padding: 8, font: '12px/1.4 ui-monospace, monospace' }} /></label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" name="createOrgUnits" /> Crea le unità organizzative mancanti</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" disabled={pending} name="confirm" value="false">Anteprima (nessuna scrittura)</button>
            <button className="btn p" disabled={pending || !r || r.valid === 0} name="confirm" value="true">Importa {r ? `${r.valid} righe valide` : ''}</button>
          </div>
          {state?.error && <div className="error">{state.error}</div>}
        </form>
        <div className="card">
          {!r ? <div className="empty">L&apos;anteprima mostrerà righe, azioni previste ed errori.</div> : (
            <>
              <h3>{r.dryRun ? 'Anteprima' : 'Import eseguito'} <small>{r.totalRows} righe · {r.valid} valide · {r.invalid} con errori{!r.dryRun ? ` · ${r.created} create · ${r.updated} aggiornate · ${r.orgUnitsCreated} unità create` : ''}</small></h3>
              {r.unknownColumns.length > 0 && <div className="suggest" style={{ marginBottom: 10 }}>Colonne ignorate: {r.unknownColumns.join(', ')}</div>}
              {r.errors.length > 0 && (
                <table style={{ marginBottom: 14 }}><thead><tr><th>Riga</th><th>Campo</th><th>Errore</th></tr></thead><tbody>{r.errors.slice(0, 100).map((e, i) => <tr key={i}><td>{e.row}</td><td>{e.field}</td><td style={{ color: 'var(--crit-text)' }}>{e.message}</td></tr>)}</tbody></table>
              )}
              <table><thead><tr><th>Riga</th><th>Azione</th><th>Nome</th><th>Email</th><th>Ruolo</th><th>Unità</th><th>Manager</th></tr></thead>
                <tbody>{r.preview.map((p) => <tr key={p.row}><td>{p.row}</td><td><span className={`pill ${p.action === 'create' ? 'g' : p.action === 'update' ? 'b' : 'c'}`}>{p.action === 'create' ? 'crea' : p.action === 'update' ? 'aggiorna' : 'errore'}</span></td><td>{p.values.first_name} {p.values.last_name}</td><td>{p.values.email}</td><td>{p.values.job_title}</td><td>{p.values.org_unit}</td><td>{p.values.manager_email}</td></tr>)}</tbody></table>
            </>
          )}
        </div>
      </div>
    </>
  );
}
