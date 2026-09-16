/**
 * Ruoli e permessi (vedi docs/02-specifiche-funzionali.md e docs/specifiche/core.md §3).
 * I permessi sono atomici e in inglese; i ruoli predefiniti li compongono.
 */
export const Roles = {
  SUPER_ADMIN: 'super_admin',
  TENANT_ADMIN: 'tenant_admin',
  HR_ADMIN: 'hr_admin',
  HRBP: 'hrbp',
  MANAGER: 'manager',
  EMPLOYEE: 'employee',
  OBSERVER: 'observer',
  ANALYST: 'analyst',
} as const;
export type Role = (typeof Roles)[keyof typeof Roles];

export const Permissions = {
  TENANT_SETTINGS: 'tenant:settings',
  ROLES_MANAGE: 'roles:manage',
  PEOPLE_READ: 'people:read',
  PEOPLE_WRITE: 'people:write',
  ORG_READ: 'org:read',
  ORG_WRITE: 'org:write',
  AUDIT_READ: 'audit:read',
  CYCLES_WRITE: 'cycles:write',
  OBJECTIVES_READ: 'objectives:read',
  OBJECTIVES_WRITE_OWN: 'objectives:write:own',
  OBJECTIVES_WRITE_TEAM: 'objectives:write:team',
  OBJECTIVES_WRITE_ANY: 'objectives:write:any',
  OBJECTIVES_WRITE_COMPANY: 'objectives:write:company',
  ANALYTICS_QUERY: 'analytics:query',
  ANALYTICS_QUERY_TEAM: 'analytics:query:team',
  ONE_ON_ONES_PARTICIPATE: 'one_on_ones:participate',
  ONE_ON_ONES_METRICS: 'one_on_ones:metrics',
  FEEDBACK_GIVE: 'feedback:give',
  FEEDBACK_READ_TEAM: 'feedback:read:team',
  FEEDBACK_MODERATE: 'feedback:moderate',
  VALUES_MANAGE: 'values:manage',
  NOTIFICATIONS_READ: 'notifications:read',
  PEOPLE_IMPORT: 'people:import',
  FORMS_MANAGE: 'forms:manage',
  FORMS_RESPOND: 'forms:respond',
  REVIEWS_MANAGE: 'reviews:manage',
  REVIEWS_PARTICIPATE: 'reviews:participate',
  SURVEYS_MANAGE: 'surveys:manage',
  SURVEYS_RESPOND: 'surveys:respond',
  SURVEYS_RESULTS_TEAM: 'surveys:results:team',
  WELFARE_USE: 'welfare:use',
  WELFARE_MANAGE: 'welfare:manage',
  WELFARE_PAYROLL: 'welfare:payroll',
  DEV_USE: 'development:use',
  DEV_TEAM: 'development:team',
  DEV_MANAGE: 'development:manage',
  F360_PARTICIPATE: 'f360:participate',
  F360_TEAM: 'f360:team',
  F360_MANAGE: 'f360:manage',
  ONBOARDING_USE: 'onboarding:use',
  ONBOARDING_TEAM: 'onboarding:team',
  ONBOARDING_MANAGE: 'onboarding:manage',
  APPS_USE: 'apps:use',
  APPS_MANAGE: 'apps:manage',
} as const;
export type Permission = (typeof Permissions)[keyof typeof Permissions];

