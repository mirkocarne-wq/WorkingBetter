'use client';
import { useActionState } from 'react';
import { forgotPassword } from '@/lib/actions';

export function ForgotForm({ tenant }: { tenant: string }) {
  const [state, action, pending] = useActionState(forgotPassword, undefined);
  if (state?.done) return <div className="suggest">Se l’indirizzo è registrato, il link di reset è in arrivo nella tua casella.</div>;
  return (
    <form action={action} style={{ display: 'grid', gap: 10 }}>
      <input type="hidden" name="tenantSlug" value={tenant} />
      <label>Email<br /><input name="email" type="email" required style={{ width: '100%' }} /></label>
      {state?.error && <div className="error">{state.error}</div>}
      <button className="btn p" disabled={pending} style={{ justifyContent: 'center' }}>{pending ? 'Invio…' : 'Invia il link'}</button>
    </form>
  );
}
