'use client';
import { useMemo, useState } from 'react';
import { canBeLauncher, simulateActor, type AppDefinition as SharedAppDefinition, type SimActor, type SimEvent } from '@wb/shared';
import type { AppDefinition } from '@/lib/api';

const appActorLabel = (a: string) => ({ subject: 'Soggetto', manager: 'Manager del soggetto', manager_of_manager: 'Manager del manager', launcher: 'Chi ha avviato', hr: 'HR' } as Record<string, string>)[a] ?? a;
import { Icon, type IconName } from './icons';

const ACTORS: SimActor[] = ['subject', 'manager', 'manager_of_manager', 'launcher', 'hr'];
const KIND: Record<SimEvent['kind'], { icon: IconName; tone: string; label: string }> = {
  do: { icon: 'form', tone: 'b', label: 'Compili' }, decide: { icon: 'review', tone: 'b', label: 'Decidi' }, see: { icon: 'people', tone: 'n', label: 'Vedi' },
  notified: { icon: 'bell', tone: 'n', label: 'Ricevi' }, action: { icon: 'check', tone: 'w', label: 'Ti riguarda' }, auto: { icon: 'sparkle', tone: 'n', label: 'Automatico' }, wait: { icon: 'clock', tone: 'n', label: 'Aspetti' },
};

/** Simulazione «nei panni di» (APP-008): funzione pura sulla definizione, nessuna istanza creata. */
export function WorkflowSimulator({ def }: { def: AppDefinition }) {
  const [actor, setActor] = useState<SimActor>('subject');
  const [decisions, setDecisions] = useState<Record<string, 'approve' | 'reject'>>({});
  const [answersText, setAnswersText] = useState('');
  const [launcherOverride, setLauncherOverride] = useState<boolean | null>(null);
  const canLaunch = canBeLauncher(def as unknown as SharedAppDefinition, actor);
  const isLauncher = launcherOverride ?? canLaunch;
  const approvals = def.stages.filter((s) => s.type === 'approval');
  const condFields = [...new Set(def.stages.flatMap((s) => (s.transitions ?? []).map((t) => t.when.field).filter((f): f is string => !!f)))];
  const answers = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const line of answersText.split('\n')) { const m = line.match(/^\s*([a-z][a-z0-9_]*)\s*=\s*(.+?)\s*$/); if (m) out[m[1]!] = /^-?\d+(\.\d+)?$/.test(m[2]!) ? Number(m[2]) : m[2] === 'true' ? true : m[2] === 'false' ? false : m[2]; }
    return out;
  }, [answersText]);
  const res = useMemo(() => simulateActor(def as unknown as SharedAppDefinition, actor, { decisions: { ...decisions }, answers, launcherIs: isLauncher ? actor : 'hr' }), [def, actor, decisions, answers, isLauncher]);
  const mine = res.events.filter((e) => e.kind !== 'wait' && e.kind !== 'auto');
  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        <span className="sup">Nei panni di</span>
        <nav className="seg" aria-label="Attore simulato">{ACTORS.map((a) => <button key={a} type="button" className={a === actor ? 'on' : ''} onClick={() => { setActor(a); setLauncherOverride(null); }}>{appActorLabel(a)}</button>)}</nav>
        {actor !== 'launcher' && <label className="check" style={{ fontSize: 12.5 }}><input type="checkbox" checked={isLauncher} onChange={(e) => setLauncherOverride(e.target.checked)} /> <span className="sup">è anche chi avvia il processo{canLaunch ? '' : ' (i permessi non lo prevedono)'}</span></label>}
      </div>
      {(approvals.length > 0 || condFields.length > 0) && (
        <div className="row" style={{ gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {approvals.map((s) => (
            <label key={s.key} className="row" style={{ gap: 6, fontSize: 12.5 }}><span className="sup">{s.name}:</span>
              <select className="input" style={{ width: 'auto', minHeight: 30, padding: '3px 8px' }} value={decisions[s.key] ?? 'approve'} onChange={(e) => setDecisions((d) => ({ ...d, [s.key]: e.target.value as 'approve' | 'reject' }))}><option value="approve">approva</option><option value="reject">{s.approval?.rejectTo ? 'rimanda' : 'respinge'}</option></select>
            </label>
          ))}
          {condFields.length > 0 && <label className="field" style={{ minWidth: 220 }}><span className="lab">Risposte per le condizioni</span><textarea className="input" rows={2} value={answersText} onChange={(e) => setAnswersText(e.target.value)} placeholder={condFields.map((f) => `${f} = …`).join('\n')} /><span className="help">una per riga, «campo = valore» ({condFields.join(', ')})</span></label>}
        </div>
      )}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <span className={`pill ${res.ended === 'end' ? 'g' : res.ended === 'rejected' ? 'c' : 'w'}`} >{res.ended === 'end' ? 'Il processo arriva alla fine' : res.ended === 'rejected' ? 'Il processo viene respinto' : 'Percorso non concluso'}</span>
        <span className="pill n">{res.path.length} passaggi · ~{res.totalDays} giorni</span>
        <span className="pill b">{mine.length} {mine.length === 1 ? 'cosa' : 'cose'} per {appActorLabel(actor).toLowerCase()}</span>
      </div>
      {res.branches.length > 0 && <div className="sup">Deviazioni nel percorso: {res.branches.join('; ')}.</div>}
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
        {res.events.map((e, i) => {
          const k = KIND[e.kind];
          return (
            <li key={i} className="row" style={{ gap: 10, alignItems: 'flex-start', flexWrap: 'nowrap', opacity: e.kind === 'wait' || e.kind === 'auto' ? 0.7 : 1 }}>
              <span className={`todo`} style={{ display: 'contents' }}><span className={`ic ${k.tone === 'b' ? 'b' : k.tone === 'w' ? 'w' : ''}`} style={{ width: 28, height: 28, borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', background: k.tone === 'b' ? 'var(--brand-soft)' : k.tone === 'w' ? 'var(--warn-soft)' : 'var(--neutral-soft)', color: k.tone === 'b' ? 'var(--brand-2)' : k.tone === 'w' ? 'var(--warn-text)' : 'var(--ink2)' }}><Icon name={k.icon} size={14} stroke={2} /></span></span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13.5 }}><b style={{ fontWeight: 600 }}>{k.label}</b> · {e.text}</div>
                <div className="sup">passo {e.step} · «{e.stageName}»{e.dueDays ? ` · entro ${e.dueDays} gg` : ''} · giorno ~{e.day}</div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
