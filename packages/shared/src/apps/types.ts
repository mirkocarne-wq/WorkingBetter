/**
 * App Studio (APP, livello L2): processi custom dichiarativi sopra il form engine.
 * Un'app è una definizione (JSON, versionata) con fasi sequenziali o parallele, attori relativi,
 * approvazioni con rimando, instradamento condizionale e notifiche. Le istanze fotografano la definizione.
 */
export const AppActorKinds = ['subject', 'manager', 'manager_of_manager', 'launcher', 'hr'] as const;
/** attore relativo, oppure `person:<uuid>` o `role:<ruolo>` */
export type AppActor = (typeof AppActorKinds)[number] | `person:${string}` | `role:${string}`;
export const AppActorLabels: Record<(typeof AppActorKinds)[number], string> = { subject: 'Soggetto', manager: 'Manager del soggetto', manager_of_manager: 'Manager del manager', launcher: 'Chi ha avviato', hr: 'HR' };

export const AppStageTypes = ['form', 'approval', 'notify', 'action'] as const;
export type AppStageType = (typeof AppStageTypes)[number];
export const AppStageTypeLabels: Record<AppStageType, string> = { form: 'Compilazione', approval: 'Approvazione', notify: 'Notifica', action: 'Azione automatica' };

/** Azioni automatiche (APP-024): eseguite dal motore all'attivazione della fase, che si conclude da sola. */
export type AppAction =
  | { type: 'action_item'; title: string; assignee: AppActor; dueDays?: number | null }
  | { type: 'person_field'; field: 'jobTitle' | 'jobLevel' | 'location' | `custom:${string}`; value: string | null }
  | { type: 'webhook'; url: string; includeAnswers?: boolean }
  | { type: 'start_app'; appKey: string };
export const AppActionTypeLabels: Record<AppAction['type'], string> = { action_item: 'Crea un’azione (action item)', person_field: 'Aggiorna un attributo della persona', webhook: 'Chiama un webhook', start_app: 'Avvia un’altra app' };

export type AppOutcome = 'submitted' | 'approved' | 'rejected' | 'notified' | 'executed';
export interface AppCondition { source: 'answer' | 'outcome'; field?: string; op: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'in' | 'not_empty'; value?: unknown }
export interface AppTransition { when: AppCondition; goto: string | 'end' }

export interface AppStage {
  key: string;
  name: string;
  type: AppStageType;
  actor: AppActor;
  description?: string | null;
  /** chiave del form (type = form) */
  formKey?: string | null;
  /** giorni dall'attivazione della fase */
  dueDays: number;
  /** fasi consecutive con lo stesso gruppo sono attive insieme (APP-021) */
  parallelGroup?: string | null;
  /** l'attore vede le risposte delle fasi precedenti (APP-020) */
  seePrevious: boolean;
  approval?: { rejectTo?: string | null; requireComment?: boolean } | null;
  notify?: { to: AppActor[]; message: string } | null;
  /** azioni automatiche (type = action) */
  actions?: AppAction[] | null;
  /** valutate in ordine al completamento; la prima vera decide (APP-023) */
  transitions?: AppTransition[] | null;
}
export type AppLaunchRole = 'hr' | 'manager' | 'employee';
export type AppViewRole = 'hr' | 'manager' | 'subject' | 'launcher' | 'actors';
export interface AppPermissions { launch: AppLaunchRole[]; /** chi lancia come dipendente può farlo solo per sé */ launchForSelfOnly?: boolean; viewInstances: AppViewRole[] }
export interface AppNaming { instanceLabel: string; launchVerb: string; subjectLabel: string }
export interface AppDefinition {
  key: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  naming: AppNaming;
  permissions: AppPermissions;
  stages: AppStage[];
  /** le notifiche di fase le gestisce il modulo proprietario (es. review): il motore non ne invia */
  silent?: boolean;
}
export const DefaultAppNaming: AppNaming = { instanceLabel: 'Richiesta', launchVerb: 'Avvia', subjectLabel: 'Persona' };
export const DefaultAppPermissions: AppPermissions = { launch: ['hr'], launchForSelfOnly: false, viewInstances: ['hr', 'subject', 'launcher', 'actors'] };
