import { cookies } from 'next/headers';
import { request, type ApiRoute } from '@wb/api-client';

/** URL dell'API vista dal browser (link, template) e dal server Next (API_INTERNAL_URL dentro Docker). */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const API_SERVER_URL = process.env.API_INTERNAL_URL ?? API_URL;
export const TOKEN_COOKIE = 'wb_token';

export { ApiError, errorMessage, type ApiRoute, type Problem } from '@wb/api-client';

const sessionToken = async () => (await cookies()).get(TOKEN_COOKIE)?.value;

/**
 * Chiamata API lato server con il token di sessione (cookie httpOnly), attraverso @wb/api-client:
 * il percorso è verificato a compile time contro il contratto OpenAPI (ADR-0009).
 */
export async function apiFetch<T>(path: ApiRoute, init: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: string; headers?: Record<string, string> } = {}): Promise<T> {
  return request<T>({ baseUrl: API_SERVER_URL, getToken: sessionToken }, path, init);
}

/** Costruisce una query string omettendo i valori vuoti o undefined. */
export function qs(params: Record<string, string | number | boolean | null | undefined>): '' | `?${string}` {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

export interface Me {
  user: { id: string; email?: string; roles: string[] };
  person: { id: string; firstName: string; lastName: string; jobTitle: string | null } | null;
  permissions: string[];
}
export interface KeyResult { id: string; title: string; unit: string | null; startValue: number; targetValue: number; currentValue: number; progress: number; confidence: Confidence | null; lastCheckInAt: string | null }
export type Confidence = 'on_track' | 'at_risk' | 'off_track';
export interface Objective {
  id: string; title: string; level: 'company' | 'unit' | 'team' | 'individual'; ownerPersonId: string | null; parentId: string | null;
  status: string; visibility: string; progress: number | null; confidence: Confidence | null; stale: boolean; lastCheckInAt: string | null;
  keyResults: KeyResult[]; children?: Objective[];
}
export interface Tenant { id: string; name: string; slug: string; defaultLocale: string; timezone: string; settings: { branding?: { primaryColor?: string }; sso?: unknown; [k: string]: unknown } }
export interface Person { id: string; firstName: string; lastName: string; email: string | null; jobTitle: string | null; managerId: string | null; orgUnitId: string | null; status: string }
export interface Cycle { id: string; name: string; startDate: string; endDate: string; status: string; checkInCadenceDays: number }

export const initials = (p: { firstName: string; lastName: string }) => `${p.firstName[0] ?? ''}${p.lastName[0] ?? ''}`.toUpperCase();
export const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 100)}%`);
export const confidenceLabel: Record<Confidence, { text: string; cls: string }> = {
  on_track: { text: 'On track', cls: 'g' },
  at_risk: { text: 'A rischio', cls: 'w' },
  off_track: { text: 'Off track', cls: 'c' },
};

// ---- 1:1 ----
export interface Relation {
  id: string; kind: string; cadenceDays: number | null; role: 'lead' | 'member'; meetingUrl?: string | null; durationMin?: number;
  other: { id: string; firstName: string; lastName: string; jobTitle: string | null };
  nextMeeting: Meeting | null; lastMeeting: Meeting | null; daysSinceLast: number | null; overdue: boolean; openActions: number; pendingPoints: number;
  meetings?: Meeting[]; openActions_?: never;
}
export interface Meeting { id: string; relationId: string; scheduledAt: string; durationMin: number; status: string }
export interface TalkingPoint { id: string; text: string; source: string; discussed: boolean; authorPersonId: string | null }
export interface ActionItem { id: string; title: string; ownerPersonId: string; dueDate: string | null; status: string }
export interface MeetingDetail extends Meeting { talkingPoints: TalkingPoint[]; sharedNote: string; privateNote: string; actionItems: ActionItem[] }
export interface Suggestion { type: string; text: string; refType: string; refId: string; severity: 'info' | 'warn' | 'crit' }

// ---- calendario (ADR-0010) ----
export interface CalendarEvent { uid: string; kind: 'meeting' | 'review_self' | 'review_manager' | 'survey_close' | 'action_due'; title: string; start: string; end: string | null; allDay: boolean; url: string | null; location: string | null; status: string }
export interface CalendarFeed { enabled: boolean; url: string | null; upcoming: CalendarEvent[] }
export interface SlotProposal { timeZone: string; durationMin: number; preferredHour: number | null; slots: string[] }
export const calendarKindLabel: Record<CalendarEvent['kind'], string> = { meeting: '1:1', review_self: 'Self-review', review_manager: 'Manager review', survey_close: 'Survey', action_due: 'Azione' };

// ---- feedback ----
export interface CompanyValue { id: string; name: string; icon: string | null; description: string | null }
export interface Feedback { id: string; kind: string; body: string; visibility: string; createdAt: string; acknowledgedAt: string | null; helpful: boolean | null; from: { id: string; firstName: string; lastName: string } | null; to: { id: string; firstName: string; lastName: string } | null; value: CompanyValue | null }
export interface Recognition { id: string; message: string; createdAt: string; from: { id: string; firstName: string; lastName: string } | null; recipients: { id: string; firstName?: string; lastName?: string }[]; values: { id: string; name: string; icon: string | null }[]; reactions: { emoji: string; count: number }[] }
export interface FeedbackRequestInbox { recipientId: string; status: string; request: { id: string; question: string; requesterPersonId: string; aboutPersonId: string; dueDate: string | null } }

export const fmtDate = (iso: string | null | undefined) => (iso ? new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: iso.includes('T') ? 'short' : undefined }).format(new Date(iso)) : '—');

// ---- notifiche ----
export interface Notification { id: string; type: string; title: string; body: string; link: string | null; readAt: string | null; createdAt: string }
export interface NotificationPreference { type: string; inApp: boolean; email: boolean; isDefault: boolean }

// ---- import ----
export interface ImportReport { dryRun: boolean; totalRows: number; valid: number; invalid: number; created: number; updated: number; orgUnitsCreated: number; errors: { row: number; field: string; message: string }[]; preview: Array<{ row: number; action: string; values: Record<string, string | null> }>; unknownColumns: string[] }

// ---- form ----
export interface FormFieldDef { key: string; type: string; label: string; help?: string; required?: boolean; options?: { value: string; label: string }[]; scale?: { min: number; max: number; labels?: Record<string, string>; allowNa?: boolean }; showIf?: { field: string; equals?: unknown; in?: unknown[]; notEmpty?: boolean }; min?: number; max?: number; placeholder?: string }
export interface FormSectionDef { key: string; title: string; description?: string; fields: FormFieldDef[]; showIf?: FormFieldDef['showIf'] }
export interface FormSchemaDef { title: string; description?: string; sections: FormSectionDef[]; scoring: { enabled: boolean } }
export interface FormDefinitionSummary { id: string; key: string; name: string; kind: string; version: number; status: string; sections: number; fields: number; publishedAt: string | null; updatedAt: string }
export interface FormResponse { id: string; status: string; answers: Record<string, unknown>; score: number | null; submittedAt: string | null; dueDate: string | null; formVersion: number; respondentPersonId: string | null; subjectPersonId: string | null; canEdit: boolean; form: { id: string; key: string; name: string; kind: string; version: number; schema: FormSchemaDef } }
export interface FormResponseSummary { id: string; status: string; score: number | null; submittedAt: string | null; dueDate: string | null; createdAt: string; subjectPersonId: string | null; respondentPersonId: string | null; form: { id: string; name: string; kind: string } | null }

// ---- review ----
export interface PersonLite { id: string; firstName: string; lastName: string; jobTitle?: string | null }
export interface ReviewCycleLite { id: string; name: string; status: string; selfDueAt: string | null; managerDueAt: string | null; periodStart: string; periodEnd: string; okrCycleId?: string | null }
export interface ReviewSummary {
  id: string; status: string; cycleId: string; subjectPersonId: string; managerPersonId: string | null; appInstanceId: string | null; finalRating: number | null; finalRatingLabel: string | null; sharedAt: string | null; signedAt: string | null; selfSubmittedAt: string | null; managerSubmittedAt: string | null;
  cycle: ReviewCycleLite | null; subject: PersonLite | null; manager: PersonLite | null;
  isSubject: boolean; isManager: boolean; isHr: boolean; canFillSelf: boolean; canFillManager: boolean; canShare: boolean; canSign: boolean; canSeeSelf: boolean; canSeeManager: boolean;
}
export interface ReviewStageResponse { id: string; status: string; submittedAt: string | null; dueDate: string | null; answers: Record<string, unknown> | null; score: number | null; formKey: string }
export interface ReviewDetail extends ReviewSummary {
  template: { name: string; managerSeesSelf: string; requireSignature: boolean; includeObjectives: boolean; ratingScale: { min: number; max: number; labels: Record<string, string> } };
  selfResponse: ReviewStageResponse | null; managerResponse: ReviewStageResponse | null; signComment: string | null; disagreed: boolean; conversationAt: string | null; ratingOverrideNote: string | null;
}
export interface ReviewContext {
  objectives: { id: string; title: string; status: string; progress: number | null; confidence: string | null; keyResults: { id: string; title: string; progress: number; currentValue: number; targetValue: number; unit: string | null }[] }[];
  feedback: { id: string; kind: string; body: string; createdAt: string; from: string }[];
  recognitions: { id: string; message: string; createdAt: string; from: string }[];
  previousReviews: { id: string; cycleName: string; finalRatingLabel: string | null; sharedAt: string | null }[];
  oneOnOnesDone: number;
}
export interface ReviewTemplate { id: string; name: string; selfFormKey: string | null; managerFormKey: string; selfDueDays: number; managerDueDays: number; managerSeesSelf: string }
export interface ReviewCycle extends ReviewCycleLite { templateId: string; launchedAt: string | null; progress: Record<string, number> | null }
export interface ReviewProgress { counts: Record<string, number>; byManager: { managerId: string; managerName: string; total: number; pending: number }[]; reviews: { id: string; status: string; subject: string; manager: string; finalRatingLabel: string | null; sharedAt: string | null; signedAt: string | null }[] }
export const reviewStatusLabel: Record<string, { text: string; cls: string }> = {
  pending_self: { text: 'Self-review da fare', cls: 'w' }, pending_manager: { text: 'Manager review da fare', cls: 'w' }, pending_share: { text: 'Da condividere', cls: 'b' },
  shared: { text: 'Condivisa', cls: 'b' }, signed: { text: 'Firmata', cls: 'g' }, closed: { text: 'Chiusa', cls: 'n' }, cancelled: { text: 'Annullata', cls: 'n' },
};

// ---- analytics (semantic layer v1) ----
export interface MetricLite { key: string; name: string; description: string; formula: string; module: string; format: 'count' | 'percent' | 'avg' | 'score'; dimensions: string[]; sensitive: boolean; minGroupSize: number; teamVisible: boolean }
export interface MetricCell { value: number | null; size: number; suppressed: boolean }
export interface MetricRow { key: string; label: string; persons: number; cells: Record<string, MetricCell> }
export interface QueryResult { snapshotDate: string | null; dimension: string | null; dimensionLabel: string; metrics: MetricLite[]; rows: MetricRow[]; total: MetricRow | null }
export interface TrendResult { metric: MetricLite; from: string; to: string; points: { date: string; value: number | null; size: number; suppressed: boolean }[] }
export interface AlertsResult { snapshotDate: string | null; alerts: { key: string; label: string; count: number; people: { personId: string; name: string; jobTitle: string | null; managerName: string | null; value: number }[] }[] }
export interface ProcessStage { total: number; done: number; overdue: number; avgDays: number | null }
export interface ProcessGroup { id: string | null; name: string; total: number; selfDone: number; managerDone: number; shared: number; signed: number; overdue: number }
export interface ProcessReport {
  cycle: { id: string; name: string; status: string; periodStart: string; periodEnd: string; launchedAt: string | null; selfDueAt: string | null; managerDueAt: string | null; closedAt: string | null };
  scope: 'all' | 'team';
  stages: { self: ProcessStage | null; manager: ProcessStage; share: ProcessStage; sign: ProcessStage };
  byOrgUnit: ProcessGroup[]; byManager: ProcessGroup[];
  late: { reviewId: string; personName: string; managerName: string | null; stage: 'self' | 'manager'; dueAt: string | null; daysLate: number | null }[];
  ratingDistribution: { label: string; count: number }[] | null; ratingSuppressed: boolean;
}
export { fmtMetric } from './format';
// ---- report salvati (ANA-050…060) ----
export interface ReportDefinition { metrics: string[]; dimension?: 'org_unit' | 'manager' | 'person' | 'cycle' | null; filters?: { orgUnitId?: string | null; managerId?: string | null; cycleId?: string | null }; compareDays?: number | null; visualization?: 'table' | 'bars' | 'trend'; trendMetric?: string | null; trendDays?: number | null }
export interface ReportSchedule { frequency: 'daily' | 'weekly' | 'monthly'; weekday?: number | null; dayOfMonth?: number | null; hour?: number | null; recipients: 'owner' | 'shared' }
export interface SavedReport { id: string; name: string; description: string | null; folder: string | null; definition: ReportDefinition; sharing: { roles: string[]; userIds: string[] }; schedule: ReportSchedule | null; nextRunAt: string | null; lastRunAt: string | null; ownerUserId: string; isOwner: boolean; createdAt: string; updatedAt: string }
export interface ComparedCell { value: number | null; previous: number | null; delta: number | null; suppressed: boolean }
export interface ReportRun { report: SavedReport; scope: 'all' | 'team'; snapshotDate: string | null; previousSnapshot: string | null; dimension: string | null; dimensionLabel: string; metrics: MetricLite[]; filters: { orgUnitId: string | null; managerId: string | null; cycleId: string | null }; rows: MetricRow[]; total: MetricRow | null; compared: Array<MetricRow & { compared: Record<string, ComparedCell> }> | null; trend: TrendResult | null }
export const scheduleLabel = (s: ReportSchedule | null) => !s ? 'Nessun invio automatico' : s.frequency === 'daily' ? `Ogni giorno alle ${s.hour ?? 7}:00` : s.frequency === 'weekly' ? `Ogni ${['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'][(s.weekday ?? 1) - 1]} alle ${s.hour ?? 7}:00` : `Il giorno ${s.dayOfMonth ?? 1} di ogni mese alle ${s.hour ?? 7}:00`;
export const deltaLabel = (format: MetricLite['format'], delta: number | null) => { if (delta == null) return ''; const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±'; const abs = Math.abs(delta); return format === 'percent' ? `${sign}${(abs * 100).toLocaleString('it-IT', { maximumFractionDigits: 1 })} pt` : `${sign}${abs.toLocaleString('it-IT', { maximumFractionDigits: 2 })}`; };

// ---- autenticazione e amministrazione ----
export interface AuthConfig { found: boolean; tenant: { name: string; slug: string } | null; password: boolean; sso: boolean; devLogin: boolean }
export interface InviteInfo { valid: boolean; expired?: boolean; email?: string; firstName?: string | null; tenant?: { name: string; slug: string } | null; sso?: boolean }
export interface UserAdmin { id: string; email: string; person: { id: string; firstName: string; lastName: string; jobTitle: string | null; status: string } | null; roles: { id: string; role: string; scopeType: string }[]; status: 'invited' | 'active' | 'disabled' | 'expired'; authProvider: string | null; invitedAt: string | null; inviteExpiresAt: string | null; lastLoginAt: string | null; disabledAt: string | null }
export interface MfaStatus { enabled: boolean; enabledAt: string | null; pending: boolean; recoveryCodesLeft: number; requiredForRole: boolean; setupRequired: boolean; available: boolean }
export interface SecurityPolicy { security: { mfaRequiredRoles: string[] } }
export interface SsoConfig { enabled: boolean; issuer: string; clientId: string; hasClientSecret: boolean; jitProvisioning: boolean; defaultRole: string; allowedDomains: string[]; passwordDisabled?: boolean; redirectUri: string }
export const roleLabel: Record<string, string> = { tenant_admin: 'Amministratore', hr_admin: 'HR admin', hrbp: 'HRBP', manager: 'Manager', employee: 'Collaboratore', observer: 'Osservatore', analyst: 'Analista' };
/** Chiamata pubblica (senza token) all'API lato server. */
export async function publicFetch<T>(path: ApiRoute, init: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: string } = {}): Promise<T> {
  return request<T>({ baseUrl: API_SERVER_URL }, path, init);
}

// ---- survey (ENG) ----
export interface SurveyLite { id: string; title: string; description: string | null; kind: string; anonymous: boolean; anonymityThreshold: number; status: 'draft' | 'open' | 'closed' | 'shared'; closesAt: string | null; launchedAt: string | null; closedAt: string | null; sharedAt: string | null; hasSummary: boolean; createdAt: string }
export interface SurveyMine extends SurveyLite { responded: boolean; canRespond: boolean; canReadSummary: boolean }
export interface SurveyAdmin extends SurveyLite { counts: { invited: number; responded: number; rate: number | null } | null }
export interface SurveyDetail extends SurveyLite { summary: string | null; drivers: Record<string, string>; enpsField: string | null; schema: FormSchemaDef; counts: { invited: number; responded: number; rate: number | null } | null; bySegment: { id: string | null; name: string; invited: number; responded: number | null }[]; populationPreview: { count: number; sample: { id: string; name: string }[] } | null }
export interface SurveyForm { survey: SurveyLite; schema: FormSchemaDef; invited: boolean; responded: boolean; canRespond: boolean }
export interface SurveyResults {
  survey: SurveyLite; scope: 'all' | 'team'; threshold: number; suppressed: boolean; responses: number; segment: string;
  counts: { invited: number; responded: number; rate: number | null } | null;
  drivers: { key: string; label: string; n: number; score: number | null; avg: number | null }[];
  questions: { key: string; label: string; driver: string | null; n: number; avg: number | null; score: number | null; distribution: Record<string, number> }[];
  enps: { n: number; promoters: number; passives: number; detractors: number; score: number | null } | null;
  comments: { question: string; text: string }[];
  heatmap: { key: string; label: string; n: number; suppressed: boolean; drivers: Record<string, number | null>; enps: number | null }[];
  previous: { id: string; title: string; drivers: Record<string, number | null>; enps: number | null; responses: number } | null;
}
export interface SurveySummary { survey: SurveyLite; summary: string | null; counts: { invited: number; responded: number; rate: number | null }; drivers: SurveyResults['drivers']; enps: SurveyResults['enps'] }
export const surveyStatusLabel: Record<string, { text: string; cls: string }> = { draft: { text: 'Bozza', cls: 'n' }, open: { text: 'Aperta', cls: 'g' }, closed: { text: 'Chiusa', cls: 'w' }, shared: { text: 'Risultati condivisi', cls: 'b' } };
export const surveyKindLabel: Record<string, string> = { engagement: 'Engagement', pulse: 'Pulse', enps: 'eNPS', wellbeing: 'Benessere', adhoc: 'Ad hoc' };

// ---- welfare (WEL) ----
export interface WelfareBalance { credited: number; spent: number; reserved: number; expired: number; adjusted: number; balance: number; available: number }
export interface WelfareMovement { id: string; createdAt: string; kind: string; amount: number; categoryKey: string | null; year: number | null; expiresAt: string | null; note: string | null; planId: string; requestId: string | null }
export interface WelfareRequest { id: string; planId: string; personId: string; itemId: string | null; kind: string; categoryKey: string; amount: string; beneficiary: string; beneficiaryName: string | null; expenseDate: string | null; attachmentName: string | null; note: string | null; status: string; taxablePortion: string; reviewNote: string | null; decidedAt: string | null; voucherCode: string | null; createdAt: string; person?: { id: string; firstName: string; lastName: string } | null; categoryName?: string }
export interface WelfareCategory { key: string; name: string; description: string | null; regime: string; beneficiaries: string[]; requiredDocs: string | null; note: string | null; used: number; threshold: number | null }
export interface WelfareCatalogItem { id: string; planId: string | null; name: string; description: string | null; categoryKey: string; kind: string; price: string | null; minAmount: string | null; maxAmount: string | null; instructions: string | null; available: boolean }
export interface WelfareInitiative { id: string; name: string; description: string | null; conditions: string | null; howTo: string | null; kind: string; capacity: number | null; active: boolean; joined: boolean; members: number }
export interface WelfarePremium { planId: string; planName: string; amount: number; windowFrom: string | null; windowTo: string | null; allowedPercents: number[]; windowOpen: boolean; chosen: { amount: number; at: string } | null; params: { taxRate: number; employeeContributionRate: number; employerContributionRate: number } }
export interface WelfareOverview { plans: { id: string; name: string; year: number; periodStart: string; periodEnd: string; regulation: string | null; rolloverRule: string; rolloverPercent: number }[]; balance: WelfareBalance; expiringSoon: number; movements: WelfareMovement[]; requests: WelfareRequest[]; categories: WelfareCategory[]; catalog: WelfareCatalogItem[]; declarations: { key: string; value: boolean; year: number }[]; initiatives: WelfareInitiative[]; premium: WelfarePremium[]; year: number }
export interface WelfarePlan { id: string; name: string; year: number; periodStart: string; periodEnd: string; status: 'draft' | 'active' | 'closed'; rolloverRule: string; rolloverPercent: number; enabledCategories: string[]; premium: { enabled: boolean; amount?: number; windowFrom?: string; windowTo?: string }; regulation: string | null; population: { orgUnitIds?: string[] }; stats: { people: number; credited: number; spent: number; reserved: number; requests: number; pending: number; requesters: number }; sources?: { id: string; name: string; kind: string; amountPerPerson: string; creditAt: string; expiresAt: string | null; creditedAt: string | null }[]; populationCount?: number }
export interface WelfareBatch { id: string; period: string; status: string; itemsCount: number; totalAmount: string; exportedAt: string | null; confirmedAt: string | null }
export const welfareRequestStatusLabel: Record<string, { text: string; cls: string }> = { submitted: { text: 'Inviata', cls: 'w' }, in_review: { text: 'In verifica', cls: 'w' }, needs_docs: { text: 'Integrazione richiesta', cls: 's' }, approved: { text: 'Approvata', cls: 'g' }, in_payroll: { text: 'In cedolino', cls: 'b' }, paid: { text: 'Liquidata', cls: 'g' }, fulfilled: { text: 'Evasa', cls: 'g' }, rejected: { text: 'Rifiutata', cls: 'c' }, cancelled: { text: 'Annullata', cls: 'n' } };
export const welfareKindLabel: Record<string, string> = { voucher: 'Voucher', service: 'Servizio', reimbursement: 'Rimborso' };
export const eur = (n: number | string | null | undefined) => (n == null ? '—' : `${Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);

