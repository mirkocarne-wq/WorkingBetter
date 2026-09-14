import { notFound } from 'next/navigation';
import { ApiError, apiFetch, onboardingKindLabel, type BuddySuggestion, type OnboardingJourney, type Person } from '@/lib/api';
import { Button, PageHeader } from '@/components/ui';
import { ActionForm } from '@/components/action-form';
import { sendOnboardingExternalLink } from '@/lib/actions';
import { OnboardingJourneyView } from '@/components/onboarding-journey';

export default async function OnboardingJourneyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let j: OnboardingJourney;
  try { j = await apiFetch<OnboardingJourney>(`/onboarding/journeys/${id}`); } catch (e) { if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound(); throw e; }
  const [buddies, people] = j.can.assignBuddy ? await Promise.all([apiFetch<BuddySuggestion[]>(`/onboarding/journeys/${id}/buddy-suggestions`).catch(() => [] as BuddySuggestion[]), apiFetch<{ items: Person[] }>('/people?limit=200').then((r) => r.items).catch(() => [] as Person[])]) : [[] as BuddySuggestion[], [] as Person[]];
  const name = j.person ? `${j.person.firstName} ${j.person.lastName}` : '—';
  return (
    <>
      <PageHeader title={j.viewer === 'self' ? 'Il mio percorso' : `${onboardingKindLabel[j.kind]} di ${name}`} subtitle={`${j.templateName}${j.person?.jobTitle ? ` · ${j.person.jobTitle}` : ''} · vista ${j.viewer === 'hr' ? 'HR' : j.viewer === 'manager' ? 'manager' : j.viewer === 'participant' ? 'partecipante' : 'personale'}`} actions={<><Button href={j.viewer === 'self' ? '/onboarding' : j.viewer === 'participant' ? '/onboarding?tab=tasks' : '/onboarding?tab=team'}>Indietro</Button>{j.viewer === 'hr' && j.appInstanceId && <Button href={`/apps/instances/${j.appInstanceId}`} title="Istanza del percorso sul motore dei processi">Processo</Button>}{j.can.sendExternalLink && <ActionForm action={sendOnboardingExternalLink.bind(null, id)} inline><Button variant="default" title="Magic link per completare il pre-boarding senza account">{j.external?.active ? 'Reinvia link pre-boarding' : 'Invia link pre-boarding'}</Button></ActionForm>}</>} />
      {j.external?.active && (j.viewer === 'hr' || j.viewer === 'manager') && <div className="sup" style={{ marginTop: -8, marginBottom: 12 }}>Link di pre-boarding attivo per {j.external.email}{j.external.expiresAt ? ` · valido fino al ${new Date(j.external.expiresAt).toLocaleDateString('it-IT')}` : ''}.</div>}
      <OnboardingJourneyView j={j} backPath={`/onboarding/journeys/${id}`} buddies={buddies} people={people} />
    </>
  );
}
