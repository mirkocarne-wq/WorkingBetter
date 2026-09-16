/**
 * Automazioni no-code «quando → se → allora» (APP-037/038, ADR-0015).
 * Il catalogo degli eventi, la valutazione delle condizioni e il vocabolario delle azioni sono puri e condivisi tra API, worker e web.
 */
import type { AppCondition } from '../apps/types.js';

export const AutomationEvents = ['person.created', 'person.terminating', 'person.tenure', 'person.leaving_in', 'review.completed', 'review.shared', 'key_result.off_track', 'survey.closed', 'f360.released', 'onboarding.completed', 'app.completed'] as const;
export type AutomationEvent = (typeof AutomationEvents)[number];

/** Descrizione di ogni evento: etichetta, se è a tempo (parametro giorni), campi disponibili nelle condizioni. */
export interface AutomationEventInfo { label: string; description: string; timed?: boolean; fields: { key: string; label: string }[]; hasSubject: boolean }
export const AutomationEventCatalog: Record<AutomationEvent, AutomationEventInfo> = {
  'person.created': { label: 'Una persona viene creata', description: 'Nuova scheda in anagrafica (manuale, import o invito)', hasSubject: true, fields: [{ key: 'source', label: 'origine (manual, import, invite)' }] },
  'person.terminating': { label: 'Una persona viene messa in uscita', description: 'Stato «in uscita» con data di cessazione', hasSubject: true, fields: [{ key: 'terminationDate', label: 'data di cessazione' }] },
  'person.tenure': { label: 'Una persona compie N giorni in azienda', description: 'Valutato ogni giorno dalla data di assunzione', timed: true, hasSubject: true, fields: [{ key: 'days', label: 'giorni dall’ingresso' }] },
  'person.leaving_in': { label: 'Mancano N giorni all’uscita di una persona', description: 'Valutato ogni giorno dalla data di cessazione', timed: true, hasSubject: true, fields: [{ key: 'days', label: 'giorni all’uscita' }] },
  'review.completed': { label: 'Una review riceve la valutazione del manager', description: 'Il manager invia la review: rating disponibile', hasSubject: true, fields: [{ key: 'rating', label: 'rating (scala del template)' }, { key: 'score', label: 'punteggio 0–1' }, { key: 'cycleName', label: 'nome del ciclo' }] },
  'review.shared': { label: 'Una review viene condivisa con la persona', description: 'Dopo le approvazioni', hasSubject: true, fields: [{ key: 'rating', label: 'rating' }, { key: 'cycleName', label: 'nome del ciclo' }] },
  'key_result.off_track': { label: 'Un risultato chiave passa a «off track»', description: 'Check-in con confidenza off track', hasSubject: true, fields: [{ key: 'objectiveTitle', label: 'titolo dell’obiettivo' }, { key: 'level', label: 'livello (company, unit, team, individual)' }, { key: 'progress', label: 'progresso 0–1' }] },
  'survey.closed': { label: 'Una survey si chiude', description: 'Chiusura manuale o alla data prevista', hasSubject: false, fields: [{ key: 'kind', label: 'tipo (engagement, pulse, enps, wellbeing, adhoc)' }, { key: 'responseRate', label: 'tasso di risposta 0–1' }, { key: 'title', label: 'titolo' }] },
  'f360.released': { label: 'Un report 360° viene rilasciato', description: 'Report condiviso con la persona', hasSubject: true, fields: [{ key: 'campaign', label: 'nome della campagna' }] },
  'onboarding.completed': { label: 'Un percorso di onboarding si completa', description: 'Tutti i task obbligatori chiusi', hasSubject: true, fields: [{ key: 'kind', label: 'tipo (onboarding, role_change, offboarding)' }, { key: 'templateName', label: 'nome del template' }] },
  'app.completed': { label: 'Un processo dell’App Studio si conclude', description: 'Istanza completata (con esito)', hasSubject: true, fields: [{ key: 'appKey', label: 'chiave dell’app' }, { key: 'outcome', label: 'esito (approved, rejected, submitted…)' }, { key: 'title', label: 'titolo dell’istanza' }] },
};
/** Campi della persona soggetto utilizzabili in ogni condizione. */
export const AutomationPersonFields: { key: string; label: string }[] = [
  { key: 'person.jobTitle', label: 'titolo di ruolo' }, { key: 'person.jobLevel', label: 'livello' }, { key: 'person.location', label: 'sede' }, { key: 'person.orgUnitId', label: 'unità (id)' }, { key: 'person.managerId', label: 'manager (id)' }, { key: 'person.status', label: 'stato' }, { key: 'person.custom.<chiave>', label: 'campo custom' },
];

export interface AutomationTrigger { event: AutomationEvent; days?: number | null; appKey?: string | null }
export type AutomationCondition = { field: string; op: AppCondition['op']; value?: string | number | boolean | string[] | null };
export type AutomationActor = 'subject' | 'manager' | 'manager_of_manager' | 'hr' | `person:${string}` | `role:${string}`;
export type AutomationAction =
  | { type: 'start_app'; appKey: string }
  | { type: 'action_item'; title: string; assignee: AutomationActor; dueDays?: number | null }
  | { type: 'person_field'; field: string; value: string | null }
  | { type: 'webhook'; url: string }
  | { type: 'notify'; to: AutomationActor[]; message: string };
