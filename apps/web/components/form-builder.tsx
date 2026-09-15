'use client';
import { useMemo, useState } from 'react';
import { slugKey } from '@/lib/slug';
import type { FormScale } from '@/lib/api';

const computeOpLabel = { sum: 'Somma', avg: 'Media', weighted_avg: 'Media pesata', min: 'Minimo', max: 'Massimo', count: 'Conteggio' } as const;
import { Icon } from './icons';

const FIELD_TYPES: [string, string][] = [
  ['scale', 'Scala'], ['long_text', 'Testo lungo'], ['short_text', 'Testo breve'], ['single_choice', 'Scelta singola'], ['multi_choice', 'Scelta multipla'],
  ['boolean', 'Sì/No'], ['number', 'Numero'], ['date', 'Data'], ['computed', 'Calcolato (formula)'], ['info', 'Solo testo informativo'],
];
const COND_OPS: [string, string][] = [['equals', 'è uguale a'], ['in', 'è tra (a, b, c)'], ['notEmpty', 'non è vuoto'], ['empty', 'è vuoto']];
const OPS = Object.entries(computeOpLabel) as [keyof typeof computeOpLabel, string][];

interface Cond { field: string; op: string; value: string }
interface FieldDraft { id: number; label: string; type: string; required: boolean; help: string; placeholder: string; min: string; max: string; scaleMin: number; scaleMax: number; scaleKey: string; labels: string; options: string; weight: string; naAllowed: boolean; cond: Cond | null; compOp: string; compFields: number[]; compDecimals: number; compScale: string }
interface SectionDraft { id: number; title: string; description: string; weight: string; cond: Cond | null; fields: FieldDraft[] }

let seq = 1;
const newField = (type = 'scale'): FieldDraft => ({ id: seq++, label: '', type, required: type !== 'info' && type !== 'computed', help: '', placeholder: '', min: '', max: '', scaleMin: 1, scaleMax: 5, scaleKey: '', labels: '', options: '', weight: '', naAllowed: false, cond: null, compOp: 'avg', compFields: [], compDecimals: 1, compScale: '' });
const newSection = (title = ''): SectionDraft => ({ id: seq++, title, description: '', weight: '', cond: null, fields: [newField()] });

const parseLabels = (text: string) => { const out: Record<string, string> = {}; for (const line of text.split('\n')) { const m = line.match(/^\s*(-?\d+)\s*[=:]\s*(.+?)\s*$/); if (m) out[m[1]!] = m[2]!; } return Object.keys(out).length ? out : undefined; };
const parseValue = (v: string): string | number | boolean => (v === 'true' ? true : v === 'false' ? false : v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v.trim());

/**
 * Costruttore di form (APP-002/003/004/005): sezioni e campi tipizzati, condizioni di visibilità «mostra solo se»,
 * campi calcolati e scale riutilizzabili del tenant. Lo schema dichiarativo viene generato in un campo nascosto
 * e validato dal form engine lato server.
 */
