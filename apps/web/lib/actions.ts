'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { API_SERVER_URL, TOKEN_COOKIE, apiFetch, errorMessage } from './api';

/** Il cookie di sessione è `Secure` quando l'app è pubblicata in https (APP_BASE_URL); in locale resta utilizzabile su http. */
const SECURE_COOKIE = (process.env.APP_BASE_URL ?? '').startsWith('https://');

export async function devLogin(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const tenantSlug = String(form.get('tenantSlug') ?? '');
  const email = String(form.get('email') ?? '');
  const res = await fetch(`${API_SERVER_URL}/api/v1/auth/dev-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenantSlug, email }),
  });
  if (!res.ok) return { error: 'Accesso non riuscito: controlla tenant ed email' };
  const { accessToken, expiresIn } = (await res.json()) as { accessToken: string; expiresIn: number };
  (await cookies()).set(TOKEN_COOKIE, accessToken, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: expiresIn, secure: SECURE_COOKIE });
  redirect('/dashboard');
}

export async function logout() {
  (await cookies()).delete(TOKEN_COOKIE);
  redirect('/login');
}

export async function checkIn(keyResultId: string, form: FormData) {
  const value = Number(form.get('value'));
  const confidence = String(form.get('confidence'));
  const comment = String(form.get('comment') ?? '') || undefined;
  await apiFetch(`/key-results/${keyResultId}/check-ins`, { method: 'POST', body: JSON.stringify({ value, confidence, comment }) });
  revalidatePath('/objectives');
  revalidatePath('/dashboard');
}

// ---- 1:1 ----
export async function createRelation(form: FormData) {
  const r = await apiFetch<{ id: string }>('/one-on-ones', {
    method: 'POST',
    body: JSON.stringify({ otherPersonId: String(form.get('otherPersonId')), kind: String(form.get('kind') ?? 'manager_report'), cadenceDays: Number(form.get('cadenceDays') ?? 7), firstMeetingAt: new Date(String(form.get('firstMeetingAt'))).toISOString() }),
  });
  revalidatePath('/one-on-ones');
  redirect(`/one-on-ones/${r.id}`);
}
export async function addTalkingPoint(meetingId: string, relationId: string, form: FormData) {
  const text = String(form.get('text') ?? '').trim();
  if (!text) return;
  await apiFetch(`/meetings/${meetingId}/talking-points`, { method: 'POST', body: JSON.stringify({ text, source: String(form.get('source') ?? 'manual'), refType: form.get('refType') || undefined, refId: form.get('refId') || undefined }) });
  revalidatePath(`/one-on-ones/${relationId}`);
}
export async function toggleTalkingPoint(id: string, relationId: string, discussed: boolean) {
  await apiFetch(`/talking-points/${id}`, { method: 'PATCH', body: JSON.stringify({ discussed }) });
  revalidatePath(`/one-on-ones/${relationId}`);
}
export async function saveNote(meetingId: string, relationId: string, visibility: 'shared' | 'private', form: FormData) {
  await apiFetch(`/meetings/${meetingId}/notes/${visibility}`, { method: 'PUT', body: JSON.stringify({ body: String(form.get('body') ?? '') }) });
  revalidatePath(`/one-on-ones/${relationId}`);
}
export async function addActionItem(meetingId: string, relationId: string, form: FormData) {
  const title = String(form.get('title') ?? '').trim();
  if (!title) return;
  await apiFetch(`/meetings/${meetingId}/action-items`, { method: 'POST', body: JSON.stringify({ title, ownerPersonId: String(form.get('ownerPersonId')), dueDate: form.get('dueDate') || null }) });
  revalidatePath(`/one-on-ones/${relationId}`);
}
export async function setActionStatus(id: string, relationId: string, status: 'open' | 'done') {
  await apiFetch(`/action-items/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
  revalidatePath(`/one-on-ones/${relationId}`);
  revalidatePath('/dashboard');
}
export async function rescheduleMeeting(meetingId: string, relationId: string, form: FormData) {
  const raw = String(form.get('scheduledAt') ?? '');
  if (!raw) return;
  const scheduledAt = new Date(raw).toISOString();
  const durationMin = form.get('durationMin') ? Number(form.get('durationMin')) : undefined;
  await apiFetch(`/meetings/${meetingId}`, { method: 'PATCH', body: JSON.stringify({ scheduledAt, durationMin }) });
  revalidatePath(`/one-on-ones/${relationId}`);
}
export async function cancelMeeting(meetingId: string, relationId: string) {
  await apiFetch(`/meetings/${meetingId}`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) });
  revalidatePath(`/one-on-ones/${relationId}`);
}
export async function setMeetingUrl(relationId: string, form: FormData) {
  const url = String(form.get('meetingUrl') ?? '').trim();
  await apiFetch(`/one-on-ones/${relationId}`, { method: 'PATCH', body: JSON.stringify({ meetingUrl: url || null }) });
  revalidatePath(`/one-on-ones/${relationId}`);
}
export async function completeMeeting(meetingId: string, relationId: string) {
  await apiFetch(`/meetings/${meetingId}/complete`, { method: 'POST', body: JSON.stringify({ scheduleNext: true }) });
  revalidatePath(`/one-on-ones/${relationId}`);
}

