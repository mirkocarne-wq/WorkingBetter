'use client';
import { useActionState } from 'react';
import { login } from '@/lib/actions';

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <form action={action} style={{ display: 'grid', gap: 10 }}>
      <label>Email<br /><input name="email" type="email" autoComplete="username" required className="input" style={{ width: '100%' }} /></label>
      <label>Password<br /><input name="password" type="password" autoComplete="current-password" required className="input" style={{ width: '100%' }} /></label>
      {state?.error && <div className="error">{state.error}</div>}
      <button className="btn p" disabled={pending} style={{ justifyContent: 'center' }}>{pending ? 'Accesso…' : 'Entra'}</button>
    </form>
  );
}