const P = Permissions;
const employee: Permission[] = [P.PEOPLE_READ, P.ORG_READ, P.OBJECTIVES_READ, P.OBJECTIVES_WRITE_OWN, P.ONE_ON_ONES_PARTICIPATE, P.FEEDBACK_GIVE, P.NOTIFICATIONS_READ, P.FORMS_RESPOND, P.REVIEWS_PARTICIPATE, P.SURVEYS_RESPOND, P.WELFARE_USE, P.DEV_USE, P.F360_PARTICIPATE, P.ONBOARDING_USE, P.APPS_USE];
const manager: Permission[] = [...employee, P.OBJECTIVES_WRITE_TEAM, P.ONE_ON_ONES_METRICS, P.FEEDBACK_READ_TEAM, P.ANALYTICS_QUERY_TEAM, P.SURVEYS_RESULTS_TEAM, P.DEV_TEAM, P.F360_TEAM, P.ONBOARDING_TEAM];
const hrbp: Permission[] = [...manager, P.PEOPLE_WRITE, P.ORG_WRITE, P.OBJECTIVES_WRITE_ANY, P.ANALYTICS_QUERY, P.PEOPLE_IMPORT, P.REVIEWS_MANAGE];
const hrAdmin: Permission[] = [...hrbp, P.CYCLES_WRITE, P.OBJECTIVES_WRITE_COMPANY, P.ROLES_MANAGE, P.AUDIT_READ, P.FEEDBACK_MODERATE, P.VALUES_MANAGE, P.FORMS_MANAGE, P.SURVEYS_MANAGE, P.WELFARE_MANAGE, P.WELFARE_PAYROLL, P.DEV_MANAGE, P.F360_MANAGE, P.ONBOARDING_MANAGE, P.APPS_MANAGE];
const tenantAdmin: Permission[] = [...hrAdmin, P.TENANT_SETTINGS];

export const RolePermissions: Record<Role, readonly Permission[]> = {
  super_admin: Object.values(P),
  tenant_admin: tenantAdmin,
  hr_admin: hrAdmin,
  hrbp,
  manager,
  employee,
  observer: [P.PEOPLE_READ, P.ORG_READ, P.OBJECTIVES_READ, P.ANALYTICS_QUERY, P.ONE_ON_ONES_METRICS],
  analyst: [P.PEOPLE_READ, P.ORG_READ, P.OBJECTIVES_READ, P.ANALYTICS_QUERY, P.ONE_ON_ONES_METRICS],
};

export function permissionsForRoles(roles: readonly string[]): Set<Permission> {
  const out = new Set<Permission>();
  for (const r of roles) {
    const perms = RolePermissions[r as Role];
    if (perms) for (const p of perms) out.add(p);
  }
  return out;
}

export function hasPermission(subject: PermissionSubject, permission: Permission): boolean {
  return effectivePermissions(subject).has(permission);
}

// ---- Ruoli custom e permessi per modulo (CORE-041, CORE-043; sprint 27) ----

/** Ruoli predefiniti assegnabili nel tenant (super_admin è della piattaforma). */
export const BuiltInRoles = [Roles.TENANT_ADMIN, Roles.HR_ADMIN, Roles.HRBP, Roles.MANAGER, Roles.EMPLOYEE, Roles.OBSERVER, Roles.ANALYST] as const;
export type BuiltInRole = (typeof BuiltInRoles)[number];
export const BuiltInRoleLabels: Record<BuiltInRole, string> = { tenant_admin: 'Amministratore', hr_admin: 'HR admin', hrbp: 'HRBP', manager: 'Manager', employee: 'Collaboratore', observer: 'Osservatore', analyst: 'Analista' };
export const isBuiltInRole = (key: string): key is BuiltInRole => (BuiltInRoles as readonly string[]).includes(key);

/**
 * Definizione di ruolo del tenant: un ruolo custom (chiave propria, ruolo base per il perimetro) oppure la
 * personalizzazione di un ruolo predefinito (stessa chiave, permessi diversi dai default).
 */
export interface RoleDefinition {
  key: string;
  name: string;
  description?: string | null;
  /** ruolo predefinito da cui il ruolo custom eredita il perimetro (team, perimetro HR…); null per i predefiniti */
  baseRole: BuiltInRole | null;
  permissions: readonly string[];
}

