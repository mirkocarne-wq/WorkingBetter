'use client';
import { useActionState, useState } from 'react';
import { inviteUser } from '@/lib/actions';

const DEFAULT_ROLES: [string, string][] = [['employee', 'Collaboratore'], ['manager', 'Manager'], ['hrbp', 'HRBP'], ['hr_admin', 'HR admin'], ['analyst', 'Analista'], ['observer', 'Osservatore'], ['tenant_admin', 'Amministratore']];

export function InviteForm({ people, managers, units, roles }: { people: { id: string; name: string; email: string | null }[]; managers: { id: string; name: string }[]; units: { id: string; name: string }[]; roles?: [string, string][] }) {
  const ROLES = roles?.length ? roles : DEFAULT_ROLES;
  const [state, action, pending] = useActionState(inviteUser, undefined);
  const [mode, setMode] = useState<'existing' | 'new'>(people.length ? 'existing' : 'new');
  const [personId, setPersonId] = useState(people[0]?.id ?? '');
  const selected = people.find((p) => p.id === personId);
  return (
    <form action={action} style={{ display: 'grid', gap: 8 }}>
      <div className="seg" style={{ justifySelf: 'start' }}>
        <a onClick={() => setMode('existing')} className={mode === 'existing' ? 'on' : ''} style={{ cursor: 'pointer' }}>Persona esistente</a>
        <a onClick={() => setMode('new')} className={mode === 'new' ? 'on' : ''} style={{ cursor: 'pointer' }}>Nuova persona</a>
      </div>
      {mode === 'existing' ? (
        <>
          <label>Persona<select name="personId" value={personId} onChange={(e) => setPersonId(e.target.value)} className="input">{people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.email ? ` · ${p.email}` : ''}</option>)}</select></label>
          <label>Email di accesso<input name="email" type="email" required key={personId} defaultValue={selected?.email ?? ''} className="input" /></label>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8 }}><label style={{ flex: 1 }}>Nome<input name="firstName" required className="input" /></label><label style={{ flex: 1 }}>Cognome<input name="lastName" required className="input" /></label></div>
          <label>Email<input name="email" type="email" required className="input" /></label>
          <label>Ruolo aziendale<input name="jobTitle" placeholder="es. Account manager" className="input" /></label>
          <div style={{ display: 'flex', gap: 8 }}>
            <label style={{ flex: 1 }}>Manager<select name="managerId" defaultValue="" className="input"><option value="">—</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
            <label style={{ flex: 1 }}>Unità<select name="orgUnitId" defaultValue="" className="input"><option value="">—</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
          </div>
        </>
      )}
      <div>
        <div style={{ fontSize: 12, color: 'var(--ink2)', marginBottom: 4 }}>Ruoli applicativi</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{ROLES.map(([v, l]) => <label key={v} style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 13 }}><input type="checkbox" name="roles" value={v} defaultChecked={v === 'employee'} />{l}</label>)}</div>
      </div>
      {state?.error && <div className="error">{state.error}</div>}
      {state?.inviteUrl !== undefined && !state.error && (
        <div className="suggest">Invito inviato a <b>{state.email}</b>.{state.inviteUrl && <> Link (mostrato solo in sviluppo): <code style={{ wordBreak: 'break-all' }}>{state.inviteUrl}</code></>}</div>
      )}
      <div><button className="btn p" disabled={pending}>{pending ? 'Invio…' : 'Invia invito'}</button></div>
    </form>
  );
}
