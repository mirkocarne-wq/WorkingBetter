'use client';
import { useMemo, useState } from 'react';
import { slugKey } from '@/lib/slug';

const FIELD_TYPES: [string, string][] = [
  ['scale', 'Scala (1–5)'], ['long_text', 'Testo lungo'], ['short_text', 'Testo breve'], ['single_choice', 'Scelta singola'], ['multi_choice', 'Scelta multipla'],
  ['boolean', 'Sì/No'], ['number', 'Numero'], ['date', 'Data'], ['info', 'Solo testo informativo'],
];

interface FieldDraft { id: number; label: string; type: string; required: boolean; help: string; min: number; max: number; options: string; weight: string; naAllowed: boolean }
interface SectionDraft { id: number; title: string; fields: FieldDraft[] }

let seq = 1;
const newField = (type = 'scale'): FieldDraft => ({ id: seq++, label: '', type, required: true, help: '', min: 1, max: 5, options: '', weight: '', naAllowed: false });
const newSection = (title = ''): SectionDraft => ({ id: seq++, title, fields: [newField()] });

/**
 * Costruttore guidato di questionari (APP-002 v1): sezioni e campi tipizzati; lo schema dichiarativo
 * viene generato in un campo nascosto e validato dal form engine lato server.
 */
export function FormBuilder({ initialKind = 'review' }: { initialKind?: string }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState(initialKind);
  const [scoring, setScoring] = useState(true);
  const [sections, setSections] = useState<SectionDraft[]>([newSection('Competenze')]);
  const key = useMemo(() => slugKey(name, 'form'), [name]);

  const schema = useMemo(() => {
    const used = new Set<string>();
    const uniq = (base: string) => {
      let k = base;
      let i = 2;
      while (used.has(k)) k = `${base}_${i++}`;
      used.add(k);
      return k;
    };
    return {
      title: name || 'Nuovo form',
      scoring: { enabled: scoring },
      sections: sections.map((s) => ({
        key: uniq(slugKey(s.title, 'sezione')),
        title: s.title || 'Sezione',
        fields: s.fields.map((f) => {
          const base: Record<string, unknown> = { key: uniq(slugKey(f.label, 'campo')), type: f.type, label: f.label || 'Domanda', required: f.type === 'info' ? false : f.required };
          if (f.help) base.help = f.help;
          if (f.type === 'scale') base.scale = { min: f.min, max: f.max, allowNa: f.naAllowed, labels: f.min === 1 && f.max === 5 ? { '1': 'Non soddisfa', '3': 'Soddisfa', '5': 'Eccezionale' } : undefined };
          if (f.type === 'single_choice' || f.type === 'multi_choice') {
            base.options = f.options.split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => {
              const [a, b] = l.split('=').map((x) => x.trim());
              return b ? { value: slugKey(a ?? '', `opt${i}`), label: b, score: Number(a) || undefined } : { value: slugKey(a ?? '', `opt${i}`), label: a ?? '' };
            });
          }
          if (f.weight && Number(f.weight) > 0) base.weight = Number(f.weight);
          if (f.type === 'long_text') base.min = 10;
          return base;
        }),
      })),
    };
  }, [name, scoring, sections]);

  const upd = (sid: number, patch: Partial<SectionDraft>) => setSections((ss) => ss.map((s) => (s.id === sid ? { ...s, ...patch } : s)));
  const updF = (sid: number, fid: number, patch: Partial<FieldDraft>) => setSections((ss) => ss.map((s) => (s.id === sid ? { ...s, fields: s.fields.map((f) => (f.id === fid ? { ...f, ...patch } : f)) } : s)));
  const fieldCount = sections.reduce((n, s) => n + s.fields.length, 0);

  return (
    <>
      <input type="hidden" name="key" value={key} />
      <input type="hidden" name="schema" value={JSON.stringify(schema)} />
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
          <label>Nome del form<input name="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Manager review Q4" className="input" /><div className="sup">chiave: <code>{key}</code></div></label>
          <label>Tipo<select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className="input"><option value="review">Review</option><option value="survey">Survey</option><option value="request">Richiesta (compilabile da chiunque)</option><option value="onboarding">Onboarding</option><option value="generic">Generico</option></select></label>
          <label style={{ display: 'flex', flexDirection: 'column' }}>Punteggio<span style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '9px 0' }}><input type="checkbox" checked={scoring} onChange={(e) => setScoring(e.target.checked)} /> calcola il punteggio dalle scale e dalle scelte</span></label>
        </div>
      </div>
      {sections.map((s, si) => (
        <div className="card" key={s.id} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <span className="lvl">Sezione {si + 1}</span>
            <input value={s.title} onChange={(e) => upd(s.id, { title: e.target.value })} placeholder="Titolo della sezione" className="input" style={{ flex: 1, fontWeight: 600 }} />
            <button type="button" className="btn sm" disabled={sections.length <= 1} onClick={() => setSections((ss) => ss.filter((x) => x.id !== s.id))}>Rimuovi sezione</button>
          </div>
          {s.fields.map((f, fi) => (
            <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8, padding: '10px 0', borderTop: '1px solid var(--grid)', alignItems: 'start' }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <input value={f.label} onChange={(e) => updF(s.id, f.id, { label: e.target.value })} placeholder={`Domanda ${fi + 1}`} className="input" />
                <input value={f.help} onChange={(e) => updF(s.id, f.id, { help: e.target.value })} placeholder="Testo di aiuto (facoltativo)" className="input" style={{ fontSize: 12 }} />
                {(f.type === 'single_choice' || f.type === 'multi_choice') && <textarea value={f.options} onChange={(e) => updF(s.id, f.id, { options: e.target.value })} rows={3} placeholder={'Una opzione per riga. Con punteggio: 3=Spesso'} className="input" style={{ fontSize: 12 }} />}
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <select value={f.type} onChange={(e) => updF(s.id, f.id, { type: e.target.value })} className="input">{FIELD_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                {f.type === 'scale' && <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>da <input type="number" value={f.min} onChange={(e) => updF(s.id, f.id, { min: Number(e.target.value) })} className="input" style={{ width: 60 }} /> a <input type="number" value={f.max} onChange={(e) => updF(s.id, f.id, { max: Number(e.target.value) })} className="input" style={{ width: 60 }} /><label style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={f.naAllowed} onChange={(e) => updF(s.id, f.id, { naAllowed: e.target.checked })} />N/A</label></div>}
                {f.type !== 'info' && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}><input type="checkbox" checked={f.required} onChange={(e) => updF(s.id, f.id, { required: e.target.checked })} /> obbligatoria {scoring && (f.type === 'scale' || f.type === 'single_choice') && <>· peso <input value={f.weight} onChange={(e) => updF(s.id, f.id, { weight: e.target.value })} placeholder="1" className="input" style={{ width: 50, padding: '3px 6px' }} /></>}</label>}
              </div>
              <button type="button" className="btn sm" disabled={s.fields.length <= 1} onClick={() => upd(s.id, { fields: s.fields.filter((x) => x.id !== f.id) })} title="Rimuovi domanda">×</button>
            </div>
          ))}
          <div style={{ marginTop: 8 }}><button type="button" className="btn sm" onClick={() => upd(s.id, { fields: [...s.fields, newField()] })}>+ Domanda</button></div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" className="btn" onClick={() => setSections((ss) => [...ss, newSection()])}>+ Sezione</button>
        <span className="sup">{sections.length} sezioni · {fieldCount} domande</span>
      </div>
    </>
  );
}
