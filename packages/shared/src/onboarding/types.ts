/**
 * Onboarding (ONB): percorsi con fasi e task a scadenza relativa alla data di riferimento (ingresso, cambio ruolo, uscita).
 */
export type OnboardingKind = 'onboarding' | 'role_change' | 'offboarding';
export const OnboardingKindLabels: Record<OnboardingKind, string> = { onboarding: 'Onboarding', role_change: 'Cambio ruolo', offboarding: 'Offboarding' };

export const OnboardingRoles = ['newcomer', 'manager', 'hr', 'buddy', 'it'] as const;
export type OnboardingRole = (typeof OnboardingRoles)[number];
export const OnboardingRoleLabels: Record<OnboardingRole, string> = { newcomer: 'Persona', manager: 'Manager', hr: 'HR', buddy: 'Buddy', it: 'IT' };

export const OnboardingTaskKinds = ['todo', 'read', 'sign', 'form', 'meeting', 'objective', 'survey'] as const;
export type OnboardingTaskKind = (typeof OnboardingTaskKinds)[number];
export const OnboardingTaskKindLabels: Record<OnboardingTaskKind, string> = { todo: 'Da fare', read: 'Da leggere', sign: 'Presa visione', form: 'Questionario', meeting: 'Incontro', objective: 'Obiettivi', survey: 'Survey di onboarding' };

export const OnboardingSurveyKeys = ['d7', 'd30', 'd90', 'exit'] as const;
export type OnboardingSurveyKey = (typeof OnboardingSurveyKeys)[number];

export interface OnboardingPhase { key: string; label: string; fromDay: number; toDay: number }
export interface OnboardingTaskDef {
  key: string;
  phase: string;
  title: string;
  description?: string | null;
  role: OnboardingRole;
  kind: OnboardingTaskKind;
  /** giorni dalla data di riferimento (negativo = prima) */
  dueDay: number;
  link?: string | null;
  /** chiave del form del form engine (kind = form) */
  formKey?: string | null;
  /** questionario di onboarding (kind = survey) */
  surveyKey?: OnboardingSurveyKey | null;
  required: boolean;
}
/** Regole di assegnazione automatica (ONB-003): tutte le condizioni indicate devono valere. */
export interface OnboardingTemplateRules { orgUnitIds?: string[]; locations?: string[]; jobTitleKeywords?: string[] }
export interface OnboardingTemplateDef { name: string; kind: OnboardingKind; description?: string | null; phases: OnboardingPhase[]; tasks: OnboardingTaskDef[]; rules?: OnboardingTemplateRules; isDefault?: boolean }
