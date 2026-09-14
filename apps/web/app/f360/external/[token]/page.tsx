import Link from 'next/link';
import { publicFetch, fmtDate, type F360Questionnaire } from '@/lib/api';
import { answerF360External } from '@/lib/actions';
import { F360QuestionnaireForm } from '@/components/f360-questionnaire';

/** Questionario per valutatori esterni tramite magic link (F360-011): nessuna sessione, nessun'altra pagina raggiungibile. */
export default async function F360ExternalPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const q = sp.done ? null : await publicFetch<F360Questionnaire>(`/f360/external/${encodeURIComponent(token)}`).catch(() => null);
  const subject = q?.subject ? `${q.subject.firstName} ${q.subject.lastName}` : 'la persona';
  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 16px' }}>
      <div className="logo" style={{ marginBottom: 16 }}><i /> WorkingBetter</div>
      {sp.done ? (
        <div className="card"><div className="empty"><b>Grazie!</b> Le tue risposte sono state registrate in forma anonima. Puoi chiudere questa pagina.</div></div>
      ) : !q ? (
        <div className="card">
          <div style={{ fontWeight: 700 }}>Link non valido o scaduto</div>
          <p className="sup">Il questionario è stato già inviato, la raccolta è terminata oppure il link non è completo. Se ti aspettavi di poter rispondere, chiedi a chi ti ha invitato di reinviare l’email.</p>
          <Link href="/" className="btn">Vai a WorkingBetter</Link>
        </div>
      ) : (
        <>
          <div className="ph"><div><h1>Feedback su {subject}</h1><p>{q.campaign.name} · gentile {q.external?.name ?? 'ospite'}, grazie per il tuo tempo{q.campaign.collectionDueAt ? ` · entro ${fmtDate(q.campaign.collectionDueAt)}` : ''}</p></div></div>
          {q.campaign.description && <div className="card" style={{ marginBottom: 16 }}>{q.campaign.description}</div>}
          {q.canAnswer ? <F360QuestionnaireForm q={q} action={answerF360External.bind(null, token)} /> : <div className="card"><div className="empty">{q.status === 'submitted' ? 'Risposte già inviate: grazie!' : 'La raccolta è terminata.'}</div></div>}
        </>
      )}
    </div>
  );
}
