import Link from 'next/link';
import { API_URL, publicFetch, type AuthConfig } from '@/lib/api';
import { LoginForm } from './login-form';

/** Pagina di accesso: password, SSO aziendale e (in sviluppo) accesso rapido senza password. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ tenant?: string; error?: string; next?: string; sso?: string }> }) {
  const sp = await searchParams;
  const tenant = sp.tenant ?? process.env.NEXT_PUBLIC_DEFAULT_TENANT ?? 'acme';
  let cfg: AuthConfig = { found: false, tenant: null, password: true, sso: false, devLogin: false };
  try { cfg = await publicFetch<AuthConfig>(`/auth/config?tenant=${encodeURIComponent(tenant)}`); } catch { /* API non raggiungibile: il form resta utilizzabile */ }
  const ssoUrl = `${API_URL}/api/v1/auth/oidc/start?tenant=${encodeURIComponent(tenant)}${sp.next ? `&redirectTo=${encodeURIComponent(sp.next)}` : ''}`;
  return (
    <div className="login">
      <div className="card" style={{ width: 400, display: 'grid', gap: 14 }}>
        <div className="logo"><i /> WorkingBetter</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{cfg.tenant ? cfg.tenant.name : 'Accedi'}</div>
          <div className="sup">Organizzazione: <b>{tenant}</b> · <Link href="/login?tenant=" style={{ color: 'var(--brand-2)' }}>cambia</Link></div>
        </div>
        {sp.error && <div className="error">{sp.error}</div>}
        {cfg.sso && <a href={ssoUrl} className="btn p" style={{ justifyContent: 'center' }}>Accedi con SSO aziendale</a>}
        {cfg.sso && cfg.password && <div className="sup" style={{ textAlign: 'center' }}>oppure con email e password</div>}
        {(cfg.password || !cfg.found) && <LoginForm tenant={tenant} next={sp.next} />}
        {!cfg.password && cfg.found && !cfg.sso && <div className="error">Nessun metodo di accesso disponibile: contatta l’amministratore.</div>}
        <div className="sup" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Link href={`/forgot-password?tenant=${encodeURIComponent(tenant)}`}>Password dimenticata?</Link>
          {cfg.devLogin && <Link href={`/login/dev?tenant=${encodeURIComponent(tenant)}`}>Accesso rapido di sviluppo</Link>}
        </div>
      </div>
    </div>
  );
}
