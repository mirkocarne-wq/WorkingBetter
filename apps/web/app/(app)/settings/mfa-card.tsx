'use client';
import { useActionState } from 'react';
import { mfaAction, saveSecurityPolicy } from '@/lib/actions';
import type { MfaStatus } from '@/lib/api';

const ROLES: [string, string][] = [['tenant_admin', 'Amministratori'], ['hr_admin', 'HR admin'], ['hrbp', 'HRBP'], ['manager', 'Manager'], ['employee', 'Collaboratori']];

/** Verifica in due passaggi (TOTP) dell'utente: attivazione con QR, codici di recupero, disattivazione. */
export function MfaCard({ status, highlight }: { status: MfaStatus; highlight?: boolean }) {
  const [state, action, pending] = useActionState(mfaAction, undefined);
  const enabled = state?.done === 'enabled' ? true : state?.done === 'disabled' ? false : status.enabled;
  return (
    <div className="card" style={highlight ? { borderColor: 'var(--warn)' } : undefined}>
      <h3>Verifica in due passaggi <small>{enabled ? 'attiva' : status.requiredForRole ? 'richiesta per il tuo ruolo' : 'non attiva'}</small></h3>
      {!status.available && <div className="error">La cifratura non è configurata sul server (NOTES_MASTER_KEY): l’MFA non è disponibile.</div>}
      {status.setupRequired && !enabled && <div className="suggest" style={{ marginBottom: 10 }}>L’organizzazione richiede la verifica in due passaggi per il tuo ruolo: attivala ora.</div>}
      {state?.recoveryCodes && (
        <div className="suggest" style={{ marginBottom: 10 }}>
          <b>Codici di recupero</b> — salvali ora, non verranno più mostrati. Ognuno vale una volta.
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 6, fontFamily: 'monospace' }}>{state.recoveryCodes.map((c) => <code key={c}>{c}</code>)}</div>
        </div>
      )}
      {!enabled && !state?.secret && (
        <form action={action} className="stack" style={{ gap: 8 }}>
          <input type="hidden" name="op" value="enroll" />
          <div className="sup">Con un’app di autenticazione (Google Authenticator, Microsoft Authenticator, 1Password, Authy…) ti verrà chiesto un codice a 6 cifre a ogni accesso con password. L’accesso SSO usa l’MFA del provider aziendale.</div>
          <div><button className="btn p" disabled={pending || !status.available}>{pending ? 'Preparazione…' : 'Attiva'}</button></div>
        </form>
      )}
      {!enabled && state?.secret && (
        <form action={action} className="stack" style={{ gap: 10 }}>
          <input type="hidden" name="op" value="confirm" />
          <div className="grid" style={{ gridTemplateColumns: '200px 1fr', alignItems: 'start' }}>
            <div dangerouslySetInnerHTML={{ __html: state.qrSvg ?? '' }} style={{ background: '#fff', padding: 6, borderRadius: 8, border: '1px solid var(--grid)' }} />
            <div className="stack" style={{ gap: 6 }}>
              <div style={{ fontSize: 13 }}>1. Inquadra il QR con l’app di autenticazione, oppure inserisci la chiave a mano:</div>
              <code style={{ wordBreak: 'break-all' }}>{state.secret}</code>
              <div style={{ fontSize: 13 }}>2. Inserisci il codice mostrato dall’app per confermare.</div>
              <input name="code" inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={8} placeholder="123 456" className="input" style={{ width: 160 }} />
            </div>
          </div>
          {state?.error && <div className="error">{state.error}</div>}
          <div><button className="btn p" disabled={pending}>{pending ? 'Verifica…' : 'Conferma e attiva'}</button></div>
        </form>
      )}
      {enabled && (
        <div className="stack" style={{ gap: 10 }}>
          <div className="sup">Attiva dal {status.enabledAt ? new Date(status.enabledAt).toLocaleDateString('it-IT') : 'ora'} · codici di recupero rimasti: {state?.recoveryCodes ? state.recoveryCodes.length : status.recoveryCodesLeft}</div>
          <form action={action} className="row"><input type="hidden" name="op" value="regenerate" /><input name="code" inputMode="numeric" placeholder="Codice dell’app" required minLength={6} maxLength={8} className="input" style={{ width: 160 }} /><button className="btn sm" disabled={pending}>Nuovi codici di recupero</button></form>
          <form action={action} className="row"><input type="hidden" name="op" value="disable" /><input name="password" type="password" placeholder="Password attuale" autoComplete="current-password" className="input" style={{ width: 200 }} /><input name="code" inputMode="numeric" placeholder="o codice (SSO)" className="input" style={{ width: 130 }} /><button className="btn sm danger" disabled={pending}>Disattiva</button></form>
          {state?.error && <div className="error">{state.error}</div>}
        </div>
      )}
    </div>
  );
}

export function SecurityPolicyForm({ roles }: { roles: string[] }) {
  const [state, action, pending] = useActionState(saveSecurityPolicy, undefined);
  return (
    <form action={action} className="stack" style={{ gap: 8 }}>
      <div className="field"><span className="lab">Verifica in due passaggi obbligatoria per</span>{ROLES.map(([v, l]) => <label key={v} className="check"><input type="checkbox" name="mfaRequiredRoles" value={v} defaultChecked={roles.includes(v)} /> <span>{l}</span></label>)}<span className="help">Chi ha uno di questi ruoli e accede con password vede l’avviso finché non attiva l’MFA. L’accesso SSO è escluso: l’MFA la applica il provider.</span></div>
      {state?.error && <div className="error">{state.error}</div>}
      {state?.saved && <div className="suggest">Politica salvata.</div>}
      <div><button className="btn p" disabled={pending}>{pending ? 'Salvataggio…' : 'Salva'}</button></div>
    </form>
  );
}
