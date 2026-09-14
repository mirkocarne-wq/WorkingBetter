'use client';
import { useActionState } from 'react';

type Action = (prev: { error?: string } | undefined, form: FormData) => Promise<{ error?: string }>;

/** Form riusabile "password + conferma" con un token nascosto (reset, accettazione invito). */
export function PasswordForm({ action, token, submitLabel, optional = false, extra }: { action: Action; token: string; submitLabel: string; optional?: boolean; extra?: React.ReactNode }) {
  const [state, run, pending] = useActionState(action, undefined);
  return (
    <form action={run} style={{ display: 'grid', gap: 10 }}>
      <input type="hidden" name="token" value={token} />
      {extra}
      <label>{optional ? 'Password (facoltativa)' : 'Password'}<br /><input name="password" type="password" autoComplete="new-password" minLength={optional ? undefined : 10} required={!optional} style={{ width: '100%' }} /></label>
      <label>Conferma password<br /><input name="confirm" type="password" autoComplete="new-password" required={!optional} style={{ width: '100%' }} /></label>
      <div className="sup">Almeno 10 caratteri. Consiglio: una frase facile da ricordare.</div>
      {state?.error && <div className="error">{state.error}</div>}
      <button className="btn p" disabled={pending} style={{ justifyContent: 'center' }}>{pending ? 'Un attimo…' : submitLabel}</button>
    </form>
  );
}
