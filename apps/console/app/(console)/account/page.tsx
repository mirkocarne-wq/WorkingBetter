import { apiFetch, fmtDate, type Operator } from '@/lib/api';
import { changePassword } from '@/lib/actions';
import { ActionForm } from '@/components/action-form';

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ first?: string }> }) {
  const sp = await searchParams;
  const me = await apiFetch<Operator>('/platform/auth/me');
  return (
    <>
      <div className="ph"><div><h1>Il mio account</h1><p>{me.email} · ultimo accesso {fmtDate(me.lastLoginAt)}</p></div></div>
      <div className="card" style={{ maxWidth: 520 }}>
        <h3>Cambia password</h3>
        {(sp.first || me.mustChangePassword) && <div className="suggest" style={{ marginBottom: 10 }}>Stai usando la password iniziale: scegline una tua (almeno 10 caratteri, diversa dall’email).</div>}
        <ActionForm action={changePassword} style={{ display: 'grid', gap: 8 }}>
          <label>Password attuale<input name="currentPassword" type="password" required autoComplete="current-password" className="input" /></label>
          <label>Nuova password<input name="newPassword" type="password" required minLength={10} autoComplete="new-password" className="input" /></label>
          <label>Conferma<input name="confirm" type="password" required minLength={10} autoComplete="new-password" className="input" /></label>
          <div><button className="btn p">Aggiorna</button></div>
        </ActionForm>
        <div className="sup" style={{ marginTop: 8 }}>Il cambio password chiude le altre sessioni aperte con il tuo account.</div>
      </div>
    </>
  );
}
