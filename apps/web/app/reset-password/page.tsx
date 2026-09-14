import Link from 'next/link';
import { PasswordForm } from '@/components/password-form';
import { resetPassword } from '@/lib/actions';

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="login">
      <div className="card" style={{ width: 400, display: 'grid', gap: 12 }}>
        <div className="logo"><i /> WorkingBetter</div>
        <div style={{ fontWeight: 700 }}>Scegli una nuova password</div>
        {!sp.token ? <div className="error">Link incompleto: usa quello ricevuto via email.</div> : <PasswordForm action={resetPassword} token={sp.token} submitLabel="Salva e accedi" />}
        <Link href="/login" className="sup">← Torna all’accesso</Link>
      </div>
    </div>
  );
}
