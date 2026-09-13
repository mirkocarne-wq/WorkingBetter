import Link from 'next/link';
import { ForgotForm } from './forgot-form';

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ tenant?: string }> }) {
  const sp = await searchParams;
  const tenant = sp.tenant ?? 'acme';
  return (
    <div className="login">
      <div className="card" style={{ width: 400, display: 'grid', gap: 12 }}>
        <div className="logo"><i /> WorkingBetter</div>
        <div style={{ fontWeight: 700 }}>Reimposta la password</div>
        <p className="sup" style={{ margin: 0 }}>Ti inviamo un link valido un’ora. Se l’indirizzo non è registrato non riceverai nulla.</p>
        <ForgotForm tenant={tenant} />
        <Link href={`/login?tenant=${encodeURIComponent(tenant)}`} className="sup">← Torna all’accesso</Link>
      </div>
    </div>
  );
}