export const AutomationActionTypeLabels: Record<AutomationAction['type'], string> = { start_app: 'Avvia un’app', action_item: 'Crea un’azione (action item)', person_field: 'Aggiorna un attributo della persona', webhook: 'Chiama un webhook', notify: 'Invia una notifica (in-app, email, chat)' };
export const AutomationActorLabels: Record<string, string> = { subject: 'La persona soggetto', manager: 'Il suo manager', manager_of_manager: 'Il manager del manager', hr: 'HR' };

export interface AutomationRuleDef { name: string; enabled: boolean; trigger: AutomationTrigger; conditions: AutomationCondition[]; actions: AutomationAction[] }
export const AutomationLimits = { rulesPerTenant: 50, actionsPerRule: 5, conditionsPerRule: 5, maxDepth: 2 } as const;

/** Evento normalizzato consegnato al motore. */
export interface AutomationEventPayload {
  type: AutomationEvent;
  subjectPersonId: string | null;
  /** identificatore stabile della sorgente (review id, istanza, survey…) per l'idempotenza */
  sourceId: string;
  data: Record<string, unknown>;
  /** profondità: 0 per gli eventi «umani», +1 per quelli prodotti da un'azione di una regola */
  depth?: number;
}
export interface AutomationPersonView { jobTitle?: string | null; jobLevel?: string | null; location?: string | null; orgUnitId?: string | null; managerId?: string | null; status?: string | null; customFields?: Record<string, unknown> | null }

const num = (v: unknown): number | null => { if (typeof v === 'number') return v; if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v); return null; };
const asList = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === 'string' ? v.split(',').map((x) => x.trim()).filter(Boolean) : v == null ? [] : [String(v)]);

/** Legge un campo della condizione: `person.*` dalla persona soggetto, il resto dai dati dell'evento. */
export function conditionValue(field: string, event: Pick<AutomationEventPayload, 'data'>, person: AutomationPersonView | null): unknown {
  if (field.startsWith('person.custom.')) return person?.customFields?.[field.slice('person.custom.'.length)];
  if (field.startsWith('person.')) return (person as Record<string, unknown> | null)?.[field.slice(7)];
  return event.data[field];
}
export function evaluateCondition(c: AutomationCondition, event: Pick<AutomationEventPayload, 'data'>, person: AutomationPersonView | null): boolean {
  const v = conditionValue(c.field, event, person);
  switch (c.op) {
    case 'not_empty': return v != null && v !== '' && !(Array.isArray(v) && v.length === 0);
    case 'eq': { const n = num(v); const m = num(c.value); if (n != null && m != null) return n === m; return String(v ?? '').toLowerCase() === String(c.value ?? '').toLowerCase(); }
    case 'ne': return !evaluateCondition({ ...c, op: 'eq' }, event, person);
    case 'in': return asList(c.value).map((x) => x.toLowerCase()).includes(String(v ?? '').toLowerCase());
    case 'lt': case 'lte': case 'gt': case 'gte': {
      const n = num(v); const m = num(c.value);
      if (n == null || m == null) return false;
      return c.op === 'lt' ? n < m : c.op === 'lte' ? n <= m : c.op === 'gt' ? n > m : n >= m;
    }
    default: return false;
  }
}
/** Tutte le condizioni in AND; nessuna condizione = sempre vero. */
export const evaluateConditions = (conds: readonly AutomationCondition[], event: Pick<AutomationEventPayload, 'data'>, person: AutomationPersonView | null) => conds.every((c) => evaluateCondition(c, event, person));

/** Il trigger corrisponde all'evento? (tipo, giorni per i trigger a tempo, chiave app per app.completed). */
export function matchTrigger(trigger: AutomationTrigger, event: AutomationEventPayload): boolean {
  if (trigger.event !== event.type) return false;
  if (AutomationEventCatalog[trigger.event].timed && trigger.days != null && num(event.data.days) !== trigger.days) return false;
  if (trigger.event === 'app.completed' && trigger.appKey && event.data.appKey !== trigger.appKey) return false;
  return true;
}
/** Chiave di idempotenza: una esecuzione per regola, evento, soggetto e sorgente. */
export const automationDedupeKey = (ruleId: string, event: AutomationEventPayload) => `${ruleId}:${event.type}:${event.subjectPersonId ?? '-'}:${event.sourceId}`;

/** Riassunto leggibile di una regola (per elenchi). */
export function describeTrigger(t: AutomationTrigger): string {
  const info = AutomationEventCatalog[t.event];
  if (!info) return t.event;
  if (info.timed && t.days != null) return info.label.replace('N giorni', `${t.days} giorni`);
  if (t.event === 'app.completed' && t.appKey) return `${info.label} (${t.appKey})`;
  return info.label;
}
export const OpLabels: Record<AppCondition['op'], string> = { eq: '=', ne: '≠', lt: '<', lte: '≤', gt: '>', gte: '≥', in: 'in', not_empty: 'non vuoto' };
export function describeCondition(c: AutomationCondition): string {
  return c.op === 'not_empty' ? `${c.field} non vuoto` : `${c.field} ${OpLabels[c.op]} ${Array.isArray(c.value) ? c.value.join(', ') : String(c.value ?? '')}`;
}
export function describeAction(a: AutomationAction): string {
  switch (a.type) {
    case 'start_app': return `avvia «${a.appKey}»`;
    case 'action_item': return `azione «${a.title}» per ${AutomationActorLabels[a.assignee] ?? a.assignee}`;
    case 'person_field': return `imposta ${a.field} = ${a.value ?? '—'}`;
    case 'webhook': return `webhook ${a.url}`;
    case 'notify': return `notifica a ${a.to.map((x) => AutomationActorLabels[x] ?? x).join(', ')}`;
  }
}
