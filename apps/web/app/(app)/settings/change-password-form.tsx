'use client';
import { useActionState } from 'react';
import { changePassword } from '@/lib/actions';

const input = { width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, font: 'inherit', background: '#fff' } as const;

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);
  return (
    <form action={action} style={{ display: 'grid', gap: 10 }}>
      <label>Password attuale <span className="sup">(vuota se non ne hai mai impostata una)</span><input name="currentPassword" type="password" autoComplete="current-password" style={input} /></label>
      <label>Nuova password<input name="newPassword" type="password" autoComplete="new-password" minLength={10} required style={input} /></label>
      <label>Conferma<input name="confirm" type="password" autoComplete="new-password" required style={input} /></label>
      {state?.error && <div className="error">{state.error}</div>}
      {state?.done && <div className="suggest">Password aggiornata.</div>}
      <div><button className="btn" disabled={pending}>{pending ? 'Salvataggio…' : 'Cambia password'}</button></div>
    </form>
  );
}
