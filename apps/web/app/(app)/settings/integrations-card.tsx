import { fmtDate, type IntegrationsConfig, type IntegrationsOverview, connectorLabel } from '@/lib/api';
import { disconnectIntegration, testIntegration } from '@/lib/actions';
import { ActionForm } from '@/components/action-form';
import { IntegrationsAdminForm } from './integrations-admin-form';

function AccountRow({ provider, ov, isAdmin }: { provider: 'google' | 'microsoft'; ov: IntegrationsOverview; isAdmin: boolean }) {
  const acc = ov.mine[provider];
  const available = ov.providers[provider].available;
  return (
    <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--grid)' }}>
      <div>
        <b>{connectorLabel[provider]}</b>
        <div className="sup">{acc ? <>collegato come {acc.displayName ?? acc.externalId} · dal {fmtDate(acc.connectedAt)}{acc.status === 'error' ? <span className="pill c" style={{ marginLeft: 6 }} title={acc.lastError ?? ''}>da ricollegare</span> : <span className="pill g" style={{ marginLeft: 6 }}>attivo</span>}</> : available ? 'i tuoi 1:1 compariranno nel calendario con il link videocall' : isAdmin ? 'non configurato: compila l’app OAuth qui sotto' : 'non attivato dall’organizzazione'}</div>
      </div>
      <div className="row" style={{ gap: 6 }}>
        {available && <a className={`btn sm ${acc ? '' : 'p'}`} href={`/api/integrations/connect?provider=${provider}`}>{acc ? 'Ricollega' : 'Collega'}</a>}
        {acc && <ActionForm action={disconnectIntegration.bind(null, provider)} inline confirm="Scollegare il calendario? Gli eventi già creati restano."><button className="btn sm">Scollega</button></ActionForm>}
      </div>
    </div>
  );
}

/** Impostazioni → Integrazioni: collegamenti personali (calendari), Slack di workspace, configurazione per amministratori (ADR-0012). */
export function IntegrationsCard({ ov, cfg, isAdmin, connected, error }: { ov: IntegrationsOverview; cfg: IntegrationsConfig | null; isAdmin: boolean; connected?: string; error?: string }) {
  const slack = ov.providers.slack;
  return (
    <div className="card">
      <h3>Integrazioni <small>calendario, Slack e Teams</small></h3>
      {connected && <div className="suggest" style={{ marginBottom: 10 }}>{connectorLabel[connected as 'google'] ?? connected} collegato correttamente.</div>}
      {error && <div className="error" style={{ marginBottom: 10 }}>Collegamento non riuscito: {error}</div>}
      <div className="lvl" style={{ margin: '6px 0' }}>Il mio calendario</div>
      <AccountRow provider="google" ov={ov} isAdmin={isAdmin} />
      <AccountRow provider="microsoft" ov={ov} isAdmin={isAdmin} />
      <div className="lvl" style={{ margin: '14px 0 6px' }}>Slack</div>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--grid)' }}>
        <div>
          <b>{slack.installed ? `Workspace ${slack.installed.teamName ?? ''}` : 'Workspace non collegato'}</b>
          <div className="sup">{slack.installed ? <>notifiche come messaggio diretto (attivabili per tipo in Notifiche) e canale riconoscimenti{ov.mine.slackUser ? ` · sei mappato come ${ov.mine.slackUser.displayName}` : ' · la mappatura con la tua email avviene al primo messaggio'}</> : slack.available ? 'un amministratore può installare l’app nel workspace' : isAdmin ? 'configura l’app Slack qui sotto e poi installala' : 'non attivato dall’organizzazione'}</div>
        </div>
        {isAdmin && (
          <div className="row" style={{ gap: 6 }}>
            {slack.available && <a className={`btn sm ${slack.installed ? '' : 'p'}`} href="/api/integrations/connect?provider=slack">{slack.installed ? 'Reinstalla' : 'Collega Slack'}</a>}
            {slack.installed && <ActionForm action={testIntegration.bind(null, 'slack')} inline><button className="btn sm">Inviami una prova</button></ActionForm>}
            {slack.installed && <ActionForm action={disconnectIntegration.bind(null, 'slack')} inline confirm="Disinstallare Slack per tutta l’organizzazione?"><button className="btn sm">Disinstalla</button></ActionForm>}
          </div>
        )}
      </div>
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: '8px 0' }}>
        <div><b>Microsoft Teams</b><div className="sup">{ov.providers.teams.enabled ? 'canale collegato via webhook: riceve i riconoscimenti' : 'nessun canale collegato'}</div></div>
        {isAdmin && ov.providers.teams.enabled && <ActionForm action={testIntegration.bind(null, 'teams')} inline><button className="btn sm">Prova nel canale</button></ActionForm>}
      </div>
      {isAdmin && cfg && (
        <details style={{ marginTop: 14 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Configurazione delle app OAuth e del webhook (amministratori)</summary>
          <div style={{ marginTop: 10 }}><IntegrationsAdminForm cfg={cfg} /></div>
        </details>
      )}
    </div>
  );
}
