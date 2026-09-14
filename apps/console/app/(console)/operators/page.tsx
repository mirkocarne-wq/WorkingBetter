import { apiFetch, fmtDate, type Operator } from '@/lib/api';
import { createOperator, operatorState } from '@/lib/actions';
import { ActionForm } from '@/components/action-form';

export default async function OperatorsPage() {
  const [ops, me] = await Promise.all([apiFetch<Operator[]>('/platform/operators'), apiFetch<Operator>('/platform/auth/me')]);
  return (
    <>
      <div className="ph"><div><h1>Operatori</h1><p>{ops.filter((o) => !o.disabledAt).length} attivi · tutti con lo stesso ruolo <code>platform_admin</code></p></div></div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <div className="card">
          <table><thead><tr><th>Operatore</th><th>Ultimo accesso</th><th>Stato</th><th></th></tr></thead>
            <tbody>{ops.map((o) => <tr key={o.id}><td><b>{o.firstName} {o.lastName}</b><div className="sup">{o.email}</div></td><td>{fmtDate(o.lastLoginAt)}</td><td>{o.disabledAt ? <span className="pill c">disattivato</span> : o.lockedUntil && new Date(o.lockedUntil) > new Date() ? <span className="pill w">bloccato</span> : <span className="pill g">attivo</span>}</td><td>{o.id !== me.id && <form action={operatorState.bind(null, o.id, !o.disabledAt)}><button className="btn sm">{o.disabledAt ? 'Riattiva' : 'Disattiva'}</button></form>}</td></tr>)}</tbody></table>
        </div>
        <div className="card">
          <h3>Nuovo operatore</h3>
          <ActionForm action={createOperator} style={{ display: 'grid', gap: 8 }}>
            <input name="email" type="email" required placeholder="email" className="input" />
            <div style={{ display: 'flex', gap: 8 }}><input name="firstName" required placeholder="Nome" className="input" /><input name="lastName" placeholder="Cognome" className="input" /></div>
            <input name="password" type="password" required minLength={10} placeholder="Password iniziale (min 10, da cambiare al primo accesso)" className="input" autoComplete="new-password" />
            <div><button className="btn p">Crea operatore</button></div>
          </ActionForm>
          <div className="sup" style={{ marginTop: 8 }}>Comunica la password iniziale su un canale sicuro. L’operatore la cambia al primo accesso; ogni accesso e ogni azione sono registrati.</div>
        </div>
      </div>
    </>
  );
}
