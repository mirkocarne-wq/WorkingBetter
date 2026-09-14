import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError, apiFetch, fmtDate, type FormResponse } from '@/lib/api';
import { FormRunner } from '@/components/form-runner';

export default async function ResponsePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let r: FormResponse;
  try { r = await apiFetch<FormResponse>(`/form-responses/${id}`); } catch (e) { if (e instanceof ApiError && e.status === 404) notFound(); throw e; }
  return (
    <>
      <div className="ph">
        <div><h1>{r.form.name}</h1><p>v{r.form.version} · {r.status === 'submitted' ? `inviato il ${fmtDate(r.submittedAt)}` : r.dueDate ? `da inviare entro ${fmtDate(r.dueDate)}` : 'bozza'}{r.score != null ? ` · punteggio ${Math.round(r.score * 100)}%` : ''}</p></div>
        <Link href="/forms" className="btn">Tutti i form</Link>
      </div>
      {r.form.schema.description && <div className="suggest" style={{ marginBottom: 16 }}>{r.form.schema.description}</div>}
      <div style={{ maxWidth: 820 }}><FormRunner response={r} /></div>
    </>
  );
}
