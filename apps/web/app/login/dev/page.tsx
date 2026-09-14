import Link from 'next/link';
import { redirect } from 'next/navigation';
import { publicFetch, type AuthConfig } from '@/lib/api';
import { DevLoginForm } from './dev-login-form';

/** Accesso rapido di sviluppo (senza password): disponibile solo se l'API gira con AUTH_MODE=dev. */
export default async function DevLoginPage({ searchParams }: { searchParams: Promise<{ tenant?: string }> }) {
  const sp = await searchParams;
  const tenant = sp.tenant ?? 'acme';
  const cfg = await publicFetch<AuthConfig>(`/auth/config?tenant=${encodeURIComponent(tenant)}`).catch(() => null);
  if (!cfg?.devLogin) redirect('/login');
  return (
    <div className="login">
      <div className="card" style={{ width: 400, display: 'grid', gap: 12 }}>
        <div className="logo"><i /> WorkingBetter</div>
        <p style={{ margin: 0, color: 'var(--ink2)' }}>Accesso di sviluppo senza password. Utenti demo: giulia.ferri, chiara.moretti, luca.bianchi, anna.colombo (@acme.test).</p>
        <DevLoginForm tenant={tenant} />
        <Link href={`/login?tenant=${encodeURIComponent(tenant)}`} className="sup">← Accesso normale</Link>
      </div>
    </div>
  );
}
