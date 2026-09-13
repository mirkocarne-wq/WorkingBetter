import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch, fmtDate, scheduleLabel, type Me, type SavedReport } from '@/lib/api';
import { Button, EmptyState, PageHeader, Pill, TableWrap } from '@/components/ui';

const dimLabel: Record<string, string> = { org_unit: 'per unità', manager: 'per manager', person: 'per persona', cycle: 'per ciclo' };

export default async function ReportsPage() {
  const me = await apiFetch<Me>('/me');
  if (!me.permissions.includes('analytics:query') && !me.permissions.includes('analytics:query:team')) redirect('/dashboard');
  const reports = await apiFetch<SavedReport[]>('/analytics/reports');
  const folders = [...new Set(reports.map((r) => r.folder ?? ''))].sort();
  return (
    <>
      <PageHeader title="Report salvati" subtitle="Report costruiti sul catalogo delle metriche: chi li apre vede solo i dati del proprio perimetro" actions={<><Button href="/analytics">Cruscotto</Button><Button href="/analytics/reports/new" variant="primary">Nuovo report</Button></>} />
      {reports.length === 0 ? (
        <div className="card"><EmptyState title="Nessun report salvato" hint="Scegli le metriche, il dettaglio e i filtri una volta sola; poi condividi il report con i ruoli giusti o fattelo arrivare via email ogni settimana." action={<Button href="/analytics/reports/new" variant="primary">Costruisci il primo report</Button>} /></div>
      ) : folders.map((f) => (
        <div className="card" key={f || '_'} style={{ marginBottom: 16 }}>
          <h3>{f || 'Senza cartella'} <small>{reports.filter((r) => (r.folder ?? '') === f).length} report</small></h3>
          <TableWrap>
            <table>
              <thead><tr><th>Report</th><th>Contenuto</th><th>Condivisione</th><th>Invio</th><th>Aggiornato</th></tr></thead>
              <tbody>
                {reports.filter((r) => (r.folder ?? '') === f).map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/analytics/reports/${r.id}`} style={{ fontWeight: 600 }}>{r.name}</Link>{r.description && <div className="sup">{r.description}</div>}</td>
                    <td className="sup">{r.definition.metrics.length} metriche {r.definition.dimension ? dimLabel[r.definition.dimension] : ''}{r.definition.compareDays ? ` · confronto ${r.definition.compareDays} gg` : ''}</td>
                    <td>{r.isOwner ? <Pill tone={r.sharing.roles.length ? 'b' : 'n'}>{r.sharing.roles.length ? `ruoli: ${r.sharing.roles.join(', ')}` : 'personale'}</Pill> : <Pill tone="b">condiviso con te</Pill>}</td>
                    <td className="sup">{scheduleLabel(r.schedule)}{r.nextRunAt ? <div>prossimo: {fmtDate(r.nextRunAt)}</div> : null}</td>
                    <td className="sup">{fmtDate(r.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </div>
      ))}
    </>
  );
}
