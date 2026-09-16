/**
 * Impostazioni di personalizzazione del tenant (livello L1 della piattaforma low-code, docs/specifiche/app-studio.md §4.4):
 * moduli attivi (CORE-004), glossario aziendale (CORE-003), campi custom della persona (CORE-011).
 */

export const TenantModules = ['okr', 'one_on_ones', 'feedback', 'reviews', 'surveys', 'welfare', 'development', 'f360', 'onboarding', 'apps', 'analytics'] as const;
export type TenantModule = (typeof TenantModules)[number];
export const TenantModuleLabels: Record<TenantModule, { name: string; description: string }> = {
  okr: { name: 'Obiettivi', description: 'Obiettivi, risultati chiave e check-in' },
  one_on_ones: { name: '1:1', description: 'Incontri periodici con agenda, note e azioni' },
  feedback: { name: 'Feedback e riconoscimenti', description: 'Feedback continuo, richieste e riconoscimenti pubblici' },
  reviews: { name: 'Review', description: 'Cicli di performance review, approvazioni e calibrazione' },
  surveys: { name: 'Survey', description: 'Engagement, pulse e questionari anonimi' },
  welfare: { name: 'Welfare', description: 'Piani welfare, budget, catalogo e rimborsi' },
  development: { name: 'Sviluppo', description: 'Competenze, piani di sviluppo, percorsi di carriera, talent review' },
  f360: { name: 'Feedback 360°', description: 'Campagne di feedback a più fonti' },
  onboarding: { name: 'Onboarding', description: 'Percorsi di inserimento con pre-boarding' },
  apps: { name: 'Processi (App Studio)', description: 'Processi custom, form e automazioni' },
  analytics: { name: 'Report', description: 'Report, metriche e invii programmati' },
};
/** Moduli attivi: assenti nelle impostazioni = attivi (compatibilità con i tenant esistenti). */
export type ModuleSettings = Partial<Record<TenantModule, boolean>>;
export const isModuleEnabled = (settings: { modules?: ModuleSettings | null } | null | undefined, m: TenantModule): boolean => settings?.modules?.[m] !== false;
/** Prefissi di percorso della web app governati da ciascun modulo (CORE-004). */
export const ModuleRoutes: Record<TenantModule, string[]> = {
  okr: ['/objectives'], one_on_ones: ['/one-on-ones'], feedback: ['/feedback'], reviews: ['/reviews'], surveys: ['/surveys'], welfare: ['/welfare'],
  development: ['/development'], f360: ['/f360'], onboarding: ['/onboarding'], apps: ['/apps'], analytics: ['/analytics'],
};

/** Concetti rinominabili (CORE-003): la chiave resta tecnica, l'interfaccia mostra il nome del tenant. */
export const NamingConcepts = ['objective', 'key_result', 'check_in', 'review', 'one_on_one', 'feedback', 'recognition', 'competency', 'process'] as const;
export type NamingConcept = (typeof NamingConcepts)[number];
export interface NamingEntry { singular: string; plural: string }
export type Naming = Record<NamingConcept, NamingEntry>;
export const DefaultNaming: Record<string, Naming> = {
  it: {
    objective: { singular: 'Obiettivo', plural: 'Obiettivi' },
    key_result: { singular: 'Risultato chiave', plural: 'Risultati chiave' },
    check_in: { singular: 'Check-in', plural: 'Check-in' },
    review: { singular: 'Review', plural: 'Review' },
    one_on_one: { singular: '1:1', plural: '1:1' },
    feedback: { singular: 'Feedback', plural: 'Feedback' },
    recognition: { singular: 'Riconoscimento', plural: 'Riconoscimenti' },
    competency: { singular: 'Competenza', plural: 'Competenze' },
    process: { singular: 'Processo', plural: 'Processi' },
  },
  en: {
    objective: { singular: 'Objective', plural: 'Objectives' },
    key_result: { singular: 'Key result', plural: 'Key results' },
    check_in: { singular: 'Check-in', plural: 'Check-ins' },
    review: { singular: 'Review', plural: 'Reviews' },
    one_on_one: { singular: '1:1', plural: '1:1s' },
    feedback: { singular: 'Feedback', plural: 'Feedback' },
    recognition: { singular: 'Recognition', plural: 'Recognitions' },
    competency: { singular: 'Competency', plural: 'Competencies' },
    process: { singular: 'Process', plural: 'Processes' },
  },
};
export const NamingConceptLabels: Record<NamingConcept, string> = { objective: 'Obiettivo', key_result: 'Risultato chiave', check_in: 'Check-in', review: 'Review', one_on_one: '1:1', feedback: 'Feedback', recognition: 'Riconoscimento', competency: 'Competenza', process: 'Processo' };
/** Unisce i default della lingua con le personalizzazioni del tenant. */
export function resolveNaming(locale: string, overrides: Partial<Record<NamingConcept, Partial<NamingEntry>>> | null | undefined): Naming {
  const base = DefaultNaming[locale.slice(0, 2)] ?? DefaultNaming.it!;
  const out = { ...base } as Naming;
  for (const c of NamingConcepts) {
    const o = overrides?.[c];
    if (o?.singular || o?.plural) out[c] = { singular: o.singular?.trim() || base[c].singular, plural: o.plural?.trim() || base[c].plural };
  }
  return out;
}

