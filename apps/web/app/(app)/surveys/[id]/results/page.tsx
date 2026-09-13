import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ApiError, apiFetch, fmtDate, surveyStatusLabel, type Me, type SurveyDetail, type SurveyResults } from '@/lib/api';
import { closeSurvey, extendSurvey, launchSurvey, remindSurvey, shareSurvey } from '@/lib/actions';
import { DriverBars, EnpsTile } from '@/components/survey-widgets';

const input = { width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, font: 'inherit', background: '#fff' } as const;
const heatColor = (v: number | null) => (v == null ? 'transparent' : `rgba(42, 120, 214, ${0.12 + v * 0.55})`);

export default async function SurveyResultsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ segment?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await apiFetch<Me>('/me');
  const isHr = me.permissions.includes('surveys:manage');
  if (!isHr && !me.permissions.includes('surveys:results:team')) redirect(`/surveys/${id}`);
  const segment = sp.segment === 'manager' || sp.segment === 'tenure' ? sp.segment : 'org_unit';
  let detail: SurveyDetail | null = null;
  if (isHr) {
    try { detail = await apiFetch<SurveyDetail>(`/surveys/${id}`); } catch (e) { if (e instanceof ApiError && e.status === 404) notFound(); throw e; }
  }
  const results = detail?.status === 'draft' ? null : await apiFetch<SurveyResults>(`/surveys/${id}/results?segment=${segment}`).catch((e) => { if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound(); throw e; });
  const s = detail ?? results!.survey;
  const st = surveyStatusLabel[s.status]!;
  const driverKeys = results ? [...new Set(results.heatmap.flatMap((h) => Object.keys(h.drivers)))] : [];
  const inTwoWeeks = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  return (
    <>
      <div className="ph">
        <div><h1>{s.title}</h1><p><span className={`pill ${st.cls}`}>{st.text}</span> · {s.anonymous ? `anonima · soglia ${s.anonymityThreshold}` : 'nominale'}{s.closesAt ? ` · chiude il ${fmtDate(s.closesAt)}` : ''}{results?.scope === 'team' ? ' · perimetro: il tuo team' : ''}</p></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/surveys" className="btn">Tutte le survey</Link>
          {isHr && s.status === 'open' && <><form action={remindSurvey.bind(null, id)}><button className="btn">Sollecita chi non ha risposto</button></form><form action={closeSurvey.bind(null, id)}><button className="btn">Chiudi ora</button></form></>}
        </div>
      </div>

      {detail?.status === 'draft' && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'start' }}>
          <div className="card">
            <h3>Popolazione <small>{detail.populationPreview?.count ?? 0} persone</small></h3>
            <div className="sup" style={{ marginBottom: 8 }}>Prime persone incluse: {detail.populationPreview?.sample.map((p) => p.name).join(', ')}{(detail.populationPreview?.count ?? 0) > 12 ? '…' : ''}</div>
            {detail.anonymous && (detail.populationPreview?.count ?? 0) < detail.anonymityThreshold && <div className="error">Popolazione sotto la soglia di anonimato ({detail.anonymityThreshold}): il lancio verrà rifiutato.</div>}
            <form action={launchSurvey.bind(null, id)} style={{ display: 'grid', gap: 8, marginTop: 10 }}>
              <label>Chiude il<input name="closesAt" type="date" defaultValue={s.closesAt ? s.closesAt.slice(0, 10) : inTwoWeeks} style={input} /></label>
              <div><button className="btn p">Lancia la survey</button></div>
              <div className="sup">Al lancio ogni persona riceve una notifica e un’email con il link. I promemoria partono automaticamente a 3 giorni e a 1 giorno dalla chiusura.</div>
            </form>
          </div>
          <div className="card"><h3>Questionario <small>{detail.schema.sections.reduce((n, x) => n + x.fields.length, 0)} domande</small></h3>{detail.schema.sections.map((sec) => <div key={sec.key} style={{ marginBottom: 10 }}><div className="lvl">{sec.title}</div>{sec.fields.map((f) => <div key={f.key} style={{ padding: '4px 0', borderBottom: '1px solid var(--grid)', fontSize: 13 }}>{f.label} <span className="sup">· {detail!.drivers[f.key] ?? (f.type === 'scale' && f.key === detail!.enpsField ? 'eNPS' : f.type === 'long_text' ? 'testo libero' : '')}</span></div>)}</div>)}</div>
        </div>
      )}

      {results && (
        <>
          <div className="grid kpis" style={{ marginBottom: 16 }}>
            {results.counts && <div className="card kpi"><div className="l">Tasso di risposta</div><div className="v">{Math.round((results.counts.rate ?? 0) * 100)}%</div><div className="d">{results.counts.responded} su {results.counts.invited} invitati</div></div>}
            {!results.counts && <div className="card kpi"><div className="l">Risposte del tuo team</div><div className="v">{results.responses}</div><div className="d">{results.suppressed ? `sotto la soglia di ${results.threshold}: nessun dettaglio` : 'sopra soglia'}</div></div>}
            {results.enps && <EnpsTile enps={results.enps} previous={results.previous?.enps ?? null} />}
            {results.previous && <div className="card kpi"><div className="l">Confronto</div><div className="v" style={{ fontSize: 18 }}>{results.previous.title}</div><div className="d">{results.previous.responses} risposte nella precedente</div></div>}
          </div>
          {results.suppressed ? <div className="card empty">Meno di {results.threshold} risposte{results.scope === 'team' ? ' nel tuo team' : ''}: per proteggere l’anonimato i risultati non vengono mostrati.</div> : (
            <>
              <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', alignItems: 'start', marginBottom: 16 }}>
                <div className="card"><h3>Driver <small>quota del punteggio massimo{results.previous ? ' · variazione vs precedente' : ''}</small></h3><DriverBars drivers={results.drivers} previous={results.previous?.drivers} /></div>
                <div className="card">
                  <h3>Domande <small>media e distribuzione</small></h3>
                  <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                    {results.questions.map((q) => {
                      const max = Math.max(1, ...Object.values(q.distribution));
                      return (
                        <div key={q.key} style={{ padding: '8px 0', borderBottom: '1px solid var(--grid)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}><span>{q.label}</span><b style={{ whiteSpace: 'nowrap' }}>{q.avg?.toLocaleString('it-IT', { maximumFractionDigits: 2 }) ?? '—'}</b></div>
                          <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 22, marginTop: 4 }} title={Object.entries(q.distribution).map(([k, v]) => `${k}: ${v}`).join(' · ')}>
                            {Object.entries(q.distribution).map(([k, v]) => <div key={k} style={{ flex: 1, background: 'var(--brand)', opacity: 0.35 + 0.65 * (v / max), height: `${Math.max(2, (v / max) * 100)}%`, borderRadius: '3px 3px 0 0' }} />)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              {isHr && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <h3>Heatmap per segmento <small>segmenti sotto soglia nascosti (protezione per differenza inclusa)</small></h3>
                  <div className="filters" style={{ marginBottom: 10 }}><span className="seg">{[['org_unit', 'Unità'], ['manager', 'Manager'], ['tenure', 'Anzianità']].map(([v, l]) => <Link key={v} href={`/surveys/${id}/results?segment=${v}`} className={segment === v ? 'on' : ''}>{l}</Link>)}</span></div>
                  <div style={{ overflowX: 'auto' }}>
                    <table>
                      <thead><tr><th>Segmento</th><th className="num">Risposte</th>{driverKeys.map((k) => <th key={k} className="num">{results.drivers.find((d) => d.key === k)?.label ?? k}</th>)}<th className="num">eNPS</th></tr></thead>
                      <tbody>{results.heatmap.map((h) => <tr key={h.key}><td>{h.label}</td><td className="num">{h.suppressed ? <span className="sup">n&lt;{results.threshold}</span> : h.n}</td>{driverKeys.map((k) => <td key={k} className="num" style={{ background: heatColor(h.drivers[k] ?? null) }}>{h.drivers[k] == null ? <span className="sup">—</span> : `${Math.round((h.drivers[k] ?? 0) * 100)}%`}</td>)}<td className="num">{h.enps == null ? <span className="sup">—</span> : `${h.enps > 0 ? '+' : ''}${h.enps}`}</td></tr>)}</tbody>
                    </table>
                  </div>
                  {detail?.bySegment.length ? <div className="sup" style={{ marginTop: 8 }}>Tasso di risposta per unità: {detail.bySegment.map((b) => `${b.name} ${b.responded == null ? `(n<${s.anonymityThreshold})` : `${b.responded}/${b.invited}`}`).join(' · ')}</div> : null}
                </div>
              )}
              {isHr && results.comments.length > 0 && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <h3>Commenti <small>{results.comments.length} · in ordine casuale, senza attributi</small></h3>
                  {results.comments.map((c, i) => <div key={i} style={{ padding: '8px 0', borderBottom: '1px solid var(--grid)' }}>“{c.text}”</div>)}
                </div>
              )}
            </>
          )}
          {isHr && (s.status === 'closed' || s.status === 'shared') && (
            <form action={shareSurvey.bind(null, id)} className="card" style={{ display: 'grid', gap: 8 }}>
              <h3>{s.status === 'shared' ? 'Sintesi pubblicata' : 'Condividi i risultati con chi ha partecipato'} <small>ENG-027</small></h3>
              <textarea name="summary" rows={4} required defaultValue={detail?.summary ?? ''} placeholder="Cosa abbiamo capito, cosa faremo, entro quando." style={{ ...input, resize: 'vertical' }} />
              <div><button className="btn p">{s.status === 'shared' ? 'Aggiorna la sintesi' : 'Pubblica la sintesi'}</button></div>
              <div className="sup">Le persone invitate vedranno la sintesi, il tasso di risposta, i driver e l’eNPS complessivi. Mai segmenti né commenti.</div>
            </form>
          )}
          {isHr && s.status === 'open' && (
            <form action={extendSurvey.bind(null, id)} className="card" style={{ display: 'flex', gap: 8, alignItems: 'end', maxWidth: 420 }}>
              <label style={{ flex: 1 }}>Proroga la chiusura al<input name="closesAt" type="date" required style={input} /></label><button className="btn">Proroga</button>
            </form>
          )}
        </>
      )}
    </>
  );
}
