import { z } from 'zod';

/**
 * Schema dichiarativo dei form (APP-001…004). Un form è un elenco di sezioni con campi tipizzati,
 * obbligatorietà, limiti, logica condizionale (showIf) e pesi per il calcolo dei punteggi.
 */
export const fieldTypes = ['short_text', 'long_text', 'number', 'date', 'boolean', 'single_choice', 'multi_choice', 'scale', 'person', 'info', 'computed'] as const;
export type FieldType = (typeof fieldTypes)[number];

const key = z.string().regex(/^[a-z][a-z0-9_]{0,60}$/, 'chiave: minuscole, numeri e underscore');

export const choiceOption = z.object({ value: z.string().min(1).max(80), label: z.string().min(1).max(200), score: z.number().optional() });

export const showIf = z.object({ field: key, equals: z.union([z.string(), z.number(), z.boolean()]).optional(), in: z.array(z.union([z.string(), z.number()])).optional(), notEmpty: z.boolean().optional() });

export const scaleDef = z.object({
  min: z.number().int().default(1),
  max: z.number().int().default(5),
  labels: z.record(z.string()).optional(), // { "1": "Non soddisfa", ... }
  allowNa: z.boolean().default(false),
});
export type ScaleDef = z.infer<typeof scaleDef>;

/** Campo calcolato (APP-004): valutato dal motore sui campi numerici o scala indicati, mostrato in sola lettura. */
export const computeOps = ['sum', 'avg', 'weighted_avg', 'min', 'max', 'count'] as const;
export type ComputeOp = (typeof computeOps)[number];
export const computeDef = z.object({
  op: z.enum(computeOps),
  fields: z.array(key).min(1),
  decimals: z.number().int().min(0).max(4).default(1),
  /** mappa il risultato (normalizzato sull'intervallo dei campi) su una scala discreta, es. rating finale 1–5 */
  scale: z.object({ min: z.number().int(), max: z.number().int() }).optional(),
});
export type ComputeDef = z.infer<typeof computeDef>;

export const fieldDef = z.object({
  key,
  type: z.enum(fieldTypes),
  label: z.string().min(1).max(300),
  help: z.string().max(1000).optional(),
  required: z.boolean().default(false),
  placeholder: z.string().max(200).optional(),
  options: z.array(choiceOption).optional(), // single/multi choice
  scale: scaleDef.optional(),
  /** scala riutilizzabile del tenant (APP-005): l'API la risolve in `scale` alla pubblicazione */
  scaleKey: key.optional(),
  compute: computeDef.optional(),
  min: z.number().optional(), // number / lunghezza testo
  max: z.number().optional(),
  weight: z.number().positive().optional(), // per i punteggi (scale, choice con score)
  showIf: showIf.optional(),
  /** commento obbligatorio se il valore (scale) è ≤ soglia (REV-033) */
  commentRequiredBelow: z.number().optional(),
  commentKey: key.optional(),
});
export type FieldDef = z.infer<typeof fieldDef>;

export const sectionDef = z.object({
  key,
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  weight: z.number().positive().optional(),
  showIf: showIf.optional(),
  fields: z.array(fieldDef).min(1),
});
export type SectionDef = z.infer<typeof sectionDef>;

export const formSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(4000).optional(),
    locale: z.string().default('it'),
    sections: z.array(sectionDef).min(1),
    scoring: z.object({ enabled: z.boolean().default(false), scale: z.object({ min: z.number(), max: z.number() }).optional() }).default({ enabled: false }),
  })
  .superRefine((f, ctx) => {
    const keys = new Set<string>();
    for (const s of f.sections) {
      if (keys.has(s.key)) ctx.addIssue({ code: 'custom', message: `chiave sezione duplicata: ${s.key}`, path: ['sections'] });
      keys.add(`section:${s.key}`);
      for (const fl of s.fields) {
        if (keys.has(fl.key)) ctx.addIssue({ code: 'custom', message: `chiave campo duplicata: ${fl.key}`, path: ['sections'] });
        keys.add(fl.key);
        if ((fl.type === 'single_choice' || fl.type === 'multi_choice') && !fl.options?.length) ctx.addIssue({ code: 'custom', message: `il campo ${fl.key} richiede options`, path: ['sections'] });
      }
    }
    const byKey = new Map(f.sections.flatMap((s) => s.fields.map((fl) => [fl.key, fl] as const)));
    for (const s of f.sections) {
      if (s.showIf && !keys.has(s.showIf.field)) ctx.addIssue({ code: 'custom', message: `showIf della sezione ${s.key} punta a un campo inesistente`, path: ['sections'] });
      for (const fl of s.fields) {
        if (fl.showIf && !keys.has(fl.showIf.field)) ctx.addIssue({ code: 'custom', message: `showIf di ${fl.key} punta a un campo inesistente`, path: ['sections'] });
        if (fl.type === 'computed') {
          if (!fl.compute) ctx.addIssue({ code: 'custom', message: `il campo calcolato ${fl.key} richiede compute`, path: ['sections'] });
          for (const ref of fl.compute?.fields ?? []) {
            const target = byKey.get(ref);
            if (!target) ctx.addIssue({ code: 'custom', message: `il campo calcolato ${fl.key} usa un campo inesistente (${ref})`, path: ['sections'] });
            else if (!['number', 'scale', 'single_choice', 'computed'].includes(target.type)) ctx.addIssue({ code: 'custom', message: `il campo calcolato ${fl.key} può usare solo numeri, scale, scelte con punteggio o altri calcolati (${ref})`, path: ['sections'] });
            else if (ref === fl.key) ctx.addIssue({ code: 'custom', message: `il campo calcolato ${fl.key} non può usare sé stesso`, path: ['sections'] });
          }
          if (fl.required) ctx.addIssue({ code: 'custom', message: `il campo calcolato ${fl.key} non può essere obbligatorio`, path: ['sections'] });
        }
      }
    }
  });
export type FormSchema = z.infer<typeof formSchema>;

export type AnswerValue = string | number | boolean | string[] | null;
export type Answers = Record<string, AnswerValue>;