/** Tipi dei campi custom della persona (CORE-011). */
export const PersonFieldTypes = ['text', 'number', 'date', 'boolean', 'single_choice'] as const;
export type PersonFieldType = (typeof PersonFieldTypes)[number];
export const PersonFieldTypeLabels: Record<PersonFieldType, string> = { text: 'Testo', number: 'Numero', date: 'Data', boolean: 'Sì/No', single_choice: 'Scelta' };
export const PersonFieldVisibilities = ['hr', 'manager', 'all'] as const;
export type PersonFieldVisibility = (typeof PersonFieldVisibilities)[number];
export const PersonFieldVisibilityLabels: Record<PersonFieldVisibility, string> = { hr: 'Solo HR e amministratori', manager: 'Anche il manager', all: 'Anche la persona' };
export interface PersonFieldDef { key: string; label: string; type: PersonFieldType; options: { value: string; label: string }[]; section?: string | null; help?: string | null; required: boolean; visibility: PersonFieldVisibility; position: number }

/** Valida i valori custom contro il catalogo: restituisce gli errori (chiave → messaggio) e i valori normalizzati. */
export function validateCustomFields(defs: readonly PersonFieldDef[], values: Record<string, unknown>, opts: { requireAll?: boolean } = {}): { errors: Record<string, string>; values: Record<string, unknown> } {
  const errors: Record<string, string> = {};
  const out: Record<string, unknown> = {};
  const byKey = new Map(defs.map((d) => [d.key, d]));
  for (const [k, raw] of Object.entries(values ?? {})) {
    const d = byKey.get(k);
    if (!d) { errors[k] = 'campo non previsto dal catalogo'; continue; }
    if (raw == null || raw === '') { if (d.required && opts.requireAll) errors[k] = 'obbligatorio'; continue; }
    switch (d.type) {
      case 'text': out[k] = String(raw).slice(0, 500); break;
      case 'number': { const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.')); if (Number.isNaN(n)) errors[k] = 'numero atteso'; else out[k] = n; break; }
      case 'date': if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) errors[k] = 'data AAAA-MM-GG attesa'; else out[k] = String(raw); break;
      case 'boolean': { const v = raw === true || raw === 'true' || raw === 'si' || raw === 'sì' || raw === '1' ? true : raw === false || raw === 'false' || raw === 'no' || raw === '0' ? false : null; if (v == null) errors[k] = 'sì/no atteso'; else out[k] = v; break; }
      case 'single_choice': if (!d.options.some((o) => o.value === String(raw))) errors[k] = 'opzione non valida'; else out[k] = String(raw); break;
    }
  }
  if (opts.requireAll) for (const d of defs) if (d.required && out[d.key] == null && !(d.key in errors)) errors[d.key] = 'obbligatorio';
  return { errors, values: out };
}
/** Campi visibili a un osservatore: HR vede tutto; il manager anche quelli `manager`; la persona e gli altri solo `all`. */
export const visibleFieldDefs = (defs: readonly PersonFieldDef[], viewer: 'hr' | 'manager' | 'self' | 'other') => defs.filter((d) => viewer === 'hr' || d.visibility === 'all' || (viewer === 'manager' && d.visibility === 'manager'));
