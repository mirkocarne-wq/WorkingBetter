import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch, type FormScale, type Me } from '@/lib/api';
import { createFormDefinition } from '@/lib/actions';
import { FormBuilder } from '@/components/form-builder';

export default async function NewFormPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const sp = await searchParams;
  const me = await apiFetch<Me>('/me');
  if (!me.permissions.includes('forms:manage')) redirect('/forms');
  const scales = await apiFetch<FormScale[]>('/form-scales').catch(() => [] as FormScale[]);
  return (
    <>
      <div className="ph">
        <div><h1>Nuovo questionario</h1><p>Sezioni e domande tipizzate, condizioni «mostra solo se», valori calcolati e scale riutilizzabili (<Link href="/forms/scales">Form → Scale</Link>). Le scale e le scelte con punteggio alimentano il rating delle review. Lo schema resta versionato: le modifiche future creano una nuova versione.</p></div>
        <div className="actions"><Link href="/forms/scales" className="btn ghost">Scale</Link><Link href="/forms" className="btn">Annulla</Link></div>
      </div>
      <form action={createFormDefinition}>
        <FormBuilder initialKind={sp.kind ?? 'review'} scales={scales} />
        <div className="card" style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" name="publish" defaultChecked /> Pubblica subito (necessario per usarlo in un template di review)</label>
          <button className="btn p">Salva questionario</button>
        </div>
      </form>
    </>
  );
}
