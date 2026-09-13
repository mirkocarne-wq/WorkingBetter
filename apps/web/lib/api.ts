import { cookies } from 'next/headers';

/** URL dell'API vista dal browser (link, template) e dal server Next (API_INTERNAL_URL dentro Docker). */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
export const API_SERVER_URL = process.env.API_INTERNAL_URL ?? API_URL;
export const TOKEN_COOKIE = 'wb_token';

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`API ${status}`);
  }
}

/** Chiamata API lato server con il token di sessione (cookie httpOnly). */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  const res = await fetch(`${API_SERVER_URL}/api/v1${path}`, {
    ...init,
    headers: { ...(init.body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
    cache: 'no-store',
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body);
  return body as T;
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
  id: string; kind: string; cadenceDays: number | null; role: 'lead' | 'member';
  other: { id: string; firstName: string; lastName: string; jobTitle: string | null };
  nextMeeting: Meeting | null; lastMeeting: Meeting | null; daysSinceLast: number | null; overdue: boolean; openActions: number; pendingPoints: number;
  meetings?: Meeting[]; openActions_?: never;
}
export interface Meeting { id: string; relationId: string; scheduledAt: string; durationMin: number; status: string }
export interface TalkingPoint { id: string; text: string; source: string; discussed: boolean; authorPersonId: string | null }
export interface ActionItem { id: string; title: string; ownerPersonId: string; dueDate: string | null; status: string }
export interface MeetingDetail extends Meeting { talkingPoints: TalkingPoint[]; sharedNote: string; privateNote: string; actionItems: ActionItem[] }
export interface Suggestion { type: string; text: string; refType: string; refId: string; severity: 'info' | 'warn' | 'crit' }

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
  id: string; status: string; cycleId: string; subjectPersonId: string; managerPersonId: string | null; finalRating: number | null; finalRatingLabel: string | null; sharedAt: string | null; signedAt: string | null; selfSubmittedAt: string | null; managerSubmittedAt: string | null;
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
