import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { AutomationActionTypeLabels, AutomationActorLabels, AutomationEventCatalog, AutomationEvents, AutomationPersonFields, OpLabels, describeTrigger } from '@wb/shared';
import { ApiError, apiFetch, fmtDate, type AppSummary, type AutomationAction, type AutomationRule, type AutomationRun, type Me, type PersonFieldDef } from '@/lib/api';
import { archiveAutomation, saveAutomation } from '@/lib/actions';
import { ActionForm } from '@/components/action-form';
import { Button, PageHeader, Pill } from '@/components/ui';

const ACTORS = ['subject', 'manager', 'manager_of_manager', 'hr', 'role:hr_admin', 'role:hrbp'];
const actorLabel = (a: string) => AutomationActorLabels[a] ?? (a.startsWith('role:') ? `Ruolo ${a.slice(5)}` : a);
const OPS = Object.entries(OpLabels);

/** Editor di una regola (APP-037/038): trigger con parametri, fino a 5 condizioni e 5 azioni, log delle esecuzioni. */
export default async function AutomationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await apiFetch<Me>('/me');
  if (!me.permissions.includes('apps:manage')) redirect('/apps');
  const isNew = id === 'new';
  let rule: AutomationRule | null = null;
  if (!isNew) { try { rule = await apiFetch<AutomationRule>(`/automations/${id}`); } catch (e) { if (e instanceof ApiError && e.status === 404) notFound(); throw e; } }
  const [runs, appsList, personFields] = await Promise.all([
    rule ? apiFetch<AutomationRun[]>(`/automations/${id}/runs?limit=30`) : Promise.resolve([] as AutomationRun[]),
    apiFetch<AppSummary[]>('/apps?scope=all').catch(() => [] as AppSummary[]),
    apiFetch<PersonFieldDef[]>('/person-fields').catch(() => [] as PersonFieldDef[]),
  ]);
  const published = appsList.filter((a) => a.status === 'published');
  // righe mostrate: quelle salvate più una vuota (fino a 5): l'editor resta compatto
  const conds = [...(rule?.conditions ?? [])];
  if (conds.length < 5) conds.push({ field: '', op: 'eq', value: '' });
  const acts: (AutomationAction | null)[] = [...(rule?.actions ?? [])];
  if (acts.length < 5) acts.push(null);
  const eventInfo = rule ? AutomationEventCatalog[rule.trigger.event] : null;
  return (
    <>
      <PageHeader title={rule ? rule.name : 'Nuova regola'} subtitle={rule ? `${describeTrigger(rule.trigger)} · ${rule.runsCount} esecuzioni${rule.lastRunAt ? ` · ultima ${fmtDate(rule.lastRunAt)}` : ''}` : 'Quando succede un evento, se valgono le condizioni, allora esegui le azioni'} actions={<><Button href="/apps/automations" variant="ghost">Automazioni</Button>{rule && !rule.archivedAt && <form action={archiveAutomation.bind(null, rule.id)}><button className="btn ghost">Archivia</button></form>}</>} />
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', alignItems: 'start' }}>
        <div className="card">
          <ActionForm action={saveAutomation.bind(null, rule?.id ?? null)} style={{ display: 'grid', gap: 16 }}>
            <fieldset disabled={!!rule?.archivedAt} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 16 }}>
              <div className="grid" style={{ gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'end' }}>
                <label className="field"><span className="lab">Nome</span><input name="name" className="input" required maxLength={120} defaultValue={rule?.name ?? ''} placeholder="es. Colloquio di fine prova a 90 giorni" /></label>
                <label className="check" style={{ paddingBottom: 8 }}><input type="checkbox" name="enabled" defaultChecked={rule ? rule.enabled : true} /> <span>Attiva</span></label>
              </div>
              <label className="field"><span className="lab">Descrizione</span><input name="description" className="input" maxLength={500} defaultValue={rule?.description ?? ''} placeholder="Perché esiste questa regola (facoltativo)" /></label>

              <section>
                <div className="lvl" style={{ marginBottom: 6 }}>Quando</div>
                <div className="grid" style={{ gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
                  <label className="field"><span className="lab">Evento</span><select name="event" className="input" defaultValue={rule?.trigger.event ?? 'person.created'}>{AutomationEvents.map((e) => <option key={e} value={e}>{AutomationEventCatalog[e].label}</option>)}</select></label>
                  <label className="field"><span className="lab">Giorni (eventi a tempo)</span><input name="days" type="number" min={0} max={3650} className="input" defaultValue={rule?.trigger.days ?? ''} placeholder="es. 90" /></label>
                  <label className="field"><span className="lab">Solo l’app (per «processo concluso»)</span><select name="triggerAppKey" className="input" defaultValue={rule?.trigger.appKey ?? ''}><option value="">qualsiasi</option>{published.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}</select></label>
                </div>
                <p className="sup" style={{ margin: '6px 0 0' }}>{eventInfo ? eventInfo.description : 'Gli eventi «a tempo» (giorni dall’ingresso, giorni all’uscita) vengono valutati ogni giorno dal worker.'}</p>
              </section>

              <section>
                <div className="lvl" style={{ marginBottom: 6 }}>Se (tutte vere) <span className="sup" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>· salva per aggiungere un’altra riga (max 5)</span></div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {conds.map((c, i) => (
                    <div key={i} className="grid" style={{ gridTemplateColumns: '2fr 100px 2fr', gap: 6 }}>
                      <input name={`cond.${i}.field`} className="input" list="auto-fields" placeholder={i === 0 ? 'campo (es. rating, person.location)' : ''} defaultValue={c.field} />
                      <select name={`cond.${i}.op`} className="input" defaultValue={c.op}>{OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                      <input name={`cond.${i}.value`} className="input" placeholder="valore (per «in»: a, b, c)" defaultValue={Array.isArray(c.value) ? c.value.join(', ') : c.value == null ? '' : String(c.value)} />
                    </div>
                  ))}
                </div>
                <datalist id="auto-fields">
                  {AutomationEvents.flatMap((e) => AutomationEventCatalog[e].fields.map((f) => <option key={`${e}:${f.key}`} value={f.key}>{`${f.label} (${AutomationEventCatalog[e].label})`}</option>))}
                  {AutomationPersonFields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                  {personFields.map((f) => <option key={`pf:${f.key}`} value={`person.custom.${f.key}`}>{`${f.label} (campo custom)`}</option>)}
                </datalist>
              </section>

              <section>
                <div className="lvl" style={{ marginBottom: 6 }}>Allora (in sequenza) <span className="sup" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>· salva per aggiungere un’altra azione (max 5)</span></div>
                <div style={{ display: 'grid', gap: 10 }}>
                  {acts.map((a, i) => (
                    <div key={i} style={{ display: 'grid', gap: 6, padding: 10, border: '1px solid var(--grid)', borderRadius: 10 }}>
                      <div className="grid" style={{ gridTemplateColumns: '220px 1fr', gap: 6 }}>
                        <select name={`act.${i}.type`} className="input" defaultValue={a?.type ?? ''}><option value="">— nessuna azione —</option>{Object.entries(AutomationActionTypeLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                        <span className="sup" style={{ alignSelf: 'center' }}>{a ? '' : 'compila solo i campi dell’azione scelta'}</span>
                      </div>
                      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 6 }}>
                        <select name={`act.${i}.appKey`} className="input" defaultValue={a?.type === 'start_app' ? a.appKey : ''} title="Avvia un’app"><option value="">app da avviare…</option>{published.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</select>
                        <input name={`act.${i}.title`} className="input" placeholder="titolo dell’azione" defaultValue={a?.type === 'action_item' ? a.title : ''} />
                        <select name={`act.${i}.assignee`} className="input" defaultValue={a?.type === 'action_item' ? a.assignee : 'manager'} title="Assegnatario">{ACTORS.map((x) => <option key={x} value={x}>{actorLabel(x)}</option>)}</select>
                        <input name={`act.${i}.dueDays`} type="number" min={0} max={365} className="input" placeholder="scadenza (gg)" defaultValue={a?.type === 'action_item' ? (a.dueDays ?? '') : ''} />
                        <input name={`act.${i}.field`} className="input" list="auto-person-fields" placeholder="attributo (jobLevel, custom:chiave)" defaultValue={a?.type === 'person_field' ? a.field : ''} />
                        <input name={`act.${i}.value`} className="input" placeholder="nuovo valore" defaultValue={a?.type === 'person_field' ? (a.value ?? '') : ''} />
                        <input name={`act.${i}.url`} className="input" placeholder="https://… (webhook)" defaultValue={a?.type === 'webhook' ? a.url : ''} />
                        <input name={`act.${i}.message`} className="input" placeholder="testo della notifica" defaultValue={a?.type === 'notify' ? a.message : ''} />
                      </div>
                      <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}><span className="sup">Notifica a</span>{ACTORS.map((x) => <label key={x} className="check"><input type="checkbox" name={`act.${i}.to`} value={x} defaultChecked={a?.type === 'notify' ? a.to.includes(x as never) : false} /> <span className="sup">{actorLabel(x)}</span></label>)}</div>
                    </div>
                  ))}
                </div>
                <datalist id="auto-person-fields"><option value="jobTitle">Titolo di ruolo</option><option value="jobLevel">Livello</option><option value="location">Sede</option>{personFields.map((f) => <option key={f.key} value={`custom:${f.key}`}>{f.label}</option>)}</datalist>
              </section>
              <div><Button variant="primary">{rule ? 'Salva regola' : 'Crea regola'}</Button></div>
            </fieldset>
          </ActionForm>
        </div>
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="card">
            <h3>Come funziona</h3>
            <ul style={{ margin: 0, padding: '0 0 0 16px', color: 'var(--ink2)', fontSize: 13.5, display: 'grid', gap: 6 }}>
              <li>Le regole sugli eventi scattano subito, nella stessa operazione che genera l’evento; quelle a tempo ogni giorno.</li>
              <li>Una regola scatta una sola volta per evento e persona (una volta al giorno per gli eventi a tempo).</li>
              <li>Un’azione fallita non blocca le altre: l’esito resta nel log qui sotto.</li>
              <li>I processi avviati da una regola possono a loro volta innescare una regola, ma non oltre un livello.</li>
              <li>Limiti: 50 regole per tenant, 5 condizioni e 5 azioni per regola.</li>
            </ul>
          </div>
          {rule && (
            <div className="card flush">
              <div className="hd"><h3>Esecuzioni<span className="count">{rule.runsCount}</span></h3></div>
              {runs.length === 0 ? <div className="empty" style={{ padding: '18px 16px' }}>Nessuna esecuzione ancora.</div> : runs.map((r) => (
                <div key={r.id} className="rowi" style={{ alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ gap: 8 }}><Pill tone={r.ok ? 'g' : 'w'} dot>{r.ok ? 'ok' : 'con errori'}</Pill><span style={{ fontWeight: 500 }}>{r.subjectName ? <Link href={`/people/${r.subjectPersonId}`}>{r.subjectName}</Link> : r.event}</span><span className="sup">{fmtDate(r.at)}</span></div>
                    <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 12.5, color: 'var(--ink2)' }}>{r.results.map((x, i) => <li key={i}>{x.type}: {x.ok ? 'ok' : 'errore'}{x.detail ? ` · ${x.detail}` : ''}</li>)}</ul>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
