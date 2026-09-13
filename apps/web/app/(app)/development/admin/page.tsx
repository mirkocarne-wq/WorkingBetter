import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch, competencyKindLabel, fmtDate, type Competency, type DevPersonRow, type JobProfile, type Me, type SuggestedAction, type TalentGrid } from '@/lib/api';
import { assignJobProfile, loadCompetencyPresets } from '@/lib/actions';
import { Button, Card, EmptyState, PageHeader, Pill, TableWrap, Tabs, Who } from '@/components/ui';
import { CompetencyForm, JobProfileForm } from './forms';

export default async function DevAdminPage({ searchParams }: { searchParams: Promise<{ tab?: string; edit?: string }> }) {
  const sp = await searchParams;
  const me = await apiFetch<Me>('/me');
  if (!me.permissions.includes('development:manage')) redirect('/development');
  const tab = ['competencies', 'profiles', 'people', 'talent'].includes(sp.tab ?? '') ? sp.tab! : 'talent';
  const [fw, people, talent] = await Promise.all([
    apiFetch<{ competencies: Competency[]; profiles: JobProfile[]; suggestedActions: SuggestedAction[] }>('/development/framework'),
    apiFetch<DevPersonRow[]>('/development/people'),
    apiFetch<TalentGrid>('/development/talent'),
  ]);
  const names = Object.fromEntries(fw.competencies.map((c) => [c.key, c.name]));
  const editing = sp.edit ? fw.profiles.find((p) => p.id === sp.edit) ?? null : null;
  const perfLabel = ['', 'Performance bassa', 'Performance media', 'Performance alta'];
  const potLabel = ['', 'Potenziale limitato', 'Potenziale in crescita', 'Potenziale alto'];
  return (
    <>
      <PageHeader title="Sviluppo · amministrazione" subtitle={`${fw.competencies.length} competenze · ${fw.profiles.length} job profile · ${people.filter((p) => p.profile).length}/${people.length} persone con profilo · ${people.filter((p) => p.plan === 'active' || p.plan === 'pending_approval').length} piani in corso`} actions={<Button href="/development">Il mio sviluppo</Button>} />
      <Tabs current={tab} items={[{ key: 'talent', label: '9-box', href: '/development/admin?tab=talent' }, { key: 'people', label: `Persone (${people.length})`, href: '/development/admin?tab=people' }, { key: 'profiles', label: `Job profile (${fw.profiles.length})`, href: '/development/admin?tab=profiles' }, { key: 'competencies', label: `Competenze (${fw.competencies.length})`, href: '/development/admin?tab=competencies' }]} />

      {tab === 'talent' && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', alignItems: 'start' }}>
          <Card title={<>9-box <small>performance dall’ultima review × potenziale del manager · {talent.unplaced} non posizionate</small></>}>
            <div style={{ display: 'grid', gridTemplateColumns: '90px repeat(3, 1fr)', gap: 6 }}>
              {[3, 2, 1].map((perf) => (
                <div key={perf} style={{ display: 'contents' }}>
                  <div className="sup" style={{ alignSelf: 'center', fontSize: 11 }}>{perfLabel[perf]}</div>
                  {[1, 2, 3].map((pot) => {
                    const items = talent.items.filter((i) => i.performance === perf && i.potential === pot);
                    const tone = perf + pot >= 5 ? 'var(--good-soft)' : perf + pot <= 3 ? 'var(--crit-soft)' : 'var(--warn-soft)';
                    return (
                      <div key={pot} style={{ background: tone, borderRadius: 8, minHeight: 88, padding: 8 }}>
                        <div className="lvl" style={{ marginBottom: 4 }}>{items[0]?.label ?? ''}</div>
                        {items.map((i) => <Link key={i.person.id} href={`/development/people/${i.person.id}`} style={{ display: 'block', fontSize: 13, fontWeight: 600 }} title={i.note ?? ''}>{i.person.firstName} {i.person.lastName}</Link>)}
                      </div>
                    );
                  })}
                  {perf === 1 && <><div /> {[1, 2, 3].map((pot) => <div key={pot} className="sup" style={{ textAlign: 'center', fontSize: 11 }}>{potLabel[pot]}</div>)}</>}
                </div>
              ))}
            </div>
            <div className="sup" style={{ marginTop: 10 }}>La performance deriva dal rating finale dell’ultima review condivisa o firmata, normalizzato in tre fasce sulla scala del template. Il potenziale è una valutazione del manager con nota obbligatoria e storico; non è mai visibile alla persona.</div>
          </Card>
          <Card title="Da posizionare" aside="senza review con rating o senza potenziale">
            {talent.items.filter((i) => !i.performance || !i.potential).length === 0 ? <EmptyState title="Tutte le persone sono posizionate" /> : talent.items.filter((i) => !i.performance || !i.potential).map((i) => (
              <div key={i.person.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--grid)' }}>
                <Who person={{ firstName: i.person.firstName, lastName: i.person.lastName, jobTitle: i.person.jobTitle }} />
                <div className="row">{!i.performance && <Pill tone="n">senza review</Pill>}{!i.potential && <Pill tone="w">potenziale da valutare</Pill>}<Button href={`/development/people/${i.person.id}`} size="sm">Apri</Button></div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {tab === 'people' && (
        <Card title="Persone" aside="assegna il job profile; il resto si vede nel profilo">
          <TableWrap>
            <table>
              <thead><tr><th>Persona</th><th>Job profile</th><th>Piano</th><th className="num">Azioni aperte</th><th>Ultima valutazione</th><th></th></tr></thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.person.id}>
                    <td><Who person={{ firstName: p.person.firstName, lastName: p.person.lastName, jobTitle: p.person.jobTitle }} /></td>
                    <td><form action={assignJobProfile.bind(null, p.person.id)} className="row"><select name="profileId" defaultValue={p.profile?.id ?? ''} className="select" style={{ width: 'auto' }}><option value="">— nessuno —</option>{fw.profiles.map((pr) => <option key={pr.id} value={pr.id}>{pr.title}{pr.level ? ` · ${pr.level}` : ''}</option>)}</select><button className="btn sm">Salva</button></form></td>
                    <td>{p.plan ? <Pill tone={p.plan === 'active' ? 'g' : p.plan === 'pending_approval' ? 'w' : 'n'}>{p.plan}</Pill> : <span className="sup">nessuno</span>}</td>
                    <td className="num">{p.openActions}{p.overdueActions ? <span style={{ color: 'var(--crit-text)' }}> · {p.overdueActions} scadute</span> : ''}</td>
                    <td className="sup">auto {fmtDate(p.lastSelf)} · manager {fmtDate(p.lastManager)}</td>
                    <td><Button href={`/development/people/${p.person.id}`} size="sm">Apri</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      )}

      {tab === 'profiles' && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'start' }}>
          <Card title="Job profile" aside="competenze attese e ruolo successivo">
            {fw.profiles.length === 0 ? <EmptyState title="Nessun job profile" hint="Crea il primo dal modulo a destra: titolo, famiglia, livello e competenze attese." /> : fw.profiles.map((p) => (
              <div key={p.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--grid)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><div><b>{p.title}</b> <span className="sup">{[p.family, p.level].filter(Boolean).join(' · ')} · {p.people ?? 0} persone</span></div><Link href={`/development/admin?tab=profiles&edit=${p.id}`} className="btn sm">Modifica</Link></div>
                <div className="sup">{p.expected.map((e) => `${names[e.competencyKey] ?? e.competencyKey} ${e.level}`).join(' · ') || 'nessuna competenza attesa'}{p.nextProfileId ? ` → ${fw.profiles.find((x) => x.id === p.nextProfileId)?.title ?? ''}` : ''}</div>
              </div>
            ))}
          </Card>
          <Card title={editing ? `Modifica: ${editing.title}` : 'Nuovo job profile'}>
            <JobProfileForm key={editing?.id ?? 'new'} competencies={fw.competencies} profiles={fw.profiles} profile={editing} />
          </Card>
        </div>
      )}

      {tab === 'competencies' && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', alignItems: 'start' }}>
          <Card title="Competenze" aside={<form action={loadCompetencyPresets}><button className="btn sm">Carica libreria predefinita</button></form>}>
            {fw.competencies.length === 0 ? <EmptyState title="Nessuna competenza" hint="Carica la libreria predefinita (11 competenze in italiano con 4 livelli) e poi adattala." /> : fw.competencies.map((c) => (
              <details key={c.key} style={{ padding: '8px 0', borderBottom: '1px solid var(--grid)' }}>
                <summary style={{ cursor: 'pointer' }}><b>{c.name}</b> <Pill tone="n">{competencyKindLabel[c.kind]}</Pill> <span className="sup">{c.description}</span></summary>
                <div style={{ fontSize: 13, marginTop: 6 }}>{c.levels.map((l) => <div key={l.level}><b>{l.level} · {l.label}</b>: {l.descriptor}</div>)}</div>
                <div className="sup" style={{ marginTop: 4 }}>Azioni suggerite: {fw.suggestedActions.filter((a) => a.competencyKey === c.key).map((a) => a.title).join(' · ') || '—'}</div>
              </details>
            ))}
          </Card>
          <Card title="Nuova competenza o modifica" aside="stessa chiave = aggiornamento">
            <CompetencyForm />
          </Card>
        </div>
      )}
    </>
  );
}