/** Permessi che non si possono togliere all'amministratore del tenant: evitano di restare chiusi fuori. */
export const ProtectedPermissions: Permission[] = [P.TENANT_SETTINGS, P.ROLES_MANAGE];

/** Catalogo dei permessi per modulo, per l'editor dei ruoli (CORE-043). */
export interface PermissionGroup { module: string; title: string; items: { key: Permission; label: string }[] }
export const PermissionCatalog: PermissionGroup[] = [
  { module: 'core', title: 'Organizzazione e accessi', items: [
    { key: P.TENANT_SETTINGS, label: 'Impostazioni del tenant (SSO, sicurezza, integrazioni, moduli, glossario)' },
    { key: P.ROLES_MANAGE, label: 'Utenti, inviti e ruoli' },
    { key: P.PEOPLE_READ, label: 'Vedere le persone' },
    { key: P.PEOPLE_WRITE, label: 'Modificare le persone e i campi custom' },
    { key: P.PEOPLE_IMPORT, label: 'Importare persone da CSV' },
    { key: P.ORG_READ, label: 'Vedere l’organigramma' },
    { key: P.ORG_WRITE, label: 'Modificare le unità organizzative' },
    { key: P.AUDIT_READ, label: 'Consultare l’audit' },
    { key: P.NOTIFICATIONS_READ, label: 'Notifiche e Guida' },
  ] },
  { module: 'okr', title: 'Obiettivi', items: [
    { key: P.OBJECTIVES_READ, label: 'Vedere gli obiettivi visibili' },
    { key: P.OBJECTIVES_WRITE_OWN, label: 'Creare e aggiornare i propri obiettivi' },
    { key: P.OBJECTIVES_WRITE_TEAM, label: 'Gestire gli obiettivi del team' },
    { key: P.OBJECTIVES_WRITE_ANY, label: 'Gestire gli obiettivi di chiunque' },
    { key: P.OBJECTIVES_WRITE_COMPANY, label: 'Obiettivi aziendali' },
    { key: P.CYCLES_WRITE, label: 'Periodi obiettivi' },
  ] },
  { module: 'one_on_ones', title: '1:1', items: [
    { key: P.ONE_ON_ONES_PARTICIPATE, label: 'Partecipare ai 1:1' },
    { key: P.ONE_ON_ONES_METRICS, label: 'Metriche aggregate dei 1:1' },
  ] },
  { module: 'feedback', title: 'Feedback e riconoscimenti', items: [
    { key: P.FEEDBACK_GIVE, label: 'Dare e chiedere feedback, riconoscere' },
    { key: P.FEEDBACK_READ_TEAM, label: 'Feedback del team (in fascicolo)' },
    { key: P.FEEDBACK_MODERATE, label: 'Moderare feedback e riconoscimenti' },
    { key: P.VALUES_MANAGE, label: 'Valori aziendali' },
  ] },
  { module: 'forms', title: 'Form', items: [
    { key: P.FORMS_RESPOND, label: 'Compilare i questionari' },
    { key: P.FORMS_MANAGE, label: 'Costruire questionari e scale' },
  ] },
  { module: 'reviews', title: 'Review', items: [
    { key: P.REVIEWS_PARTICIPATE, label: 'Partecipare alle review (self, manager, firma)' },
    { key: P.REVIEWS_MANAGE, label: 'Template, cicli, approvazioni e calibrazione' },
  ] },
  { module: 'surveys', title: 'Survey', items: [
    { key: P.SURVEYS_RESPOND, label: 'Rispondere alle survey' },
    { key: P.SURVEYS_RESULTS_TEAM, label: 'Risultati aggregati del team' },
    { key: P.SURVEYS_MANAGE, label: 'Creare survey e vedere tutti i risultati' },
  ] },
  { module: 'analytics', title: 'Report', items: [
    { key: P.ANALYTICS_QUERY_TEAM, label: 'Report sul proprio team' },
    { key: P.ANALYTICS_QUERY, label: 'Report su tutta l’azienda e report salvati' },
  ] },
  { module: 'welfare', title: 'Welfare', items: [
    { key: P.WELFARE_USE, label: 'Usare il proprio conto welfare' },
    { key: P.WELFARE_MANAGE, label: 'Piani, catalogo, verifica richieste' },
    { key: P.WELFARE_PAYROLL, label: 'Flussi paghe' },
  ] },
  { module: 'development', title: 'Sviluppo', items: [
    { key: P.DEV_USE, label: 'Il proprio profilo di sviluppo' },
    { key: P.DEV_TEAM, label: 'Profili e piani del team' },
    { key: P.DEV_MANAGE, label: 'Framework, profili di ruolo, talent review' },
  ] },
  { module: 'f360', title: 'Feedback 360°', items: [
    { key: P.F360_PARTICIPATE, label: 'Partecipare alle campagne' },
    { key: P.F360_TEAM, label: 'Report 360° del team' },
    { key: P.F360_MANAGE, label: 'Campagne e report di tutti' },
  ] },
  { module: 'onboarding', title: 'Onboarding', items: [
    { key: P.ONBOARDING_USE, label: 'Il proprio percorso' },
    { key: P.ONBOARDING_TEAM, label: 'Percorsi del team' },
    { key: P.ONBOARDING_MANAGE, label: 'Template e avvio dei percorsi' },
  ] },
  { module: 'apps', title: 'Processi (App Studio)', items: [
    { key: P.APPS_USE, label: 'Avviare e compilare i processi' },
    { key: P.APPS_MANAGE, label: 'Costruire e pubblicare app' },
  ] },
];
export const PermissionLabels: Record<string, string> = Object.fromEntries(PermissionCatalog.flatMap((g) => g.items.map((i) => [i.key, i.label])));

