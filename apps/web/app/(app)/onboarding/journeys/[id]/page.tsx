import { notFound } from 'next/navigation';
import { ApiError, apiFetch, onboardingKindLabel, type BuddySuggestion, type OnboardingJourney, type Person } from '@/lib/api';
import { Button, PageHeader } from '@/components/ui';
import { OnboardingJourneyView } from '@/components/onboarding-journey';

export default async function OnboardingJourneyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let j: OnboardingJourney;
  try { j = await apiFetch<OnboardingJourney>(`/onboarding/journeys/${id}`); } catch (e) { if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound(); throw e; }
  const [buddies, people] = j.can.assignBuddy ? await Promise.all([apiFetch<BuddySuggestion[]>(`/onboarding/journeys/${id}/buddy-suggestions`).catch(() => [] as BuddySuggestion[]), apiFetch<{ items: Person[] }>('/people?limit=200').then((r) => r.items).catch(() => [] as Person[])]) : [[] as BuddySuggestion[], [] as Person[]];
  const name = j.person ? `${j.person.firstName} ${j.person.lastName}` : '—';
  return (
    <>
      <PageHeader title={j.viewer === 'self' ? 'Il mio percorso' : `${onboardingKindLabel[j.kind]} di ${name}`} subtitle={`${j.templateName}${j.person?.jobTitle ? ` · ${j.person.jobTitle}` : ''} · vista ${j.viewer === 'hr' ? 'HR' : j.viewer === 'manager' ? 'manager' : j.viewer === 'participant' ? 'partecipante' : 'personale'}`} actions={<Button href={j.viewer === 'self' ? '/onboarding' : j.viewer === 'participant' ? '/onboarding?tab=tasks' : '/onboarding?tab=team'}>Indietro</Button>} />
      <OnboardingJourneyView j={j} backPath={`/onboarding/journeys/${id}`} buddies={buddies} people={people} />
    </>
  );
}
