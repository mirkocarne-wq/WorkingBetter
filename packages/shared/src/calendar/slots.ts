/** Proposta di slot per un 1:1 da dati interni (INT-024): orario di lavoro, giorni feriali, impegni già noti. */

export interface BusyInterval {
  start: Date;
  end: Date;
}

export interface SlotOptions {
  /** Non proporre prima di questo istante (di solito adesso). */
  after: Date;
  durationMin: number;
  busy: BusyInterval[];
  /** Quanti slot restituire (uno per giorno lavorativo, sui primi giorni disponibili). */
  count?: number;
  /** Orario di lavoro in ore locali [start, end). */
  workHours?: { start: number; end: number };
  /** Giorni lavorativi (0 = domenica … 6 = sabato). */
  workDays?: number[];
  /** Granularità degli slot in minuti. */
  stepMin?: number;
  /** Scostamento del fuso del tenant rispetto a UTC, in minuti (es. Europe/Rome estate = 120). */
  tzOffsetMin?: number;
  /** Quanti giorni esplorare al massimo. */
  horizonDays?: number;
  /** Ora locale preferita (es. la stessa dell'ultimo 1:1): se libera, viene proposta per prima quel giorno. */
  preferredHour?: number | null;
}

const overlaps = (aStart: number, aEnd: number, b: BusyInterval) => aStart < b.end.getTime() && aEnd > b.start.getTime();

/**
 * Restituisce fino a `count` proposte, al massimo una per giorno: per ogni giorno lavorativo il primo slot libero
 * (o l'ora preferita se libera). Tutto è calcolato in "ora locale" applicando `tzOffsetMin`.
 */
export function proposeSlots(o: SlotOptions): Date[] {
  const count = o.count ?? 3;
  const wh = o.workHours ?? { start: 9, end: 18 };
  const days = o.workDays ?? [1, 2, 3, 4, 5];
  const step = o.stepMin ?? 30;
  const off = (o.tzOffsetMin ?? 0) * 60000;
  const horizon = o.horizonDays ?? 21;
  const dur = o.durationMin * 60000;
  const out: Date[] = [];
  // "locale" = UTC + offset: lavoriamo su timestamp traslati e ritrasliamo alla fine
  const localAfter = o.after.getTime() + off;
  const dayStart = Date.UTC(new Date(localAfter).getUTCFullYear(), new Date(localAfter).getUTCMonth(), new Date(localAfter).getUTCDate());
  for (let d = 0; d < horizon && out.length < count; d++) {
    const day = dayStart + d * 86400000;
    if (!days.includes(new Date(day).getUTCDay())) continue;
    const from = day + wh.start * 3600000;
    const to = day + wh.end * 3600000;
    const candidates: number[] = [];
    if (o.preferredHour != null) candidates.push(day + o.preferredHour * 3600000);
    for (let t = from; t + dur <= to; t += step * 60000) candidates.push(t);
    const pick = candidates.find((t) => {
      if (t < from || t + dur > to) return false;
      if (t < localAfter) return false;
      const realStart = t - off;
      const realEnd = realStart + dur;
      return !o.busy.some((b) => overlaps(realStart, realEnd, b));
    });
    if (pick != null) out.push(new Date(pick - off));
  }
  return out;
}

/** Scostamento in minuti di un fuso IANA rispetto a UTC a una certa data (positivo a est di Greenwich). */
export function tzOffsetMinutes(timeZone: string, at: Date): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(at);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
    const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    return Math.round((asUtc - at.getTime()) / 60000);
  } catch {
    return 0;
  }
}
