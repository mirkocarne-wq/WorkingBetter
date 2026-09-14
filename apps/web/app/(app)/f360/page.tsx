import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch, fmtDate, f360CampaignStatusLabel, f360CategoryLabel, f360SubjectStatusLabel, f360RequestStatusLabel, type Competency, type F360Campaign, type F360RequestSummary, type F360SubjectSummary, type Me } from '@/lib/api';
import { createF360Campaign } from '@/lib/actions';
import { Button, Card, EmptyState, PageHeader, Pill, TableWrap, Tabs, Who } from '@/components/ui';
import { ActionForm } from '@/components/action-form';

export default async function F360Page({ searchParams }: { searchParams: Promise<{ tab?: string; done?: string; declined?: string }> }) {
  const sp = await searchParams;
  const me = await apiFetch<Me>('/me');
  if (!me.permissions.includes('f360:participate') && !me.permissions.includes('f360:manage')) redirect('/dashboard');
  const isTeam = me.permissions.includes('f360:team') || me.permissions.includes('f360:manage');
  const isHr = me.permissions.includes('f360:manage');
  const canParticipate = me.permissions.includes('f360:participate') && !!me.person;
  const tabs = [
    ...(canParticipate ? [{ key: 'requests', label: 'Da compilare', href: '/f360' }, { key: 'mine', label: 'I miei 360°', href: '/f360?tab=mine' }] : []),
    ...(isTeam && me.person ? [{ key: 'team', label: 'Il mio team', href: '/f360?tab=team' }] : []),
    ...(isHr ? [{ key: 'campaigns', label: 'Campagne', href: '/f360?tab=campaigns' }] : []),
  ];
  const tab = tabs.some((t) => t.key === sp.tab) ? sp.tab! : (tabs[0]?.key ?? 'campaigns');
  const [requests, mine, team, campaigns] = await Promise.all([
    canParticipate ? apiFetch<F360RequestSummary[]>('/f360/requests?status=all') : Promise.resolve([] as F360RequestSummary[]),
    canParticipate ? apiFetch<F360SubjectSummary[]>('/f360/subjects?box=mine') : Promise.resolve([] as F360SubjectSummary[]),
    isTeam && me.person ? apiFetch<F360SubjectSummary[]>('/f360/subjects?box=team').catch(() => [] as F360SubjectSummary[]) : Promise.resolve([] as F360SubjectSummary[]),
    isHr ? apiFetch<F360Campaign[]>('/f360/campaigns') : Promise.resolve([] as F360Campaign[]),
  ]);
  const open = requests.filter((r) => r.status === 'pending');
  const todo = open.length + mine.filter((s) => s.can.nominate || s.can.submitNominations).length + team.filter((s) => s.can.approve || s.can.release).length;
  const [framework, units] = tab === 'campaigns' && isHr ? await Promise.all([apiFetch<{ competencies: Competency[] }>('/development/framework'), apiFetch<{ id: string; name: string }[]>('/org-units')]) : [null, [] as { id: string; name: string }[]];
  const SubjectRows = ({ rows, who }: { rows: F360SubjectSummary[]; who: 'person' | 'manager' }) => (
    <TableWrap>
      <table>
        <thead><tr><th>{who === 'person' ? 'Persona' : 'Manager'}</th><th>Campagna</th><th>Stato</th><th>Scadenza</th><th></th></tr></thead>
        <tbody>
          {rows.map((s) => {
            const st = f360SubjectStatusLabel[s.status];
            const p = who === 'person' ? s.person : s.manager;
            const action = s.can.submitNominations || s.can.nominate ? 'Nomina i valutatori' : s.can.approve ? 'Approva le nomine' : s.can.release ? 'Rilascia il report' : s.can.seeReport ? 'Apri il report' : 'Apri';
            return (
              <tr key={s.id}>
                <td>{p ? <Who person={p} /> : '—'}</td>
                <td>{s.campaign.name}<div className="sup">{f360CampaignStatusLabel[s.campaign.status].text}</div></td>
                <td><Pill tone={st.cls as 'g'}>{st.text}</Pill></td>
                <td>{s.campaign.status === 'nomination' ? fmtDate(s.campaign.nominationDueAt) : s.campaign.status === 'collection' ? fmtDate(s.campaign.collectionDueAt) : '—'}</td>
                <td><Button href={`/f360/subjects/${s.id}`} size="sm" variant={s.can.nominate || s.can.approve || s.can.release || (s.can.seeReport && s.viewer === 'self') ? 'primary' : 'default'}>{action}</Button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableWrap>
  );
  return (
    <>
      <PageHeader title="Feedback 360°" subtitle={`${todo} ${todo === 1 ? 'azione in attesa' : 'azioni in attesa'} da parte tua`} />
      {sp.done && <div className="card" style={{ marginBottom: 16 }}><div className="empty">Grazie! Le tue risposte sono state registrate.</div></div>}
      {sp.declined && <div className="card" style={{ marginBottom: 16 }}><div className="empty">Richiesta declinata: chi ti ha nominato è stato avvisato.</div></div>}
      {tabs.length > 1 && <Tabs items={tabs} current={tab} />}
      {tab === 'requests' && (
        <Card title={<>Richieste ricevute <small>{open.length} da compilare</small></>}>
          {requests.length === 0 ? <EmptyState title="Nessuna richiesta di feedback 360°" hint="Quando un collega ti nominerà come valutatore la troverai qui, con la scadenza." /> : (
            <TableWrap>
              <table>
                <thead><tr><th>Su chi</th><th>Come</th><th>Campagna</th><th>Scadenza</th><th>Stato</th><th></th></tr></thead>
                <tbody>
                  {requests.map((r) => {
                    const st = f360RequestStatusLabel[r.status] ?? { text: r.status, cls: 'n' };
                    return (
                      <tr key={r.id}>
                        <td>{r.category === 'self' ? <b>Te stesso/a</b> : r.subject ? <Who person={r.subject} /> : '—'}</td>
                        <td>{r.categoryLabel}{r.anonymous && <div className="sup">anonimo</div>}</td>
                        <td>{r.campaign.name}</td>
                        <td>{fmtDate(r.campaign.collectionDueAt)}</td>
                        <td><Pill tone={st.cls as 'g'}>{st.text}</Pill>{r.hasDraft && r.status === 'pending' && <div className="sup">bozza salvata</div>}</td>
                        <td>{r.status === 'pending' ? <Button href={`/f360/requests/${r.id}`} size="sm" variant="primary">Compila</Button> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      )}
      {tab === 'mine' && <Card title="I miei 360°" aside="campagne in cui sei la persona valutata">{mine.length === 0 ? <EmptyState title="Nessun 360° ti riguarda al momento" hint="L’HR lancia le campagne; riceverai una notifica quando dovrai nominare i tuoi valutatori." /> : <SubjectRows rows={mine} who="manager" />}</Card>}
      {tab === 'team' && <Card title="Il mio team" aside="360° dei tuoi riporti diretti: approvi le nomine, vedi il report, registri il debrief">{team.length === 0 ? <EmptyState title="Nessun 360° per i tuoi riporti" /> : <SubjectRows rows={team} who="person" />}</Card>}
      {tab === 'campaigns' && isHr && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', alignItems: 'start' }}>
          <Card title="Campagne 360°">
            {campaigns.length === 0 ? <EmptyState title="Nessuna campagna" hint="Creane una a destra: scegli le competenze del framework, le categorie di valutatori e le regole." /> : (
              <TableWrap>
                <table>
                  <thead><tr><th>Campagna</th><th>Stato</th><th>Soggetti</th><th>Risposte</th><th>Scadenze</th><th></th></tr></thead>
                  <tbody>
                    {campaigns.map((c) => {
                      const st = f360CampaignStatusLabel[c.status];
                      const subjects = Object.values(c.subjects ?? {}).reduce((a, b) => a + b, 0);
                      const invited = ['pending', 'submitted', 'expired', 'declined'].reduce((a, k) => a + (c.requests?.[k] ?? 0), 0);
                      return (
                        <tr key={c.id}>
                          <td><b>{c.name}</b><div className="sup">{c.competencyKeys.length} competenze · soglia {c.anonymityThreshold}</div></td>
                          <td><Pill tone={st.cls as 'g'}>{st.text}</Pill></td>
                          <td className="num">{subjects}</td>
                          <td>{invited ? <div className="row"><div className="bar g"><i style={{ width: `${Math.round(((c.requests?.submitted ?? 0) / invited) * 100)}%` }} /></div><span className="sup">{c.requests?.submitted ?? 0}/{invited}</span></div> : <span className="sup">—</span>}</td>
                          <td className="sup">nomine {fmtDate(c.nominationDueAt)}<br />raccolta {fmtDate(c.collectionDueAt)}</td>
                          <td><Button href={`/f360/campaigns/${c.id}`} size="sm">Apri</Button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </Card>
          <Card title="Nuova campagna">
            {!framework || framework.competencies.length === 0 ? <div className="suggest">Prima carica o crea le competenze in <Link href="/development/admin">Sviluppo → Amministrazione</Link>: il questionario 360° valuta le competenze del framework.</div> : (
              <ActionForm action={createF360Campaign} className="stack" style={{ gap: 8 }}>
                <label className="field"><span className="lab">Nome</span><input name="name" required className="input" placeholder="360° Leadership 2026" /></label>
                <label className="field"><span className="lab">Descrizione <span className="sup">(facoltativa, mostrata ai valutatori)</span></span><textarea name="description" rows={2} className="input" /></label>
                <div className="field"><span className="lab">Competenze valutate</span><div className="stack" style={{ gap: 4, maxHeight: 180, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 8 }}>{framework.competencies.filter((c) => c.active !== false).map((c) => <label key={c.key} className="check"><input type="checkbox" name="competencyKeys" value={c.key} defaultChecked={c.kind !== 'role'} /> <span>{c.name} <span className="sup">· {c.kind}</span></span></label>)}</div></div>
                <div className="field"><span className="lab">Categorie di valutatori <span className="sup">(min–max nomine)</span></span>
                  <div className="stack" style={{ gap: 4 }}>
                    {(['self', 'manager', 'peer', 'report', 'other', 'external'] as const).map((k) => {
                      const d = { self: [1, 1, true], manager: [1, 1, true], peer: [3, 6, true], report: [0, 8, true], other: [0, 4, true], external: [0, 3, false] }[k] as [number, number, boolean];
                      return <div key={k} className="row" style={{ gap: 8 }}><label className="check" style={{ minWidth: 150 }}><input type="checkbox" name={`cat_${k}`} defaultChecked={d[2]} /> <span>{f360CategoryLabel[k]}</span></label><input name={`min_${k}`} type="number" min={0} max={20} defaultValue={d[0]} className="input" style={{ width: 64 }} aria-label={`min ${f360CategoryLabel[k]}`} /><span className="sup">–</span><input name={`max_${k}`} type="number" min={1} max={20} defaultValue={d[1]} className="input" style={{ width: 64 }} aria-label={`max ${f360CategoryLabel[k]}`} />{k !== 'self' && k !== 'manager' && <span className="sup">anonima</span>}</div>;
                    })}
                  </div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <label className="field" style={{ flex: 1 }}><span className="lab">Chi nomina</span><select name="nominationBy" className="input" defaultValue="subject"><option value="subject">La persona valutata</option><option value="manager">Il manager</option><option value="hr">L’HR</option></select></label>
                  <label className="field" style={{ flex: 1 }}><span className="lab">Rilascio del report</span><select name="releaseRule" className="input" defaultValue="after_debrief"><option value="after_debrief">Dopo il debrief</option><option value="manager">Quando il manager lo rilascia</option><option value="immediately">Subito alla chiusura</option></select></label>
                </div>
                <label className="check"><input type="checkbox" name="requireApproval" defaultChecked /> <span>Le nomine della persona vanno approvate dal manager</span></label>
                <div className="row" style={{ gap: 8 }}>
                  <label className="field" style={{ flex: 1 }}><span className="lab">Soglia di anonimato</span><input name="anonymityThreshold" type="number" min={2} max={10} defaultValue={3} className="input" /></label>
                  <label className="field" style={{ flex: 2 }}><span className="lab">Popolazione</span><select name="orgUnitId" className="input"><option value="">Tutta l’azienda</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name} (e sotto-unità)</option>)}</select></label>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <label className="field" style={{ flex: 1 }}><span className="lab">Nomine entro</span><input name="nominationDueAt" type="date" className="input" /></label>
                  <label className="field" style={{ flex: 1 }}><span className="lab">Raccolta entro</span><input name="collectionDueAt" type="date" className="input" /></label>
                </div>
                <div><Button variant="primary">Crea bozza</Button></div>
              </ActionForm>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