/**
 * Permessi effettivi da ruoli + definizioni del tenant: un ruolo con definizione usa i permessi della definizione
 * (custom o predefinito personalizzato), gli altri i default; `super_admin` ha sempre tutto; l'amministratore
 * conserva i permessi protetti.
 */
export function resolvePermissions(roles: readonly string[], definitions: readonly RoleDefinition[] = []): Set<Permission> {
  const byKey = new Map(definitions.map((d) => [d.key, d]));
  const out = new Set<Permission>();
  for (const r of roles) {
    if (r === Roles.SUPER_ADMIN) { for (const p of Object.values(P)) out.add(p); continue; }
    const def = byKey.get(r);
    const perms = def ? def.permissions : RolePermissions[r as Role];
    if (perms) for (const p of perms) if ((Object.values(P) as string[]).includes(p)) out.add(p as Permission);
    if (r === Roles.TENANT_ADMIN) for (const p of ProtectedPermissions) out.add(p);
  }
  return out;
}
/** Ruoli predefiniti «impliciti» dei ruoli custom (perimetro): un ruolo custom con base `manager` vale come manager per team e viste. */
export function baseRolesOf(roles: readonly string[], definitions: readonly RoleDefinition[]): string[] {
  const byKey = new Map(definitions.map((d) => [d.key, d]));
  const out: string[] = [];
  for (const r of roles) { const b = byKey.get(r)?.baseRole; if (b && !roles.includes(b) && !out.includes(b)) out.push(b); }
  return out;
}

/** Soggetto di una verifica di permesso: elenco di ruoli oppure un principal con permessi già risolti dal guard. */
export type PermissionSubject = readonly string[] | { roles: readonly string[]; permissions?: readonly string[] | null };
export function effectivePermissions(subject: PermissionSubject): Set<Permission> {
  if (Array.isArray(subject)) return permissionsForRoles(subject as readonly string[]);
  const s = subject as { roles: readonly string[]; permissions?: readonly string[] | null };
  return s.permissions ? new Set(s.permissions as Permission[]) : permissionsForRoles(s.roles);
}
