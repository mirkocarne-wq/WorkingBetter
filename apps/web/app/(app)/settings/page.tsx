import Link from 'next/link';
import { apiFetch, type Me, type SsoConfig, type Tenant } from '@/lib/api';
import { BrandingForm } from './branding-form';
import { SsoForm } from './sso-form';
import { ChangePasswordForm } from './change-password-form';

export default async function SettingsPage() {
  const me = await apiFetch<Me>('/me');
  const isAdmin = me.permissions.includes('tenant:settings');
  const sso = isAdmin ? await apiFetch<SsoConfig>('/tenant/sso') : null;
  const tenant = isAdmin ? await apiFetch<Tenant>('/tenant') : null;
  return (
    <>
      <div className="ph"><div><h1>Impostazioni</h1><p>{isAdmin ? 'Accesso e sicurezza dell’organizzazione' : 'Il tuo account'}</p></div><div className="actions">{isAdmin && <Link href="/settings/design" className="btn">Guida di stile</Link>}{me.permissions.includes('roles:manage') && <Link href="/people/users" className="btn">Utenti e accessi</Link>}</div></div>
      <div className="grid" style={{ gridTemplateColumns: isAdmin ? '1.4fr 1fr' : '1fr', alignItems: 'start' }}>
        {isAdmin && sso && (
          <div className="card">
            <h3>SSO aziendale (OpenID Connect) <small>{sso.enabled ? 'attivo' : 'non attivo'}</small></h3>
            <p className="sup" style={{ marginTop: -6 }}>Funziona con Microsoft Entra ID, Google Workspace, Okta, Keycloak e qualunque provider OIDC. Registra un’applicazione “web” presso il provider con questo redirect URI: <code>{sso.redirectUri}</code></p>
            <SsoForm sso={sso} />
          </div>
        )}
        <div className="stack">
          {isAdmin && tenant && (
            <div className="card">
              <h3>Aspetto <small>nome e colore dell’organizzazione</small></h3>
              <BrandingForm name={tenant.name} primaryColor={tenant.settings?.branding?.primaryColor ?? ''} />
            </div>
          )}
          <div className="card">
            <h3>La mia password</h3>
            <ChangePasswordForm />
          </div>
        </div>
      </div>
    </>
  );
}