// ---- feedback ----
export async function giveFeedback(form: FormData) {
  await apiFetch('/feedback', { method: 'POST', body: JSON.stringify({ toPersonId: String(form.get('toPersonId')), kind: String(form.get('kind')), body: String(form.get('body')), visibility: String(form.get('visibility')), valueId: form.get('valueId') || undefined, requestRecipientId: form.get('requestRecipientId') || undefined }) });
  revalidatePath('/feedback');
}
export async function giveRecognition(form: FormData) {
  await apiFetch('/recognitions', { method: 'POST', body: JSON.stringify({ recipientPersonIds: [String(form.get('recipientPersonId'))], message: String(form.get('message')), valueIds: form.getAll('valueIds').map(String) }) });
  revalidatePath('/feedback');
}
export async function react(recognitionId: string) {
  await apiFetch(`/recognitions/${recognitionId}/reactions`, { method: 'POST', body: JSON.stringify({ emoji: '👏' }) });
  revalidatePath('/feedback');
}
export async function acknowledgeFeedback(id: string, helpful: boolean) {
  await apiFetch(`/feedback/${id}/acknowledge`, { method: 'POST', body: JSON.stringify({ helpful }) });
  revalidatePath('/feedback');
}
export async function shareWithManager(id: string) {
  await apiFetch(`/feedback/${id}/share-with-manager`, { method: 'POST', body: '{}' });
  revalidatePath('/feedback');
}
export async function requestFeedback(form: FormData) {
  await apiFetch('/feedback-requests', { method: 'POST', body: JSON.stringify({ recipientPersonIds: form.getAll('recipientPersonIds').map(String), question: String(form.get('question')) }) });
  revalidatePath('/feedback');
}

// ---- notifiche ----
export async function markNotificationRead(id: string, link: string | null) {
  await apiFetch(`/notifications/${id}/read`, { method: 'POST' });
  revalidatePath('/notifications');
  if (link) redirect(link);
}
export async function markAllNotificationsRead() {
  await apiFetch('/notifications/read-all', { method: 'POST' });
  revalidatePath('/notifications');
}
export async function savePreferences(form: FormData) {
  const types = form.getAll('type').map(String);
  const items = types.map((type) => ({ type, inApp: form.get(`inApp:${type}`) === 'on', email: form.get(`email:${type}`) === 'on' }));
  await apiFetch('/notification-preferences', { method: 'PUT', body: JSON.stringify({ items }) });
  revalidatePath('/notifications');
}

// ---- import ----
export async function importPeople(_prev: unknown, form: FormData): Promise<{ report?: import('./api').ImportReport; csv?: string; error?: string }> {
  const file = form.get('file');
  let csv = String(form.get('csv') ?? '');
  if (file instanceof File && file.size > 0) csv = await file.text();
  if (!csv.trim()) return { error: 'Carica un file CSV o incolla il contenuto' };
  const dryRun = form.get('confirm') !== 'true';
  const createOrgUnits = form.get('createOrgUnits') === 'on';
  try {
    const report = await apiFetch<import('./api').ImportReport>('/people/import', { method: 'POST', body: JSON.stringify({ csv, dryRun, createOrgUnits }) });
    if (!dryRun) revalidatePath('/people');
    return { report, csv };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Import non riuscito', csv };
  }
}

// ---- form ----
function answersFromForm(form: FormData, schema: import('./api').FormSchemaDef): Record<string, unknown> {
  const answers: Record<string, unknown> = {};
  for (const s of schema.sections) for (const f of s.fields) {
    if (f.type === 'info') continue;
    if (f.type === 'multi_choice') { const v = form.getAll(f.key).map(String); if (v.length) answers[f.key] = v; continue; }
    const raw = form.get(f.key);
    if (raw == null || raw === '') continue;
    const v = String(raw);
    if (f.type === 'number') answers[f.key] = Number(v);
    else if (f.type === 'scale') answers[f.key] = v === 'na' ? 'na' : Number(v);
    else if (f.type === 'boolean') answers[f.key] = v === 'true';
    else answers[f.key] = v;
  }
  return answers;
}
export async function saveFormDraft(id: string, schema: import('./api').FormSchemaDef, form: FormData) {
  await apiFetch(`/form-responses/${id}/draft`, { method: 'PUT', body: JSON.stringify({ answers: answersFromForm(form, schema) }) });
  revalidatePath(`/forms/responses/${id}`);
}
export async function submitForm(id: string, schema: import('./api').FormSchemaDef, _prev: unknown, form: FormData): Promise<{ errors?: { field: string; message: string }[] }> {
  const answers = answersFromForm(form, schema);
  try {
    await apiFetch(`/form-responses/${id}/submit`, { method: 'POST', body: JSON.stringify({ answers }) });
  } catch (e) {
    const body = (e as { body?: { errors?: { field: string; message: string }[] } }).body;
    if (body?.errors) {
      await apiFetch(`/form-responses/${id}/draft`, { method: 'PUT', body: JSON.stringify({ answers }) }).catch(() => {});
      return { errors: body.errors };
    }
    throw e;
  }
  revalidatePath(`/forms/responses/${id}`);
  redirect(`/forms/responses/${id}`);
}
export async function startFormResponse(formKey: string) {
  const r = await apiFetch<{ id: string }>('/form-responses', { method: 'POST', body: JSON.stringify({ formKey }) });
  redirect(`/forms/responses/${r.id}`);
}

