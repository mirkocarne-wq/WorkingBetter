'use client';
import { useActionState } from 'react';
import { saveSso } from '@/lib/actions';
import type { SsoConfig } from '@/lib/api';


export function SsoForm({ sso }: { sso: SsoConfig }) {
  const [state, action, pending] = useActionState(saveSso, undefined);
  return (
    <form action={action} style={{ display: 'grid', gap: 10 }}>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" name="enabled" defaultChecked={sso.enabled} /> Abilita l’accesso SSO per questa organizzazione</label>
      <label>Issuer (URL del provider)<input name="issuer" defaultValue={sso.issuer} placeholder="https://login.microsoftonline.com/<tenant>/v2.0 · http://localhost:8080/realms/workingbetter" className="input" /></label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label>Client ID<input name="clientId" defaultValue={sso.clientId} className="input" /></label>
        <label>Client secret {sso.hasClientSecret && <span className="sup">(già salvato, cifrato)</span>}<input name="clientSecret" type="password" autoComplete="off" placeholder={sso.hasClientSecret ? 'lascia vuoto per non cambiarlo' : 'facoltativo con PKCE'} className="input" /></label>
      </div>
      {sso.hasClientSecret && <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" name="clearSecret" /> Rimuovi il client secret salvato</label>}
      <label>Domini email ammessi <span className="sup">(separati da virgola; vuoto = tutti)</span><input name="allowedDomains" defaultValue={sso.allowedDomains.join(', ')} placeholder="acme.it, acme.com" className="input" /></label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" name="jitProvisioning" defaultChecked={sso.jitProvisioning} /> Crea automaticamente le persone al primo accesso</label>
        <label>Ruolo di default<select name="defaultRole" defaultValue={sso.defaultRole} className="input"><option value="employee">Collaboratore</option><option value="manager">Manager</option><option value="observer">Osservatore</option></select></label>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" name="passwordDisabled" defaultChecked={!!sso.passwordDisabled} /> Disabilita l’accesso con password (gli amministratori possono sempre entrare con la password)</label>
      {state?.error && <div className="error">{state.error}</div>}
      {state?.saved && <div className="suggest">Impostazioni salvate. Prova l’accesso da una finestra in incognito prima di disabilitare le password.</div>}
      <div><button className="btn p" disabled={pending}>{pending ? 'Salvataggio…' : 'Salva'}</button></div>
    </form>
  );
}
