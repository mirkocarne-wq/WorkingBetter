import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, apiFetch, fmtDate, type Me, type SurveyForm, type SurveySummary } from '@/lib/api';
import { SurveyRunner } from '@/components/survey-runner';
import { DriverBars, EnpsTile } from '@/components/survey-widgets';

export default async function SurveyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await apiFetch<Me>('/me');
  let f: SurveyForm;
  try { f = await apiFetch<SurveyForm>(`/surveys/${id}/form`); } catch (e) { if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound(); throw e; }
  const s = f.survey;
  const summary = s.status === 'shared' ? await apiFetch<SurveySummary>(`/surveys/${id}/summary`).catch(() => null) : null;
  return (
    <>
      <div className="ph">
        <div><h1>{s.title}</h1><p>{s.anonymous ? 'Anonima' : 'Nominale'} · {s.status === 'open' ? `chiude il ${fmtDate(s.closesAt)}` : s.status === 'shared' ? `risultati condivisi il ${fmtDate(s.sharedAt)}` : 'chiusa'}</p></div>
        <div style={{ display: 'flex', gap: 8 }}><Link href="/surveys" className="btn">Tutte le survey</Link>{me.permissions.includes('surveys:manage') && <Link href={`/surveys/${id}/results`} className="btn">Gestione e risultati</Link>}</div>
      </div>
      {s.description && <div className="card" style={{ marginBottom: 16 }}>{s.description}</div>}
      {(sp.done || f.responded) && s.status === 'open' && <div className="card"><div className="empty">Grazie! Le tue risposte sono state registrate{s.anonymous ? ' in forma anonima' : ''}. I risultati aggregati saranno condivisi dall’HR alla chiusura.</div></div>}
      {f.canRespond && !sp.done && <SurveyRunner surveyId={id} schema={f.schema} anonymous={s.anonymous} />}
      {!f.canRespond && !f.responded && s.status === 'open' && <div className="card empty">Anteprima: non sei tra gli invitati a questa survey.</div>}
      {summary && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', alignItems: 'start' }}>
          <div className="card"><h3>Cosa abbiamo capito <small>sintesi dell’HR</small></h3><p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{summary.summary}</p><div className="sup" style={{ marginTop: 10 }}>{summary.counts.responded} risposte su {summary.counts.invited} invitati ({Math.round((summary.counts.rate ?? 0) * 100)}%)</div></div>
          <div style={{ display: 'grid', gap: 16 }}>
            {summary.enps && <EnpsTile enps={summary.enps} />}
            <div className="card"><h3>Punteggio per driver</h3><DriverBars drivers={summary.drivers} /></div>
          </div>
        </div>
      )}
      {s.status === 'closed' && !summary && f.invited && <div className="card empty">Survey chiusa: i risultati saranno condivisi dall’HR.</div>}
    </>
  );
}
