import { notFound } from 'next/navigation';
import { ApiError, apiFetch, type AppInstance, type Person } from '@/lib/api';
import { Button, PageHeader } from '@/components/ui';
import { AppInstanceView } from '@/components/app-instance';

export default async function AppInstancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let inst: AppInstance;
  try { inst = await apiFetch<AppInstance>(`/apps/instances/${id}`); } catch (e) { if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound(); throw e; }
  const people = inst.can.manage ? await apiFetch<{ items: Person[] }>('/people?limit=200').then((r) => r.items).catch(() => [] as Person[]) : [];
  return (
    <>
      <PageHeader title={<>{inst.icon ? `${inst.icon} ` : ''}{inst.name}{inst.title ? ` · ${inst.title}` : ''}</>} subtitle={`${inst.naming.instanceLabel} · ${inst.subject ? `${inst.subject.firstName} ${inst.subject.lastName}` : '—'} · v${inst.appVersion} · vista ${inst.viewer === 'hr' ? 'HR' : inst.viewer === 'subject' ? 'soggetto' : inst.viewer === 'launcher' ? 'chi ha avviato' : inst.viewer === 'manager' ? 'manager' : 'attore'}`} actions={<Button href={inst.viewer === 'hr' ? '/apps?tab=instances' : '/apps'}>Processi</Button>} />
      <AppInstanceView inst={inst} people={people} />
    </>
  );
}
