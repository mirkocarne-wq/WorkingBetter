import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch, fmtDate, qs, type AuditPage, type Me, type UserAdmin } from '@/lib/api';
import { Button, PageHeader, Pill, TableWrap } from '@/components/ui';

const ENTITY_LABELS: Record<string, string> = { person: 'persona', user: 'utente', tenant: 'tenant', org_unit: 'unità', objective: 'obiettivo', review: 'review', review_cycle: 'ciclo review', review_template: 'template review', survey: 'survey', feedback: 'feedback', recognition: 'riconoscimento', meeting: 'incontro 1:1', one_on_one: 'relazione 1:1', action_item: 'azione', app: 'app', app_instance: 'istanza', form: 'form', role: 'ruolo', automation_rule: 'automazione', audit_log: 'audit', person_field_def: 'campo persona', welfare_request: 'richiesta welfare', f360_campaign: 'campagna 360°', f360_subject: 'soggetto 360°', onboarding_journey: 'percorso onboarding' };

/** Impostazioni → Audit (CORE-051): chi ha fatto cosa, quando, su quale entità; i campi cambiati, mai i valori. */
export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await apiFetch<Me>('/me');
  if (!me.permissions.includes('audit:read')) redirect('/settings');
  const sp = await searchParams;
  const filters = { action: sp.action || undefined, entityType: sp.entityType || undefined, entityId: sp.entityId || undefined, actorUserId: sp.actorUserId || undefined, from: sp.from || undefined, to: sp.to || undefined, q: sp.q || undefined };
  const [page, actions, users] = await Promise.all([
    apiFetch<AuditPage>(`/audit${qs({ ...filters, beforeAt: sp.beforeAt, limit: 50 })}`),
    apiFetch<string[]>('/audit/actions').catch(() => [] as string[]),
    me.permissions.includes('roles:manage') ? apiFetch<UserAdmin[]>('/users').catch(() => [] as UserAdmin[]) : Promise.resolve([] as UserAdmin[]),
  ]);
  const prefixes = [...new Set(actions.map((a) => a.split('.')[0]!))].sort();
  const active = Object.values(filters).filter(Boolean).length;
  const exportHref = `/api/export?report=audit${qs(filters).replace(/^\?/, '&')}`;
  return (
    <>
      <PageHeader title="Audit" subtitle={`Chi ha fatto cosa, quando e su quale entità · ${active ? `${active} ${active === 1 ? 'filtro attivo' : 'filtri attivi'}` : 'tutte le azioni'} · i contenuti non passano mai da qui, solo i campi cambiati`} actions={<><Button href="/settings" variant="ghost">Impostazioni</Button><a className="btn" href={exportHref}>Esporta CSV</a></>} />
      <div className="card" style={{ marginBottom: 16 }}>
        <form method="get" className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, alignItems: 'end' }}>
          <label className="field"><span className="lab">Azione</span>
            <select name="action" className="input" defaultValue={sp.action ?? ''}>
              <option value="">tutte</option>
              {prefixes.map((p) => <optgroup key={p} label={p}><option value={`${p}.`}>{p}.* (tutte)</option>{actions.filter((a) => a.startsWith(`${p}.`)).map((a) => <option key={a} value={a}>{a}</option>)}</optgroup>)}
            </select>
          </label>
          <label className="field"><span className="lab">Entità</span><input name="entityType" className="input" list="audit-entities" defaultValue={sp.entityType ?? ''} placeholder="es. person" /></label>
          <datalist id="audit-entities">{Object.entries(ENTITY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</datalist>
          <label className="field"><span className="lab">ID entità</span><input name="entityId" className="input" defaultValue={sp.entityId ?? ''} placeholder="uuid" /></label>
          {users.length > 0 && <label className="field"><span className="lab">Utente</span><select name="actorUserId" className="input" defaultValue={sp.actorUserId ?? ''}><option value="">tutti</option>{users.map((u) => <option key={u.id} value={u.id}>{u.person ? `${u.person.firstName} ${u.person.lastName}` : u.email}</option>)}</select></label>}
          <label className="field"><span className="lab">Dal</span><input name="from" type="date" className="input" defaultValue={sp.from ?? ''} /></label>
          <label className="field"><span className="lab">Al</span><input name="to" type="date" className="input" defaultValue={sp.to ?? ''} /></label>
          <label className="field"><span className="lab">Testo</span><input name="q" className="input" defaultValue={sp.q ?? ''} placeholder="azione, entità o id" /></label>
          <div className="row" style={{ gap: 6 }}><Button variant="primary">Filtra</Button>{active > 0 && <Button href="/settings/audit" variant="ghost">Azzera</Button>}</div>
        </form>
      </div>
      <div className="card flush">
        <TableWrap>
          <table>
            <thead><tr><th>Quando</th><th>Azione</th><th>Entità</th><th>Campi cambiati</th><th>Chi</th><th>IP</th></tr></thead>
            <tbody>
              {page.items.length === 0 && <tr><td colSpan={6} className="empty">Nessuna azione corrisponde ai filtri.</td></tr>}
              {page.items.map((r) => (
                <tr key={r.id}>
                  <td className="sup" style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.at)}</td>
                  <td><Link href={`/settings/audit${qs({ ...filters, action: r.action })}`}><code>{r.action}</code></Link></td>
                  <td>{ENTITY_LABELS[r.entityType] ?? r.entityType}{r.entityId && <div className="sup"><Link href={`/settings/audit${qs({ entityType: r.entityType, entityId: r.entityId })}`} title="Tutte le azioni su questa entità"><code style={{ fontSize: 11 }}>{r.entityId.slice(0, 8)}…</code></Link>{r.entityType === 'person' && <> · <Link href={`/people/${r.entityId}`}>scheda</Link></>}</div>}</td>
                  <td>{r.changedFields.length ? <span className="row" style={{ gap: 4, flexWrap: 'wrap' }}>{r.changedFields.slice(0, 8).map((f) => <Pill key={f}>{f}</Pill>)}{r.changedFields.length > 8 && <span className="sup">+{r.changedFields.length - 8}</span>}</span> : <span className="sup">—</span>}</td>
                  <td>{r.actorName ?? r.actorEmail ?? <span className="sup">sistema</span>}{r.actorName && r.actorEmail && <div className="sup">{r.actorEmail}</div>}</td>
                  <td className="sup" style={{ fontSize: 12 }}>{r.ip ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
        {page.nextBeforeAt && <div style={{ padding: '10px 16px', borderTop: '1px solid var(--grid)' }}><Button href={`/settings/audit${qs({ ...filters, beforeAt: page.nextBeforeAt })}`} size="sm">Azioni precedenti</Button></div>}
      </div>
    </>
  );
}
