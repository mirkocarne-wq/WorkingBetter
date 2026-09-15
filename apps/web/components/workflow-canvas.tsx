import Link from 'next/link';
import { layoutWorkflow, type AppDefinition as SharedAppDefinition } from '@wb/shared';
import { appActorLabel, appStageTypeLabel, type AppDefinition } from '@/lib/api';
import { Icon, type IconName } from './icons';

const TYPE_ICON: Record<string, IconName> = { form: 'form', approval: 'review', notify: 'bell', action: 'sparkle' };

/**
 * Diagramma auto-disposto del processo (ADR-0014, APP-027): archi in SVG, nodi HTML cliccabili.
 * Nessuno stato: la selezione e l'inserimento viaggiano nella query string (?stage=, ?stage=new&after=).
 */
export function WorkflowCanvas({ def, base, selected, editable, forms }: { def: AppDefinition; base: string; selected?: string | null; editable: boolean; forms: { key: string; name: string }[] }) {
  const l = layoutWorkflow(def as unknown as SharedAppDefinition);
  const pos = new Map(l.nodes.map((n) => [n.key, n]));
  const right = (k: string) => { const n = pos.get(k)!; return { x: n.x + n.w, y: n.y + n.h / 2 }; };
  const left = (k: string) => { const n = pos.get(k)!; return { x: n.x, y: n.y + n.h / 2 }; };
  const top = (k: string) => { const n = pos.get(k)!; return { x: n.x + n.w / 2, y: n.y }; };
  const bottom = (k: string) => { const n = pos.get(k)!; return { x: n.x + n.w / 2, y: n.y + n.h }; };
  const problemsFor = (key: string) => (def.stages.find((s) => s.key === key)?.type === 'form' && !def.stages.find((s) => s.key === key)?.formKey ? 'manca il form' : null);
  const width = Math.max(l.width, 640);
  const height = l.height + 24;
  return (
    <div className="wf" style={{ overflowX: 'auto' }}>
      <div style={{ position: 'relative', width, height, minWidth: '100%' }}>
        <svg width={width} height={height} style={{ position: 'absolute', inset: 0 }} aria-hidden>
          <defs>
            <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--line-2)" /></marker>
            <marker id="wf-arrow-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--brand)" /></marker>
            <marker id="wf-arrow-r" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--crit)" /></marker>
          </defs>
          {l.edges.filter((e) => e.kind === 'next').map((e, i) => {
            const a = right(e.from), b = left(e.to);
            const mx = (a.x + b.x) / 2;
            return <path key={`n${i}`} d={`M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`} fill="none" stroke="var(--line-2)" strokeWidth={1.5} markerEnd="url(#wf-arrow)" />;
          })}
          {l.edges.filter((e) => e.kind === 'transition').map((e, i) => {
            const a = top(e.from), b = top(e.to);
            const lift = 34 + (i % 3) * 14;
            const y = Math.min(a.y, b.y) - lift;
            return <g key={`t${i}`}><path d={`M${a.x},${a.y} C${a.x},${y} ${b.x},${y} ${b.x},${b.y}`} fill="none" stroke="var(--brand)" strokeWidth={1.5} strokeDasharray="5 4" markerEnd="url(#wf-arrow-b)" />{e.label && <text x={(a.x + b.x) / 2} y={y + 4} textAnchor="middle" fontSize={11} fill="var(--brand-2)" style={{ paintOrder: 'stroke', stroke: 'var(--bg)', strokeWidth: 4 }}>se {e.label}</text>}</g>;
          })}
          {l.edges.filter((e) => e.kind === 'reject').map((e, i) => {
            const a = bottom(e.from), b = bottom(e.to);
            const drop = 30 + (i % 3) * 14;
            const y = Math.max(a.y, b.y) + drop;
            return <g key={`r${i}`}><path d={`M${a.x},${a.y} C${a.x},${y} ${b.x},${y} ${b.x},${b.y}`} fill="none" stroke="var(--crit)" strokeWidth={1.5} strokeDasharray="5 4" markerEnd="url(#wf-arrow-r)" />{e.label && <text x={(a.x + b.x) / 2} y={y - 5} textAnchor="middle" fontSize={11} fill="var(--crit-text)" style={{ paintOrder: 'stroke', stroke: 'var(--bg)', strokeWidth: 4 }}>{e.label}</text>}</g>;
          })}
        </svg>
        {editable && def.stages.length > 0 && <Link href={`${base}?stage=new&after=start`} className="wf-add" style={{ left: pos.get(def.stages[0]!.key)!.x - 30, top: pos.get(def.stages[0]!.key)!.y + pos.get(def.stages[0]!.key)!.h / 2 - 11 }} title="Aggiungi una fase all'inizio"><Icon name="plus" size={12} stroke={2.4} /></Link>}
        {l.nodes.map((n) => {
          if (n.kind === 'end') return <div key={n.key} className="wf-end" style={{ left: n.x, top: n.y, width: n.w, height: n.h }}><Icon name="check" size={14} stroke={2.4} />Fine</div>;
          const s = n.stage!;
          const on = selected === s.key;
          const formName = s.formKey ? (forms.find((f) => f.key === s.formKey)?.name ?? s.formKey) : null;
          const problem = problemsFor(s.key);
          const detail = s.type === 'form' ? (formName ?? 'form da scegliere') : s.type === 'approval' ? (s.approval?.rejectTo ? `rimanda a «${def.stages.find((x) => x.key === s.approval!.rejectTo)?.name ?? s.approval!.rejectTo}»` : 'approva o respinge') : s.type === 'notify' ? `a ${(s.notify?.to ?? []).map(appActorLabel).join(', ')}` : `${(s.actions ?? []).length} azion${(s.actions ?? []).length === 1 ? 'e' : 'i'}`;
          return (
            <div key={n.key} style={{ position: 'absolute', left: n.x, top: n.y, width: n.w, height: n.h }}>
              <Link href={`${base}?stage=${encodeURIComponent(s.key)}`} className={`wf-node${on ? ' on' : ''}${problem ? ' warn' : ''}`} aria-current={on ? 'true' : undefined} title={problem ?? undefined}>
                <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}><span className="wf-ic"><Icon name={TYPE_ICON[s.type] ?? 'flow'} size={14} stroke={2} /></span><span className="wf-type">{appStageTypeLabel[s.type]}</span>{s.parallelGroup && <span className="wf-par" title={`gruppo parallelo «${s.parallelGroup}»`}>∥</span>}<span style={{ flex: 1 }} /><span className="wf-num">{n.index + 1}</span></div>
                <div className="wf-name">{s.name}</div>
                <div className="wf-sub">{appActorLabel(s.actor)} · {s.dueDays} gg{detail ? ` · ${detail}` : ''}</div>
              </Link>
              {editable && (n.row === 0) && <Link href={`${base}?stage=new&after=${encodeURIComponent(def.stages[Math.max(...l.nodes.filter((x) => x.col === n.col && x.kind === 'stage').map((x) => x.index))]!.key)}`} className="wf-add" style={{ left: n.w + (l.gapX / 2) - 11, top: n.h / 2 - 11 }} title="Aggiungi una fase dopo questa colonna"><Icon name="plus" size={12} stroke={2.4} /></Link>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
