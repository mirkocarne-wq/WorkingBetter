'use client';
import { useActionState } from 'react';
import { mfaLogin, passwordLogin } from '@/lib/actions';

export function LoginForm({ tenant, next }: { tenant: string; next?: string }) {
  const [state, action, pending] = useActionState(passwordLogin, undefined);
  const [mfaState, mfaAction, mfaPending] = useActionState(mfaLogin, undefined);
  if (state?.challenge) {
    return (
      <form action={mfaAction} style={{ display: 'grid', gap: 10 }}>
        <input type="hidden" name="challenge" value={state.challenge} />
        <input type="hidden" name="next" value={next ?? ''} />
        <div className="suggest">Verifica in due passaggi: inserisci il codice dell’app di autenticazione oppure un codice di recupero.</div>
        <label>Codice<br /><input name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required minLength={6} maxLength={20} placeholder="123 456" style={{ width: '100%' }} /></label>
        {mfaState?.error && <div className="error">{mfaState.error}</div>}
        <button className="btn p" disabled={mfaPending} style={{ justifyContent: 'center' }}>{mfaPending ? 'Verifica…' : 'Conferma'}</button>
      </form>
    );
  }
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
