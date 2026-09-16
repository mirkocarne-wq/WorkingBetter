import Link from 'next/link';
import { redirect } from 'next/navigation';
import { describeAction, describeTrigger } from '@wb/shared';
import { apiFetch, fmtDate, type AutomationRule, type Me } from '@/lib/api';
import { setAutomationEnabled } from '@/lib/actions';
import { Button, EmptyState, PageHeader, Pill, TableWrap } from '@/components/ui';

/** Processi → Automazioni (APP-037): regole «quando → se → allora» del tenant. */
export default async function AutomationsPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const me = await apiFetch<Me>('/me');
  if (!me.permissions.includes('apps:manage')) redirect('/apps');
  const sp = await searchParams;
  const rules = await apiFetch<AutomationRule[]>(`/automations${sp.archived === '1' ? '?includeArchived=true' : ''}`);
  const active = rules.filter((r) => r.enabled && !r.archivedAt).length;
  return (
    <>
      <PageHeader title="Automazioni" subtitle={rules.length ? `${active} ${active === 1 ? 'regola attiva' : 'regole attive'} su ${rules.filter((r) => !r.archivedAt).length} · quando succede qualcosa, se valgono le condizioni, allora la piattaforma agisce` : 'Regole «quando → se → allora» sugli eventi della piattaforma'} actions={<><Button href="/apps?tab=studio" variant="ghost">Studio</Button><Button href="/apps/automations/new" variant="primary" icon="plus">Nuova regola</Button></>} />
      {rules.length === 0 ? (
        <EmptyState title="Nessuna automazione ancora" hint="Esempi: «quando una persona compie 90 giorni → avvia il colloquio di fine prova», «quando una review chiude con rating basso → crea un’azione per l’HRBP», «quando un processo si conclude → chiama un webhook»." action={<Button href="/apps/automations/new" variant="primary">Crea la prima regola</Button>} />
      ) : (
        <div className="card flush">
          <TableWrap>
            <table>
              <thead><tr><th>Regola</th><th>Quando</th><th>Allora</th><th>Esecuzioni</th><th style={{ textAlign: 'right' }}>Stato</th></tr></thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id} style={r.archivedAt ? { opacity: 0.6 } : undefined}>
                    <td><Link href={`/apps/automations/${r.id}`} style={{ fontWeight: 600 }}>{r.name}</Link>{r.description && <div className="sup">{r.description}</div>}</td>
                    <td>{describeTrigger(r.trigger)}{r.conditions.length > 0 && <div className="sup">{r.conditions.length} {r.conditions.length === 1 ? 'condizione' : 'condizioni'}</div>}</td>
                    <td><ul style={{ margin: 0, paddingLeft: 16, fontSize: 13 }}>{r.actions.map((a, i) => <li key={i}>{describeAction(a)}</li>)}</ul></td>
                    <td className="sup">{r.runsCount}{r.lastRunAt ? ` · ultima ${fmtDate(r.lastRunAt)}` : ''}</td>
                    <td style={{ textAlign: 'right' }}>
                      {r.archivedAt ? <Pill>archiviata</Pill> : (
                        <form action={setAutomationEnabled.bind(null, r.id, !r.enabled)} style={{ display: 'inline' }}>
                          <button className={`pill ${r.enabled ? 'g' : 'n'}`} style={{ border: 0, cursor: 'pointer', font: 'inherit' }} title={r.enabled ? 'Disattiva' : 'Attiva'}>{r.enabled ? 'attiva' : 'spenta'}</button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--grid)' }}><Link href={sp.archived === '1' ? '/apps/automations' : '/apps/automations?archived=1'} className="sup">{sp.archived === '1' ? 'Nascondi archiviate' : 'Mostra archiviate'}</Link></div>
        </div>
      )}
    </>
  );
}
