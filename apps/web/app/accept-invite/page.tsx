import Link from 'next/link';
import { API_URL, publicFetch, type InviteInfo } from '@/lib/api';
import { acceptInvite } from '@/lib/actions';
import { PasswordForm } from '@/components/password-form';

export default async function AcceptInvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const sp = await searchParams;
  const info = sp.token ? await publicFetch<InviteInfo>(`/auth/invite/${encodeURIComponent(sp.token)}`).catch(() => ({ valid: false }) as InviteInfo) : ({ valid: false } as InviteInfo);
  return (
    <div className="login">
      <div className="card" style={{ width: 420, display: 'grid', gap: 12 }}>
        <div className="logo"><i /> WorkingBetter</div>
        {!info.valid ? (
          <>
            <div style={{ fontWeight: 700 }}>Invito non valido</div>
            <p className="sup" style={{ margin: 0 }}>{info.expired ? 'Il link è scaduto o è già stato usato. Chiedi all’HR di reinviare l’invito.' : 'Controlla di aver aperto il link completo ricevuto via email.'}</p>
            <Link href="/login" className="btn">Vai all’accesso</Link>
          </>
        ) : (
          <>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Benvenuto/a{info.firstName ? `, ${info.firstName}` : ''}</div>
            <p style={{ margin: 0, color: 'var(--ink2)' }}><b>{info.tenant?.name}</b> ti ha invitato a WorkingBetter con l’indirizzo <b>{info.email}</b>.</p>
            {info.sso && (
              <div className="suggest">
                La tua organizzazione usa l’accesso SSO aziendale: puoi entrare direttamente con il tuo account di lavoro. In alternativa imposta anche una password.
                <div style={{ marginTop: 8 }}><a className="btn p" href={`${API_URL}/api/v1/auth/oidc/start?tenant=${encodeURIComponent(info.tenant?.slug ?? '')}`}>Accedi con SSO aziendale</a></div>
              </div>
            )}
            <PasswordForm action={acceptInvite} token={sp.token!} submitLabel="Attiva l’account" optional={!!info.sso} />
          </>
        )}
      </div>
    </div>
  );
}
