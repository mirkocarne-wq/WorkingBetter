import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch, type Me } from '@/lib/api';
import { createFormDefinition } from '@/lib/actions';
import { FormBuilder } from '@/components/form-builder';

export default async function NewFormPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const sp = await searchParams;
  const me = await apiFetch<Me>('/me');
  if (!me.permissions.includes('forms:manage')) redirect('/forms');
  return (
    <>
      <div className="ph">
        <div><h1>Nuovo questionario</h1><p>Sezioni e domande tipizzate; le scale e le scelte con punteggio alimentano il rating delle review. Lo schema resta versionato: le modifiche future creano una nuova versione.</p></div>
        <Link href="/forms" className="btn">Annulla</Link>
      </div>
      <form action={createFormDefinition}>
        <FormBuilder initialKind={sp.kind ?? 'review'} />
        <div className="card" style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" name="publish" defaultChecked /> Pubblica subito (necessario per usarlo in un template di review)</label>
          <button className="btn p">Salva questionario</button>
        </div>
      </form>
    </>
  );
}