// ---- sviluppo e carriera (DEV) ----
export interface CompetencyLevelDef { level: number; label: string; descriptor: string }
export interface Competency { id?: string; key: string; name: string; kind: 'core' | 'role' | 'leadership'; description: string | null; levels: CompetencyLevelDef[]; active?: boolean }
export interface JobProfile { id: string; title: string; family: string | null; level: string | null; description: string | null; expected: { competencyKey: string; level: number }[]; nextProfileId: string | null; active: boolean; people?: number }
export interface SuggestedAction { competencyKey: string; kind: 'training' | 'mentoring' | 'experience' | 'reading' | 'other'; title: string; description: string; targetLevel?: number | null; alreadyInPlan?: boolean }
export interface GapRow { competencyKey: string; expected: number | null; bySource: Partial<Record<'self' | 'manager' | 'review' | '360', number>>; assessed: number | null; gap: number | null }
export interface DevAction { id: string; planId: string; title: string; description: string | null; kind: SuggestedAction['kind']; competencyKey: string | null; source: string; dueDate: string | null; status: 'open' | 'done' | 'cancelled'; evidence: string | null; completedAt: string | null }
export interface DevPlan { id: string; personId: string; title: string; status: 'draft' | 'pending_approval' | 'active' | 'completed' | 'archived'; periodStart: string | null; periodEnd: string | null; approvedAt: string | null; approvedByPersonId: string | null; managerNote: string | null; actions: DevAction[]; progress: { total: number; done: number; overdue: number; percent: number } }
export interface DevProfile {
  person: { id: string; firstName: string; lastName: string; jobTitle: string | null; jobLevel: string | null; managerId: string | null; jobProfileId: string | null };
  manager: { id: string; firstName: string; lastName: string } | null; viewer: 'self' | 'manager' | 'hr'; policy: string;
  profile: JobProfile | null; nextProfile: { id: string; title: string; level: string | null; family: string | null; expected: { competencyKey: string; level: number }[] } | null;
  competencies: Competency[]; gaps: GapRow[]; nextGaps: GapRow[]; suggestions: SuggestedAction[]; plan: DevPlan | null;
  lastAssessment: { self: string | null; manager: string | null };
  can: { assessSelf: boolean; assessAsManager: boolean; editPlan: boolean; approve: boolean; talent: boolean };
  talent: { potential: number | null; performance: number | null; label: string | null; note: string | null; session: string | null; at: string | null } | null;
}
export interface DevPersonRow { person: DevProfile['person']; profile: { id: string; title: string; level: string | null } | null; plan: DevPlan['status'] | null; openActions: number; overdueActions: number; lastSelf: string | null; lastManager: string | null }
export interface TalentGrid { scope: 'all' | 'team'; items: { person: DevProfile['person']; performance: number | null; potential: number | null; label: string | null; note: string | null; session: string | null; at: string | null }[]; cells: Record<string, number>; unplaced: number }
export const devPlanStatusLabel: Record<string, { text: string; cls: string }> = { draft: { text: 'Bozza', cls: 'n' }, pending_approval: { text: 'In approvazione', cls: 'w' }, active: { text: 'Attivo', cls: 'g' }, completed: { text: 'Completato', cls: 'b' }, archived: { text: 'Archiviato', cls: 'n' } };
export const actionKindLabel: Record<string, string> = { training: 'Formazione', mentoring: 'Mentoring', experience: 'Esperienza', reading: 'Lettura', other: 'Altro' };
export const competencyKindLabel: Record<string, string> = { core: 'Trasversale', role: 'Di ruolo', leadership: 'Leadership' };