// ---- review ----
export async function createReviewCycle(form: FormData) {
  const orgUnitId = String(form.get('orgUnitId') ?? '');
  const r = await apiFetch<{ id: string }>('/review-cycles', {
    method: 'POST',
    body: JSON.stringify({ templateId: String(form.get('templateId')), name: String(form.get('name')), periodStart: String(form.get('periodStart')), periodEnd: String(form.get('periodEnd')), okrCycleId: form.get('okrCycleId') || undefined, population: orgUnitId ? { orgUnitIds: [orgUnitId] } : {} }),
  });
  revalidatePath('/reviews');
  redirect(`/reviews/cycles/${r.id}`);
}
export async function launchReviewCycle(id: string) {
  await apiFetch(`/review-cycles/${id}/launch`, { method: 'POST', body: '{}' });
  revalidatePath(`/reviews/cycles/${id}`);
  revalidatePath('/reviews');
}
export async function remindReviewCycle(id: string) {
  await apiFetch(`/review-cycles/${id}/remind`, { method: 'POST' });
  revalidatePath(`/reviews/cycles/${id}`);
}
export async function closeReviewCycle(id: string) {
  await apiFetch(`/review-cycles/${id}/close`, { method: 'POST' });
  revalidatePath(`/reviews/cycles/${id}`);
  revalidatePath('/reviews');
}
export async function shareReview(id: string) {
  await apiFetch(`/reviews/${id}/share`, { method: 'POST' });
  revalidatePath(`/reviews/${id}`);
  revalidatePath('/reviews');
}
export async function signReview(id: string, form: FormData) {
  await apiFetch(`/reviews/${id}/sign`, { method: 'POST', body: JSON.stringify({ comment: String(form.get('comment') ?? '') || undefined, disagree: form.get('disagree') === 'on' }) });
  revalidatePath(`/reviews/${id}`);
  revalidatePath('/reviews');
}
export async function markConversation(id: string) {
  await apiFetch(`/reviews/${id}/conversation`, { method: 'POST', body: '{}' });
  revalidatePath(`/reviews/${id}`);
}

// ---- analytics ----
export async function refreshAnalytics() {
  await apiFetch('/analytics/refresh', { method: 'POST' });
  revalidatePath('/analytics');
}

// ---- creazione da web: obiettivi, periodi, template di review, form ----
const num = (v: FormDataEntryValue | null, d = 0) => (v == null || v === '' ? d : Number(v));
const str = (v: FormDataEntryValue | null) => (v == null ? '' : String(v).trim());

export async function createObjective(form: FormData) {
  const titles = form.getAll('krTitle').map(String);
  const types = form.getAll('krType').map(String);
  const units = form.getAll('krUnit').map(String);
  const starts = form.getAll('krStart');
  const targets = form.getAll('krTarget');
  const keyResults = titles.map((t, i) => ({ title: t.trim(), type: types[i] ?? 'number', unit: units[i]?.trim() || undefined, startValue: num(starts[i] ?? null, 0), targetValue: num(targets[i] ?? null, 1) })).filter((k) => k.title);
  const level = str(form.get('level')) || 'individual';
  const body = {
    cycleId: str(form.get('cycleId')),
    title: str(form.get('title')),
    description: str(form.get('description')) || undefined,
    level,
    ownerPersonId: str(form.get('ownerPersonId')) || undefined,
    ownerOrgUnitId: level === 'unit' || level === 'team' ? str(form.get('ownerOrgUnitId')) || undefined : undefined,
    parentId: str(form.get('parentId')) || undefined,
    visibility: str(form.get('visibility')) || 'public',
    dueDate: str(form.get('dueDate')) || undefined,
    keyResults,
    publish: form.get('publish') === 'on',
  };
  await apiFetch('/objectives', { method: 'POST', body: JSON.stringify(body) });
  revalidatePath('/objectives');
  redirect(`/objectives?view=${level === 'individual' ? 'mine' : 'tree'}&cycle=${body.cycleId}`);
}

export async function createOkrCycle(form: FormData) {
  await apiFetch('/cycles', { method: 'POST', body: JSON.stringify({ name: str(form.get('name')), startDate: str(form.get('startDate')), endDate: str(form.get('endDate')), checkInCadenceDays: num(form.get('checkInCadenceDays'), 7) }) });
  revalidatePath('/objectives');
  redirect('/objectives/new');
}

export async function createReviewTemplate(form: FormData) {
  const labels: Record<string, string> = {};
  for (const line of str(form.get('ratingLabels')).split('\n')) {
    const [k, ...rest] = line.split('=');
    if (k && rest.length) labels[k.trim()] = rest.join('=').trim();
  }
  const min = num(form.get('ratingMin'), 1);
  const max = num(form.get('ratingMax'), 5);
  await apiFetch('/review-templates', {
    method: 'POST',
    body: JSON.stringify({
      name: str(form.get('name')),
      description: str(form.get('description')) || undefined,
      selfFormKey: str(form.get('selfFormKey')) || null,
      managerFormKey: str(form.get('managerFormKey')),
      selfDueDays: num(form.get('selfDueDays'), 14),
      managerDueDays: num(form.get('managerDueDays'), 21),
      managerSeesSelf: str(form.get('managerSeesSelf')) || 'after_submit',
      requireSignature: form.get('requireSignature') === 'on',
      includeObjectives: form.get('includeObjectives') === 'on',
      ratingScale: { min, max, labels },
      overallRatingField: str(form.get('overallRatingField')) || null,
    }),
  });
  revalidatePath('/reviews');
  redirect('/reviews?box=cycles');
}

