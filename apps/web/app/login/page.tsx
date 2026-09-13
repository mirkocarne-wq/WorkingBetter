'use client';
import { useActionState } from 'react';
import { devLogin } from '@/lib/actions';

export default function LoginPage() {
  const [state, action, pending] = useActionState(devLogin, undefined);
  return (
    <div className="login">
      <form action={action} className="card">
        <div className="logo"><i /> WorkingBetter</div>
        <p style={{ margin: 0, color: 'var(--ink2)' }}>Accesso di sviluppo (senza password). In produzione l&apos;accesso avviene tramite SSO aziendale.</p>
        <label>Tenant<br /><input name="tenantSlug" defaultValue="acme" required style={{ width: '100%' }} /></label>
        <label>Email<br /><input name="email" type="email" defaultValue="giulia.ferri@acme.test" required style={{ width: '100%' }} /></label>
        {state?.error && <div className="error">{state.error}</div>}
        <button className="btn p" disabled={pending}>{pending ? 'Accesso…' : 'Entra'}</button>
      </form>
    </div>
  );
}
