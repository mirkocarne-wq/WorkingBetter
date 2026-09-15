import Link from 'next/link';
import { redirect } from 'next/navigation';
import { apiFetch, type FormScale, type Me } from '@/lib/api';
import { archiveFormScale, createFormScale } from '@/lib/actions';
import { ActionForm } from '@/components/action-form';
import { Button, Card, EmptyState, Field, Input, PageHeader, Pill } from '@/components/ui';

/** Scale riutilizzabili del tenant (APP-005): un catalogo unico per questionari, review e survey. */
export default async function FormScalesPage() {
  const me = await apiFetch<Me>('/me');
  if (!me.permissions.includes('forms:manage')) redirect('/forms');
  const scales = await apiFetch<FormScale[]>('/form-scales?includeArchived=true');
  const active = scales.filter((s) => !s.archivedAt);
  const archived = scales.filter((s) => s.archivedAt);
  return (
    <>
      <PageHeader title="Scale riutilizzabili" subtitle="Definisci una volta le scale di valutazione dell’azienda; nel costruttore dei questionari basta sceglierle. Modificarne una vale per le prossime pubblicazioni: i questionari già pubblicati restano com’erano." actions={<Button href="/forms" variant="ghost">Form</Button>} />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <Card title="Scale attive" aside={`${active.length}`} className="flush">
          {active.length === 0 ? <EmptyState title="Nessuna scala ancora" hint="Crea la prima a destra: per esempio «Accordo» da 1 a 5 con le etichette agli estremi." /> : (
            <div className="tbl"><table>
              <thead><tr><th>Scala</th><th>Intervallo</th><th>Etichette</th><th></th></tr></thead>
              <tbody>
                {active.map((s) => (
                  <tr key={s.id}>
                    <td><div style={{ fontWeight: 600 }}>{s.name}</div><code style={{ fontSize: 11 }}>{s.key}</code></td>
                    <td>{s.min}–{s.max}{s.allowNa && <Pill>N/A</Pill>}</td>
                    <td className="sup">{Object.entries(s.labels).sort((a, b) => Number(a[0]) - Number(b[0])).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}</td>
                    <td style={{ textAlign: 'right' }}><form action={archiveFormScale.bind(null, s.id, true)}><button className="btn sm ghost" title="Le prossime pubblicazioni non potranno usarla">Archivia</button></form></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
          {archived.length > 0 && (
            <details style={{ padding: '10px 20px', borderTop: '1px solid var(--grid)' }}>
              <summary className="sup" style={{ cursor: 'pointer' }}>{archived.length} archiviate</summary>
              {archived.map((s) => <div key={s.id} className="row" style={{ justifyContent: 'space-between', padding: '6px 0' }}><span>{s.name} <span className="sup">{s.min}–{s.max}</span></span><form action={archiveFormScale.bind(null, s.id, false)}><button className="btn sm ghost">Ripristina</button></form></div>)}
            </details>
          )}
        </Card>
        <Card title="Nuova scala">
          <ActionForm action={createFormScale} className="stack" style={{ gap: 10 }}>
            <Field label="Nome" required><Input name="name" required maxLength={120} placeholder="Accordo (Likert 5)" /></Field>
            <Field label="Chiave" help="minuscole, numeri e underscore; stabile nel tempo" required><Input name="key" required pattern="[a-z][a-z0-9_]*" maxLength={60} placeholder="likert_5" /></Field>
            <div className="row" style={{ gap: 10 }}>
              <Field label="Da" required><Input name="min" type="number" defaultValue={1} min={-100} max={100} required /></Field>
              <Field label="A" required><Input name="max" type="number" defaultValue={5} min={-100} max={100} required /></Field>
              <label className="check" style={{ alignSelf: 'end', paddingBottom: 8 }}><input type="checkbox" name="allowNa" /> <span>ammetti N/A</span></label>
            </div>
            <Field label="Etichette" help="una per riga, «valore = testo»; non serve etichettarle tutte"><textarea name="labels" rows={4} className="input" placeholder={'1 = Per niente d’accordo\n3 = Neutrale\n5 = Del tutto d’accordo'} /></Field>
            <div><Button variant="primary">Crea scala</Button></div>
          </ActionForm>
          <div className="sup" style={{ marginTop: 12 }}>Suggerimenti: <b>Accordo</b> 1–5, <b>Frequenza</b> 1–5 (Raramente…Sempre), <b>Rating review</b> 1–5 (Non soddisfa…Eccezionale), <b>NPS</b> 0–10.</div>
        </Card>
      </div>
      <p className="sup" style={{ marginTop: 16 }}>Le scale si scelgono in <Link href="/forms/new">Nuovo questionario</Link>: alla pubblicazione la scala viene copiata nel questionario, così le compilazioni passate non cambiano se la scala evolve.</p>
    </>
  );
}
