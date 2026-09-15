import type { Answers, AnswerValue, ComputeDef, FieldDef, FormSchema, SectionDef } from './schema.js';

export interface AnswerError {
  field: string;
  message: string;
}

const isEmpty = (v: AnswerValue | undefined) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

/** Valuta una condizione showIf sulle risposte correnti. */
export function isVisible(def: { showIf?: FieldDef['showIf'] }, answers: Answers): boolean {
  const c = def.showIf;
  if (!c) return true;
  const v = answers[c.field];
  if (c.notEmpty !== undefined) return c.notEmpty ? !isEmpty(v) : isEmpty(v);
  if (c.in) return Array.isArray(v) ? v.some((x) => c.in!.includes(x)) : c.in.includes(v as string | number);
  if (c.equals !== undefined) return v === c.equals;
  return true;
}

/** Campi visibili dato lo stato delle risposte (sezione nascosta → tutti i suoi campi nascosti). */
export function visibleFields(schema: FormSchema, answers: Answers): Array<{ section: SectionDef; field: FieldDef }> {
  const out: Array<{ section: SectionDef; field: FieldDef }> = [];
  for (const section of schema.sections) {
    if (!isVisible(section, answers)) continue;
    for (const field of section.fields) if (isVisible(field, answers)) out.push({ section, field });
  }
  return out;
}

/** Validazione completa per l'invio (APP-002). In bozza si salvano risposte parziali senza validare l'obbligatorietà. */
export function validateAnswers(schema: FormSchema, answers: Answers, mode: 'draft' | 'submit' = 'submit'): AnswerError[] {
  const errors: AnswerError[] = [];
  const visible = visibleFields(schema, answers);
  for (const { field } of visible) {
    if (field.type === 'info' || field.type === 'computed') continue;
    const v = answers[field.key];
    if (isEmpty(v)) {
      if (mode === 'submit' && field.required) errors.push({ field: field.key, message: 'Campo obbligatorio' });
      continue;
    }
    switch (field.type) {
      case 'short_text':
      case 'long_text':
        if (typeof v !== 'string') errors.push({ field: field.key, message: 'Testo atteso' });
        else {
          if (field.min != null && v.length < field.min) errors.push({ field: field.key, message: `Almeno ${field.min} caratteri` });
          if (field.max != null && v.length > field.max) errors.push({ field: field.key, message: `Al massimo ${field.max} caratteri` });
        }
        break;
      case 'number':
        if (typeof v !== 'number' || Number.isNaN(v)) errors.push({ field: field.key, message: 'Numero atteso' });
        else {
          if (field.min != null && v < field.min) errors.push({ field: field.key, message: `Minimo ${field.min}` });
          if (field.max != null && v > field.max) errors.push({ field: field.key, message: `Massimo ${field.max}` });
        }
        break;
      case 'date':
        if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) errors.push({ field: field.key, message: 'Data AAAA-MM-GG attesa' });
        break;
      case 'boolean':
        if (typeof v !== 'boolean') errors.push({ field: field.key, message: 'Valore sì/no atteso' });
        break;
      case 'single_choice':
        if (typeof v !== 'string' || !field.options?.some((o) => o.value === v)) errors.push({ field: field.key, message: 'Opzione non valida' });
        break;
      case 'multi_choice':
        if (!Array.isArray(v) || v.some((x) => !field.options?.some((o) => o.value === x))) errors.push({ field: field.key, message: 'Opzioni non valide' });
        break;
      case 'scale': {
        const sc = field.scale ?? { min: 1, max: 5, allowNa: false };
        if (v === 'na') {
          if (!sc.allowNa) errors.push({ field: field.key, message: 'N/A non ammesso' });
        } else if (typeof v !== 'number' || !Number.isInteger(v) || v < sc.min || v > sc.max) errors.push({ field: field.key, message: `Valore tra ${sc.min} e ${sc.max}` });
        break;
      }
      case 'person':
        if (typeof v !== 'string' || !/^[0-9a-f-]{36}$/i.test(v)) errors.push({ field: field.key, message: 'Persona non valida' });
        break;
    }
    if (mode === 'submit' && field.type === 'scale' && field.commentRequiredBelow != null && field.commentKey && typeof v === 'number' && v <= field.commentRequiredBelow && isEmpty(answers[field.commentKey])) {
      errors.push({ field: field.commentKey, message: `Commento obbligatorio per valutazioni ≤ ${field.commentRequiredBelow}` });
    }
  }
  const known = new Set(schema.sections.flatMap((s) => s.fields.map((f) => f.key)));
  for (const k of Object.keys(answers)) if (!known.has(k)) errors.push({ field: k, message: 'Campo sconosciuto' });
  return errors;
}

/** Valore numerico di un campo ai fini dei calcoli: numero, scala (N/A escluso), scelta con punteggio, altro calcolato. */
function numericValue(f: FieldDef, answers: Answers, derived: Record<string, number | null>): number | null {
  if (f.type === 'computed') return derived[f.key] ?? null;
  const v = answers[f.key];
  if (f.type === 'number' || f.type === 'scale') return typeof v === 'number' && !Number.isNaN(v) ? v : null;
  if (f.type === 'single_choice' && typeof v === 'string') { const o = f.options?.find((x) => x.value === v); return o?.score ?? null; }
  return null;
}
/** Intervallo [min,max] di un campo, per normalizzare la mappatura su scala. */
function rangeOf(f: FieldDef, derivedRange: Record<string, [number, number] | null>): [number, number] | null {
  if (f.type === 'scale') { const sc = f.scale ?? { min: 1, max: 5 }; return [sc.min, sc.max]; }
  if (f.type === 'number' && f.min != null && f.max != null) return [f.min, f.max];
  if (f.type === 'single_choice' && f.options?.some((o) => o.score != null)) { const sc = f.options.map((o) => o.score ?? 0); return [Math.min(...sc), Math.max(...sc)]; }
  if (f.type === 'computed') return derivedRange[f.key] ?? null;
  return null;
}
const roundTo = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