export function FormBuilder({ initialKind = 'review', scales = [] }: { initialKind?: string; scales?: FormScale[] }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState(initialKind);
  const [scoring, setScoring] = useState(true);
  const [sections, setSections] = useState<SectionDraft[]>([newSection('Competenze')]);
  const key = useMemo(() => slugKey(name, 'form'), [name]);

  // chiavi stabili per campo (servono alle condizioni e ai calcolati prima del salvataggio)
  const keyOf = useMemo(() => {
    const used = new Set<string>();
    const map = new Map<number, string>();
    const uniq = (base: string) => { let k = base; let i = 2; while (used.has(k)) k = `${base}_${i++}`; used.add(k); return k; };
    for (const s of sections) { uniq(`section_${slugKey(s.title, 'sezione')}`); for (const f of s.fields) map.set(f.id, uniq(slugKey(f.label, 'campo'))); }
    return map;
  }, [sections]);
  const allFields = sections.flatMap((s) => s.fields.map((f) => ({ ...f, key: keyOf.get(f.id)!, section: s.title })));
  const numericFields = allFields.filter((f) => ['number', 'scale', 'single_choice', 'computed'].includes(f.type));

  const condToSchema = (c: Cond | null) => {
    if (!c || !c.field) return undefined;
    if (c.op === 'notEmpty') return { field: c.field, notEmpty: true };
    if (c.op === 'empty') return { field: c.field, notEmpty: false };
    if (c.op === 'in') return { field: c.field, in: c.value.split(',').map((x) => parseValue(x)).filter((x) => x !== '') };
    return { field: c.field, equals: parseValue(c.value) };
  };

  const schema = useMemo(() => {
    const used = new Set<string>();
    const uniq = (base: string) => { let k = base; let i = 2; while (used.has(k)) k = `${base}_${i++}`; used.add(k); return k; };
    return {
      title: name || 'Nuovo form',
      scoring: { enabled: scoring },
      sections: sections.map((s) => ({
        key: uniq(slugKey(s.title, 'sezione')),
        title: s.title || 'Sezione',
        ...(s.description ? { description: s.description } : {}),
        ...(s.weight && Number(s.weight) > 0 ? { weight: Number(s.weight) } : {}),
        ...(condToSchema(s.cond) ? { showIf: condToSchema(s.cond) } : {}),
        fields: s.fields.map((f) => {
          const base: Record<string, unknown> = { key: keyOf.get(f.id), type: f.type, label: f.label || 'Domanda', required: f.type === 'info' || f.type === 'computed' ? false : f.required };
          if (f.help) base.help = f.help;
          if (f.placeholder) base.placeholder = f.placeholder;
          if (f.type === 'scale') {
            const sc = scales.find((x) => x.key === f.scaleKey);
            if (sc) { base.scaleKey = sc.key; base.scale = { min: sc.min, max: sc.max, allowNa: sc.allowNa, labels: sc.labels }; }
            else base.scale = { min: f.scaleMin, max: f.scaleMax, allowNa: f.naAllowed, labels: parseLabels(f.labels) ?? (f.scaleMin === 1 && f.scaleMax === 5 ? { '1': 'Non soddisfa', '3': 'Soddisfa', '5': 'Eccezionale' } : undefined) };
          }
          if (f.type === 'single_choice' || f.type === 'multi_choice') {
            base.options = f.options.split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => {
              const [a, b] = l.split('=').map((x) => x.trim());
              return b ? { value: slugKey(b, `opt${i}`), label: b, score: Number(a) || undefined } : { value: slugKey(a ?? '', `opt${i}`), label: a ?? '' };
            });
          }
          if ((f.type === 'number' || f.type === 'short_text' || f.type === 'long_text') && f.min !== '') base.min = Number(f.min);
          if ((f.type === 'number' || f.type === 'short_text' || f.type === 'long_text') && f.max !== '') base.max = Number(f.max);
          if (f.weight && Number(f.weight) > 0) base.weight = Number(f.weight);
          if (f.type === 'long_text' && f.min === '') base.min = 10;
          if (f.type === 'computed') {
            const compScale = f.compScale.match(/^\s*(-?\d+)\s*[-–]\s*(-?\d+)\s*$/);
            base.compute = { op: f.compOp, fields: f.compFields.map((id) => keyOf.get(id)).filter(Boolean), decimals: f.compDecimals, ...(compScale ? { scale: { min: Number(compScale[1]), max: Number(compScale[2]) } } : {}) };
          }
          const sh = condToSchema(f.cond);
          if (sh) base.showIf = sh;
          return base;
        }),
      })),
    };
  }, [name, scoring, sections, keyOf, scales]);

  const upd = (sid: number, patch: Partial<SectionDraft>) => setSections((ss) => ss.map((s) => (s.id === sid ? { ...s, ...patch } : s)));
  const updF = (sid: number, fid: number, patch: Partial<FieldDraft>) => setSections((ss) => ss.map((s) => (s.id === sid ? { ...s, fields: s.fields.map((f) => (f.id === fid ? { ...f, ...patch } : f)) } : s)));
  const moveF = (sid: number, fid: number, dir: -1 | 1) => setSections((ss) => ss.map((s) => { if (s.id !== sid) return s; const i = s.fields.findIndex((f) => f.id === fid); const j = i + dir; if (j < 0 || j >= s.fields.length) return s; const arr = [...s.fields]; [arr[i], arr[j]] = [arr[j]!, arr[i]!]; return { ...s, fields: arr }; }));
  const fieldCount = sections.reduce((n, s) => n + s.fields.length, 0);
  const problems: string[] = [];
  for (const f of allFields) {
    if (f.type === 'computed' && f.compFields.length === 0) problems.push(`«${f.label || f.key}»: scegli almeno un campo da calcolare`);
    if ((f.type === 'single_choice' || f.type === 'multi_choice') && !f.options.trim()) problems.push(`«${f.label || f.key}»: aggiungi le opzioni`);
    if (f.cond && !f.cond.field) problems.push(`«${f.label || f.key}»: la condizione non indica il campo`);
  }

  // funzione di rendering (non un componente): evita di rimontare gli input a ogni battuta
  const renderCond = (cond: Cond | null, onChange: (c: Cond | null) => void, exclude?: number) => (
    <div className="row" style={{ gap: 6, flexWrap: 'wrap', fontSize: 12.5 }}>
      <label className="check" style={{ gap: 6 }}><input type="checkbox" checked={!!cond} onChange={(e) => onChange(e.target.checked ? { field: allFields.find((x) => x.id !== exclude)?.key ?? '', op: 'equals', value: '' } : null)} /> <span className="sup">mostra solo se</span></label>
      {cond && (
        <>
          <select value={cond.field} onChange={(e) => onChange({ ...cond, field: e.target.value })} className="input" style={{ width: 'auto', minHeight: 30, padding: '3px 8px' }}>
            {allFields.filter((x) => x.id !== exclude && x.type !== 'info' && x.type !== 'computed').map((x) => <option key={x.key} value={x.key}>{x.label || x.key}</option>)}
          </select>
          <select value={cond.op} onChange={(e) => onChange({ ...cond, op: e.target.value })} className="input" style={{ width: 'auto', minHeight: 30, padding: '3px 8px' }}>{COND_OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          {(cond.op === 'equals' || cond.op === 'in') && <input value={cond.value} onChange={(e) => onChange({ ...cond, value: e.target.value })} placeholder={cond.op === 'in' ? 'valore1, valore2' : 'valore (es. true, 3, si)'} className="input" style={{ width: 180, minHeight: 30, padding: '3px 8px' }} />}
        </>
      )}
    </div>
  );

  return (
    <>
      <input type="hidden" name="key" value={key} />
      <input type="hidden" name="schema" value={JSON.stringify(schema)} />
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
          <label className="field"><span className="lab">Nome del form</span><input name="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Manager review Q4" className="input" /><span className="help">chiave: <code>{key}</code></span></label>
          <label className="field"><span className="lab">Tipo</span><select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className="input"><option value="review">Review</option><option value="survey">Survey</option><option value="request">Richiesta (compilabile da chiunque)</option><option value="onboarding">Onboarding</option><option value="app">App Studio (fase di processo)</option><option value="generic">Generico</option></select></label>
          <label className="field"><span className="lab">Punteggio</span><span className="check" style={{ padding: '8px 0' }}><input type="checkbox" checked={scoring} onChange={(e) => setScoring(e.target.checked)} /> <span>calcola il punteggio dalle scale e dalle scelte</span></span></label>
        </div>
      </div>
      {sections.map((s, si) => (
        <div className="card" key={s.id} style={{ marginBottom: 16 }}>
          <div className="row" style={{ marginBottom: 6 }}>
            <span className="lvl">Sezione {si + 1}</span>
            <input value={s.title} onChange={(e) => upd(s.id, { title: e.target.value })} placeholder="Titolo della sezione" className="input" style={{ flex: 1, fontWeight: 600 }} />
            {scoring && <label className="row" style={{ gap: 4, fontSize: 12.5 }}><span className="sup">peso</span><input value={s.weight} onChange={(e) => upd(s.id, { weight: e.target.value })} placeholder="1" className="input" style={{ width: 56, minHeight: 30, padding: '3px 6px' }} /></label>}
            <button type="button" className="btn sm ghost" disabled={sections.length <= 1} onClick={() => setSections((ss) => ss.filter((x) => x.id !== s.id))}>Rimuovi sezione</button>
          </div>
          <input value={s.description} onChange={(e) => upd(s.id, { description: e.target.value })} placeholder="Introduzione della sezione (facoltativa)" className="input" style={{ fontSize: 12.5, marginBottom: 6 }} />
          {renderCond(s.cond, (c) => upd(s.id, { cond: c }))}
          {s.fields.map((f, fi) => {
            const fkey = keyOf.get(f.id)!;
            return (
              <div key={f.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) auto', gap: 8, padding: '12px 0', borderTop: '1px solid var(--grid)', alignItems: 'start', marginTop: 8 }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <div className="row" style={{ gap: 6 }}><span className="lvl" style={{ width: 44 }}>{fi + 1}</span><input value={f.label} onChange={(e) => updF(s.id, f.id, { label: e.target.value })} placeholder={f.type === 'info' ? 'Testo da mostrare' : f.type === 'computed' ? 'Nome del valore calcolato (es. Punteggio finale)' : `Domanda ${fi + 1}`} className="input" style={{ flex: 1 }} /><code style={{ fontSize: 10.5 }}>{fkey}</code></div>
                  {f.type !== 'info' && f.type !== 'computed' && <div className="row" style={{ gap: 6 }}><input value={f.help} onChange={(e) => updF(s.id, f.id, { help: e.target.value })} placeholder="Testo di aiuto (facoltativo)" className="input" style={{ fontSize: 12.5, flex: 1 }} />{(f.type === 'short_text' || f.type === 'long_text' || f.type === 'number') && <input value={f.placeholder} onChange={(e) => updF(s.id, f.id, { placeholder: e.target.value })} placeholder="Segnaposto" className="input" style={{ fontSize: 12.5, width: 160 }} />}</div>}
                  {(f.type === 'single_choice' || f.type === 'multi_choice') && <textarea value={f.options} onChange={(e) => updF(s.id, f.id, { options: e.target.value })} rows={3} placeholder={'Una opzione per riga. Con punteggio: 3=Spesso'} className="input" style={{ fontSize: 12.5 }} />}
                  {f.type === 'computed' && (
                    <div className="row" style={{ gap: 6, flexWrap: 'wrap', fontSize: 12.5 }}>
                      <select value={f.compOp} onChange={(e) => updF(s.id, f.id, { compOp: e.target.value })} className="input" style={{ width: 'auto', minHeight: 30, padding: '3px 8px' }}>{OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                      <span className="sup">di</span>
                      <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                        {numericFields.filter((x) => x.id !== f.id).map((x) => <label key={x.id} className="check" style={{ gap: 4, border: '1px solid var(--line)', borderRadius: 999, padding: '2px 8px', background: f.compFields.includes(x.id) ? 'var(--brand-soft)' : '#fff' }}><input type="checkbox" checked={f.compFields.includes(x.id)} onChange={(e) => updF(s.id, f.id, { compFields: e.target.checked ? [...f.compFields, x.id] : f.compFields.filter((id) => id !== x.id) })} /> <span>{x.label || x.key}</span></label>)}
                        {numericFields.filter((x) => x.id !== f.id).length === 0 && <span className="sup">aggiungi prima campi numerici o scale</span>}
                      </span>
                      <label className="row" style={{ gap: 4 }}><span className="sup">decimali</span><input type="number" min={0} max={4} value={f.compDecimals} onChange={(e) => updF(s.id, f.id, { compDecimals: Number(e.target.value) })} className="input" style={{ width: 56, minHeight: 30, padding: '3px 6px' }} /></label>
                      <label className="row" style={{ gap: 4 }}><span className="sup">riporta su scala</span><input value={f.compScale} onChange={(e) => updF(s.id, f.id, { compScale: e.target.value })} placeholder="es. 1-5" className="input" style={{ width: 80, minHeight: 30, padding: '3px 6px' }} /></label>
                    </div>
                  )}
                  {f.type !== 'info' && renderCond(f.cond, (c) => updF(s.id, f.id, { cond: c }), f.id)}
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  <select value={f.type} onChange={(e) => updF(s.id, f.id, { type: e.target.value, required: e.target.value === 'info' || e.target.value === 'computed' ? false : f.required })} className="input">{FIELD_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  {f.type === 'scale' && (
                    <div style={{ display: 'grid', gap: 6, fontSize: 12.5 }}>
                      <select value={f.scaleKey} onChange={(e) => updF(s.id, f.id, { scaleKey: e.target.value })} className="input" style={{ minHeight: 30, padding: '3px 8px' }}>
                        <option value="">Scala personalizzata</option>
                        {scales.map((sc) => <option key={sc.key} value={sc.key}>{sc.name} ({sc.min}–{sc.max}{sc.allowNa ? ', N/A' : ''})</option>)}
                      </select>
                      {!f.scaleKey && <>
                        <div className="row" style={{ gap: 6 }}>da <input type="number" value={f.scaleMin} onChange={(e) => updF(s.id, f.id, { scaleMin: Number(e.target.value) })} className="input" style={{ width: 60, minHeight: 30, padding: '3px 6px' }} /> a <input type="number" value={f.scaleMax} onChange={(e) => updF(s.id, f.id, { scaleMax: Number(e.target.value) })} className="input" style={{ width: 60, minHeight: 30, padding: '3px 6px' }} /><label className="check" style={{ gap: 4 }}><input type="checkbox" checked={f.naAllowed} onChange={(e) => updF(s.id, f.id, { naAllowed: e.target.checked })} />N/A</label></div>
                        <textarea value={f.labels} onChange={(e) => updF(s.id, f.id, { labels: e.target.value })} rows={2} placeholder={'Etichette (facoltative): 1=Non soddisfa\n5=Eccezionale'} className="input" style={{ fontSize: 12 }} />
                      </>}
                    </div>
                  )}
                  {(f.type === 'number' || f.type === 'short_text' || f.type === 'long_text') && <div className="row" style={{ gap: 6, fontSize: 12.5 }}><span className="sup">{f.type === 'number' ? 'min' : 'min caratteri'}</span><input value={f.min} onChange={(e) => updF(s.id, f.id, { min: e.target.value })} className="input" style={{ width: 60, minHeight: 30, padding: '3px 6px' }} /><span className="sup">max</span><input value={f.max} onChange={(e) => updF(s.id, f.id, { max: e.target.value })} className="input" style={{ width: 60, minHeight: 30, padding: '3px 6px' }} /></div>}
                  {f.type !== 'info' && f.type !== 'computed' && <label className="check" style={{ gap: 6, fontSize: 12.5 }}><input type="checkbox" checked={f.required} onChange={(e) => updF(s.id, f.id, { required: e.target.checked })} /> <span>obbligatoria {scoring && (f.type === 'scale' || f.type === 'single_choice' || f.type === 'number') && <>· peso <input value={f.weight} onChange={(e) => updF(s.id, f.id, { weight: e.target.value })} placeholder="1" className="input" style={{ width: 50, padding: '3px 6px', minHeight: 26 }} /></>}</span></label>}
                </div>
                <div style={{ display: 'grid', gap: 4 }}>
                  <button type="button" className="btn sm ghost" disabled={fi === 0} onClick={() => moveF(s.id, f.id, -1)} title="Sposta su"><Icon name="chev" size={13} stroke={2.2} style={{ transform: 'rotate(-90deg)' }} /></button>
                  <button type="button" className="btn sm ghost" disabled={fi === s.fields.length - 1} onClick={() => moveF(s.id, f.id, 1)} title="Sposta giù"><Icon name="chev" size={13} stroke={2.2} style={{ transform: 'rotate(90deg)' }} /></button>
                  <button type="button" className="btn sm ghost" disabled={s.fields.length <= 1} onClick={() => upd(s.id, { fields: s.fields.filter((x) => x.id !== f.id) })} title="Rimuovi domanda"><Icon name="x" size={13} stroke={2.2} /></button>
                </div>
              </div>
            );
          })}
          <div className="row" style={{ marginTop: 10, gap: 6 }}>
            <button type="button" className="btn sm" onClick={() => upd(s.id, { fields: [...s.fields, newField()] })}><Icon name="plus" size={13} stroke={2.2} />Domanda</button>
            <button type="button" className="btn sm ghost" onClick={() => upd(s.id, { fields: [...s.fields, newField('computed')] })}>+ Valore calcolato</button>
          </div>
        </div>
      ))}
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="btn" onClick={() => setSections((ss) => [...ss, newSection()])}><Icon name="plus" size={14} stroke={2.2} />Sezione</button>
        <span className="sup">{sections.length} sezioni · {fieldCount} domande{allFields.filter((f) => f.cond).length ? ` · ${allFields.filter((f) => f.cond).length} condizionali` : ''}{allFields.filter((f) => f.type === 'computed').length ? ` · ${allFields.filter((f) => f.type === 'computed').length} calcolati` : ''}</span>
        {problems.length > 0 && <span className="pill w">{problems[0]}</span>}
      </div>
    </>
  );
}