// ---- feedback 360° (F360) ----
export type F360Category = 'self' | 'manager' | 'peer' | 'report' | 'other' | 'external';
export type F360CampaignStatus = 'draft' | 'nomination' | 'collection' | 'closed';
export type F360SubjectStatus = 'nominating' | 'pending_approval' | 'approved' | 'collecting' | 'ready' | 'released';
export interface F360CategoryConfig { key: F360Category; enabled: boolean; min: number; max: number; anonymous: boolean }
export interface F360Scale { min: number; max: number; labels: Record<string, string> }
export interface F360OpenQuestion { key: string; label: string }
export interface F360CompetencyDef { key: string; name: string; description: string | null; levels: CompetencyLevelDef[] }
export interface F360Answers { ratings: Record<string, number | null>; comments: Record<string, string>; openAnswers: Record<string, string> }
export interface F360CampaignLite { id: string; name: string; status: F360CampaignStatus; nominationBy: 'subject' | 'manager' | 'hr'; requireApproval: boolean; releaseRule: 'immediately' | 'manager' | 'after_debrief'; nominationDueAt: string | null; collectionDueAt: string | null; anonymityThreshold: number; categories: F360CategoryConfig[] }
export interface F360ProgressRow { id: string; status: F360SubjectStatus; person: PersonLite | null; manager: PersonLite | null; byCategory: Record<string, { nominated: number; invited: number; submitted: number; declined: number }>; invited: number; submitted: number; releasedAt: string | null; debriefAt: string | null; reportGeneratedAt: string | null }
export interface F360Progress { campaign: { id: string; name: string; status: F360CampaignStatus }; totals: { subjects: number; byStatus: Record<string, number>; invited: number; submitted: number }; subjects: F360ProgressRow[] }
export interface F360Campaign extends F360CampaignLite { description: string | null; competencyKeys: string[]; scale: F360Scale; openQuestions: F360OpenQuestion[]; managerSeesReport: boolean; population: { orgUnitIds?: string[]; personIds?: string[] }; launchedAt: string | null; collectionStartedAt: string | null; closedAt: string | null; createdAt: string; subjects?: Record<string, number>; requests?: Record<string, number>; competencies?: F360CompetencyDef[]; progress?: F360Progress | null }
export interface F360CategoryStat { key: string; label: string; invited: number; responded: number; shown: boolean; merged: F360Category[]; anonymous: boolean }
export interface F360CompetencyResult { competencyKey: string; self: number | null; byCategory: Record<string, { n: number; avg: number }>; others: number | null; othersN: number; gap: number | null; comments: { category: string; text: string }[] }
export interface F360Report { generatedAt: string; threshold: number; categories: F360CategoryStat[]; competencies: F360CompetencyResult[]; overall: { self: number | null; others: number | null; manager: number | null }; strengths: string[]; developmentAreas: string[]; openAnswers: Record<string, { category: string; text: string }[]>; responses: number }
export interface F360SubjectSummary { id: string; campaign: F360CampaignLite; personId: string; managerPersonId: string | null; status: F360SubjectStatus; viewer: 'self' | 'manager' | 'hr'; nominationSubmittedAt: string | null; approvedAt: string | null; reportGeneratedAt: string | null; releasedAt: string | null; debriefAt: string | null; debriefNote: string | null; can: { nominate: boolean; submitNominations: boolean; approve: boolean; seeReport: boolean; release: boolean; debrief: boolean; addDevAction: boolean }; person: PersonLite | null; manager: PersonLite | null; counts?: Record<string, number> }
export interface F360Nomination { id: string; category: F360Category; categoryLabel: string; anonymous: boolean; person: PersonLite | null; externalName: string | null; externalEmail: string | null; status: string; declineReason: string | null; nominatedBy: string | null; canRemove: boolean }
export interface F360SubjectDetail extends F360SubjectSummary { nominations: F360Nomination[]; byCategory: (F360CategoryConfig & { label: string; nominated: number })[]; competencies: F360CompetencyDef[]; scale: F360Scale; openQuestions: F360OpenQuestion[]; report: F360Report | null }
export interface F360Suggestion extends PersonLite { category: F360Category; reason: string }
export interface F360RequestSummary { id: string; category: F360Category; categoryLabel: string; anonymous: boolean; status: string; invitedAt: string | null; submittedAt: string | null; expiresAt: string | null; hasDraft: boolean; subject: PersonLite | null; campaign: { id: string; name: string; status: F360CampaignStatus; collectionDueAt: string | null } }
export interface F360Questionnaire { id: string; category: F360Category; categoryLabel: string; anonymous: boolean; status: string; expiresAt: string | null; submittedAt: string | null; subject: PersonLite | null; campaign: { id: string; name: string; description: string | null; status: F360CampaignStatus; collectionDueAt: string | null; anonymityThreshold: number }; competencies: F360CompetencyDef[]; scale: F360Scale; openQuestions: F360OpenQuestion[]; draft: F360Answers | null; canAnswer: boolean; external?: { name: string | null; email: string | null } }
export interface F360HeatmapRow { key: string; label: string; subjects: number; suppressed: boolean; cells: Record<string, number | null> }
export interface F360Aggregate { campaign: { id: string; name: string; status: F360CampaignStatus; threshold: number }; groupBy: 'org_unit' | 'manager'; competencies: F360CompetencyDef[]; rows: F360HeatmapRow[]; total: F360HeatmapRow | null; subjectsWithReport: number }
export const f360CategoryLabel: Record<F360Category, string> = { self: 'Autovalutazione', manager: 'Manager', peer: 'Pari', report: 'Riporti diretti', other: 'Altri interni', external: 'Esterni' };
export const f360CampaignStatusLabel: Record<F360CampaignStatus, { text: string; cls: string }> = { draft: { text: 'Bozza', cls: 'n' }, nomination: { text: 'Nomine in corso', cls: 'w' }, collection: { text: 'Raccolta in corso', cls: 'g' }, closed: { text: 'Chiusa', cls: 'b' } };
export const f360SubjectStatusLabel: Record<F360SubjectStatus, { text: string; cls: string }> = { nominating: { text: 'Nomine da fare', cls: 'w' }, pending_approval: { text: 'Nomine da approvare', cls: 'w' }, approved: { text: 'Nomine approvate', cls: 'g' }, collecting: { text: 'Raccolta in corso', cls: 'g' }, ready: { text: 'Report pronto', cls: 'b' }, released: { text: 'Report rilasciato', cls: 'b' } };
export const f360RequestStatusLabel: Record<string, { text: string; cls: string }> = { proposed: { text: 'Proposto', cls: 'n' }, invited: { text: 'Invitato', cls: 'n' }, pending: { text: 'Da compilare', cls: 'w' }, submitted: { text: 'Inviato', cls: 'g' }, declined: { text: 'Ha declinato', cls: 'c' }, expired: { text: 'Scaduto', cls: 'n' }, rejected: { text: 'Escluso', cls: 'n' } };
export const f360ReleaseRuleLabel: Record<string, string> = { immediately: 'Subito alla chiusura', manager: 'Quando il manager lo rilascia', after_debrief: 'Dopo il debrief registrato' };

