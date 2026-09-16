import type { TenantModule } from '../tenant/index.js';

/** Avviamento guidato (AVV): profili, passi e controlli automatici. */
export type GuideProfile = 'admin' | 'hr' | 'manager' | 'employee';

/** Chiavi dei controlli automatici valutati dall'API sui dati reali (vedi docs/specifiche/avviamento-guidato.md §6). */
export type GuideCheck =
  | 'tenant_branding'
  | 'org_units'
  | 'people_loaded'
  | 'managers_assigned'
  | 'hr_roles'
  | 'users_active'
  | 'secure_access'
  | 'integrations'
  | 'okr_cycle_active'
  | 'company_values'
  | 'review_forms'
  | 'review_template'
  | 'review_cycle'
  | 'survey_launched'
  | 'competency_framework'
  | 'onboarding_template'
  | 'welfare_plan'
  | 'app_published'
  | 'has_reports'
  | 'team_objectives'
  | 'one_on_one_relations'
  | 'one_on_one_done'
  | 'feedback_given'
  | 'team_reviews'
  | 'own_objective'
  | 'own_check_in'
  | 'own_one_on_one'
  | 'own_mfa';

export interface GuideStep {
  /** chiave stabile (usata per lo stato salvato) */
  key: string;
  title: string;
  /** perché il passo conta: la regola o la pratica HR dietro */
  why: string;
  /** istruzioni passo per passo */
  how: string[];
  /** rotta dell'app dove si fa l'azione */
  href: string;
  /** etichetta del pulsante */
  cta: string;
  /** capitolo del manuale (file in docs/manuale, con eventuale ancora) */
  manual: string;
  /** controllo automatico; assente = passo manuale */
  check?: GuideCheck;
  /** i passi facoltativi non contano nel totale */
  optional?: boolean;
  /** modulo del tenant da cui dipende il passo: se disattivato (CORE-004) il passo sparisce dalla guida */
  module?: TenantModule;
}

export interface GuideProfileDefinition {
  profile: GuideProfile;
  title: string;
  intro: string;
  steps: GuideStep[];
}