export async function createFormDefinition(form: FormData) {
  const schema = JSON.parse(str(form.get('schema')) || '{}') as unknown;
  const created = await apiFetch<{ id: string }>('/forms', { method: 'POST', body: JSON.stringify({ key: str(form.get('key')), name: str(form.get('name')), kind: str(form.get('kind')) || 'generic', schema }) });
  if (form.get('publish') === 'on') await apiFetch(`/forms/${created.id}/publish`, { method: 'POST' });
  revalidatePath('/forms');
  redirect('/forms');
}

export async function publishFormDefinition(id: string) {
  await apiFetch(`/forms/${id}/publish`, { method: 'POST' });
  revalidatePath('/forms');
}

// ---- autenticazione (ADR-0007) ----
async function setSessionCookie(accessToken: string, expiresIn: number) {
  (await cookies()).set(TOKEN_COOKIE, accessToken, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: expiresIn, secure: SECURE_COOKIE });
}
interface SessionResponse { accessToken: string; expiresIn: number }
async function authPost(path: string, body: unknown): Promise<{ ok: true; data: SessionResponse } | { ok: false; error: string }> {
  const res = await fetch(`${API_SERVER_URL}/api/v1${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' });
  const data = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, error: (data && (data.detail || data.title)) || 'Operazione non riuscita' };
  return { ok: true, data: data as SessionResponse };
}

export async function passwordLogin(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const r = await authPost('/auth/login', { tenantSlug: str(form.get('tenantSlug')), email: str(form.get('email')), password: String(form.get('password') ?? '') });
  if (!r.ok) return { error: r.error };
  await setSessionCookie(r.data.accessToken, r.data.expiresIn);
  redirect(str(form.get('next')) || '/dashboard');
}

export async function forgotPassword(_prev: { done?: boolean; error?: string } | undefined, form: FormData): Promise<{ done?: boolean; error?: string }> {
  const r = await authPost('/auth/forgot-password', { tenantSlug: str(form.get('tenantSlug')), email: str(form.get('email')) });
  return r.ok ? { done: true } : { error: r.error };
}

export async function resetPassword(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const password = String(form.get('password') ?? '');
  if (password !== String(form.get('confirm') ?? '')) return { error: 'Le due password non coincidono' };
  const r = await authPost('/auth/reset-password', { token: str(form.get('token')), password });
  if (!r.ok) return { error: r.error };
  await setSessionCookie(r.data.accessToken, r.data.expiresIn);
  redirect('/dashboard');
}

export async function acceptInvite(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const password = String(form.get('password') ?? '');
  if (password && password !== String(form.get('confirm') ?? '')) return { error: 'Le due password non coincidono' };
  const r = await authPost(`/auth/invite/${encodeURIComponent(str(form.get('token')))}/accept`, password ? { password } : {});
  if (!r.ok) return { error: r.error };
  await setSessionCookie(r.data.accessToken, r.data.expiresIn);
  redirect('/dashboard');
}

export async function changePassword(_prev: { done?: boolean; error?: string } | undefined, form: FormData): Promise<{ done?: boolean; error?: string }> {
  const next = String(form.get('newPassword') ?? '');
  if (next !== String(form.get('confirm') ?? '')) return { error: 'Le due password non coincidono' };
  try {
    const session = await apiFetch<{ accessToken?: string; expiresIn?: number }>('/auth/password', { method: 'PATCH', body: JSON.stringify({ currentPassword: String(form.get('currentPassword') ?? ''), newPassword: next }) });
    // le altre sessioni sono state revocate: questa continua con il nuovo token
    if (session.accessToken && session.expiresIn) (await cookies()).set(TOKEN_COOKIE, session.accessToken, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: session.expiresIn, secure: SECURE_COOKIE });
    return { done: true };
  } catch (e) {
    const body = (e as { body?: { detail?: string; title?: string } }).body;
    return { error: body?.detail || body?.title || 'Cambio password non riuscito' };
  }
}

// ---- utenti e SSO (amministrazione) ----
export async function inviteUser(_prev: { inviteUrl?: string | null; error?: string; email?: string } | undefined, form: FormData): Promise<{ inviteUrl?: string | null; error?: string; email?: string }> {
  const personId = str(form.get('personId'));
  const body = {
    email: str(form.get('email')),
    personId: personId || undefined,
    firstName: str(form.get('firstName')) || undefined,
    lastName: str(form.get('lastName')) || undefined,
    jobTitle: str(form.get('jobTitle')) || undefined,
    managerId: str(form.get('managerId')) || undefined,
    orgUnitId: str(form.get('orgUnitId')) || undefined,
    roles: form.getAll('roles').map(String).filter(Boolean),
  };
  try {
    const r = await apiFetch<{ inviteUrl: string | null; email: string }>('/users/invite', { method: 'POST', body: JSON.stringify(body) });
    revalidatePath('/people/users');
    return { inviteUrl: r.inviteUrl, email: r.email };
  } catch (e) {
    const b = (e as { body?: { detail?: string; title?: string } }).body;
    return { error: b?.detail || b?.title || 'Invito non riuscito' };
  }
}
export async function resendInvite(id: string) {
  await apiFetch(`/users/${id}/resend-invite`, { method: 'POST' });
  revalidatePath('/people/users');
}
export async function setUserDisabled(id: string, disabled: boolean) {
  await apiFetch(`/users/${id}/${disabled ? 'disable' : 'enable'}`, { method: 'POST' });
  revalidatePath('/people/users');
}
export async function assignRole(userId: string, form: FormData) {
  await apiFetch('/role-assignments', { method: 'POST', body: JSON.stringify({ userId, role: str(form.get('role')) }) });
  revalidatePath('/people/users');
}
export async function revokeRole(assignmentId: string) {
  await apiFetch(`/role-assignments/${assignmentId}`, { method: 'DELETE' });
  revalidatePath('/people/users');
}
export async function saveSso(_prev: { saved?: boolean; error?: string } | undefined, form: FormData): Promise<{ saved?: boolean; error?: string }> {
  const secret = String(form.get('clientSecret') ?? '');
  const body = {
    enabled: form.get('enabled') === 'on',
    issuer: str(form.get('issuer')),
    clientId: str(form.get('clientId')),
    clientSecret: secret === '' ? (form.get('clearSecret') === 'on' ? '' : undefined) : secret,
    jitProvisioning: form.get('jitProvisioning') === 'on',
    defaultRole: str(form.get('defaultRole')) || 'employee',
    allowedDomains: str(form.get('allowedDomains')).split(/[\s,;]+/).map((d) => d.trim()).filter(Boolean),
    passwordDisabled: form.get('passwordDisabled') === 'on',
  };
  try {
    await apiFetch('/tenant/sso', { method: 'PUT', body: JSON.stringify(body) });
    revalidatePath('/settings');
    return { saved: true };
  } catch (e) {
    const b = (e as { body?: { detail?: string; title?: string; errors?: { message: string }[] } }).body;
    return { error: b?.errors?.[0]?.message || b?.detail || b?.title || 'Salvataggio non riuscito' };
  }
}

// ---- survey ----
export async function createSurvey(form: FormData) {
  const orgUnitId = str(form.get('orgUnitId'));
  const closes = str(form.get('closesAt'));
  const r = await apiFetch<{ id: string }>('/surveys', {
    method: 'POST',
    body: JSON.stringify({
      title: str(form.get('title')),
      description: str(form.get('description')) || undefined,
      template: str(form.get('template')),
      anonymous: form.get('anonymous') !== 'off',
      anonymityThreshold: num(form.get('anonymityThreshold'), 5),
      population: orgUnitId ? { orgUnitIds: [orgUnitId] } : {},
      closesAt: closes ? new Date(`${closes}T23:59:00`).toISOString() : undefined,
      rotation: num(form.get('rotation'), 0),
    }),
  });
  revalidatePath('/surveys');
  redirect(`/surveys/${r.id}/results`);
}
export async function launchSurvey(id: string, form: FormData) {
  const closes = str(form.get('closesAt'));
  await apiFetch(`/surveys/${id}/launch`, { method: 'POST', body: JSON.stringify(closes ? { closesAt: new Date(`${closes}T23:59:00`).toISOString() } : {}) });
  revalidatePath(`/surveys/${id}/results`);
  revalidatePath('/surveys');
}
export async function remindSurvey(id: string) { await apiFetch(`/surveys/${id}/remind`, { method: 'POST' }); revalidatePath(`/surveys/${id}/results`); }
export async function closeSurvey(id: string) { await apiFetch(`/surveys/${id}/close`, { method: 'POST' }); revalidatePath(`/surveys/${id}/results`); revalidatePath('/surveys'); }
export async function extendSurvey(id: string, form: FormData) {
  await apiFetch(`/surveys/${id}/extend`, { method: 'POST', body: JSON.stringify({ closesAt: new Date(`${str(form.get('closesAt'))}T23:59:00`).toISOString() }) });
  revalidatePath(`/surveys/${id}/results`);
}
export async function shareSurvey(id: string, form: FormData) {
  await apiFetch(`/surveys/${id}/share`, { method: 'POST', body: JSON.stringify({ summary: str(form.get('summary')) }) });
  revalidatePath(`/surveys/${id}/results`);
  revalidatePath('/surveys');
}
export async function respondSurvey(id: string, _prev: { errors?: { field: string; message: string }[]; error?: string } | undefined, form: FormData): Promise<{ errors?: { field: string; message: string }[]; error?: string }> {
  const answers = JSON.parse(str(form.get('answers')) || '{}') as Record<string, unknown>;
  try {
    await apiFetch(`/surveys/${id}/respond`, { method: 'POST', body: JSON.stringify({ answers }) });
  } catch (e) {
    const b = (e as { body?: { errors?: { field: string; message: string }[]; detail?: string; title?: string } }).body;
    if (b?.errors?.length) return { errors: b.errors };
    return { error: b?.detail || b?.title || 'Invio non riuscito' };
  }
  revalidatePath('/surveys');
  redirect(`/surveys/${id}?done=1`);
}

// ---- welfare ----
export async function createWelfareRequest(_prev: { error?: string; ok?: boolean } | undefined, form: FormData): Promise<{ error?: string; ok?: boolean }> {
  const itemId = str(form.get('itemId'));
  try {
    await apiFetch('/welfare/requests', {
      method: 'POST',
      body: JSON.stringify({
        planId: str(form.get('planId')),
        itemId: itemId || undefined,
        categoryKey: str(form.get('categoryKey')) || undefined,
        kind: str(form.get('kind')) || undefined,
        amount: num(form.get('amount'), 0),
        beneficiary: str(form.get('beneficiary')) || 'self',
        beneficiaryName: str(form.get('beneficiaryName')) || undefined,
        expenseDate: str(form.get('expenseDate')) || undefined,
        attachmentName: str(form.get('attachmentName')) || undefined,
        declarationAccepted: form.get('declarationAccepted') === 'on',
        note: str(form.get('note')) || undefined,
      }),
    });
  } catch (e) {
    const b = (e as { body?: { detail?: string; title?: string } }).body;
    return { error: b?.detail || b?.title || 'Richiesta non inviata' };
  }
  revalidatePath('/welfare');
  return { ok: true };
}
export async function cancelWelfareRequest(id: string) { await apiFetch(`/welfare/requests/${id}/cancel`, { method: 'POST' }); revalidatePath('/welfare'); }
export async function setWelfareDeclaration(year: number, key: string, value: boolean) { await apiFetch('/welfare/declarations', { method: 'PUT', body: JSON.stringify({ year, key, value }) }); revalidatePath('/welfare'); }
export async function toggleInitiative(id: string, join: boolean) { await apiFetch(`/welfare/initiatives/${id}/${join ? 'join' : 'leave'}`, { method: 'POST' }); revalidatePath('/welfare'); }
export async function choosePremium(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  try {
    await apiFetch('/welfare/premium/choice', { method: 'POST', body: JSON.stringify({ planId: str(form.get('planId')), percent: num(form.get('percent'), 0), acceptRegulation: form.get('acceptRegulation') === 'on' ? true : false }) });
  } catch (e) {
    const b = (e as { body?: { detail?: string; title?: string; errors?: { message: string }[] } }).body;
    return { error: b?.errors?.[0]?.message || b?.detail || b?.title || 'Scelta non registrata' };
  }
  revalidatePath('/welfare');
  return {};
}
// amministrazione
export async function loadWelfarePresets(year: number) { await apiFetch(`/welfare/presets?year=${year}`, { method: 'POST' }); revalidatePath('/welfare/admin'); }
export async function createWelfarePlan(form: FormData) {
  const orgUnitId = str(form.get('orgUnitId'));
  const r = await apiFetch<{ id: string }>('/welfare/plans', {
    method: 'POST',
    body: JSON.stringify({
      name: str(form.get('name')), year: num(form.get('year'), new Date().getFullYear()), periodStart: str(form.get('periodStart')), periodEnd: str(form.get('periodEnd')),
      population: orgUnitId ? { orgUnitIds: [orgUnitId] } : {},
      regulation: str(form.get('regulation')) || undefined,
      rolloverRule: str(form.get('rolloverRule')) || 'none', rolloverPercent: num(form.get('rolloverPercent'), 0),
      enabledCategories: form.getAll('enabledCategories').map(String),
      premium: { enabled: form.get('premiumEnabled') === 'on', amount: num(form.get('premiumAmount'), 0), windowFrom: str(form.get('premiumFrom')) || undefined, windowTo: str(form.get('premiumTo')) || undefined, allowedPercents: [0, 25, 50, 75, 100], taxRate: 0.23, employeeContributionRate: 0.0919, employerContributionRate: 0.3 },
    }),
  });
  revalidatePath('/welfare/admin');
  redirect(`/welfare/admin?tab=plans&plan=${r.id}`);
}
export async function addWelfareSource(planId: string, form: FormData) {
  await apiFetch(`/welfare/plans/${planId}/sources`, { method: 'POST', body: JSON.stringify({ name: str(form.get('name')), kind: str(form.get('kind')) || 'on_top', amountPerPerson: num(form.get('amountPerPerson'), 0), creditAt: str(form.get('creditAt')), expiresAt: str(form.get('expiresAt')) || null }) });
  revalidatePath('/welfare/admin');
}
export async function activateWelfarePlan(id: string) { await apiFetch(`/welfare/plans/${id}/activate`, { method: 'POST' }); revalidatePath('/welfare/admin'); revalidatePath('/welfare'); }
export async function closeWelfarePlan(id: string) { await apiFetch(`/welfare/plans/${id}/close`, { method: 'POST' }); revalidatePath('/welfare/admin'); }
export async function createCatalogItem(form: FormData) {
  const price = str(form.get('price'));
  await apiFetch('/welfare/catalog', { method: 'POST', body: JSON.stringify({ name: str(form.get('name')), description: str(form.get('description')) || undefined, categoryKey: str(form.get('categoryKey')), kind: str(form.get('kind')) || 'reimbursement', price: price ? Number(price) : null, maxAmount: str(form.get('maxAmount')) ? num(form.get('maxAmount'), 0) : null, instructions: str(form.get('instructions')) || undefined, available: true }) });
  revalidatePath('/welfare/admin');
}
export async function createInitiative(form: FormData) {
  await apiFetch('/welfare/initiatives', { method: 'POST', body: JSON.stringify({ name: str(form.get('name')), description: str(form.get('description')) || undefined, howTo: str(form.get('howTo')) || undefined, kind: str(form.get('kind')) || 'convention', capacity: str(form.get('capacity')) ? num(form.get('capacity'), 0) : null, active: true }) });
  revalidatePath('/welfare/admin');
}
export async function decideWelfareRequest(id: string, decision: 'approve' | 'reject' | 'needs_docs', form: FormData) {
  await apiFetch(`/welfare/requests/${id}/decide`, { method: 'POST', body: JSON.stringify({ decision, note: str(form.get('note')) || undefined }) });
  revalidatePath('/welfare/admin');
}
export async function adjustWelfare(form: FormData) {
  await apiFetch('/welfare/adjustments', { method: 'POST', body: JSON.stringify({ planId: str(form.get('planId')), personId: str(form.get('personId')), amount: num(form.get('amount'), 0), note: str(form.get('note')) }) });
  revalidatePath('/welfare/admin');
}
export async function createPayrollBatch(form: FormData) { await apiFetch('/welfare/payroll/batches', { method: 'POST', body: JSON.stringify({ period: str(form.get('period')) }) }); revalidatePath('/welfare/admin'); }
export async function confirmPayrollBatch(id: string) { await apiFetch(`/welfare/payroll/batches/${id}/confirm`, { method: 'POST' }); revalidatePath('/welfare/admin'); }

// ---- aspetto (design system: colore primario del tenant) ----
export async function saveBranding(_prev: { error?: string; saved?: boolean } | undefined, form: FormData): Promise<{ error?: string; saved?: boolean }> {
  const name = String(form.get('name') ?? '').trim();
  const primaryColor = String(form.get('primaryColor') ?? '').trim().toLowerCase();
  if (!name) return { error: 'Il nome dell’organizzazione è obbligatorio' };
  if (primaryColor && !/^#[0-9a-f]{6}$/.test(primaryColor)) return { error: 'Colore non valido: usa il formato #rrggbb' };
  try {
    await apiFetch('/tenant', { method: 'PATCH', body: JSON.stringify({ name, settings: { branding: primaryColor ? { primaryColor } : {} } }) });
  } catch (e) {
    return { error: errorMessage(e, 'Salvataggio non riuscito') };
  }
  revalidatePath('/', 'layout');
  return { saved: true };
}

// ---- calendario personale (INT-022) ----
export async function rotateCalendarFeed() {
  await apiFetch('/calendar/feed/rotate', { method: 'POST' });
  revalidatePath('/settings');
}
export async function disableCalendarFeed() {
  await apiFetch('/calendar/feed', { method: 'DELETE' });
  revalidatePath('/settings');
}

// ---- report salvati (ANA-050…060) ----
function reportPayload(form: FormData) {
  const metrics = form.getAll('metrics').map(String).filter(Boolean);
  const dimension = String(form.get('dimension') ?? '') || null;
  const visualization = String(form.get('visualization') ?? 'table') as 'table' | 'bars' | 'trend';
  const compare = String(form.get('compareDays') ?? '');
  const frequency = String(form.get('frequency') ?? '');
  const roles = form.getAll('roles').map(String).filter(Boolean);
  return {
    name: String(form.get('name') ?? '').trim(),
    description: String(form.get('description') ?? '').trim() || null,
    folder: String(form.get('folder') ?? '').trim() || null,
    definition: {
      metrics, dimension,
      filters: { orgUnitId: String(form.get('orgUnitId') ?? '') || null, managerId: String(form.get('managerId') ?? '') || null, cycleId: String(form.get('cycleId') ?? '') || null },
      compareDays: compare ? Number(compare) : null,
      visualization,
      trendMetric: visualization === 'trend' ? String(form.get('trendMetric') ?? '') || metrics[0] || null : null,
      trendDays: visualization === 'trend' ? Number(form.get('trendDays') ?? 30) : null,
    },
    sharing: { roles, userIds: [] },
    schedule: frequency ? { frequency, weekday: Number(form.get('weekday') ?? 1), dayOfMonth: Number(form.get('dayOfMonth') ?? 1), hour: Number(form.get('hour') ?? 7), recipients: String(form.get('recipients') ?? 'owner') } : null,
  };
}
export async function saveReport(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const id = String(form.get('id') ?? '');
  const body = reportPayload(form);
  if (!body.name) return { error: 'Dai un nome al report' };
  if (!body.definition.metrics.length) return { error: 'Scegli almeno una metrica' };
  let target = id;
  try {
    if (id) await apiFetch(`/analytics/reports/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    else target = (await apiFetch<{ id: string }>('/analytics/reports', { method: 'POST', body: JSON.stringify(body) })).id;
  } catch (e) {
    return { error: errorMessage(e, 'Salvataggio non riuscito') };
  }
  revalidatePath('/analytics/reports');
  redirect(`/analytics/reports/${target}`);
}
export async function deleteReport(id: string) {
  await apiFetch(`/analytics/reports/${id}`, { method: 'DELETE' });
  revalidatePath('/analytics/reports');
  redirect('/analytics/reports');
}
export async function duplicateReport(id: string) {
  const copy = await apiFetch<{ id: string }>(`/analytics/reports/${id}/duplicate`, { method: 'POST' });
  revalidatePath('/analytics/reports');
  redirect(`/analytics/reports/${copy.id}?edit=1`);
}
export async function sendReportNow(id: string) {
  await apiFetch(`/analytics/reports/${id}/send`, { method: 'POST' });
  revalidatePath(`/analytics/reports/${id}`);
}

