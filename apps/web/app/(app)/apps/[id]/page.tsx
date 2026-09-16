import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ApiError, apiFetch, fmtDate, appStageTypeLabel, appStatusLabel, type AppDetail, type Me } from '@/lib/api';
import { appAction, createAppFromForm, duplicateApp, saveAppMeta } from '@/lib/actions';
import { Button, Card, PageHeader, Pill } from '@/components/ui';
import { ActionForm } from '@/components/action-form';
import { StageForm, StageList } from '@/components/app-stage-editor';
import { WorkflowCanvas } from '@/components/workflow-canvas';
import { WorkflowSimulator } from '@/components/workflow-simulator';
import { moveAppStage } from '@/lib/actions';
import { Icon } from '@/components/icons';

const NEW: AppDetail = { id: '', key: '', name: '', version: 1, status: 'draft', templateKey: null, publishedAt: null, definition: { key: '', name: '', description: '', icon: '🧩', naming: { instanceLabel: 'Richiesta', launchVerb: 'Avvia', subjectLabel: 'Persona' }, permissions: { launch: ['hr'], launchForSelfOnly: false, viewInstances: ['hr', 'subject', 'launcher', 'actors'] }, stages: [] }, versions: [], forms: [], problems: [] };

/** Editor dell'app (APP-027 visuale, 008 simulazione, 031, 032, 033, 035): diagramma, pannello della fase, simulazione, impostazioni, versioni, export. */
export default async function AppEditorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ stage?: string; after?: string; view?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const me = await apiFetch<Me>('/me');
  if (!me.permissions.includes('apps:manage')) redirect('/apps');
  let a: AppDetail = NEW;
  if (id !== 'new') { try { a = await apiFetch<AppDetail>(`/apps/${id}`); } catch (e) { if (e instanceof ApiError && e.status === 404) notFound(); throw e; } }
  const forms = await apiFetch<{ key: string; name: string }[]>('/forms?status=published&latest=true').catch(() => [] as { key: string; name: string }[]);
  // chiavi del catalogo campi persona (CORE-011) proposte all'azione «aggiorna attributo»
  const personFields = await apiFetch<{ key: string; label: string }[]>('/person-fields').catch(() => [] as { key: string; label: string }[]);
  const editable = a.status === 'draft';
  const st = appStatusLabel[a.status] ?? { text: a.status, cls: 'n' };
  const d = a.definition;
  const isNew = sp.stage === 'new' && editable;
  const selected = !isNew && sp.stage ? d.stages.find((x) => x.key === sp.stage) ?? null : null;
  const selectedKey = selected?.key ?? null;
  const selectedIndex = selected ? d.stages.findIndex((x) => x.key === selected.key) : -1;
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
        <>
          <Card title="Processo" aside={<span className="row" style={{ gap: 8 }}><span>{d.stages.length} fasi · {d.stages.filter((s) => s.parallelGroup).length ? 'con fasi parallele' : 'in sequenza'}</span><Link href={`/apps/${a.id}${sp.view === 'list' ? '' : '?view=list'}`} className="btn sm ghost">{sp.view === 'list' ? 'Diagramma' : 'Vista elenco'}</Link></span>} className="flush" style={{ marginBottom: 24 }}>
            <div style={{ padding: '0 0 0' }}>
              {sp.view === 'list' ? <div style={{ padding: 20 }}><StageList app={a} forms={forms} editable={editable} /></div> : d.stages.length === 0 ? <div className="empty"><b>Nessuna fase ancora</b>{editable ? <Link href={`/apps/${a.id}?stage=new`} className="btn sm p" style={{ marginTop: 8 }}>Aggiungi la prima fase</Link> : null}</div> : <WorkflowCanvas def={d} base={`/apps/${a.id}`} selected={selectedKey} editable={editable} forms={forms} />}
            </div>
            {sp.view !== 'list' && <div className="sup" style={{ padding: '10px 20px', borderTop: '1px solid var(--grid)' }}>Clicca una fase per modificarla; i «+» inseriscono una fase in quel punto. Frecce tratteggiate blu: instradamenti condizionali in avanti; rosse: rimandi delle approvazioni; ∥ fasi attive insieme. I form si creano in <Link href="/forms/new?kind=app">Form → Nuovo questionario</Link> e vanno pubblicati.</div>}
          </Card>
          <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', alignItems: 'start' }}>
          <div className="stack" style={{ gap: 16 }}>
            {(selected || isNew) && (
              <Card title={isNew ? 'Nuova fase' : <span className="row" style={{ gap: 8 }}>{selected!.name}<Pill>{appStageTypeLabel[selected!.type]}</Pill></span>} aside={isNew ? (sp.after && sp.after !== 'start' ? `dopo «${d.stages.find((x) => x.key === sp.after)?.name ?? sp.after}»` : sp.after === 'start' ? 'all’inizio' : 'in fondo') : editable ? <span className="row" style={{ gap: 4 }}>
                <form action={moveAppStage.bind(null, a.id, d.stages, selected!.key, -1)}><button className="btn sm ghost" title="Sposta prima" disabled={selectedIndex === 0}><Icon name="chev" size={13} stroke={2.2} style={{ transform: 'rotate(180deg)' }} /></button></form>
                <form action={moveAppStage.bind(null, a.id, d.stages, selected!.key, 1)}><button className="btn sm ghost" title="Sposta dopo" disabled={selectedIndex === d.stages.length - 1}><Icon name="chev" size={13} stroke={2.2} /></button></form>
                <form action={moveAppStage.bind(null, a.id, d.stages, selected!.key, 0)}><button className="btn sm ghost" title="Rimuovi fase"><Icon name="x" size={13} stroke={2.2} /></button></form>
                <Link href={`/apps/${a.id}`} className="btn sm ghost" title="Chiudi">Chiudi</Link>
              </span> : <Link href={`/apps/${a.id}`} className="btn sm ghost">Chiudi</Link>}>
                <StageForm app={a} stage={selected} forms={forms} editable={editable} insertAfter={isNew ? (sp.after ?? '') : null} personFields={personFields} />
              </Card>
            )}
            {!selected && !isNew && d.stages.length > 0 && <div className="card" style={{ color: 'var(--ink2)' }}>Seleziona una fase nel diagramma per vederne i dettagli{editable ? ', oppure usa i «+» per aggiungerne una' : ''}.</div>}
            <Card title="Simula il processo" aside="nei panni di un attore, senza creare nulla">
              {d.stages.length === 0 ? <div className="sup">Aggiungi almeno una fase.</div> : <WorkflowSimulator def={d} />}
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
        </>
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
