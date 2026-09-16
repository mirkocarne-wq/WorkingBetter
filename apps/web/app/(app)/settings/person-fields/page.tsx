import { redirect } from 'next/navigation';
import { PersonFieldTypeLabels, PersonFieldTypes, PersonFieldVisibilities, PersonFieldVisibilityLabels } from '@wb/shared';
import { apiFetch, type Me, type PersonFieldDef } from '@/lib/api';
import { createPersonField, setPersonFieldArchived, updatePersonField } from '@/lib/actions';
import { ActionForm } from '@/components/action-form';
import { Button, PageHeader, Pill } from '@/components/ui';

const SHORT_VIS: Record<PersonFieldDef['visibility'], string> = { hr: 'Solo HR', manager: 'Manager', all: 'Tutti' };
const optionsText = (d: PersonFieldDef) => d.options.map((o) => (o.value === o.label ? o.value : `${o.value}=${o.label}`)).join('\n');

function FieldInputs({ d }: { d?: PersonFieldDef }) {
  return (
    <>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <label className="field"><span className="lab">Etichetta</span><input name="label" className="input" required maxLength={120} defaultValue={d?.label ?? ''} placeholder="es. Tipo di contratto" /></label>
        <label className="field"><span className="lab">Tipo</span><select name="type" className="input" defaultValue={d?.type ?? 'text'}>{PersonFieldTypes.map((t) => <option key={t} value={t}>{PersonFieldTypeLabels[t]}</option>)}</select></label>
        <label className="field"><span className="lab">Sezione</span><input name="section" className="input" maxLength={80} defaultValue={d?.section ?? ''} placeholder="es. Contratto" /></label>
        <label className="field"><span className="lab">Chi lo vede</span><select name="visibility" className="input" defaultValue={d?.visibility ?? 'hr'}>{PersonFieldVisibilities.map((v) => <option key={v} value={v}>{PersonFieldVisibilityLabels[v]}</option>)}</select></label>
      </div>
      <label className="field"><span className="lab">Opzioni (una per riga, «valore=etichetta»; solo per il tipo Scelta)</span><textarea name="options" className="input" rows={3} defaultValue={d ? optionsText(d) : ''} placeholder={'perm=Indeterminato\nfixed=Determinato'} /></label>
      <label className="field"><span className="lab">Aiuto per chi compila</span><input name="help" className="input" maxLength={300} defaultValue={d?.help ?? ''} /></label>
      <label className="check"><input type="checkbox" name="required" defaultChecked={d?.required ?? false} /> <span>Obbligatorio (nell’import CSV e nella scheda)</span></label>
    </>
  );
}

/** Impostazioni → Campi persona (CORE-011): catalogo degli attributi custom dell'anagrafica. */
export default async function PersonFieldsPage({ searchParams }: { searchParams: Promise<{ edit?: string; archived?: string }> }) {
  const me = await apiFetch<Me>('/me');
  if (!me.permissions.includes('people:write')) redirect('/settings');
  const sp = await searchParams;
  const all = await apiFetch<PersonFieldDef[]>('/person-fields?includeArchived=true');
  const fields = sp.archived === '1' ? all : all.filter((d) => !d.archivedAt);
  const editing = sp.edit ? all.find((d) => d.id === sp.edit) : undefined;
  const archivedCount = all.filter((d) => d.archivedAt).length;
  return (
    <>
      <PageHeader title="Campi persona" subtitle={`${all.length - archivedCount} campi attivi${archivedCount ? ` · ${archivedCount} archiviati` : ''} · i valori si compilano nella scheda persona, con l’import CSV (colonne custom:chiave) o con un processo`} actions={<Button href="/settings" variant="ghost">Impostazioni</Button>} />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 340px', alignItems: 'start' }}>
        <div className="card flush">
          <div className="tbl">
            <table>
              <thead><tr><th>Campo</th><th>Chiave</th><th>Tipo</th><th>Visibilità</th><th style={{ textAlign: 'right' }}></th></tr></thead>
              <tbody>
                {fields.length === 0 && <tr><td colSpan={5} className="empty">Nessun campo ancora: definisci il primo dal pannello a destra.</td></tr>}
                {fields.map((d) => (
                  <tr key={d.id} style={d.archivedAt ? { opacity: 0.6 } : undefined}>
                    <td style={{ minWidth: 150 }}><div style={{ fontWeight: 500 }}>{d.label}{d.required && <span title="obbligatorio" style={{ color: 'var(--crit-text)' }}> *</span>}</div>{d.section && <div className="sup">{d.section}</div>}</td>
                    <td><code>{d.key}</code></td>
                    <td>{PersonFieldTypeLabels[d.type]}{d.type === 'single_choice' && <div className="sup">{d.options.length} opzioni</div>}</td>
                    <td><Pill tone={d.visibility === 'hr' ? 'n' : d.visibility === 'manager' ? 'w' : 'g'} title={PersonFieldVisibilityLabels[d.visibility]}>{SHORT_VIS[d.visibility]}</Pill></td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {d.archivedAt ? <form action={setPersonFieldArchived.bind(null, d.id, false)} style={{ display: 'inline' }}><button className="btn sm">Riattiva</button></form> : (
                        <span style={{ display: 'grid', gap: 4, justifyItems: 'end' }}>
                          <Button href={`/settings/person-fields?edit=${d.id}`} size="sm">Modifica</Button>
                          <form action={setPersonFieldArchived.bind(null, d.id, true)}><button className="btn sm ghost">Archivia</button></form>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {archivedCount > 0 && <div style={{ padding: '10px 16px', borderTop: '1px solid var(--grid)' }}><Button href={sp.archived === '1' ? '/settings/person-fields' : '/settings/person-fields?archived=1'} variant="ghost" size="sm">{sp.archived === '1' ? 'Nascondi archiviati' : `Mostra ${archivedCount} archiviati`}</Button></div>}
        </div>
        <div className="card">
          {editing ? (
            <>
              <h3>Modifica «{editing.label}» <small><code>{editing.key}</code></small></h3>
              <ActionForm action={updatePersonField.bind(null, editing.id)} style={{ display: 'grid', gap: 8 }}>
                <FieldInputs d={editing} />
                <div className="row"><Button variant="primary">Salva</Button><Button href="/settings/person-fields" variant="ghost">Annulla</Button></div>
              </ActionForm>
            </>
          ) : (
            <>
              <h3>Nuovo campo <small>la chiave non si potrà cambiare</small></h3>
              <ActionForm action={createPersonField} style={{ display: 'grid', gap: 8 }}>
                <label className="field"><span className="lab">Chiave</span><input name="key" className="input" required pattern="[a-z][a-z0-9_]{0,40}" title="minuscole, numeri e _" placeholder="es. contract_type" /></label>
                <FieldInputs />
                <div><Button variant="primary">Crea campo</Button></div>
              </ActionForm>
            </>
          )}
        </div>
      </div>
    </>
  );
}
