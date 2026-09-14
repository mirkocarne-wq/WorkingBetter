import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, apiFetch, fmtDate, f360CampaignStatusLabel, f360ReleaseRuleLabel, f360RequestStatusLabel, f360SubjectStatusLabel, type F360SubjectDetail, type F360Suggestion, type Person } from '@/lib/api';
import { approveF360Nominations, debriefF360, nominateF360, releaseF360, removeF360Nomination, submitF360Nominations } from '@/lib/actions';
import { Button, Card, EmptyState, PageHeader, Pill, Who } from '@/components/ui';
import { ActionForm } from '@/components/action-form';
import { F360ReportView } from '@/components/f360-report';

export default async function F360SubjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let s: F360SubjectDetail;
  try { s = await apiFetch<F360SubjectDetail>(`/f360/subjects/${id}`); } catch (e) { if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound(); throw e; }
  const [suggestions, people] = s.can.nominate ? await Promise.all([apiFetch<F360Suggestion[]>(`/f360/subjects/${id}/suggestions`).catch(() => [] as F360Suggestion[]), apiFetch<{ items: Person[] }>('/people?limit=200').then((r) => r.items).catch(() => [] as Person[])]) : [[] as F360Suggestion[], [] as Person[]];
  const isSelf = s.viewer === 'self';
  const name = s.person ? `${s.person.firstName} ${s.person.lastName}` : '—';
  const st = f360SubjectStatusLabel[s.status];
  const cst = f360CampaignStatusLabel[s.campaign.status];
  const nominable = s.byCategory.filter((c) => c.key !== 'self' && c.key !== 'manager');
  const nominated = new Set(s.nominations.map((n) => n.person?.id).filter(Boolean));
  const back = isSelf ? '/f360?tab=mine' : s.viewer === 'manager' ? '/f360?tab=team' : `/f360/campaigns/${s.campaign.id}`;
  return (
    <>
      <PageHeader
        title={isSelf ? `Il mio 360° · ${s.campaign.name}` : `360° di ${name}`}
        subtitle={<><Pill tone={st.cls as 'g'}>{st.text}</Pill> · campagna <Pill tone={cst.cls as 'g'}>{cst.text}</Pill>{s.manager ? ` · manager ${s.manager.firstName} ${s.manager.lastName}` : ''} · rilascio: {(f360ReleaseRuleLabel[s.campaign.releaseRule] ?? s.campaign.releaseRule).toLowerCase()}</>}
        actions={<><Button href={back}>Indietro</Button>{s.can.release && <ActionForm action={releaseF360.bind(null, id)} inline><Button variant="primary">Rilascia il report a {s.person?.firstName}</Button></ActionForm>}</>}
      />
      {s.report && s.can.seeReport ? (
        <>
          <div className="row" style={{ marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
            <span className="sup">Report generato il {fmtDate(s.reportGeneratedAt)}{s.releasedAt ? ` · rilasciato il ${fmtDate(s.releasedAt)}` : ' · non ancora rilasciato alla persona'}{s.debriefAt ? ` · debrief ${fmtDate(s.debriefAt)}` : ''}</span>
          </div>
          {s.can.debrief && (
            <Card title={s.debriefAt ? 'Debrief registrato' : 'Registra il debrief'} aside={s.campaign.releaseRule === 'after_debrief' && s.status === 'ready' ? 'al salvataggio il report viene rilasciato alla persona' : 'colloquio di restituzione'} style={{ marginBottom: 16 }}>
              {s.debriefNote && <div className="suggest" style={{ marginBottom: 8 }}>{s.debriefNote}</div>}
              <ActionForm action={debriefF360.bind(null, id)} className="row" style={{ flexWrap: 'wrap' }} inline>
                <input name="at" type="datetime-local" className="input" style={{ width: 'auto' }} />
                <input name="note" className="input" placeholder="Nota del debrief (visibile a manager e HR, non alla persona)" style={{ minWidth: 280, flex: 1 }} />
                <Button variant={s.debriefAt ? 'default' : 'primary'}>{s.debriefAt ? 'Aggiorna' : 'Registra debrief'}</Button>
              </ActionForm>
            </Card>
          )}
          <F360ReportView report={s.report} competencies={s.competencies} scale={s.scale} subjectId={id} canAddAction={s.can.addDevAction} viewer={s.viewer} />
        </>
      ) : s.status === 'ready' && isSelf ? (
        <Card><EmptyState title="Il tuo report è pronto ma non ancora rilasciato" hint={s.campaign.releaseRule === 'after_debrief' ? 'Lo riceverai dopo il colloquio di restituzione con il tuo manager.' : 'Il tuo manager lo rilascerà a breve.'} /></Card>
      ) : null}

      {(s.campaign.status === 'nomination' || s.campaign.status === 'collection') && (
        <div className="grid" style={{ gridTemplateColumns: s.can.nominate ? 'minmax(0, 1.2fr) minmax(0, 1fr)' : '1fr', alignItems: 'start', marginTop: s.report ? 16 : 0 }}>
          <Card title={<>Valutatori <small>{s.campaign.status === 'nomination' ? `nomine entro ${fmtDate(s.campaign.nominationDueAt)}` : `raccolta entro ${fmtDate(s.campaign.collectionDueAt)}`}</small></>}>
            {s.byCategory.map((cat) => {
              const rows = s.nominations.filter((n) => n.category === cat.key);
              const short = rows.length < cat.min;
              return (
                <div key={cat.key} style={{ padding: '8px 0', borderBottom: '1px solid var(--grid)' }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <b>{cat.label} <span className="sup">{cat.anonymous ? 'anonima' : 'nominale'} · {cat.min > 0 ? `min ${cat.min} · ` : ''}max {cat.max}</span></b>
                    <Pill tone={short ? 'w' : 'g'}>{rows.length}{cat.min ? `/${cat.min}` : ''}</Pill>
                  </div>
                  {rows.length === 0 && <div className="sup">Nessuno.</div>}
                  {rows.map((n) => {
                    const rst = f360RequestStatusLabel[n.status] ?? { text: n.status, cls: 'n' };
                    return (
                      <div key={n.id} className="row" style={{ justifyContent: 'space-between', padding: '4px 0' }}>
                        <span>{n.person ? <Who person={n.person} /> : <span className="who"><span className="av s">✉</span><span><div className="n">{n.externalName}</div><div className="r">{n.externalEmail ?? 'esterno'}</div></span></span>}</span>
                        <span className="row">
                          {n.status !== 'proposed' && <Pill tone={rst.cls as 'g'} title={n.declineReason ?? undefined}>{rst.text}</Pill>}
                          {n.declineReason && <span className="sup">«{n.declineReason}»</span>}
                          {n.canRemove && <form action={removeF360Nomination.bind(null, n.id, id)}><button className="btn sm ghost" title="Rimuovi">✕</button></form>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {s.campaign.status === 'nomination' && (
              <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
                {s.can.submitNominations && s.status === 'nominating' && <ActionForm action={submitF360Nominations.bind(null, id)} inline><Button variant="primary">{s.campaign.requireApproval && isSelf ? 'Invia le nomine al manager' : 'Conferma le nomine'}</Button></ActionForm>}
                {s.status === 'pending_approval' && isSelf && <span className="sup">Nomine inviate il {fmtDate(s.nominationSubmittedAt)}: in attesa dell’approvazione del manager.</span>}
                {s.status === 'approved' && <span className="sup">Nomine approvate il {fmtDate(s.approvedAt)}. La raccolta parte quando l’HR avvia la fase.</span>}
              </div>
            )}
            {s.can.approve && (
              <ActionForm action={approveF360Nominations.bind(null, id)} className="stack" style={{ gap: 6, marginTop: 12 }}>
                <div className="suggest">Approva le nomine di {s.person?.firstName}. Puoi escludere qualcuno spuntandolo: non riceverà la richiesta.</div>
                <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>{s.nominations.filter((n) => n.category !== 'self' && n.category !== 'manager').map((n) => <label key={n.id} className="check"><input type="checkbox" name="rejectIds" value={n.id} /> <span>escludi {n.person ? `${n.person.firstName} ${n.person.lastName}` : n.externalName}</span></label>)}</div>
                <div><Button variant="primary">Approva le nomine</Button></div>
              </ActionForm>
            )}
            {s.campaign.status === 'collection' && <div className="sup" style={{ marginTop: 10 }}>Nelle categorie anonime lo stato mostra solo «invitato»: chi ha risposto non è visibile a nessuno; i conteggi compaiono nel report.</div>}
          </Card>
          {s.can.nominate && (
            <div className="stack" style={{ gap: 16 }}>
              <Card title="Suggerimenti" aside="dall’organizzazione e dai tuoi 1:1">
                {suggestions.length === 0 ? <div className="sup">Nessun suggerimento: usa la ricerca qui sotto.</div> : suggestions.map((p) => (
                  <div key={p.id} className="row" style={{ justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--grid)' }}>
                    <Who person={p} role={p.reason} />
                    <ActionForm action={nominateF360.bind(null, id)} inline><input type="hidden" name="personId" value={p.id} /><select name="category" className="input" defaultValue={p.category} style={{ width: 'auto' }} aria-label="Categoria">{nominable.filter((c) => c.key !== 'external').map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select><Button size="sm">Nomina</Button></ActionForm>
                  </div>
                ))}
              </Card>
              <Card title="Aggiungi un collega">
                <ActionForm action={nominateF360.bind(null, id)} className="row" style={{ flexWrap: 'wrap' }} inline>
                  <select name="personId" className="input" required style={{ minWidth: 220, flex: 1 }} aria-label="Persona"><option value="">Scegli una persona…</option>{people.filter((p) => p.id !== s.personId && p.id !== s.managerPersonId && !nominated.has(p.id) && p.status === 'active').map((p) => <option key={p.id} value={p.id}>{p.firstName} {p.lastName}{p.jobTitle ? ` · ${p.jobTitle}` : ''}</option>)}</select>
                  <select name="category" className="input" style={{ width: 'auto' }} aria-label="Categoria">{nominable.filter((c) => c.key !== 'external').map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
                  <Button size="sm">Nomina</Button>
                </ActionForm>
              </Card>
              {nominable.some((c) => c.key === 'external') && (
                <Card title="Valutatore esterno" aside="cliente, fornitore, partner: riceve un link personale via email">
                  <ActionForm action={nominateF360.bind(null, id)} className="row" style={{ flexWrap: 'wrap' }} inline>
                    <input type="hidden" name="category" value="external" />
                    <input name="externalName" className="input" placeholder="Nome e cognome" required style={{ flex: 1, minWidth: 160 }} />
                    <input name="externalEmail" type="email" className="input" placeholder="email" required style={{ flex: 1, minWidth: 180 }} />
                    <Button size="sm">Invita</Button>
                  </ActionForm>
                </Card>
              )}
            </div>
          )}
        </div>
      )}
      {s.campaign.status === 'closed' && !s.report && !isSelf && <Card><EmptyState title="Report non disponibile" hint="Il report non è visibile con il tuo ruolo per questa campagna." /></Card>}
      <div className="sup" style={{ marginTop: 16 }}>Vedi anche: <Link href="/development">Sviluppo e carriera</Link>{!isSelf && s.person ? <> · <Link href={`/development/people/${s.person.id}`}>profilo competenze di {s.person.firstName}</Link></> : null}</div>
    </>
  );
}
