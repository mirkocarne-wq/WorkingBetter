import Link from 'next/link';
import { apiFetch, type CalendarFeed, type IntegrationsConfig, type IntegrationsOverview, type Me, type MfaStatus, type SecurityPolicy, type SsoConfig, type Tenant } from '@/lib/api';
import { IntegrationsCard } from './integrations-card';
import { MfaCard, SecurityPolicyForm } from './mfa-card';
import { BrandingForm } from './branding-form';
import { CalendarCard } from './calendar-card';
import { logoutEverywhere } from '@/lib/actions';
import { SsoForm } from './sso-form';
import { ChangePasswordForm } from './change-password-form';

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ mfa?: string; connected?: string; integration_error?: string }> }) {
  const sp = await searchParams;
  const me = await apiFetch<Me>('/me');
  const isAdmin = me.permissions.includes('tenant:settings');
  const sso = isAdmin ? await apiFetch<SsoConfig>('/tenant/sso') : null;
  const tenant = isAdmin ? await apiFetch<Tenant>('/tenant') : null;
  const feed = await apiFetch<CalendarFeed>('/calendar/feed').catch(() => null);
  const mfa = await apiFetch<MfaStatus>('/auth/mfa').catch(() => null);
  const security = isAdmin ? await apiFetch<SecurityPolicy>('/tenant/security').catch(() => null) : null;
  const integrations = await apiFetch<IntegrationsOverview>('/integrations').catch(() => null);
  const integrationsCfg = isAdmin ? await apiFetch<IntegrationsConfig>('/integrations/config').catch(() => null) : null;
  return (
    <>
      <div className="ph"><div><h1>Impostazioni</h1><p>{isAdmin ? 'Accesso, aspetto, integrazioni e calendario' : 'Il tuo account, le integrazioni e il tuo calendario'}</p></div><div className="actions">{me.permissions.includes('audit:read') && <Link href="/settings/audit" className="btn">Audit</Link>}{isAdmin && <Link href="/settings/design" className="btn">Guida di stile</Link>}{me.permissions.includes('roles:manage') && <Link href="/people/users" className="btn">Utenti e accessi</Link>}</div></div>
      <div className="grid" style={{ gridTemplateColumns: isAdmin ? '1.4fr 1fr' : '1fr', alignItems: 'start' }}>
        {isAdmin && sso && (
          <div className="card">
            <h3>SSO aziendale (OpenID Connect) <small>{sso.enabled ? 'attivo' : 'non attivo'}</small></h3>
            <p className="sup" style={{ marginTop: -6 }}>Funziona con Microsoft Entra ID, Google Workspace, Okta, Keycloak e qualunque provider OIDC. Registra un’applicazione “web” presso il provider con questo redirect URI: <code>{sso.redirectUri}</code></p>
            <SsoForm sso={sso} />
            {security && <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--grid)' }}><h3>Politiche di sicurezza</h3><SecurityPolicyForm roles={security.security.mfaRequiredRoles} /></div>}
          </div>
        )}
        <div className="stack">
          {(isAdmin || me.permissions.includes('people:write') || me.permissions.includes('roles:manage')) && (
            <div className="card">
              <h3>Personalizzazione <small>come la piattaforma parla e cosa mostra</small></h3>
              <div style={{ display: 'grid', gap: 6 }}>
                {isAdmin && <Link href="/settings/modules" className="btn ghost" style={{ justifyContent: 'space-between' }}><span><b>Moduli attivi</b><span className="sup" style={{ display: 'block' }}>Accendi solo i moduli che l’azienda usa</span></span><span aria-hidden>›</span></Link>}
                {isAdmin && <Link href="/settings/glossary" className="btn ghost" style={{ justifyContent: 'space-between' }}><span><b>Glossario aziendale</b><span className="sup" style={{ display: 'block' }}>Obiettivi, review, 1:1… con i nomi di casa vostra</span></span><span aria-hidden>›</span></Link>}
                {me.permissions.includes('roles:manage') && <Link href="/settings/roles" className="btn ghost" style={{ justifyContent: 'space-between' }}><span><b>Ruoli e permessi</b><span className="sup" style={{ display: 'block' }}>Permessi dei ruoli per modulo e ruoli custom</span></span><span aria-hidden>›</span></Link>}
                <Link href="/settings/person-fields" className="btn ghost" style={{ justifyContent: 'space-between' }}><span><b>Campi persona</b><span className="sup" style={{ display: 'block' }}>Attributi custom dell’anagrafica: contratto, sede legale, centro di costo…</span></span><span aria-hidden>›</span></Link>
              </div>
            </div>
          )}
          {isAdmin && tenant && (
            <div className="card">
              <h3>Aspetto <small>nome e colore dell’organizzazione</small></h3>
              <BrandingForm name={tenant.name} primaryColor={tenant.settings?.branding?.primaryColor ?? ''} logoDataUrl={tenant.settings?.branding?.logoDataUrl ?? null} />
            </div>
          )}
          {mfa && <MfaCard status={mfa} highlight={sp.mfa === 'required' || mfa.setupRequired} />}
          <div className="card">
            <h3>La mia password</h3>
            <ChangePasswordForm />
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--grid)' }}>
              <div className="sup" style={{ marginBottom: 6 }}>Hai usato un computer condiviso o hai perso un dispositivo? Invalida tutte le sessioni aperte, compresa questa.</div>
              <form action={logoutEverywhere}><button className="btn sm danger">Esci da tutti i dispositivi</button></form>
            </div>
          </div>
        </div>
        {integrations && <div style={{ gridColumn: isAdmin ? '1 / -1' : undefined }}><IntegrationsCard ov={integrations} cfg={integrationsCfg} isAdmin={isAdmin} connected={sp.connected} error={sp.integration_error} /></div>}
        {feed && <div style={{ gridColumn: isAdmin ? '1 / -1' : undefined }}><CalendarCard feed={feed} /></div>}
      </div>
    </>
  );
}
