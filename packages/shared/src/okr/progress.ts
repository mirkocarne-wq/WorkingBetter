import type { KeyResultType } from './types.js';

export interface KeyResultProgressInput {
  type: KeyResultType;
  startValue: number;
  targetValue: number;
  currentValue: number;
  /** milestone: numero tappe completate su totale (currentValue/targetValue) */
  allowOverachievement?: boolean;
}

/**
 * Progresso di un key result in [0,1] (o oltre 1 se overachievement abilitato).
 * Regole: docs/specifiche/obiettivi-okr.md §6.
 *  - numerico/percentuale/valuta: (current − start) / (target − start); funziona anche per KR decrescenti.
 *  - booleano: 0 o 1.
 *  - milestone: completate / totali.
 */
export function keyResultProgress(kr: KeyResultProgressInput): number {
  const clamp = (v: number) => {
    if (Number.isNaN(v)) return 0;
    const lo = Math.max(0, v);
    return kr.allowOverachievement ? lo : Math.min(1, lo);
  };
  switch (kr.type) {
    case 'boolean':
      return kr.currentValue >= 1 ? 1 : 0;
    case 'milestone':
      return kr.targetValue <= 0 ? 0 : clamp(kr.currentValue / kr.targetValue);
    default: {
      const span = kr.targetValue - kr.startValue;
      if (span === 0) return kr.currentValue === kr.targetValue ? 1 : 0;
      return clamp((kr.currentValue - kr.startValue) / span);
    }
  }
}

export interface WeightedProgress {
  progress: number;
  weight?: number | null;
}

/** Progresso di un obiettivo = media (pesata se i pesi sono presenti) dei KR. Nessun KR → null. */
export function objectiveProgress(items: readonly WeightedProgress[]): number | null {
  if (items.length === 0) return null;
  const weighted = items.some((i) => i.weight != null && i.weight > 0);
  if (!weighted) {
    return round(items.reduce((s, i) => s + i.progress, 0) / items.length);
  }
  let num = 0;
  let den = 0;
  for (const i of items) {
    const w = i.weight != null && i.weight > 0 ? i.weight : 0;
    num += i.progress * w;
    den += w;
  }
  return den === 0 ? 0 : round(num / den);
}

function round(v: number): number {
  return Math.round(v * 10000) / 10000;
}
