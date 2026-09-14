import { redirect } from 'next/navigation';
import { apiFetch, type Me, type MetricLite, type Person } from '@/lib/api';
import { PageHeader, Button } from '@/components/ui';
import { ReportBuilder } from '@/components/report-builder';

export default async function NewReportPage() {
  const me = await apiFetch<Me>('/me');
  const canShare = me.permissions.includes('analytics:query');
  if (!canShare && !me.permissions.includes('analytics:query:team')) redirect('/dashboard');
  const [catalog, units, people, cycles] = await Promise.all([
    apiFetch<MetricLite[]>('/analytics/metrics'),
    apiFetch<{ id: string; name: string }[]>('/org-units').catch(() => []),
    apiFetch<{ items: Person[] }>('/people?limit=200').then((r) => r.items).catch(() => [] as Person[]),
    apiFetch<{ id: string; name: string }[]>('/analytics/process').catch(() => []),
  ]);
  const managerIds = new Set(people.map((p) => p.managerId).filter(Boolean));
  const managers = people.filter((p) => managerIds.has(p.id)).map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}` }));
  return (
    <>
      <PageHeader title="Nuovo report" subtitle="Metriche → dettaglio → filtri → confronto → visualizzazione → condivisione" actions={<Button href="/analytics/reports">Annulla</Button>} />
      <ReportBuilder catalog={catalog} canShare={canShare} units={units} managers={managers} cycles={cycles} />
    </>
  );
}