// ---- sviluppo e carriera (DEV) ----
export async function loadCompetencyPresets() {
  await apiFetch('/development/framework/presets', { method: 'POST' });
  revalidatePath('/development/admin');
}
export async function saveCompetency(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const levels = [1, 2, 3, 4].map((l) => ({ level: l, label: String(form.get(`label${l}`) ?? ''), descriptor: String(form.get(`descriptor${l}`) ?? '') }));
  try {
    await apiFetch('/development/competencies', { method: 'PUT', body: JSON.stringify({ key: String(form.get('key') ?? '').trim().toLowerCase(), name: String(form.get('name') ?? '').trim(), kind: String(form.get('kind') ?? 'core'), description: String(form.get('description') ?? '') || null, levels, active: form.get('active') !== 'false' }) });
  } catch (e) { return { error: errorMessage(e) }; }
  revalidatePath('/development/admin');
  return {};
}
export async function saveJobProfile(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const id = String(form.get('id') ?? '');
  const expected = form.getAll('competencyKey').map(String).map((k, i) => ({ competencyKey: k, level: Number(form.getAll('expectedLevel')[i] ?? 0) })).filter((e) => e.level > 0);
  const body = { title: String(form.get('title') ?? '').trim(), family: String(form.get('family') ?? '') || null, level: String(form.get('level') ?? '') || null, description: String(form.get('description') ?? '') || null, expected, nextProfileId: String(form.get('nextProfileId') ?? '') || null };
  try {
    if (id) await apiFetch(`/development/job-profiles/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    else await apiFetch('/development/job-profiles', { method: 'POST', body: JSON.stringify(body) });
  } catch (e) { return { error: errorMessage(e) }; }
  revalidatePath('/development/admin');
  return {};
}
export async function assignJobProfile(personId: string, form: FormData) {
  await apiFetch(`/development/people/${personId}/job-profile`, { method: 'PUT', body: JSON.stringify({ profileId: String(form.get('profileId') ?? '') || null }) });
  revalidatePath('/development/admin');
  revalidatePath(`/development/people/${personId}`);
}
export async function submitAssessment(personId: string, source: 'self' | 'manager', backPath: string, form: FormData) {
  const items = form.getAll('competencyKey').map(String).map((k) => ({ competencyKey: k, level: Number(form.get(`level_${k}`) ?? 0), note: String(form.get(`note_${k}`) ?? '') || null })).filter((i) => i.level > 0);
  if (!items.length) return;
  await apiFetch(`/development/people/${personId}/assessments`, { method: 'POST', body: JSON.stringify({ source, items }) });
  revalidatePath(backPath);
}
export async function createDevPlan(personId: string | null, backPath: string, form: FormData) {
  await apiFetch('/development/plans', { method: 'POST', body: JSON.stringify({ personId: personId ?? undefined, title: String(form.get('title') ?? 'Piano di sviluppo').trim() || 'Piano di sviluppo', periodEnd: String(form.get('periodEnd') ?? '') || null }) });
  revalidatePath(backPath);
}
export async function setDevPlanStatus(planId: string, status: string, backPath: string, form?: FormData) {
  const managerNote = form ? String(form.get('managerNote') ?? '') || undefined : undefined;
  await apiFetch(`/development/plans/${planId}`, { method: 'PATCH', body: JSON.stringify({ status, managerNote }) });
  revalidatePath(backPath);
}
export async function addDevAction(planId: string, backPath: string, form: FormData) {
  const title = String(form.get('title') ?? '').trim();
  if (!title) return;
  await apiFetch(`/development/plans/${planId}/actions`, { method: 'POST', body: JSON.stringify({ title, description: String(form.get('description') ?? '') || null, kind: String(form.get('kind') ?? 'other'), competencyKey: String(form.get('competencyKey') ?? '') || null, dueDate: String(form.get('dueDate') ?? '') || null, source: String(form.get('source') ?? 'manual') }) });
  revalidatePath(backPath);
}
export async function setDevActionStatus(actionId: string, status: 'open' | 'done' | 'cancelled', backPath: string, form?: FormData) {
  const evidence = form ? String(form.get('evidence') ?? '') || undefined : undefined;
  await apiFetch(`/development/actions/${actionId}`, { method: 'PATCH', body: JSON.stringify({ status, evidence }) });
  revalidatePath(backPath);
}
export async function setPotential(personId: string, backPath: string, form: FormData) {
  await apiFetch(`/development/talent/${personId}`, { method: 'PUT', body: JSON.stringify({ potential: Number(form.get('potential') ?? 2), note: String(form.get('note') ?? ''), session: String(form.get('session') ?? '') || null }) });
  revalidatePath(backPath);
  revalidatePath('/development/admin');
}

/** Esce da tutte le sessioni (tutti i dispositivi): il server invalida i token emessi finora. */
export async function logoutEverywhere() {
  await apiFetch('/auth/logout-all', { method: 'POST' }).catch(() => undefined);
  (await cookies()).delete(TOKEN_COOKIE);
  redirect('/login');
}
