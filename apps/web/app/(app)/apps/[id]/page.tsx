import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ApiError, apiFetch, fmtDate, appActorLabel, appStatusLabel, type AppDetail, type Me } from '@/lib/api';
import { appAction, createAppFromForm, duplicateApp, saveAppMeta } from '@/lib/actions';
import { Button, Card, PageHeader, Pill } from '@/components/ui';
import { ActionForm } from '@/components/action-form';
import { StageList } from '@/components/app-stage-editor';

const NEW: AppDetail = { id: '', key: '', name: '', version: 1, status: 'draft', templateKey: null, publishedAt: null, definition: { key: '', name: '', description: '', icon: '🧩', naming: { instanceLabel: 'Richiesta', launchVerb: 'Avvia', subjectLabel: 'Persona' }, permissions: { launch: ['hr'], launchForSelfOnly: false, viewInstances: ['hr', 'subject', 'launcher', 'actors'] }, stages: [] }, versions: [], forms: [], problems: [] };

/** Editor dell'app (APP-027 a lista, 031, 032, 033, 035): impostazioni, permessi, fasi, versioni, export. */
export default async function AppEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await apiFetch<Me>('/me');
  if (!me.permissions.includes('apps:manage')) redirect('/apps');
  let a: AppDetail = NEW;
  if (id !== 'new') { try { a = await apiFetch<AppDetail>(`/apps/${id}`); } catch (e) { if (e instanceof ApiError && e.status === 404) notFound(); throw e; } }
  const forms = await apiFetch<{ key: string; name: string }[]>('/forms?status=published&latest=true').catch(() => [] as { key: string; name: string }[]);
  const editable = a.status === 'draft';
  const st = appStatusLabel[a.status] ?? { text: a.status, cls: 'n' };
  const d = a.definition;
  return (
    <>
      <PageHeader
        title={id === 'new' ? 'Nuova app' : <>{d.icon ? `${d.icon} ` : ''}{a.name}</>}
        subtitle={id === 'new' ? 'Un processo custom: fasi, attori, approvazioni' : <><Pill tone={st.cls as 'g'}>{st.text}</Pill> · v{a.version} · chiave <code>{a.key}</code>{a.publishedAt ? ` · pubblicata il ${fmtDate(a.publishedAt)}` : ''}</>}
        actions={
          <>
            <Button href="/apps?tab=studio">Studio</Button>
            {id !== 'new' && editable && <ActionForm action={appAction.bind(null, a.id, 'publish')} inline><Button variant="primary" disabled={a.problems.length > 0} title={a.problems.join(' · ')}>Pubblica</Button></ActionForm>}
            {id !== 'new' && a.status === 'published' && <ActionForm action={appAction.bind(null, a.id, 'versions')} inline><Button variant="primary">Nuova versione</Button></ActionForm>}
            {id !== 'new' && a.status !== 'archived' && <ActionForm action={appAction.bind(null, a.id, 'archive')} inline confirm="Archiviare l’app? Non sarà più avviabile; le istanze in corso proseguono."><Button variant="ghost">Archivia</Button></ActionForm>}
          </>
        }
      />
      {id !== 'new' && a.problems.length > 0 && <div className="suggest" style={{ marginBottom: 16, borderColor: 'var(--warn)' }}>Da sistemare prima di pubblicare: {a.problems.join(' · ')}</div>}
      {id === 'new' ? (
        <Card title="Crea da zero" aside="oppure installa un template dallo Studio">
          <NewAppForm />
        </Card>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', alignItems: 'start' }}>
          <div className="stack" style={{ gap: 16 }}>
            <Card title="Fasi" aside={editable ? 'ordine, attori, scadenze, approvazioni, instradamenti' : 'sola lettura: crea una nuova versione per modificare'}>
              <StageList app={a} forms={forms} editable={editable} />
              <div className="sup" style={{ marginTop: 10 }}>Le fasi consecutive con lo stesso gruppo parallelo sono attive insieme. Il rimando riapre una fase precedente; l’instradamento salta in avanti (o chiude) quando la condizione è vera. I form si creano in <Link href="/forms/new?kind=app">Form → Nuovo questionario</Link> (tipo «app») e vanno pubblicati.</div>
            </Card>
            <Card title="Anteprima del percorso">
              <ol style={{ margin: 0, paddingLeft: 18 }}>{d.stages.map((s) => <li key={s.key} style={{ marginBottom: 4 }}><b>{s.name}</b> <span className="sup">· {appActorLabel(s.actor)} · {s.type === 'form' ? `compila «${forms.find((f) => f.key === s.formKey)?.name ?? s.formKey}»` : s.type === 'approval' ? (s.approval?.rejectTo ? `approva o rimanda a «${d.stages.find((x) => x.key === s.approval!.rejectTo)?.name}»` : 'approva o respinge') : `notifica ${s.notify?.to.map(appActorLabel).join(', ')}`} · entro {s.dueDays} gg</span></li>)}</ol>
            </Card>
          </div>
          <div className="stack" style={{ gap: 16 }}>
            <Card title="Impostazioni" aside="nome, naming, permessi">
              <ActionForm action={saveAppMeta.bind(null, a.id)} className="stack" style={{ gap: 6 }}>
                <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 6 }}>
                  <div className="row"><input name="icon" className="input" defaultValue={d.icon ?? ''} placeholder="🧩" style={{ width: 60 }} aria-label="Icona" /><input name="name" className="input" required defaultValue={a.name} style={{ flex: 1 }} aria-label="Nome" /></div>
                  <textarea name="description" className="input" rows={2} defaultValue={d.description ?? ''} placeholder="Descrizione mostrata a chi avvia" />
                  <div className="row" style={{ flexWrap: 'wrap' }}>
                    <label className="field" style={{ flex: 1 }}><span className="lab">Etichetta istanza</span><input name="instanceLabel" className="input" defaultValue={d.naming.instanceLabel} /></label>
                    <label className="field" style={{ flex: 1 }}><span className="lab">Verbo di avvio</span><input name="launchVerb" className="input" defaultValue={d.naming.launchVerb} /></label>
                    <label className="field" style={{ flex: 1 }}><span className="lab">Etichetta soggetto</span><input name="subjectLabel" className="input" defaultValue={d.naming.subjectLabel} /></label>
                  </div>
                  <div className="field"><span className="lab">Chi può avviare</span><div className="row" style={{ flexWrap: 'wrap' }}>{(['hr', 'manager', 'employee'] as const).map((r) => <label key={r} className="check"><input type="checkbox" name="launch" value={r} defaultChecked={d.permissions.launch.includes(r)} /> <span>{r === 'hr' ? 'HR' : r === 'manager' ? 'Manager (per i riporti)' : 'Dipendenti'}</span></label>)}<label className="check"><input type="checkbox" name="launchForSelfOnly" defaultChecked={d.permissions.launchForSelfOnly} /> <span className="sup">i dipendenti solo per sé</span></label></div></div>
                  <div className="field"><span className="lab">Chi vede le istanze</span><div className="row" style={{ flexWrap: 'wrap' }}>{(['hr', 'subject', 'launcher', 'actors', 'manager'] as const).map((r) => <label key={r} className="check"><input type="checkbox" name="viewInstances" value={r} defaultChecked={d.permissions.viewInstances.includes(r)} /> <span>{{ hr: 'HR', subject: 'Soggetto', launcher: 'Chi avvia', actors: 'Attori delle fasi', manager: 'Manager del soggetto' }[r]}</span></label>)}</div></div>
                  {editable && <div><Button size="sm" variant="primary">Salva impostazioni</Button></div>}
                </fieldset>
              </ActionForm>
            </Card>
            <Card title="Versioni e portabilità">
              <div className="stack" style={{ gap: 4, marginBottom: 8 }}>{a.versions.map((v) => <div key={v.id} className="row" style={{ justifyContent: 'space-between' }}><span>v{v.version} <Pill tone={(appStatusLabel[v.status]?.cls ?? 'n') as 'g'}>{appStatusLabel[v.status]?.text ?? v.status}</Pill></span>{v.id !== a.id ? <Link href={`/apps/${v.id}`} className="sup">apri</Link> : <span className="sup">questa</span>}</div>)}</div>
              <div className="sup" style={{ marginBottom: 8 }}>Form usati: {a.forms.length ? a.forms.map((f) => `${f.name} (v${f.version})`).join(', ') : 'nessuno'}</div>
              <ActionForm action={duplicateApp.bind(null, a.id)} className="row" style={{ flexWrap: 'wrap' }} inline>
                <input name="key" className="input" placeholder="nuova_chiave" required pattern="[a-z][a-z0-9_]*" style={{ width: 150 }} />
                <input name="name" className="input" placeholder="Nome della copia" required style={{ flex: 1, minWidth: 160 }} />
                <Button size="sm">Duplica</Button>
              </ActionForm>
              <details style={{ marginTop: 8 }}><summary className="sup" style={{ cursor: 'pointer' }}>Esporta JSON (copia e incolla in un altro tenant)</summary><ExportBox id={a.id} /></details>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

async function ExportBox({ id }: { id: string }) {
  const exp = await apiFetch<unknown>(`/apps/${id}/export`).catch(() => null);
  return <textarea readOnly className="input" rows={8} defaultValue={exp ? JSON.stringify(exp, null, 1) : 'Export non disponibile'} style={{ fontFamily: 'monospace', fontSize: 11, marginTop: 6 }} />;
}

function NewAppForm() {
  return (
    <ActionForm action={createAppFromForm} className="stack" style={{ gap: 6 }}>
      <div className="row"><input name="key" className="input" placeholder="chiave_app" required pattern="[a-z][a-z0-9_]*" style={{ width: 180 }} /><input name="name" className="input" placeholder="Nome dell’app" required style={{ flex: 1 }} /></div>
      <textarea name="description" className="input" rows={2} placeholder="Descrizione" />
      <div className="sup">L’app nasce in bozza con una fase di esempio: aggiungi e modifica le fasi, poi pubblica.</div>
      <div><Button variant="primary">Crea bozza</Button></div>
    </ActionForm>
  );
}
