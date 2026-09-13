'use client';
import type { FormFieldDef } from '@/lib/api';

const input = { width: '100%', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, font: 'inherit', background: '#fff' } as const;

/** Valuta una condizione showIf sulle risposte correnti (copia client del motore). */
export function visibleIf(def: { showIf?: FormFieldDef['showIf'] }, answers: Record<string, unknown>) {
  const c = def.showIf;
  if (!c) return true;
  const v = answers[c.field];
  const empty = v == null || v === '' || (Array.isArray(v) && v.length === 0);
  if (c.notEmpty !== undefined) return c.notEmpty ? !empty : empty;
  if (c.in) return Array.isArray(v) ? v.some((x) => c.in!.includes(x)) : c.in.includes(v);
  if (c.equals !== undefined) return v === c.equals;
  return true;
}

/** Rendering di un campo del form engine (riusato da compilazioni, review e survey). */
export function Field({ f, value, onChange, readOnly }: { f: FormFieldDef; value: unknown; onChange: (v: unknown) => void; readOnly: boolean }) {
  const dis = readOnly;
  switch (f.type) {
    case 'info': return <div className="suggest">{f.label}</div>;
    case 'short_text': return <input name={f.key} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder} disabled={dis} style={input} />;
    case 'long_text': return <textarea name={f.key} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} rows={4} placeholder={f.placeholder} disabled={dis} style={{ ...input, resize: 'vertical' }} />;
    case 'number': return <input name={f.key} type="number" step="any" value={(value as number) ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} disabled={dis} style={{ ...input, width: 160 }} />;
    case 'date': return <input name={f.key} type="date" value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} disabled={dis} style={{ ...input, width: 200 }} />;
    case 'boolean': return (
      <div style={{ display: 'flex', gap: 12 }}>{[['true', 'Sì'], ['false', 'No']].map(([v, l]) => <label key={v} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="radio" name={f.key} value={v} checked={value === (v === 'true')} onChange={() => onChange(v === 'true')} disabled={dis} />{l}</label>)}</div>
    );
    case 'single_choice': return (
      <div style={{ display: 'grid', gap: 6 }}>{f.options?.map((o) => <label key={o.value} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="radio" name={f.key} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} disabled={dis} />{o.label}</label>)}</div>
    );
    case 'multi_choice': {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return <div style={{ display: 'grid', gap: 6 }}>{f.options?.map((o) => <label key={o.value} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" name={f.key} value={o.value} checked={arr.includes(o.value)} onChange={(e) => onChange(e.target.checked ? [...arr, o.value] : arr.filter((x) => x !== o.value))} disabled={dis} />{o.label}</label>)}</div>;
    }
    case 'scale': {
      const sc = f.scale ?? { min: 1, max: 5 };
      const vals = Array.from({ length: sc.max - sc.min + 1 }, (_, i) => sc.min + i);
      return (
        <div className="scale-row" style={{ display: 'flex', gap: 6 }}>
          {vals.map((v) => <label key={v} style={{ flex: 1, textAlign: 'center', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 4px', fontSize: 12, background: value === v ? 'var(--brand)' : '#fff', color: value === v ? '#fff' : 'var(--ink2)', cursor: dis ? 'default' : 'pointer' }}><input type="radio" name={f.key} value={v} checked={value === v} onChange={() => onChange(v)} disabled={dis} style={{ display: 'none' }} /><b style={{ display: 'block', fontSize: 14 }}>{v}</b>{sc.labels?.[String(v)] ?? ''}</label>)}
          {sc.allowNa && <label style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontSize: 12, background: value === 'na' ? 'var(--ink2)' : '#fff', color: value === 'na' ? '#fff' : 'var(--ink2)' }}><input type="radio" name={f.key} value="na" checked={value === 'na'} onChange={() => onChange('na')} disabled={dis} style={{ display: 'none' }} />N/A</label>}
        </div>
      );
    }
    case 'person': return <input name={f.key} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} placeholder="ID persona" disabled={dis} style={input} />;
    default: return null;
  }
}
