import type { Answers, AnswerValue, FieldDef, FormSchema, SectionDef } from './schema.js';

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
    if (field.type === 'info') continue;
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