/** Campi calcolati (APP-004): valuta le formule nell'ordine di definizione (un calcolato può usare i precedenti); i campi nascosti o senza valore sono esclusi. */
export function computeDerived(schema: FormSchema, answers: Answers): Record<string, number | null> {
  const fields = schema.sections.flatMap((s) => s.fields);
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const visible = new Set(visibleFields(schema, answers).map((x) => x.field.key));
  const derived: Record<string, number | null> = {};
  const derivedRange: Record<string, [number, number] | null> = {};
  for (const f of fields) {
    if (f.type !== 'computed' || !f.compute) continue;
    const c: ComputeDef = f.compute;
    const inputs = c.fields.map((k) => byKey.get(k)).filter((x): x is FieldDef => !!x && visible.has(x.key));
    const vals = inputs.map((x) => ({ v: numericValue(x, answers, derived), w: x.weight ?? 1, r: rangeOf(x, derivedRange) })).filter((x) => x.v != null) as { v: number; w: number; r: [number, number] | null }[];
    let out: number | null = null;
    if (c.op === 'count') out = vals.length;
    else if (vals.length) {
      const vs = vals.map((x) => x.v);
      if (c.op === 'sum') out = vs.reduce((a, b) => a + b, 0);
      else if (c.op === 'avg') out = vs.reduce((a, b) => a + b, 0) / vs.length;
      else if (c.op === 'weighted_avg') { const ws = vals.reduce((a, x) => a + x.w, 0); out = ws > 0 ? vals.reduce((a, x) => a + x.v * x.w, 0) / ws : null; }
      else if (c.op === 'min') out = Math.min(...vs);
      else if (c.op === 'max') out = Math.max(...vs);
    }
    // intervallo del risultato (per la mappatura su scala e per i calcolati a catena)
    const ranges = vals.map((x) => x.r).filter((r): r is [number, number] => !!r);
    let range: [number, number] | null = null;
    if (ranges.length) {
      if (c.op === 'sum') range = [ranges.reduce((a, r) => a + r[0], 0), ranges.reduce((a, r) => a + r[1], 0)];
      else if (c.op === 'count') range = [0, c.fields.length];
      else range = [Math.min(...ranges.map((r) => r[0])), Math.max(...ranges.map((r) => r[1]))];
    }
    if (out != null && c.scale && range && range[1] > range[0]) {
      const norm = Math.max(0, Math.min(1, (out - range[0]) / (range[1] - range[0])));
      out = Math.round(c.scale.min + norm * (c.scale.max - c.scale.min));
      range = [c.scale.min, c.scale.max];
    } else if (out != null) out = roundTo(out, c.decimals ?? 1);
    derived[f.key] = out;
    derivedRange[f.key] = range;
  }
  return derived;
}

export interface SectionScore {
  section: string;
  score: number | null; // normalizzato 0..1
  weight: number;
  fields: Array<{ field: string; score: number | null; weight: number }>;
}
export interface FormScore {
  total: number | null; // 0..1 (media pesata delle sezioni con punteggio)
  sections: SectionScore[];
}

/** Punteggi (APP-004): scale → (v−min)/(max−min); choice con score → score normalizzato sul max; N/A e campi nascosti esclusi. */
export function computeScores(schema: FormSchema, answers: Answers): FormScore {
  const visible = new Set(visibleFields(schema, answers).map((x) => x.field.key));
  const sections: SectionScore[] = [];
  for (const section of schema.sections) {
    if (!isVisible(section, answers)) continue;
    const fields: SectionScore['fields'] = [];
    for (const f of section.fields) {
      if (!visible.has(f.key)) continue;
      const v = answers[f.key];
      let score: number | null = null;
      if (f.type === 'scale' && typeof v === 'number') {
        const sc = f.scale ?? { min: 1, max: 5 };
        score = sc.max === sc.min ? 1 : (v - sc.min) / (sc.max - sc.min);
      } else if (f.type === 'single_choice' && typeof v === 'string' && f.options?.some((o) => o.score != null)) {
        const opt = f.options.find((o) => o.value === v);
        const max = Math.max(...f.options.map((o) => o.score ?? 0));
        if (opt?.score != null && max > 0) score = opt.score / max;
      }
      if (f.type === 'scale' || (f.type === 'single_choice' && f.options?.some((o) => o.score != null))) fields.push({ field: f.key, score, weight: f.weight ?? 1 });
      // i campi calcolati (APP-004) non entrano nel punteggio: sono una lettura derivata
    }
    const scored = fields.filter((x) => x.score != null);
    const wsum = scored.reduce((s, x) => s + x.weight, 0);
    const score = scored.length && wsum > 0 ? round(scored.reduce((s, x) => s + x.score! * x.weight, 0) / wsum) : null;
    sections.push({ section: section.key, score, weight: section.weight ?? 1, fields });
  }
  const scoredSections = sections.filter((s) => s.score != null);
  const wsum = scoredSections.reduce((s, x) => s + x.weight, 0);
  const total = scoredSections.length && wsum > 0 ? round(scoredSections.reduce((s, x) => s + x.score! * x.weight, 0) / wsum) : null;
  return { total, sections };
}

/** Mappa un punteggio 0..1 su una scala discreta (es. 1–5) per il rating complessivo (REV-006). */
export function scoreToScale(score: number, min: number, max: number): number {
  return Math.round(min + score * (max - min));
}

const round = (v: number) => Math.round(v * 10000) / 10000;
