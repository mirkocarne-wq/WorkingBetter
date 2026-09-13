'use client';
import { useActionState } from 'react';
import { passwordLogin } from '@/lib/actions';

export function LoginForm({ tenant, next }: { tenant: string; next?: string }) {
  const [state, action, pending] = useActionState(passwordLogin, undefined);
  return (
    <form action={action} style={{ display: 'grid', gap: 10 }}>
      <input type="hidden" name="tenantSlug" value={tenant} />
      <input type="hidden" name="next" value={next ?? ''} />
      <label>Email<br /><input name="email" type="email" autoComplete="username" required style={{ width: '100%' }} /></label>
      <label>Password<br /><input name="password" type="password" autoComplete="current-password" required style={{ width: '100%' }} /></label>
      {state?.error && <div className="error">{state.error}</div>}
      <button className="btn p" disabled={pending} style={{ justifyContent: 'center' }}>{pending ? 'Accesso…' : 'Entra'}</button>
    </form>
  );
}
