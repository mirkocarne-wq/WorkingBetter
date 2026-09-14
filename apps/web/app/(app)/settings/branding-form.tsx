'use client';
import { useActionState, useState } from 'react';
import { saveBranding } from '@/lib/actions';

const PRESETS = ['#2a78d6', '#1baf7a', '#b34fc4', '#e08a1e', '#c9432f', '#4d7c8a', '#0b0b0b'];

/** Nome e colore primario del tenant: il colore tinge pulsanti, tab, link attivi e focus (token --brand). */
export function BrandingForm({ name, primaryColor, logoDataUrl }: { name: string; primaryColor: string; logoDataUrl?: string | null }) {
  const [state, action, pending] = useActionState(saveBranding, undefined);
  const [color, setColor] = useState(primaryColor || '#2a78d6');
  return (
    <form action={action} className="stack">
      <label className="field"><span className="lab">Nome dell’organizzazione</span><input name="name" defaultValue={name} required className="input" /></label>
      <label className="field">
        <span className="lab">Colore primario</span>
        <div className="row">
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Selettore colore" style={{ width: 44, height: 36, padding: 2, border: '1px solid var(--line)', borderRadius: 8, background: '#fff' }} />
          <input name="primaryColor" value={color} onChange={(e) => setColor(e.target.value)} pattern="#[0-9a-fA-F]{6}" className="input" style={{ width: 120 }} />
          {PRESETS.map((c) => <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Usa ${c}`} title={c} style={{ width: 24, height: 24, borderRadius: 999, border: color === c ? '2px solid var(--ink)' : '1px solid var(--line)', background: c, cursor: 'pointer' }} />)}
        </div>
        <span className="help">Anteprima: <span className="btn p sm" style={{ background: color, borderColor: color, pointerEvents: 'none' }}>Azione</span> <span className="pill" style={{ background: `color-mix(in srgb, ${color} 13%, #fff)`, color: `color-mix(in srgb, ${color} 78%, #000)` }}>Etichetta</span> · vale per tutti gli utenti dopo il salvataggio.</span>
      </label>
      <label className="field">
        <span className="lab">Logo (PDF ed email)</span>
        <div className="row" style={{ alignItems: 'center', gap: 12 }}>
          {logoDataUrl ? <img src={logoDataUrl} alt="Logo attuale" style={{ maxHeight: 40, maxWidth: 120, border: '1px solid var(--line)', borderRadius: 6, padding: 2, background: '#fff' }} /> : <span className="sup">nessun logo</span>}
          <input type="file" name="logo" accept="image/png,image/jpeg" className="input" style={{ width: 'auto' }} />
          {logoDataUrl && <label className="check"><input type="checkbox" name="removeLogo" /> <span className="sup">rimuovi</span></label>}
        </div>
        <span className="help">PNG o JPEG fino a 200 KB; compare in alto a destra nei PDF di review e 360°.</span>
      </label>
      {state?.error && <div className="error">{state.error}</div>}
      {state?.saved && <div className="suggest">Aspetto salvato.</div>}
      <div><button className="btn p" disabled={pending}>{pending ? 'Salvataggio…' : 'Salva'}</button></div>
    </form>
  );
}
