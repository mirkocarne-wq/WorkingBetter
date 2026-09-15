import type { AppDefinition, AppStage, AppTransition } from './types.js';
import { groupOf } from './engine.js';

/**
 * Diagramma auto-disposto della definizione (ADR-0014, APP-027): una colonna per passo sequenziale,
 * le fasi dello stesso gruppo parallelo impilate nella stessa colonna, un nodo terminale «Fine».
 * Le coordinate sono in px e servono al rendering SVG della web app; nessuno stato è persistito.
 */
export interface LayoutNode { key: string; stage: AppStage | null; col: number; row: number; x: number; y: number; w: number; h: number; index: number; kind: 'stage' | 'end' }
export type EdgeKind = 'next' | 'transition' | 'reject';
export interface LayoutEdge { from: string; to: string; kind: EdgeKind; label?: string }
export interface WorkflowLayout { nodes: LayoutNode[]; edges: LayoutEdge[]; columns: number; width: number; height: number; node: { w: number; h: number }; gapX: number; gapY: number }

export const LAYOUT = { w: 220, h: 88, gapX: 72, gapY: 20, padX: 24, padY: 28 } as const;

const OP_LABEL: Record<string, string> = { eq: '=', ne: '≠', lt: '<', lte: '≤', gt: '>', gte: '≥', in: 'in', not_empty: 'non vuoto' };
/** Etichetta leggibile di un instradamento («esito = approved», «importo > 500»). */
export function transitionLabel(t: AppTransition): string {
  const c = t.when;
  const subject = c.source === 'outcome' ? 'esito' : (c.field ?? 'campo');
  if (c.op === 'not_empty') return `${subject} non vuoto`;
  const v = Array.isArray(c.value) ? (c.value as unknown[]).join(', ') : String(c.value ?? '');
  return `${subject} ${OP_LABEL[c.op] ?? c.op} ${v}`.trim();
}

export function layoutWorkflow(def: AppDefinition): WorkflowLayout {
  const { w, h, gapX, gapY, padX, padY } = LAYOUT;
  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  const colOf = new Map<string, number>();
  let col = 0;
  let maxRows = 1;
  let i = 0;
  while (i < def.stages.length) {
    const group = groupOf(def, i);
    group.forEach((idx, row) => {
      const s = def.stages[idx]!;
      nodes.push({ key: s.key, stage: s, col, row, x: 0, y: 0, w, h, index: idx, kind: 'stage' });
      colOf.set(s.key, col);
    });
    maxRows = Math.max(maxRows, group.length);
    i = group[group.length - 1]! + 1;
    col++;
  }
  nodes.push({ key: '__end', stage: null, col, row: 0, x: 0, y: 0, w: 120, h: 44, index: def.stages.length, kind: 'end' });
  colOf.set('__end', col);
  const columns = col + 1;
  // coordinate: colonne a passo fisso, righe centrate verticalmente sull'altezza massima
  const totalH = maxRows * h + (maxRows - 1) * gapY;
  const rowsInCol = new Map<number, number>();
  for (const n of nodes) rowsInCol.set(n.col, (rowsInCol.get(n.col) ?? 0) + 1);
  for (const n of nodes) {
    const rows = rowsInCol.get(n.col) ?? 1;
    const colH = rows * h + (rows - 1) * gapY;
    const top = padY + (totalH - colH) / 2;
    n.x = padX + n.col * (w + gapX);
    n.y = n.kind === 'end' ? padY + (totalH - n.h) / 2 : top + n.row * (h + gapY);
  }
  // archi di sequenza: da ogni fase di una colonna a ogni fase della colonna successiva (o a «Fine»)
  const byCol = new Map<number, LayoutNode[]>();
  for (const n of nodes) byCol.set(n.col, [...(byCol.get(n.col) ?? []), n]);
  for (let c = 0; c < columns - 1; c++) {
    const from = byCol.get(c) ?? []; const to = byCol.get(c + 1) ?? [];
    // una fase con instradamento «solo» condizionale mantiene comunque il flusso di default verso la successiva
    for (const a of from) for (const b of to) edges.push({ from: a.key, to: b.key, kind: 'next' });
  }
  for (const s of def.stages) {
    for (const t of s.transitions ?? []) edges.push({ from: s.key, to: t.goto === 'end' ? '__end' : t.goto, kind: 'transition', label: transitionLabel(t) });
    if (s.type === 'approval' && s.approval?.rejectTo) edges.push({ from: s.key, to: s.approval.rejectTo, kind: 'reject', label: 'rimanda' });
  }
  const width = padX * 2 + (columns - 1) * (w + gapX) + 120;
  const height = padY * 2 + totalH + 40; // spazio per gli archi curvi sotto
  return { nodes, edges, columns, width, height, node: { w, h }, gapX, gapY };
}
