'use client';
import { useActionState } from 'react';
import { devLogin } from '@/lib/actions';

export function DevLoginForm({ tenant }: { tenant: string }) {
  const [state, action, pending] = useActionState(devLogin, undefined);
  return (
    <form action={action} style={{ display: 'grid', gap: 10 }}>
      <label>Tenant<br /><input name="tenantSlug" defaultValue={tenant} required style={{ width: '100%' }} /></label>
      <label>Email<br /><input name="email" type="email" defaultValue="giulia.ferri@acme.test" required style={{ width: '100%' }} /></label>
      {state?.error && <div className="error">{state.error}</div>}
      <button className="btn p" disabled={pending} style={{ justifyContent: 'center' }}>{pending ? 'Accesso…' : 'Entra'}</button>
    </form>
  );
}