// ---- onboarding (ONB) ----
export type OnboardingKind = 'onboarding' | 'role_change' | 'offboarding';
export type OnboardingRole = 'newcomer' | 'manager' | 'hr' | 'buddy' | 'it';
export type OnboardingTaskKind = 'todo' | 'read' | 'sign' | 'form' | 'meeting' | 'objective' | 'survey';
export interface OnboardingPhase { key: string; label: string; fromDay: number; toDay: number }
export interface OnboardingTaskDef { key: string; phase: string; title: string; description?: string | null; role: OnboardingRole; kind: OnboardingTaskKind; dueDay: number; link?: string | null; formKey?: string | null; surveyKey?: string | null; required: boolean }
export interface OnboardingTemplate { id: string; name: string; kind: OnboardingKind; description: string | null; phases: OnboardingPhase[]; tasks: OnboardingTaskDef[]; rules: { orgUnitIds?: string[]; locations?: string[]; jobTitleKeywords?: string[] }; isDefault: boolean; active: boolean; journeys?: number; updatedAt: string }
export interface OnboardingProgress { total: number; done: number; skipped: number; overdue: number; requiredOpen: number; percent: number }
export interface OnboardingJourneySummary { id: string; kind: OnboardingKind; status: 'active' | 'completed' | 'cancelled'; templateName: string; anchorDate: string; day: number; startedAt: string; completedAt: string | null; person: PersonLite | null; manager: PersonLite | null; buddy: PersonLite | null; progress: OnboardingProgress; surveys: { key: string; score: number | null; low: boolean }[] }
export interface OnboardingTask { id: string; journeyId: string; key: string; phase: string; title: string; description: string | null; role: OnboardingRole; kind: OnboardingTaskKind; kindLabel: string; link: string | null; formKey: string | null; surveyKey: string | null; required: boolean; status: 'open' | 'done' | 'skipped'; dueDate: string | null; overdue: boolean; assignee: PersonLite | null; completedAt: string | null; completedBy: string | null; note: string | null; isMine: boolean; journey?: { id: string; kind: OnboardingKind; templateName: string; anchorDate: string; person: PersonLite | null; isMe: boolean } }
export interface OnboardingSurveyDef { key: string; title: string; questions: { key: string; text: string }[] }
export interface OnboardingJourney extends OnboardingJourneySummary { viewer: 'self' | 'manager' | 'hr' | 'participant'; phases: OnboardingPhase[]; hr: PersonLite | null; it: PersonLite | null; can: { edit: boolean; addTask: boolean; assignBuddy: boolean }; tasks: OnboardingTask[]; surveys: { key: string; title: string; score: number | null; low: boolean; answers: Record<string, number> | null; comment: string | null; submittedAt: string }[]; surveyDefs: Record<string, OnboardingSurveyDef> }
export interface OnboardingMe { journey: OnboardingJourney | null; tasks: OnboardingTask[] }
export interface OnboardingDashboard { scope: 'all' | 'team'; totals: { active: number; completed: number; overdueTasks: number; lowSurveys: number; avgPercent: number | null }; overdueByRole: Record<string, number>; overdueByAssignee: { person: PersonLite | null; role: string; n: number }[]; surveys: { key: string; title: string; n: number; avg: number | null; low: number }[]; journeys: OnboardingJourneySummary[] }
export interface BuddySuggestion extends PersonLite { reason: string; activeBuddies: number }
export const onboardingKindLabel: Record<OnboardingKind, string> = { onboarding: 'Onboarding', role_change: 'Cambio ruolo', offboarding: 'Offboarding' };
export const onboardingRoleLabel: Record<OnboardingRole, string> = { newcomer: 'Persona', manager: 'Manager', hr: 'HR', buddy: 'Buddy', it: 'IT' };
export const onboardingTaskKindLabel: Record<OnboardingTaskKind, string> = { todo: 'Da fare', read: 'Da leggere', sign: 'Presa visione', form: 'Questionario', meeting: 'Incontro', objective: 'Obiettivi', survey: 'Survey' };
export const onboardingStatusLabel: Record<string, { text: string; cls: string }> = { active: { text: 'In corso', cls: 'g' }, completed: { text: 'Completato', cls: 'b' }, cancelled: { text: 'Annullato', cls: 'n' } };

