import Link from 'next/link';
import { NewTenantForm } from './new-tenant-form';

export default function NewTenantPage() {
  return (
    <>
      <div className="ph"><div><h1>Nuovo tenant</h1><p>Crea l’organizzazione con l’unità radice e invita il primo amministratore (PLT-011)</p></div><Link href="/tenants" className="btn">Tutti i tenant</Link></div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <div className="card"><NewTenantForm /></div>
        <div className="card">
          <h3>Cosa succede</h3>
          <ol style={{ paddingLeft: 18, display: 'grid', gap: 6 }}>
            <li>Nasce il tenant con lo slug indicato (immutabile) e un’unità organizzativa radice con il nome dell’azienda.</li>
            <li>L’amministratore viene creato come persona e utente con ruolo <code>tenant_admin</code>, in stato «invitato».</li>
            <li>Un invito valido 7 giorni viene accodato via email; il link è mostrato qui una sola volta per gli ambienti senza posta.</li>
            <li>Al primo accesso l’amministratore trova la Guida con i passi di avviamento (aspetto, unità, persone, referenti HR, SSO).</li>
          </ol>
          <div className="sup" style={{ marginTop: 8 }}>Ogni creazione è registrata negli eventi di piattaforma con il tuo nome e l’indirizzo IP.</div>
        </div>
      </div>
    </>
  );
}
