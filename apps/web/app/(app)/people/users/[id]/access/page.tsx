import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { BuiltInRoleLabels, GuideProfileLabels, type GuideProfile } from '@wb/shared';
import { ApiError, apiFetch, fmtDate, type Me, type UserAccess } from '@/lib/api';
import { Button, PageHeader, Pill } from '@/components/ui';

const VIS_LABEL = { hr: 'tutti i campi (profilo HR)', manager: 'i campi «anche il manager» delle persone del suo team, oltre a quelli per tutti', all: 'solo i campi «anche la persona»' };

/** Persone → Utenti → «Cosa vede» (CORE-044): ruoli, permessi effettivi per modulo e perimetro di dato di un utente. */
export default async function UserAccessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await apiFetch<Me>('/me');
  if (!me.permissions.includes('roles:manage')) redirect('/people/users');
  let a: UserAccess;
  try { a = await apiFetch<UserAccess>(`/users/${id}/access`); } catch (e) { if (e instanceof ApiError && e.status === 404) notFound(); throw e; }
  const name = a.person ? `${a.person.firstName} ${a.person.lastName}` : a.user.email;
  const granted = a.catalog.reduce((n, g) => n + g.items.filter((i) => i.granted).length, 0);
  const total = a.catalog.reduce((n, g) => n + g.items.length, 0);
  const p = a.perimeter;
  return (
    <>
      <PageHeader title={`Cosa vede ${name}`} subtitle={`${a.user.email} · ${a.roles.length} ${a.roles.length === 1 ? 'ruolo' : 'ruoli'} · ${granted} permessi su ${total} · profilo Guida «${GuideProfileLabels[a.guideProfile as GuideProfile] ?? a.guideProfile}»${a.user.disabledAt ? ' · utente disattivato' : ''}`} actions={<><Button href="/people/users" variant="ghost">Utenti e accessi</Button><Button href="/settings/roles" variant="ghost">Ruoli e permessi</Button></>} />
      <div className="grid" style={{ gridTemplateColumns: '340px minmax(0, 1fr)', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card">
            <h3>Ruoli</h3>
            {a.roles.length === 0 ? <div className="sup">Nessun ruolo: l’utente può solo accedere.</div> : (
              <div style={{ display: 'grid', gap: 8 }}>
                {a.roles.map((r, i) => (
                  <div key={i} className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div><b style={{ fontWeight: 600 }}>{r.name}</b>{!r.builtIn && <div className="sup"><code>{r.key}</code> · base {BuiltInRoleLabels[r.baseRole as keyof typeof BuiltInRoleLabels] ?? r.baseRole}</div>}{r.customized && <div className="sup">permessi personalizzati dal tenant</div>}{r.scopeType === 'org_unit' && <div className="sup">perimetro: {r.scopeName ?? 'unità'}</div>}</div>
                    <Link href={`/settings/roles?role=${r.key}`} className="sup">definizione</Link>
                  </div>
                ))}
              </div>
            )}
            {a.implicitRoles.length > 0 && <p className="sup" style={{ marginTop: 10 }}>Perimetro ereditato dai ruoli custom: {a.implicitRoles.map((k) => BuiltInRoleLabels[k as keyof typeof BuiltInRoleLabels] ?? k).join(', ')}.</p>}
          </div>
          <div className="card">
            <h3>Perimetro di dato</h3>
            <dl className="kv">
              <dt>Vede tutti</dt><dd>{p.seesEveryone ? <Pill tone="w">sì, tutta l’azienda</Pill> : <Pill tone="g">no, solo sé e il team</Pill>}</dd>
              <dt>Riporti diretti</dt><dd>{p.directReports.length === 0 ? '—' : p.directReports.map((d) => <Link key={d.id} href={`/people/${d.id}`} style={{ display: 'block' }}>{d.firstName} {d.lastName}{d.jobTitle ? <span className="sup"> · {d.jobTitle}</span> : null}</Link>)}</dd>
              <dt>Riporti indiretti</dt><dd>{p.indirectReportsCount}</dd>
              <dt>Campi custom</dt><dd>{VIS_LABEL[p.customFieldsVisibility]}</dd>
              <dt>Unità di perimetro</dt><dd>{p.orgUnitScopes.length ? <>{p.orgUnitScopes.map((u) => u.name).join(', ')}<div className="sup">registrato sull’assegnazione; i moduli oggi distinguono solo tenant e team del manager</div></> : '—'}</dd>
            </dl>
          </div>
          <div className="card">
            <h3>Accesso</h3>
            <dl className="kv">
              <dt>Ultimo accesso</dt><dd>{fmtDate(a.user.lastLoginAt)}</dd>
              <dt>Metodo</dt><dd>{a.user.authProvider === 'oidc' ? 'SSO' : a.user.authProvider ?? '—'}</dd>
              <dt>Verifica in due passaggi</dt><dd>{a.user.mfaEnabled ? <Pill tone="g">attiva</Pill> : <Pill>non attiva</Pill>}</dd>
              <dt>Stato</dt><dd>{a.user.disabledAt ? <Pill tone="c">disattivato</Pill> : <Pill tone="g">attivo</Pill>}</dd>
            </dl>
          </div>
        </div>
        <div className="card">
          <h3>Permessi effettivi per modulo <small>{granted} su {total}</small></h3>
          <div style={{ display: 'grid', gap: 14 }}>
            {a.catalog.map((g) => (
              <div key={g.module}>
                <div className="lvl" style={{ marginBottom: 6 }}>{g.title}{!g.moduleEnabled && <Pill tone="w">modulo spento nel tenant</Pill>}</div>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '4px 12px' }}>
                  {g.items.map((i) => <div key={i.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', opacity: i.granted && g.moduleEnabled ? 1 : 0.55 }} title={i.key}><span aria-hidden style={{ color: i.granted ? 'var(--good-text)' : 'var(--muted)', width: 12, flex: 'none' }}>{i.granted ? '✓' : '·'}</span><span>{i.label}</span></div>)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
