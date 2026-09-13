import { notFound } from 'next/navigation';
import { ApiError, apiFetch, type DevProfile } from '@/lib/api';
import { Button, PageHeader } from '@/components/ui';
import { DevProfileView } from '@/components/dev-profile';

export default async function DevPersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let d: DevProfile;
  try { d = await apiFetch<DevProfile>(`/development/people/${id}`); } catch (e) { if (e instanceof ApiError && e.status === 404) notFound(); throw e; }
  return (
    <>
      <PageHeader title={`Sviluppo di ${d.person.firstName} ${d.person.lastName}`} subtitle={<>{d.person.jobTitle ?? ''}{d.profile ? ` · ${d.profile.title}` : ' · nessun job profile'}{d.manager ? ` · manager ${d.manager.firstName} ${d.manager.lastName}` : ''} · vista {d.viewer === 'hr' ? 'HR' : 'manager'}</>} actions={<><Button href="/development?tab=team">Il mio team</Button><Button href="/development/admin">Amministrazione</Button></>} />
      <DevProfileView d={d} backPath={`/development/people/${id}`} />
    </>
  );
}
