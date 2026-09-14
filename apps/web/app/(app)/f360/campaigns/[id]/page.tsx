import { notFound } from 'next/navigation';
import { ApiError, apiFetch, fmtDate, f360CampaignStatusLabel, f360CategoryLabel, f360ReleaseRuleLabel, f360SubjectStatusLabel, type F360Aggregate, type F360Campaign } from '@/lib/api';
import { f360CampaignAction } from '@/lib/actions';
import { Button, Card, Kpi, PageHeader, Pill, TableWrap, Who } from '@/components/ui';
import { ActionForm } from '@/components/action-form';

export default async function F360CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ groupBy?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const groupBy = sp.groupBy === 'manager' ? 'manager' : 'org_unit';
  let c: F360Campaign;
  try { c = await apiFetch<F360Campaign>(`/f360/campaigns/${id}`); } catch (e) { if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound(); throw e; }
  const agg = c.status === 'closed' ? await apiFetch<F360Aggregate>(`/f360/campaigns/${id}/aggregate?groupBy=${groupBy}`).catch(() => null) : null;
  const st = f360CampaignStatusLabel[c.status];
  const p = c.progress;
  const cats = c.categories.filter((x) => x.enabled);
  const heat = (v: number | null) => (v == null ? undefined : { background: `color-mix(in oklab, var(--brand) ${Math.round(((v - c.scale.min) / Math.max(1, c.scale.max - c.scale.min)) * 60)}%, var(--surface, #fff))` });
  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={<><Pill tone={st.cls as 'g'}>{st.text}</Pill> · {c.competencyKeys.length} competenze · soglia di anonimato {c.anonymityThreshold} · rilascio: {f360ReleaseRuleLabel[c.releaseRule]}</>}
        actions={
          <>
            <Button href="/f360?tab=campaigns">Tutte le campagne</Button>
            {c.status === 'draft' && <ActionForm action={f360CampaignAction.bind(null, id, 'launch')} inline><Button variant="primary">Lancia (fase di nomina)</Button></ActionForm>}
            {c.status === 'nomination' && <ActionForm action={f360CampaignAction.bind(null, id, 'start-collection')} inline confirm="Le nomine ancora in sospeso saranno approvate d’ufficio e tutti i valutatori riceveranno l’invito. Continuare?"><Button variant="primary">Avvia la raccolta</Button></ActionForm>}
            {c.status === 'collection' && <ActionForm action={f360CampaignAction.bind(null, id, 'remind')} inline><Button>Sollecita</Button></ActionForm>}
            {c.status === 'collection' && <ActionForm action={f360CampaignAction.bind(null, id, 'close')} inline confirm="Chiudere la raccolta? Le richieste aperte scadono e i report vengono generati con le risposte ricevute."><Button variant="primary">Chiudi e genera i report</Button></ActionForm>}
            {c.status === 'closed' && <a className="btn" href={`/api/export?report=f360-aggregate&campaignId=${id}&groupBy=${groupBy}`}>Esporta aggregato CSV</a>}
          </>
        }
      />
      <div className="grid kpis" style={{ marginBottom: 16 }}>
        <Kpi label="Soggetti" value={p?.totals.subjects ?? 0} detail={p ? Object.entries(p.totals.byStatus).map(([k, n]) => `${f360SubjectStatusLabel[k as keyof typeof f360SubjectStatusLabel]?.text ?? k}: ${n}`).join(' · ') : 'bozza'} />
        <Kpi label="Tasso di risposta" value={p && p.totals.invited ? `${Math.round((p.totals.submitted / p.totals.invited) * 100)}%` : '—'} detail={p ? `${p.totals.submitted} risposte su ${p.totals.invited} inviti` : undefined} />
        <Kpi label="Nomine entro" value={fmtDate(c.nominationDueAt)} detail={c.launchedAt ? `lanciata il ${fmtDate(c.launchedAt)}` : undefined} />
        <Kpi label="Raccolta entro" value={fmtDate(c.collectionDueAt)} detail={c.closedAt ? `chiusa il ${fmtDate(c.closedAt)}` : c.collectionStartedAt ? `avviata il ${fmtDate(c.collectionStartedAt)}` : undefined} />
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <div className="stack" style={{ gap: 16 }}>
          {p && (
            <Card title="Avanzamento per soggetto" aside="conteggi per categoria: mai chi ha risposto nelle categorie anonime">
              <TableWrap>
                <table>
                  <thead><tr><th>Persona</th><th>Stato</th>{cats.map((x) => <th key={x.key} className="num" title={x.anonymous ? 'anonima' : 'nominale'}>{f360CategoryLabel[x.key]}</th>)}<th className="num">Totale</th><th></th></tr></thead>
                  <tbody>
                    {p.subjects.map((s) => {
                      const sst = f360SubjectStatusLabel[s.status];
                      return (
                        <tr key={s.id}>
                          <td>{s.person ? <Who person={s.person} role={s.manager ? `manager: ${s.manager.firstName} ${s.manager.lastName}` : 'senza manager'} /> : '—'}</td>
                          <td><Pill tone={sst.cls as 'g'}>{sst.text}</Pill>{s.debriefAt && <div className="sup">debrief {fmtDate(s.debriefAt)}</div>}</td>
                          {cats.map((x) => { const b = s.byCategory[x.key]; return <td key={x.key} className="num">{!b ? <span className="sup">—</span> : c.status === 'nomination' ? b.nominated : <>{b.submitted}/{b.invited}{b.declined ? <span className="sup" title="hanno declinato"> ·{b.declined}✕</span> : ''}</>}</td>; })}
                          <td className="num"><b>{c.status === 'nomination' ? Object.values(s.byCategory).reduce((a, b) => a + b.nominated, 0) : `${s.submitted}/${s.invited}`}</b></td>
                          <td><Button href={`/f360/subjects/${s.id}`} size="sm">Apri</Button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableWrap>
            </Card>
          )}
          {agg && (
            <Card title={<>Heatmap competenze <small>media «altri» per {groupBy === 'manager' ? 'manager' : 'unità'} · gruppi sotto {agg.campaign.threshold} soggetti soppressi</small></>}>
              <div className="row" style={{ marginBottom: 8 }}><Button href={`/f360/campaigns/${id}?groupBy=org_unit`} size="sm" variant={groupBy === 'org_unit' ? 'primary' : 'default'}>Per unità</Button><Button href={`/f360/campaigns/${id}?groupBy=manager`} size="sm" variant={groupBy === 'manager' ? 'primary' : 'default'}>Per manager</Button></div>
              {agg.subjectsWithReport === 0 ? <div className="sup">Nessun report generato.</div> : (
                <TableWrap>
                  <table>
                    <thead><tr><th>{groupBy === 'manager' ? 'Manager' : 'Unità'}</th><th className="num">Soggetti</th>{agg.competencies.map((k) => <th key={k.key} className="num">{k.name}</th>)}</tr></thead>
                    <tbody>
                      {[...agg.rows, ...(agg.total ? [agg.total] : [])].map((r) => (
                        <tr key={r.key} style={r.key === 'all' ? { fontWeight: 700 } : undefined}>
                          <td>{r.label}</td><td className="num">{r.subjects}</td>
                          {agg.competencies.map((k) => <td key={k.key} className="num" style={r.suppressed ? undefined : heat(r.cells[k.key] ?? null)}>{r.suppressed ? <span className="sup" title="sotto soglia">·</span> : r.cells[k.key] == null ? <span className="sup">—</span> : r.cells[k.key]!.toLocaleString('it-IT', { maximumFractionDigits: 2 })}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </Card>
          )}
        </div>
        <div className="stack" style={{ gap: 16 }}>
          <Card title="Configurazione">
            {c.description && <p style={{ marginTop: 0 }}>{c.description}</p>}
            <div className="sup">Competenze</div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>{(c.competencies ?? []).map((k) => <Pill key={k.key} tone="n">{k.name}</Pill>)}</div>
            <div className="sup">Categorie</div>
            <table style={{ marginBottom: 10 }}><tbody>{cats.map((x) => <tr key={x.key}><td>{f360CategoryLabel[x.key]}</td><td className="num">{x.min}–{x.max}</td><td className="sup">{x.anonymous ? 'anonima' : 'nominale'}</td></tr>)}</tbody></table>
            <div className="sup">Nomine: {c.nominationBy === 'subject' ? 'la persona valutata' : c.nominationBy === 'manager' ? 'il manager' : 'l’HR'}{c.requireApproval && c.nominationBy === 'subject' ? ', con approvazione del manager' : ''} · scala {c.scale.min}–{c.scale.max} · il manager {c.managerSeesReport ? 'vede' : 'non vede'} il report</div>
            <div className="sup" style={{ marginTop: 6 }}>Domande aperte: {c.openQuestions.map((q) => q.label).join(' · ') || 'nessuna'}</div>
          </Card>
          <Card title="Come funziona" aside="fasi">
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              <li><b>Nomine</b>: ogni soggetto (o il manager) sceglie i valutatori con i suggerimenti dall’organizzazione; il manager approva.</li>
              <li><b>Raccolta</b>: i valutatori ricevono la richiesta; gli esterni un link personale via email. Sollecita chi manca.</li>
              <li><b>Chiusura</b>: i report vengono generati applicando la soglia di anonimato; le medie alimentano il profilo competenze (fonte 360°).</li>
              <li><b>Rilascio</b>: {(f360ReleaseRuleLabel[c.releaseRule] ?? c.releaseRule).toLowerCase()}; dalle aree di sviluppo si creano azioni nel piano.</li>
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
