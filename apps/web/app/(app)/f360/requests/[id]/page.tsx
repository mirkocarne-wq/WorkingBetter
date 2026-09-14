import { notFound } from 'next/navigation';
import { ApiError, apiFetch, fmtDate, type F360Questionnaire } from '@/lib/api';
import { answerF360, declineF360 } from '@/lib/actions';
import { Button, Card, EmptyState, PageHeader } from '@/components/ui';
import { F360QuestionnaireForm } from '@/components/f360-questionnaire';

export default async function F360RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let q: F360Questionnaire;
  try { q = await apiFetch<F360Questionnaire>(`/f360/requests/${id}`); } catch (e) { if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound(); throw e; }
  const who = q.category === 'self' ? 'La tua autovalutazione' : `Feedback su ${q.subject ? `${q.subject.firstName} ${q.subject.lastName}` : '—'}`;
  return (
    <>
      <PageHeader title={who} subtitle={<>{q.campaign.name} · come {q.categoryLabel.toLowerCase()} · {q.canAnswer ? `entro ${fmtDate(q.campaign.collectionDueAt)}` : q.status === 'submitted' ? `inviato il ${fmtDate(q.submittedAt)}` : 'richiesta chiusa'}</>} actions={<Button href="/f360">Le mie richieste</Button>} />
      {q.campaign.description && <Card style={{ marginBottom: 16 }}><p style={{ margin: 0 }}>{q.campaign.description}</p></Card>}
      {q.canAnswer ? <F360QuestionnaireForm q={q} action={answerF360.bind(null, id)} declineAction={declineF360.bind(null, id)} /> : <Card><EmptyState title={q.status === 'submitted' ? 'Risposte già inviate' : 'Questa richiesta non è più aperta'} hint={q.status === 'submitted' ? 'Grazie: le tue risposte sono state registrate.' : 'La raccolta è terminata o la richiesta è stata declinata.'} /></Card>}
    </>
  );
}