// ---- app studio (APP) ----
export type AppStageType = 'form' | 'approval' | 'notify' | 'action';
export type AppActionDef = { type: 'action_item'; title: string; assignee: string; dueDays?: number | null } | { type: 'person_field'; field: string; value: string | null } | { type: 'webhook'; url: string; includeAnswers?: boolean } | { type: 'start_app'; appKey: string };
export const appActionTypeLabel: Record<AppActionDef['type'], string> = { action_item: 'Crea un’azione (action item)', person_field: 'Aggiorna un attributo della persona', webhook: 'Chiama un webhook', start_app: 'Avvia un’altra app' };
export interface AppCondition { source: 'answer' | 'outcome'; field?: string; op: 'eq' | 'ne' | 'lt' | 'lte' | 'gt' | 'gte' | 'in' | 'not_empty'; value?: unknown }
export interface AppStageDef { key: string; name: string; type: AppStageType; actor: string; description?: string | null; formKey?: string | null; dueDays: number; parallelGroup?: string | null; seePrevious: boolean; approval?: { rejectTo?: string | null; requireComment?: boolean } | null; notify?: { to: string[]; message: string } | null; actions?: AppActionDef[] | null; transitions?: { when: AppCondition; goto: string }[] | null }
export interface AppDefinition { key: string; name: string; description?: string | null; icon?: string | null; naming: { instanceLabel: string; launchVerb: string; subjectLabel: string }; permissions: { launch: ('hr' | 'manager' | 'employee')[]; launchForSelfOnly?: boolean; viewInstances: ('hr' | 'manager' | 'subject' | 'launcher' | 'actors')[] }; stages: AppStageDef[] }
export interface AppSummary { id: string; key: string; name: string; version: number; status: 'draft' | 'published' | 'archived'; templateKey: string | null; publishedAt: string | null; updatedAt: string; definition: AppDefinition; instances: Record<string, number>; canLaunchForSelf?: boolean; canLaunchForOthers?: boolean }
export interface AppDetail { id: string; key: string; name: string; version: number; status: 'draft' | 'published' | 'archived'; templateKey: string | null; publishedAt: string | null; definition: AppDefinition; versions: { id: string; version: number; status: string; publishedAt: string | null }[]; forms: { id: string; key: string; name: string; version: number; status: string }[]; problems: string[] }
export interface AppTemplateLite { key: string; name: string; category: string; description: string; icon: string | null; stages: number; forms: string[] }
export interface AppRunView { id: string; attempt: number; status: 'pending' | 'active' | 'done' | 'rejected' | 'skipped' | 'superseded'; outcome: string | null; comment: string | null; dueDate: string | null; overdue: boolean; activatedAt: string | null; completedAt: string | null; actor: PersonLite | null; completedBy: string | null; formResponseId: string | null; answers: Record<string, unknown> | null; isMine: boolean; canDecide: boolean }
export interface AppInstanceStage { key: string; name: string; type: AppStageType; actor: string; description: string | null; parallelGroup: string | null; formKey: string | null; dueDays: number; seePrevious: boolean; approval: { rejectTo?: string | null; requireComment?: boolean } | null; run: AppRunView | null; history: { attempt: number; status: string; outcome: string | null; comment: string | null; completedAt: string | null; completedBy: string | null }[] }
export interface AppInstance { id: string; appId: string; appKey: string; appVersion: number; name: string; icon: string | null; naming: AppDefinition['naming']; status: 'running' | 'completed' | 'cancelled'; outcome: string | null; title: string | null; currentStages: string[]; subject: PersonLite | null; launcher: PersonLite | null; startedAt: string; completedAt: string | null; cancelledAt: string | null; viewer: 'hr' | 'subject' | 'launcher' | 'actor' | 'manager'; progress: { total: number; done: number; active: number; percent: number }; can: { cancel: boolean; manage: boolean }; stages: AppInstanceStage[]; events: { at: string; type: string; stageKey: string | null; actor: string; data: Record<string, unknown> }[] }
export interface AppInstanceSummary { id: string; appKey: string; name: string; icon: string | null; instanceLabel: string; status: 'running' | 'completed' | 'cancelled'; outcome: string | null; title: string | null; startedAt: string; completedAt: string | null; subject: PersonLite | null; launcher: PersonLite | null; progress: { total: number; done: number; active: number; percent: number }; activeStages: { key: string; name: string; actor: PersonLite | null; dueDate: string | null; overdue: boolean; isMine: boolean; runId: string; type: AppStageType; formResponseId: string | null }[] }
export interface AppDashboardRow { id: string; key: string; name: string; icon: string | null; version: number; counts: { running: number; completed: number; cancelled: number; overdue: number }; avgDays: number | null; stages: { key: string; name: string; type: AppStageType; active: number; overdue: number }[] }
export const appStageTypeLabel: Record<AppStageType, string> = { form: 'Compilazione', approval: 'Approvazione', notify: 'Notifica', action: 'Azione automatica' };
export const appActorLabel = (a: string) => ({ subject: 'Soggetto', manager: 'Manager del soggetto', manager_of_manager: 'Manager del manager', launcher: 'Chi ha avviato', hr: 'HR' } as Record<string, string>)[a] ?? (a.startsWith('role:') ? `Ruolo ${roleLabel[a.slice(5)] ?? a.slice(5)}` : 'Persona specifica');
export const appInstanceStatusLabel: Record<string, { text: string; cls: string }> = { running: { text: 'In corso', cls: 'g' }, completed: { text: 'Conclusa', cls: 'b' }, cancelled: { text: 'Annullata', cls: 'n' } };
export const appRunStatusLabel: Record<string, { text: string; cls: string }> = { pending: { text: 'In attesa', cls: 'n' }, active: { text: 'Attiva', cls: 'g' }, done: { text: 'Conclusa', cls: 'b' }, rejected: { text: 'Rimandata', cls: 'c' }, skipped: { text: 'Saltata', cls: 'n' }, superseded: { text: 'Superata', cls: 'n' } };
export const appStatusLabel: Record<string, { text: string; cls: string }> = { draft: { text: 'Bozza', cls: 'w' }, published: { text: 'Pubblicata', cls: 'g' }, archived: { text: 'Archiviata', cls: 'n' } };
