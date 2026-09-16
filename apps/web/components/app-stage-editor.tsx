import { appActionTypeLabel, appActorLabel, appStageTypeLabel, type AppDetail, type AppStageDef } from '@/lib/api';
import { moveAppStage, saveAppStage } from '@/lib/actions';
import { Button, Pill } from '@/components/ui';
import { ActionForm } from '@/components/action-form';

const ACTORS = ['subject', 'manager', 'manager_of_manager', 'launcher', 'hr', 'role:hr_admin', 'role:hrbp', 'role:manager'];
const PERSON_FIELDS = [['jobTitle', 'Titolo di ruolo'], ['jobLevel', 'Livello'], ['location', 'Sede'], ['custom:', 'Campo custom (custom:chiave)']];
const OPS = [['', '—'], ['eq', '='], ['ne', '≠'], ['lt', '<'], ['lte', '≤'], ['gt', '>'], ['gte', '≥'], ['in', 'in (a,b,c)'], ['not_empty', 'non vuoto']];

/** Modulo di una fase (APP-020…023): usato per modificare una fase esistente o aggiungerne una. */
export function StageForm({ app, stage, forms, editable, insertAfter, personFields = [] }: { app: AppDetail; stage: AppStageDef | null; forms: { key: string; name: string }[]; editable: boolean; insertAfter?: string | null; personFields?: { key: string; label: string }[] }) {
  const s = stage ?? { key: '', name: '', type: 'form' as const, actor: 'subject', dueDays: 7, seePrevious: true, parallelGroup: null, formKey: null, approval: null, notify: null, actions: null, transitions: null, description: null };
  const t = s.transitions?.[0];
  const a = s.actions?.[0] ?? null;
  const rest = (s.actions ?? []).slice(1);
  const others = app.definition.stages.filter((x) => x.key !== s.key);
  return (
    <ActionForm action={saveAppStage.bind(null, app.id, app.definition.stages, stage ? stage.key : null)} className="stack" style={{ gap: 6 }}>
      <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 6 }}>
        {!stage && insertAfter && <input type="hidden" name="insertAfter" value={insertAfter} />}
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <input name="key" className="input" placeholder="chiave_fase" required pattern="[a-z][a-z0-9_]*" defaultValue={s.key} style={{ width: 160 }} readOnly={!!stage} />
          <input name="name" className="input" placeholder="Nome della fase" required defaultValue={s.name} style={{ flex: 1, minWidth: 200 }} />
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <select name="type" className="input" style={{ width: 'auto' }} defaultValue={s.type}>{Object.entries(appStageTypeLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <select name="actor" className="input" style={{ width: 'auto' }} defaultValue={s.actor}>{ACTORS.map((a) => <option key={a} value={a}>{appActorLabel(a)}</option>)}</select>
          <label className="row" style={{ gap: 4 }}><span className="sup">entro</span><input name="dueDays" type="number" min={0} max={365} className="input" defaultValue={s.dueDays} style={{ width: 70 }} /><span className="sup">giorni</span></label>
          <input name="parallelGroup" className="input" placeholder="gruppo parallelo (opz.)" defaultValue={s.parallelGroup ?? ''} style={{ width: 170 }} />
          <label className="check"><input type="checkbox" name="seePrevious" defaultChecked={s.seePrevious} /> <span className="sup">vede le fasi precedenti</span></label>
        </div>
        <input name="description" className="input" placeholder="Istruzioni per chi compila o decide (facoltative)" defaultValue={s.description ?? ''} />
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <label className="row" style={{ gap: 4 }}><span className="sup">Form (compilazione)</span><select name="formKey" className="input" style={{ width: 'auto' }} defaultValue={s.formKey ?? ''}><option value="">—</option>{forms.map((f) => <option key={f.key} value={f.key}>{f.name} ({f.key})</option>)}</select></label>
          <label className="row" style={{ gap: 4 }}><span className="sup">Rimando (approvazione)</span><select name="rejectTo" className="input" style={{ width: 'auto' }} defaultValue={s.approval?.rejectTo ?? ''}><option value="">respingi e chiudi</option>{others.map((o) => <option key={o.key} value={o.key}>a «{o.name}»</option>)}</select></label>
          <label className="check"><input type="checkbox" name="requireComment" defaultChecked={s.approval?.requireComment ?? true} /> <span className="sup">commento obbligatorio per rimandare</span></label>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <span className="sup">Notifica a</span>{['subject', 'manager', 'launcher', 'hr'].map((a) => <label key={a} className="check"><input type="checkbox" name="notifyTo" value={a} defaultChecked={s.notify?.to?.includes(a) ?? a === 'subject'} /> <span className="sup">{appActorLabel(a)}</span></label>)}
          <input name="message" className="input" placeholder="Testo della notifica" defaultValue={s.notify?.message ?? ''} style={{ flex: 1, minWidth: 200 }} />
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <span className="sup">Azione automatica</span>
          <select name="actionType" className="input" style={{ width: 'auto' }} defaultValue={a?.type ?? ''}><option value="">—</option>{Object.entries(appActionTypeLabel).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <input name="actionTitle" className="input" placeholder="titolo dell’action item" defaultValue={a?.type === 'action_item' ? a.title : ''} style={{ width: 200 }} />
          <select name="actionAssignee" className="input" style={{ width: 'auto' }} defaultValue={a?.type === 'action_item' ? a.assignee : 'manager'}>{ACTORS.map((x) => <option key={x} value={x}>{appActorLabel(x)}</option>)}</select>
          <input name="actionDueDays" type="number" min={0} max={365} className="input" placeholder="gg" defaultValue={a?.type === 'action_item' ? (a.dueDays ?? 7) : 7} style={{ width: 64 }} />
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <input name="actionField" className="input" list={`pf-${s.key || 'new'}`} placeholder="attributo (jobTitle, jobLevel, location, custom:chiave)" defaultValue={a?.type === 'person_field' ? a.field : ''} style={{ width: 260 }} />
          <datalist id={`pf-${s.key || 'new'}`}>{PERSON_FIELDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}{personFields.map((f) => <option key={`custom:${f.key}`} value={`custom:${f.key}`}>{f.label} (campo custom)</option>)}</datalist>
          <input name="actionValue" className="input" placeholder="nuovo valore" defaultValue={a?.type === 'person_field' ? (a.value ?? '') : ''} style={{ width: 160 }} />
          <input name="actionUrl" className="input" placeholder="https://… (webhook)" defaultValue={a?.type === 'webhook' ? a.url : ''} style={{ width: 220 }} />
          <label className="check"><input type="checkbox" name="actionIncludeAnswers" defaultChecked={a?.type === 'webhook' ? !!a.includeAnswers : true} /> <span className="sup">con le risposte</span></label>
          <input name="actionAppKey" className="input" placeholder="chiave app da avviare" defaultValue={a?.type === 'start_app' ? a.appKey : ''} style={{ width: 180 }} />
          <input type="hidden" name="actionsRest" value={JSON.stringify(rest)} />
          {rest.length > 0 && <span className="sup">+{rest.length} altre azioni (modificabili via import JSON)</span>}
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <span className="sup">Instradamento: se</span>
          <input name="condField" className="input" placeholder="campo (vuoto = esito)" defaultValue={t?.when.field ?? ''} style={{ width: 160 }} />
          <select name="condOp" className="input" style={{ width: 'auto' }} defaultValue={t?.when.op ?? ''}>{OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          <input name="condValue" className="input" placeholder="valore" defaultValue={t?.when.value == null ? '' : Array.isArray(t.when.value) ? t.when.value.join(',') : String(t.when.value)} style={{ width: 120 }} />
          <span className="sup">vai a</span>
          <select name="condGoto" className="input" style={{ width: 'auto' }} defaultValue={t?.goto ?? ''}><option value="">—</option><option value="end">fine</option>{others.map((o) => <option key={o.key} value={o.key}>{o.name}</option>)}</select>
        </div>
        {editable && <div><Button size="sm" variant={stage ? 'default' : 'primary'}>{stage ? 'Salva fase' : 'Aggiungi fase'}</Button></div>}
      </fieldset>
    </ActionForm>
  );
}

export function StageList({ app, forms, editable }: { app: AppDetail; forms: { key: string; name: string }[]; editable: boolean }) {
  const stages = app.definition.stages;
  return (
    <div className="stack" style={{ gap: 8 }}>
      {stages.map((s, i) => (
        <details key={s.key} style={{ border: '1px solid var(--grid)', borderRadius: 10, padding: '8px 12px' }}>
          <summary style={{ cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <b>{i + 1}. {s.name}</b>
            <Pill tone="n">{appStageTypeLabel[s.type]}</Pill>
            <span className="sup">{appActorLabel(s.actor)} · {s.dueDays} gg{s.parallelGroup ? ` · parallelo «${s.parallelGroup}»` : ''}{s.formKey ? ` · form ${s.formKey}` : ''}{s.approval?.rejectTo ? ` · rimanda a ${s.approval.rejectTo}` : ''}{s.actions?.length ? ` · ${s.actions.length} azion${s.actions.length === 1 ? 'e' : 'i'}` : ''}{s.transitions?.length ? ' · con instradamento' : ''}</span>
            {editable && <span className="row" style={{ marginLeft: 'auto', gap: 4 }}>
              <form action={moveAppStage.bind(null, app.id, stages, s.key, -1)}><button className="btn sm ghost" title="Su" disabled={i === 0}>↑</button></form>
              <form action={moveAppStage.bind(null, app.id, stages, s.key, 1)}><button className="btn sm ghost" title="Giù" disabled={i === stages.length - 1}>↓</button></form>
              <form action={moveAppStage.bind(null, app.id, stages, s.key, 0)}><button className="btn sm ghost" title="Rimuovi">✕</button></form>
            </span>}
          </summary>
          <div style={{ marginTop: 8 }}><StageForm app={app} stage={s} forms={forms} editable={editable} /></div>
        </details>
      ))}
      {editable && <details style={{ border: '1px dashed var(--line)', borderRadius: 10, padding: '8px 12px' }}><summary style={{ cursor: 'pointer' }}><b>＋ Nuova fase</b></summary><div style={{ marginTop: 8 }}><StageForm app={app} stage={null} forms={forms} editable /></div></details>}
    </div>
  );
}
