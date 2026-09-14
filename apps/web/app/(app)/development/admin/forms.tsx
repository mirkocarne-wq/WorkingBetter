'use client';
import { useActionState } from 'react';
import { saveCompetency, saveJobProfile } from '@/lib/actions';
import type { Competency, JobProfile } from '@/lib/api';

export function CompetencyForm() {
  const [state, action, pending] = useActionState(saveCompetency, undefined);
  return (
    <form action={action} className="stack" style={{ gap: 8 }}>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <label className="field"><span className="lab">Chiave</span><input name="key" placeholder="es. negotiation" pattern="[a-z0-9_]+" required className="input" /></label>
        <label className="field"><span className="lab">Tipo</span><select name="kind" className="select"><option value="core">Trasversale</option><option value="role">Di ruolo</option><option value="leadership">Leadership</option></select></label>
      </div>
      <label className="field"><span className="lab">Nome</span><input name="name" required className="input" /></label>
      <label className="field"><span className="lab">Descrizione</span><input name="description" className="input" /></label>
      {[1, 2, 3, 4].map((l) => (
        <div key={l} className="grid" style={{ gridTemplateColumns: '140px 1fr', gap: 6 }}>
          <input name={`label${l}`} placeholder={`Livello ${l}`} defaultValue={['', 'In apprendimento', 'Autonomo', 'Riferimento', 'Modello'][l]} className="input" />
          <input name={`descriptor${l}`} placeholder="Comportamento osservabile" className="input" required />
        </div>
      ))}
      {state?.error && <div className="error">{state.error}</div>}
      <div><button className="btn p" disabled={pending}>{pending ? 'Salvataggio…' : 'Salva competenza'}</button></div>
    </form>
  );
}

export function JobProfileForm({ competencies, profiles, profile }: { competencies: Competency[]; profiles: JobProfile[]; profile: JobProfile | null }) {
  const [state, action, pending] = useActionState(saveJobProfile, undefined);
  const expectedOf = (k: string) => profile?.expected.find((e) => e.competencyKey === k)?.level ?? 0;
  return (
    <form action={action} className="stack" style={{ gap: 8 }}>
      {profile && <input type="hidden" name="id" value={profile.id} />}
      <label className="field"><span className="lab">Titolo</span><input name="title" defaultValue={profile?.title ?? ''} required className="input" /></label>
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <label className="field"><span className="lab">Famiglia</span><input name="family" defaultValue={profile?.family ?? ''} placeholder="Engineering, Sales…" className="input" /></label>
        <label className="field"><span className="lab">Livello</span><input name="level" defaultValue={profile?.level ?? ''} placeholder="Junior, Mid, Senior, Lead" className="input" /></label>
      </div>
      <label className="field"><span className="lab">Ruolo successivo</span><select name="nextProfileId" defaultValue={profile?.nextProfileId ?? ''} className="select"><option value="">— nessuno —</option>{profiles.filter((p) => p.id !== profile?.id).map((p) => <option key={p.id} value={p.id}>{p.title}{p.level ? ` · ${p.level}` : ''}</option>)}</select></label>
      <label className="field"><span className="lab">Descrizione</span><input name="description" defaultValue={profile?.description ?? ''} className="input" /></label>
      <div className="field"><span className="lab">Competenze attese <span className="sup">(0 = non richiesta)</span></span>
        {competencies.map((c) => (
          <div key={c.key} className="row" style={{ justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13 }}>{c.name}</span>
            <input type="hidden" name="competencyKey" value={c.key} />
            <select name="expectedLevel" defaultValue={String(expectedOf(c.key))} className="select" style={{ width: 'auto' }}><option value="0">—</option>{c.levels.map((l) => <option key={l.level} value={l.level}>{l.level} · {l.label}</option>)}</select>
          </div>
        ))}
        {competencies.length === 0 && <span className="sup">Carica prima le competenze.</span>}
      </div>
      {state?.error && <div className="error">{state.error}</div>}
      <div><button className="btn p" disabled={pending}>{pending ? 'Salvataggio…' : profile ? 'Salva modifiche' : 'Crea job profile'}</button></div>
    </form>
  );
}
