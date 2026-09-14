import Link from 'next/link';
import { publicFetch, fmtDate, type OnboardingExternal } from '@/lib/api';
import { OnboardingExternalView } from '@/components/onboarding-external';

/** Pre-boarding per la persona senza account tramite magic link (ONB-011): solo i task prima dell'ingresso, nessun'altra pagina. */
export default async function OnboardingExternalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const j = await publicFetch<OnboardingExternal>(`/onboarding/external/${encodeURIComponent(token)}`).catch(() => null);
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 16px' }}>
      <div className="logo" style={{ marginBottom: 16 }}><i /> {j?.organization ?? 'WorkingBetter'}</div>
      {!j ? (
        <div className="card">
          <div style={{ fontWeight: 700 }}>Link non valido o scaduto</div>
          <p className="sup">Il percorso è concluso, il link è stato rinnovato oppure non è completo. Chiedi a chi ti segue nell&apos;ingresso di reinviarti l&apos;email.</p>
          <Link href="/" className="btn">Vai a WorkingBetter</Link>
        </div>
      ) : (
        <>
          <div className="ph"><div><h1>Benvenuto/a{j.person ? `, ${j.person.firstName}` : ''}!</h1><p>{j.templateName} · ingresso il {fmtDate(j.anchorDate)}{j.manager ? ` · manager ${j.manager.firstName} ${j.manager.lastName}` : ''}{j.buddy ? ` · buddy ${j.buddy.firstName} ${j.buddy.lastName}` : ''}</p></div></div>
          <OnboardingExternalView token={token} j={j} />
        </>
      )}
    </div>
  );
}
