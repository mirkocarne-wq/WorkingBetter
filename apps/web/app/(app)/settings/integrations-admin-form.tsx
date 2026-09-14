'use client';
import { useActionState } from 'react';
import { saveIntegrationsConfig } from '@/lib/actions';
import type { IntegrationsConfig } from '@/lib/api';

function Secret({ name, has, label }: { name: string; has: boolean; label: string }) {
  return (
    <label className="field">
      <span className="lab">{label} {has && <span className="pill g" style={{ marginLeft: 6 }}>impostato</span>}</span>
      <div className="row">
        <input name={name} type="password" autoComplete="new-password" placeholder={has ? 'lascia vuoto per non cambiarlo' : 'segreto dell’app'} className="input" style={{ flex: 1 }} />
        {has && <label className="check"><input type="checkbox" name={`${name}Clear`} /> <span className="sup">rimuovi</span></label>}
      </div>
    </label>
  );
}

/** Configurazione per tenant delle app OAuth (Google, Microsoft, Slack) e del webhook Teams (ADR-0012). */
export function IntegrationsAdminForm({ cfg }: { cfg: IntegrationsConfig }) {
  const [state, action, pending] = useActionState(saveIntegrationsConfig, undefined);
  return (
    <form action={action} className="stack" style={{ gap: 14 }}>
      {!cfg.cipherEnabled && <div className="error">NOTES_MASTER_KEY non è configurata sull’API: i segreti e i token non possono essere salvati.</div>}
      <fieldset style={{ border: '1px solid var(--grid)', borderRadius: 10, padding: '10px 14px' }}>
        <legend><b>Google Calendar</b> <label className="check" style={{ marginLeft: 8 }}><input type="checkbox" name="google_enabled" defaultChecked={cfg.google.enabled} /> <span className="sup">abilitato</span></label></legend>
        <div className="sup" style={{ marginBottom: 8 }}>Google Cloud → credenziali OAuth «applicazione web»; redirect URI: <code>{cfg.google.redirectUri}</code> · scope: <code>{cfg.google.scopes}</code></div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: 1, minWidth: 220 }}><span className="lab">Client ID</span><input name="google_clientId" defaultValue={cfg.google.clientId} className="input" /></label>
          <div style={{ flex: 1, minWidth: 220 }}><Secret name="google_clientSecret" has={cfg.google.hasClientSecret} label="Client secret" /></div>
        </div>
      </fieldset>
      <fieldset style={{ border: '1px solid var(--grid)', borderRadius: 10, padding: '10px 14px' }}>
        <legend><b>Microsoft 365</b> <label className="check" style={{ marginLeft: 8 }}><input type="checkbox" name="microsoft_enabled" defaultChecked={cfg.microsoft.enabled} /> <span className="sup">abilitato</span></label></legend>
        <div className="sup" style={{ marginBottom: 8 }}>Entra ID → registrazione app (piattaforma Web); redirect URI: <code>{cfg.microsoft.redirectUri}</code> · permessi delegati: <code>{cfg.microsoft.scopes}</code></div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: 1, minWidth: 200 }}><span className="lab">Application (client) ID</span><input name="microsoft_clientId" defaultValue={cfg.microsoft.clientId} className="input" /></label>
          <label className="field" style={{ width: 220 }}><span className="lab">Tenant (id, dominio o common)</span><input name="microsoft_tenant" defaultValue={cfg.microsoft.tenant} className="input" /></label>
          <div style={{ flex: 1, minWidth: 220 }}><Secret name="microsoft_clientSecret" has={cfg.microsoft.hasClientSecret} label="Client secret" /></div>
        </div>
      </fieldset>
      <fieldset style={{ border: '1px solid var(--grid)', borderRadius: 10, padding: '10px 14px' }}>
        <legend><b>Slack</b> <label className="check" style={{ marginLeft: 8 }}><input type="checkbox" name="slack_enabled" defaultChecked={cfg.slack.enabled} /> <span className="sup">abilitato</span></label></legend>
        <div className="sup" style={{ marginBottom: 8 }}>api.slack.com → app con bot token; redirect URL: <code>{cfg.slack.redirectUri}</code> · bot scope: <code>{cfg.slack.scopes}</code>{cfg.slack.installed ? <> · installata in <b>{cfg.slack.installed.teamName}</b> ({cfg.slack.installed.status})</> : ' · non ancora installata: salva e poi «Collega Slack» qui sotto'}</div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: 1, minWidth: 200 }}><span className="lab">Client ID</span><input name="slack_clientId" defaultValue={cfg.slack.clientId} className="input" /></label>
          <div style={{ flex: 1, minWidth: 220 }}><Secret name="slack_clientSecret" has={cfg.slack.hasClientSecret} label="Client secret" /></div>
          <label className="field" style={{ width: 220 }}><span className="lab">Canale riconoscimenti (id)</span><input name="slack_recognitionsChannel" defaultValue={cfg.slack.recognitionsChannel} placeholder="C0123ABC" className="input" /></label>
        </div>
      </fieldset>
      <fieldset style={{ border: '1px solid var(--grid)', borderRadius: 10, padding: '10px 14px' }}>
        <legend><b>Microsoft Teams</b> <label className="check" style={{ marginLeft: 8 }}><input type="checkbox" name="teams_enabled" defaultChecked={cfg.teams.enabled} /> <span className="sup">abilitato</span></label></legend>
        <div className="sup" style={{ marginBottom: 8 }}>Incoming webhook di un canale (Connettori del canale → Incoming Webhook). Serve per il canale riconoscimenti; le notifiche personali in Teams richiedono un’app Teams e non sono ancora disponibili.</div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
          <label className="field" style={{ flex: 1, minWidth: 260 }}><span className="lab">Webhook URL {cfg.teams.hasWebhook && <span className="pill g" style={{ marginLeft: 6 }}>impostato</span>}</span><input name="teams_webhookUrl" type="url" placeholder={cfg.teams.hasWebhook ? 'lascia vuoto per non cambiarlo' : 'https://….webhook.office.com/…'} className="input" /></label>
          {cfg.teams.hasWebhook && <label className="check"><input type="checkbox" name="teams_webhookUrlClear" /> <span className="sup">rimuovi</span></label>}
          <label className="check"><input type="checkbox" name="teams_postRecognitions" defaultChecked={cfg.teams.postRecognitions} /> <span className="sup">pubblica i riconoscimenti</span></label>
        </div>
      </fieldset>
      {state?.error && <div className="error">{state.error}</div>}
      {state?.ok && <div className="suggest">{state.message}</div>}
      <div><button className="btn p" disabled={pending}>{pending ? 'Salvataggio…' : 'Salva connettori'}</button></div>
    </form>
  );
}
