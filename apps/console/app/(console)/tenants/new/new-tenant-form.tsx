'use client';
import Link from 'next/link';
import { useActionState } from 'react';
import { createTenant, type ActionState } from '@/lib/actions';

type State = (ActionState & { inviteUrl?: string }) | undefined;

export function NewTenantForm() {
  const [state, action, pending] = useActionState<State, FormData>(createTenant as (prev: State, form: FormData) => Promise<State>, undefined);
  if (state?.ok) {
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div className="suggest">{state.message}</div>
        <div><b>Link d’invito</b> (valido fino al {state.expiresAt ? new Date(state.expiresAt).toLocaleString('it-IT') : '—'}): copialo ora, non verrà mostrato di nuovo.</div>
        <code style={{ wordBreak: 'break-all', fontSize: 12, padding: 8, background: '#f3f5f8', borderRadius: 6 }}>{state.inviteUrl}</code>
        <div style={{ display: 'flex', gap: 8 }}>{state.link && <Link href={state.link} className="btn p">Apri il tenant</Link>}<Link href="/tenants/new" className="btn">Crea un altro</Link></div>
      </div>
    );
  }
  return (
    <form action={action} style={{ display: 'grid', gap: 10 }}>
      <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 10 }}>
        <label>Nome dell’organizzazione<input name="name" required minLength={2} maxLength={120} placeholder="Acme S.p.A." className="input" /></label>
        <label>Slug <span className="sup">(minuscole, cifre, trattini; è l’identificativo di accesso: <code>/login?tenant=slug</code>)</span><input name="slug" required pattern="[a-z0-9][a-z0-9-]{1,40}" placeholder="acme" className="input" /></label>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ flex: 1 }}>Fuso orario<input name="timezone" defaultValue="Europe/Rome" className="input" /></label>
          <label style={{ flex: 1 }}>Lingua<select name="defaultLocale" defaultValue="it" className="input"><option value="it">Italiano</option><option value="en">English</option></select></label>
        </div>
        <div className="lvl" style={{ marginTop: 6 }}>Primo amministratore</div>
        <label>Email<input name="adminEmail" type="email" required className="input" /></label>
        <div style={{ display: 'flex', gap: 8 }}>
          <label style={{ flex: 1 }}>Nome<input name="adminFirstName" required className="input" /></label>
          <label style={{ flex: 1 }}>Cognome<input name="adminLastName" className="input" /></label>
        </div>
        {state?.error && <div className="error">{state.error}</div>}
        <div><button className="btn p">{pending ? 'Creazione…' : 'Crea tenant e invita'}</button></div>
      </fieldset>
    </form>
  );
}
