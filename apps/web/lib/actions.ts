'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { API_SERVER_URL, TOKEN_COOKIE, apiFetch, errorMessage, publicFetch } from './api';

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
  const hasChat = form.get('hasChat') === '1';
  const items = types.map((type) => ({ type, inApp: form.get(`inApp:${type}`) === 'on', email: form.get(`email:${type}`) === 'on', ...(hasChat ? { chat: form.get(`chat:${type}`) === 'on' } : {}) }));
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
      approvalChain: form.getAll('approvalChain').map(String),
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

export async function passwordLogin(_prev: { error?: string; challenge?: string } | undefined, form: FormData): Promise<{ error?: string; challenge?: string }> {
  const r = await authPost('/auth/login', { tenantSlug: str(form.get('tenantSlug')), email: str(form.get('email')), password: String(form.get('password') ?? '') });
  if (!r.ok) return { error: r.error };
  const data = r.data as SessionResponse & { mfaRequired?: boolean; challenge?: string; mfaSetupRequired?: boolean };
  // verifica in due passaggi: il server ha restituito una sfida, non una sessione
  if (data.mfaRequired && data.challenge) return { challenge: data.challenge };
  await setSessionCookie(data.accessToken, data.expiresIn);
  if (data.mfaSetupRequired) redirect('/settings?mfa=required');
  redirect(str(form.get('next')) || '/dashboard');
}

export async function mfaLogin(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const r = await authPost('/auth/mfa/verify', { challenge: str(form.get('challenge')), code: str(form.get('code')) });
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
  // logo per i PDF e le email (REV-054): PNG o JPEG fino a 200 KB, salvato come data URL nelle impostazioni
  const logo = form.get('logo');
  const removeLogo = form.get('removeLogo') === 'on';
  let logoDataUrl: string | null | undefined = removeLogo ? null : undefined;
  if (!removeLogo && logo instanceof File && logo.size > 0) {
    if (!['image/png', 'image/jpeg'].includes(logo.type)) return { error: 'Il logo deve essere un PNG o un JPEG' };
    if (logo.size > 200 * 1024) return { error: 'Il logo supera i 200 KB' };
    logoDataUrl = `data:${logo.type};base64,${Buffer.from(await logo.arrayBuffer()).toString('base64')}`;
  }
  try {
    const current = await apiFetch<{ settings?: { branding?: Record<string, unknown> } }>('/tenant');
    const branding: Record<string, unknown> = { ...(current.settings?.branding ?? {}) };
    if (primaryColor) branding.primaryColor = primaryColor; else delete branding.primaryColor;
    if (logoDataUrl !== undefined) { if (logoDataUrl) branding.logoDataUrl = logoDataUrl; else delete branding.logoDataUrl; }
    await apiFetch('/tenant', { method: 'PATCH', body: JSON.stringify({ name, settings: { branding } }) });
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

// ---- verifica in due passaggi (CORE-030) ----
export type MfaEnrollState = { error?: string; secret?: string; otpauthUrl?: string; qrSvg?: string; recoveryCodes?: string[]; done?: 'enabled' | 'disabled' | 'regenerated' };
export async function mfaAction(_prev: MfaEnrollState | undefined, form: FormData): Promise<MfaEnrollState> {
  const op = str(form.get('op'));
  try {
    if (op === 'enroll') {
      const r = await apiFetch<{ secret: string; otpauthUrl: string; qrSvg: string }>('/auth/mfa/enroll', { method: 'POST' });
      return { secret: r.secret, otpauthUrl: r.otpauthUrl, qrSvg: r.qrSvg };
    }
    if (op === 'confirm') {
      const r = await apiFetch<{ recoveryCodes: string[] }>('/auth/mfa/confirm', { method: 'POST', body: JSON.stringify({ code: str(form.get('code')) }) });
      revalidatePath('/settings');
      return { recoveryCodes: r.recoveryCodes, done: 'enabled' };
    }
    if (op === 'regenerate') {
      const r = await apiFetch<{ recoveryCodes: string[] }>('/auth/mfa/recovery-codes', { method: 'POST', body: JSON.stringify({ code: str(form.get('code')) }) });
      revalidatePath('/settings');
      return { recoveryCodes: r.recoveryCodes, done: 'regenerated' };
    }
    if (op === 'disable') {
      await apiFetch('/auth/mfa/disable', { method: 'POST', body: JSON.stringify({ password: String(form.get('password') ?? ''), code: str(form.get('code')) || undefined }) });
      revalidatePath('/settings');
      return { done: 'disabled' };
    }
  } catch (e) {
    return { error: errorMessage(e, 'Operazione non riuscita') };
  }
  return {};
}
export async function saveSecurityPolicy(_prev: { error?: string; saved?: boolean } | undefined, form: FormData): Promise<{ error?: string; saved?: boolean }> {
  try {
    await apiFetch('/tenant/security', { method: 'PUT', body: JSON.stringify({ mfaRequiredRoles: form.getAll('mfaRequiredRoles').map(String) }) });
  } catch (e) { return { error: errorMessage(e) }; }
  revalidatePath('/settings');
  return { saved: true };
}

// ---- feedback 360° (F360) ----
export type ActionState = { error?: string; ok?: boolean; message?: string };
async function attempt(fn: () => Promise<void>, ok = 'Fatto'): Promise<ActionState> {
  try { await fn(); } catch (e) { return { error: errorMessage(e) }; }
  return { ok: true, message: ok };
}
function f360AnswersFrom(form: FormData): import('./api').F360Answers {
  const ratings: Record<string, number | null> = {};
  const comments: Record<string, string> = {};
  const openAnswers: Record<string, string> = {};
  for (const k of form.getAll('competencyKey').map(String)) {
    const v = str(form.get(`rating_${k}`));
    ratings[k] = v === '' ? null : Number(v);
    const c = str(form.get(`comment_${k}`));
    if (c) comments[k] = c;
  }
  for (const k of form.getAll('openKey').map(String)) { const v = str(form.get(`open_${k}`)); if (v) openAnswers[k] = v; }
  return { ratings, comments, openAnswers };
}
export async function createF360Campaign(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const keys = ['self', 'manager', 'peer', 'report', 'other', 'external'] as const;
  const categories = keys.map((k) => ({ key: k, enabled: form.get(`cat_${k}`) === 'on', min: num(form.get(`min_${k}`), 0), max: Math.max(1, num(form.get(`max_${k}`), 1)), anonymous: !(k === 'self' || k === 'manager') }));
  const orgUnitId = str(form.get('orgUnitId'));
  let id: string;
  try {
    const c = await apiFetch<{ id: string }>('/f360/campaigns', { method: 'POST', body: JSON.stringify({ name: str(form.get('name')), description: str(form.get('description')) || null, competencyKeys: form.getAll('competencyKeys').map(String), categories, nominationBy: str(form.get('nominationBy')) || 'subject', requireApproval: form.get('requireApproval') === 'on', releaseRule: str(form.get('releaseRule')) || 'after_debrief', managerSeesReport: form.get('managerSeesReport') !== 'off', anonymityThreshold: num(form.get('anonymityThreshold'), 3), population: orgUnitId ? { orgUnitIds: [orgUnitId] } : {}, nominationDueAt: str(form.get('nominationDueAt')) || null, collectionDueAt: str(form.get('collectionDueAt')) || null }) });
    id = c.id;
  } catch (e) { return { error: errorMessage(e) }; }
  revalidatePath('/f360');
  redirect(`/f360/campaigns/${id}`);
}
export async function f360CampaignAction(id: string, action: 'launch' | 'start-collection' | 'remind' | 'close', _prev: ActionState | undefined, _form: FormData): Promise<ActionState> {
  const r = await attempt(() => apiFetch(`/f360/campaigns/${id}/${action}`, { method: 'POST' }), action === 'remind' ? 'Solleciti inviati' : action === 'launch' ? 'Campagna lanciata: fase di nomina' : action === 'start-collection' ? 'Raccolta avviata: valutatori invitati' : 'Campagna chiusa: report generati');
  revalidatePath(`/f360/campaigns/${id}`);
  revalidatePath('/f360');
  return r;
}
export async function nominateF360(subjectId: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const category = str(form.get('category'));
  const personId = str(form.get('personId'));
  const body = category === 'external' ? { category, externalEmail: str(form.get('externalEmail')), externalName: str(form.get('externalName')) } : { category, personId };
  const r = await attempt(() => apiFetch(`/f360/subjects/${subjectId}/nominations`, { method: 'POST', body: JSON.stringify(body) }), 'Nomina aggiunta');
  revalidatePath(`/f360/subjects/${subjectId}`);
  return r;
}
export async function removeF360Nomination(id: string, subjectId: string) {
  await apiFetch(`/f360/nominations/${id}`, { method: 'DELETE' }).catch(() => undefined);
  revalidatePath(`/f360/subjects/${subjectId}`);
}
export async function submitF360Nominations(subjectId: string, _prev: ActionState | undefined, _form: FormData): Promise<ActionState> {
  const r = await attempt(() => apiFetch(`/f360/subjects/${subjectId}/nominations/submit`, { method: 'POST' }), 'Nomine inviate');
  revalidatePath(`/f360/subjects/${subjectId}`);
  return r;
}
export async function approveF360Nominations(subjectId: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const rejectIds = form.getAll('rejectIds').map(String);
  const r = await attempt(() => apiFetch(`/f360/subjects/${subjectId}/nominations/approve`, { method: 'POST', body: JSON.stringify({ rejectIds }) }), 'Nomine approvate');
  revalidatePath(`/f360/subjects/${subjectId}`);
  return r;
}
export async function releaseF360(subjectId: string, _prev: ActionState | undefined, _form: FormData): Promise<ActionState> {
  const r = await attempt(() => apiFetch(`/f360/subjects/${subjectId}/release`, { method: 'POST' }), 'Report rilasciato alla persona');
  revalidatePath(`/f360/subjects/${subjectId}`);
  return r;
}
export async function debriefF360(subjectId: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const at = str(form.get('at'));
  const r = await attempt(() => apiFetch(`/f360/subjects/${subjectId}/debrief`, { method: 'POST', body: JSON.stringify({ at: at ? new Date(at).toISOString() : undefined, note: str(form.get('note')) || undefined }) }), 'Debrief registrato');
  revalidatePath(`/f360/subjects/${subjectId}`);
  return r;
}
export async function addF360DevAction(subjectId: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const r = await attempt(() => apiFetch(`/f360/subjects/${subjectId}/dev-actions`, { method: 'POST', body: JSON.stringify({ competencyKey: str(form.get('competencyKey')), title: str(form.get('title')), kind: str(form.get('kind')) || 'other', dueDate: str(form.get('dueDate')) || null }) }), 'Azione aggiunta al piano di sviluppo');
  revalidatePath(`/f360/subjects/${subjectId}`);
  revalidatePath('/development');
  return r;
}
export async function answerF360(requestId: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const mode = str(form.get('mode')) === 'submit' ? 'submit' : 'draft';
  const answers = f360AnswersFrom(form);
  if (mode === 'draft') {
    const r = await attempt(() => apiFetch(`/f360/requests/${requestId}/draft`, { method: 'PUT', body: JSON.stringify(answers) }), 'Bozza salvata');
    revalidatePath(`/f360/requests/${requestId}`);
    return r;
  }
  try { await apiFetch(`/f360/requests/${requestId}/submit`, { method: 'POST', body: JSON.stringify(answers) }); } catch (e) { return { error: errorMessage(e) }; }
  revalidatePath('/f360');
  redirect('/f360?done=1');
}
export async function declineF360(requestId: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  try { await apiFetch(`/f360/requests/${requestId}/decline`, { method: 'POST', body: JSON.stringify({ reason: str(form.get('reason')) || undefined }) }); } catch (e) { return { error: errorMessage(e) }; }
  revalidatePath('/f360');
  redirect('/f360?declined=1');
}
export async function answerF360External(token: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const mode = str(form.get('mode')) === 'submit' ? 'submit' : 'draft';
  const answers = f360AnswersFrom(form);
  if (mode === 'draft') return attempt(() => publicFetch(`/f360/external/${encodeURIComponent(token)}/draft`, { method: 'PUT', body: JSON.stringify(answers) }), 'Bozza salvata: puoi riaprire il link più tardi');
  try { await publicFetch(`/f360/external/${encodeURIComponent(token)}/submit`, { method: 'POST', body: JSON.stringify(answers) }); } catch (e) { return { error: errorMessage(e) }; }
  redirect(`/f360/external/${encodeURIComponent(token)}?done=1`);
}

// ---- onboarding (ONB) ----
export async function sendOnboardingExternalLink(id: string, _prev: ActionState | undefined, _form: FormData): Promise<ActionState> {
  let sent: { email: string; tasks: number } | null = null;
  const r = await attempt(async () => { sent = await apiFetch<{ email: string; tasks: number }>(`/onboarding/journeys/${id}/external-link`, { method: 'POST' }); }, 'Link inviato');
  if (r.ok && sent) r.message = `Link inviato a ${(sent as { email: string }).email} (${(sent as { tasks: number }).tasks} task di pre-boarding)`;
  revalidatePath(`/onboarding/journeys/${id}`);
  return r;
}
export async function completeOnboardingExternalTask(token: string, taskId: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const r = await attempt(() => publicFetch(`/onboarding/external/${encodeURIComponent(token)}/tasks/${taskId}`, { method: 'POST', body: JSON.stringify({ acknowledged: form.get('acknowledged') === 'on', note: str(form.get('note')) || null }) }), 'Fatto');
  revalidatePath(`/onboarding/external/${token}`);
  return r;
}
export async function submitOnboardingExternalForm(token: string, taskId: string, schema: import('./api').FormSchemaDef, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const answers = answersFromForm(form, schema);
  try {
    await publicFetch(`/onboarding/external/${encodeURIComponent(token)}/tasks/${taskId}/form`, { method: 'POST', body: JSON.stringify({ answers }) });
  } catch (e) {
    const body = (e as { body?: { errors?: { field: string; message: string }[] } }).body;
    if (body?.errors?.length) return { error: body.errors.map((x) => x.message).join(' · ') };
    return { error: errorMessage(e) };
  }
  revalidatePath(`/onboarding/external/${token}`);
  return { ok: true, message: 'Modulo inviato, grazie!' };
}
export async function loadOnboardingPresets() { await apiFetch('/onboarding/templates/presets', { method: 'POST' }); revalidatePath('/onboarding'); }
export async function startOnboarding(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  let id: string;
  try {
    const j = await apiFetch<{ id: string }>('/onboarding/journeys', { method: 'POST', body: JSON.stringify({ personId: str(form.get('personId')), templateId: str(form.get('templateId')) || undefined, kind: str(form.get('kind')) || undefined, anchorDate: str(form.get('anchorDate')) || undefined, buddyPersonId: str(form.get('buddyPersonId')) || undefined }) });
    id = j.id;
  } catch (e) { return { error: errorMessage(e) }; }
  revalidatePath('/onboarding');
  redirect(`/onboarding/journeys/${id}`);
}
export async function autoStartOnboarding(_prev: ActionState | undefined, _form: FormData): Promise<ActionState> {
  try { const r = await apiFetch<{ started: number }>('/onboarding/journeys/auto', { method: 'POST', body: JSON.stringify({}) }); revalidatePath('/onboarding'); return { ok: true, message: r.started ? `${r.started} percorsi avviati` : 'Nessun percorso da avviare' }; } catch (e) { return { error: errorMessage(e) }; }
}
export async function updateOnboardingTask(taskId: string, backPath: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const status = str(form.get('status')) as 'open' | 'done' | 'skipped';
  const r = await attempt(() => apiFetch(`/onboarding/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ status, note: str(form.get('note')) || undefined, acknowledged: form.get('acknowledged') === 'on' || undefined }) }), status === 'done' ? 'Fatto' : status === 'skipped' ? 'Saltato' : 'Riaperto');
  revalidatePath(backPath);
  revalidatePath('/onboarding');
  return r;
}
export async function updateOnboardingJourney(id: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const body: Record<string, unknown> = {};
  if (form.has('buddyPersonId')) body.buddyPersonId = str(form.get('buddyPersonId')) || null;
  if (form.has('anchorDate') && str(form.get('anchorDate'))) body.anchorDate = str(form.get('anchorDate'));
  if (form.has('status')) body.status = str(form.get('status'));
  if (form.has('itPersonId')) body.itPersonId = str(form.get('itPersonId')) || null;
  const r = await attempt(() => apiFetch(`/onboarding/journeys/${id}`, { method: 'PATCH', body: JSON.stringify(body) }), 'Percorso aggiornato');
  revalidatePath(`/onboarding/journeys/${id}`);
  return r;
}
export async function addOnboardingTask(id: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const r = await attempt(() => apiFetch(`/onboarding/journeys/${id}/tasks`, { method: 'POST', body: JSON.stringify({ phase: str(form.get('phase')), title: str(form.get('title')), description: str(form.get('description')) || null, role: str(form.get('role')) || 'newcomer', kind: str(form.get('kind')) || 'todo', dueDate: str(form.get('dueDate')) || null, link: str(form.get('link')) || null, required: form.get('required') !== 'off' }) }), 'Task aggiunto');
  revalidatePath(`/onboarding/journeys/${id}`);
  return r;
}
export async function submitOnboardingSurvey(journeyId: string, key: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const answers: Record<string, number> = {};
  for (const q of form.getAll('questionKey').map(String)) { const v = str(form.get(`q_${q}`)); if (v) answers[q] = Number(v); }
  const r = await attempt(() => apiFetch(`/onboarding/journeys/${journeyId}/surveys/${key}`, { method: 'POST', body: JSON.stringify({ answers, comment: str(form.get('comment')) || null }) }), 'Grazie! Risposte registrate');
  revalidatePath('/onboarding');
  revalidatePath(`/onboarding/journeys/${journeyId}`);
  return r;
}
export async function saveOnboardingTemplate(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const id = str(form.get('id'));
  let tasks: unknown;
  let phases: unknown;
  try { tasks = JSON.parse(str(form.get('tasks')) || '[]'); phases = JSON.parse(str(form.get('phases')) || '[]'); } catch { return { error: 'Fasi o task non sono JSON validi' }; }
  const body = { name: str(form.get('name')), kind: str(form.get('kind')) || 'onboarding', description: str(form.get('description')) || null, phases, tasks, rules: { orgUnitIds: form.getAll('orgUnitIds').map(String).filter(Boolean), locations: str(form.get('locations')).split(',').map((x) => x.trim()).filter(Boolean), jobTitleKeywords: str(form.get('jobTitleKeywords')).split(',').map((x) => x.trim()).filter(Boolean) }, isDefault: form.get('isDefault') === 'on', active: form.get('active') !== 'off' };
  try {
    if (id) await apiFetch(`/onboarding/templates/${id}`, { method: 'PATCH', body: JSON.stringify({ ...body, kind: undefined }) });
    else { const t = await apiFetch<{ id: string }>('/onboarding/templates', { method: 'POST', body: JSON.stringify(body) }); revalidatePath('/onboarding'); redirect(`/onboarding/templates/${t.id}`); }
  } catch (e) { if ((e as { digest?: string }).digest?.startsWith('NEXT_REDIRECT')) throw e; return { error: errorMessage(e) }; }
  revalidatePath(`/onboarding/templates/${id}`);
  revalidatePath('/onboarding');
  return { ok: true, message: 'Template salvato' };
}

// ---- app studio (APP) ----
export async function installAppTemplate(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  let id: string;
  try { const a = await apiFetch<{ id: string }>('/apps/templates/install', { method: 'POST', body: JSON.stringify({ key: str(form.get('key')) }) }); id = a.id; } catch (e) { return { error: errorMessage(e) }; }
  revalidatePath('/apps');
  redirect(`/apps/${id}`);
}
export async function importApp(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  let payload: unknown;
  try { payload = JSON.parse(str(form.get('json'))); } catch { return { error: 'JSON non valido' }; }
  let id: string;
  try { const a = await apiFetch<{ id: string }>('/apps/import', { method: 'POST', body: JSON.stringify(payload) }); id = a.id; } catch (e) { return { error: errorMessage(e) }; }
  revalidatePath('/apps');
  redirect(`/apps/${id}`);
}
export async function appAction(id: string, action: 'publish' | 'versions' | 'archive', _prev: ActionState | undefined, _form: FormData): Promise<ActionState> {
  let target = id;
  try { const r = await apiFetch<{ id?: string }>(`/apps/${id}/${action}`, { method: 'POST' }); if (action === 'versions' && r.id) target = r.id; } catch (e) { return { error: errorMessage(e) }; }
  revalidatePath('/apps');
  revalidatePath(`/apps/${id}`);
  if (action === 'archive') redirect('/apps?tab=studio');
  if (target !== id) redirect(`/apps/${target}`);
  return { ok: true, message: action === 'publish' ? 'App pubblicata' : 'Fatto' };
}
export async function duplicateApp(id: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  let target: string;
  try { const r = await apiFetch<{ id: string }>(`/apps/${id}/duplicate`, { method: 'POST', body: JSON.stringify({ key: str(form.get('key')), name: str(form.get('name')) }) }); target = r.id; } catch (e) { return { error: errorMessage(e) }; }
  revalidatePath('/apps');
  redirect(`/apps/${target}`);
}
function stageFromForm(form: FormData): Record<string, unknown> {
  const type = str(form.get('type')) || 'form';
  const rejectTo = str(form.get('rejectTo'));
  const notifyTo = form.getAll('notifyTo').map(String).filter(Boolean);
  const condField = str(form.get('condField')); const condOp = str(form.get('condOp')); const condValue = str(form.get('condValue')); const condGoto = str(form.get('condGoto'));
  // azioni automatiche (APP-024): l'editor gestisce la prima azione; le altre (da import) restano nel campo nascosto
  const actionType = str(form.get('actionType'));
  let rest: unknown[] = [];
  try { rest = JSON.parse(str(form.get('actionsRest')) || '[]') as unknown[]; } catch { rest = []; }
  const first =
    actionType === 'action_item' ? { type: 'action_item', title: str(form.get('actionTitle')), assignee: str(form.get('actionAssignee')) || 'manager', dueDays: num(form.get('actionDueDays'), 7) }
    : actionType === 'person_field' ? { type: 'person_field', field: str(form.get('actionField')) || 'jobTitle', value: str(form.get('actionValue')) || null }
    : actionType === 'webhook' ? { type: 'webhook', url: str(form.get('actionUrl')), includeAnswers: form.get('actionIncludeAnswers') === 'on' }
    : actionType === 'start_app' ? { type: 'start_app', appKey: str(form.get('actionAppKey')) }
    : null;
  return {
    key: str(form.get('key')), name: str(form.get('name')), type, actor: str(form.get('actor')) || 'subject', description: str(form.get('description')) || null,
    formKey: type === 'form' ? str(form.get('formKey')) || null : null, dueDays: num(form.get('dueDays'), 7), parallelGroup: str(form.get('parallelGroup')) || null, seePrevious: form.get('seePrevious') === 'on',
    approval: type === 'approval' ? { rejectTo: rejectTo || null, requireComment: form.get('requireComment') === 'on' } : null,
    notify: type === 'notify' ? { to: notifyTo.length ? notifyTo : ['subject'], message: str(form.get('message')) || 'Aggiornamento sul processo.' } : null,
    actions: type === 'action' ? [...(first ? [first] : []), ...rest] : null,
    transitions: condOp && condGoto ? [{ when: { source: condField ? 'answer' : 'outcome', field: condField || undefined, op: condOp, value: condOp === 'not_empty' ? undefined : condOp === 'in' ? condValue.split(',').map((x) => x.trim()) : Number.isNaN(Number(condValue)) || condValue === '' ? condValue : Number(condValue) }, goto: condGoto }] : null,
  };
}
export async function saveAppMeta(id: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const body = { name: str(form.get('name')), description: str(form.get('description')) || null, icon: str(form.get('icon')) || null, naming: { instanceLabel: str(form.get('instanceLabel')) || 'Richiesta', launchVerb: str(form.get('launchVerb')) || 'Avvia', subjectLabel: str(form.get('subjectLabel')) || 'Persona' }, permissions: { launch: form.getAll('launch').map(String), launchForSelfOnly: form.get('launchForSelfOnly') === 'on', viewInstances: form.getAll('viewInstances').map(String) } };
  const r = await attempt(() => apiFetch(`/apps/${id}`, { method: 'PATCH', body: JSON.stringify(body) }), 'Impostazioni salvate');
  revalidatePath(`/apps/${id}`);
  return r;
}
export async function saveAppStage(id: string, stages: import('./api').AppStageDef[], originalKey: string | null, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const stage = stageFromForm(form);
  let next: unknown[];
  if (originalKey) next = stages.map((s) => (s.key === originalKey ? stage : s));
  else {
    // inserimento in un punto preciso del diagramma (dopo la fase indicata; vuoto = in fondo, "start" = in testa)
    const after = str(form.get('insertAfter'));
    const idx = after === 'start' ? 0 : after ? stages.findIndex((s) => s.key === after) + 1 : stages.length;
    next = [...stages.slice(0, idx < 0 ? stages.length : idx), stage, ...stages.slice(idx < 0 ? stages.length : idx)];
  }
  const r = await attempt(() => apiFetch(`/apps/${id}`, { method: 'PATCH', body: JSON.stringify({ stages: next }) }), originalKey ? 'Fase aggiornata' : 'Fase aggiunta');
  revalidatePath(`/apps/${id}`);
  if (!originalKey && !r.error) redirect(`/apps/${id}?stage=${encodeURIComponent(str(form.get('key')))}`);
  return r;
}
export async function createFormScale(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const labels: Record<string, string> = {};
  for (const line of str(form.get('labels')).split('\n')) { const m = line.match(/^\s*(-?\d+)\s*[=:]\s*(.+?)\s*$/); if (m) labels[m[1]!] = m[2]!; }
  const r = await attempt(() => apiFetch('/form-scales', { method: 'POST', body: JSON.stringify({ key: str(form.get('key')), name: str(form.get('name')), min: num(form.get('min'), 1), max: num(form.get('max'), 5), labels, allowNa: form.get('allowNa') === 'on' }) }), 'Scala creata');
  revalidatePath('/forms/scales');
  return r;
}
export async function archiveFormScale(id: string, archived: boolean) {
  await apiFetch(`/form-scales/${id}`, { method: 'PATCH', body: JSON.stringify({ archived }) }).catch(() => undefined);
  revalidatePath('/forms/scales');
}
export async function moveAppStage(id: string, stages: import('./api').AppStageDef[], key: string, dir: -1 | 1 | 0) {
  const i = stages.findIndex((s) => s.key === key);
  if (i < 0) return;
  const next = [...stages];
  if (dir === 0) next.splice(i, 1);
  else { const j = i + dir; if (j < 0 || j >= next.length) return; [next[i], next[j]] = [next[j]!, next[i]!]; }
  await apiFetch(`/apps/${id}`, { method: 'PATCH', body: JSON.stringify({ stages: next }) }).catch(() => undefined);
  revalidatePath(`/apps/${id}`);
}
export async function launchApp(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  let id: string;
  try { const r = await apiFetch<{ id: string }>('/apps/instances', { method: 'POST', body: JSON.stringify({ appKey: str(form.get('appKey')), subjectPersonId: str(form.get('subjectPersonId')) || undefined, title: str(form.get('title')) || undefined }) }); id = r.id; } catch (e) { return { error: errorMessage(e) }; }
  revalidatePath('/apps');
  redirect(`/apps/instances/${id}`);
}
export async function decideAppRun(runId: string, instanceId: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const decision = str(form.get('decision')) === 'reject' ? 'reject' : 'approve';
  const r = await attempt(() => apiFetch(`/apps/runs/${runId}/decide`, { method: 'POST', body: JSON.stringify({ decision, comment: str(form.get('comment')) || undefined }) }), decision === 'approve' ? 'Approvato' : 'Rimandato');
  revalidatePath(`/apps/instances/${instanceId}`);
  revalidatePath('/apps');
  return r;
}
export async function manageAppRun(runId: string, instanceId: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const actorPersonId = str(form.get('actorPersonId')); const dueDate = str(form.get('dueDate'));
  const r = await attempt(async () => {
    if (actorPersonId) await apiFetch(`/apps/runs/${runId}/reassign`, { method: 'POST', body: JSON.stringify({ actorPersonId }) });
    if (dueDate) await apiFetch(`/apps/runs/${runId}/extend`, { method: 'POST', body: JSON.stringify({ dueDate }) });
  }, 'Fase aggiornata');
  revalidatePath(`/apps/instances/${instanceId}`);
  return r;
}
export async function cancelAppInstance(id: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const r = await attempt(() => apiFetch(`/apps/instances/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason: str(form.get('reason')) || undefined }) }), 'Istanza annullata');
  revalidatePath(`/apps/instances/${id}`);
  revalidatePath('/apps');
  return r;
}
export async function createAppFromForm(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const key = str(form.get('key'));
  let id: string;
  try {
    const a = await apiFetch<{ id: string }>('/apps', { method: 'POST', body: JSON.stringify({ key, name: str(form.get('name')), description: str(form.get('description')) || null, icon: '🧩', naming: { instanceLabel: 'Richiesta', launchVerb: 'Avvia', subjectLabel: 'Persona' }, permissions: { launch: ['hr'], launchForSelfOnly: false, viewInstances: ['hr', 'subject', 'launcher', 'actors'] }, stages: [{ key: 'approval', name: 'Approvazione', type: 'approval', actor: 'manager', dueDays: 5, seePrevious: true, approval: { rejectTo: null, requireComment: true } }] }) });
    id = a.id;
  } catch (e) { return { error: errorMessage(e) }; }
  revalidatePath('/apps');
  redirect(`/apps/${id}`);
}

// ---- connettori esterni (ADR-0012) ----
export async function saveIntegrationsConfig(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const sec = (k: string) => { const v = str(form.get(k)); return form.get(`${k}Clear`) === 'on' ? '' : v || undefined; };
  const body = {
    google: { enabled: form.get('google_enabled') === 'on', clientId: str(form.get('google_clientId')) || null, clientSecret: sec('google_clientSecret') },
    microsoft: { enabled: form.get('microsoft_enabled') === 'on', clientId: str(form.get('microsoft_clientId')) || null, clientSecret: sec('microsoft_clientSecret'), tenant: str(form.get('microsoft_tenant')) || 'common' },
    slack: { enabled: form.get('slack_enabled') === 'on', clientId: str(form.get('slack_clientId')) || null, clientSecret: sec('slack_clientSecret'), recognitionsChannel: str(form.get('slack_recognitionsChannel')) || null },
    teams: { enabled: form.get('teams_enabled') === 'on', webhookUrl: form.get('teams_webhookUrlClear') === 'on' ? null : str(form.get('teams_webhookUrl')) || undefined, postRecognitions: form.get('teams_postRecognitions') === 'on' },
  };
  const r = await attempt(() => apiFetch('/integrations/config', { method: 'PUT', body: JSON.stringify(body) }), 'Connettori salvati');
  revalidatePath('/settings');
  return r;
}
export async function disconnectIntegration(provider: string, _prev: ActionState | undefined, _form: FormData): Promise<ActionState> {
  const r = await attempt(() => apiFetch(`/integrations/${provider}`, { method: 'DELETE' }), 'Scollegato');
  revalidatePath('/settings');
  return r;
}
export async function testIntegration(provider: string, _prev: ActionState | undefined, _form: FormData): Promise<ActionState> {
  return attempt(() => apiFetch(`/integrations/${provider}/test`, { method: 'POST' }), provider === 'slack' ? 'Messaggio di prova in coda: arriva in Slack entro un minuto' : 'Card di prova in coda: arriva nel canale Teams entro un minuto');
}

// ---- catena di approvazione e calibrazione delle review (REV-050, REV-040…045) ----
export async function approveReview(id: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const decision = str(form.get('decision')) === 'return' ? 'return' : 'approve';
  const r = await attempt(() => apiFetch(`/reviews/${id}/approve`, { method: 'POST', body: JSON.stringify({ decision, comment: str(form.get('comment')) || undefined }) }), decision === 'approve' ? 'Approvata' : 'Rimandata al manager');
  revalidatePath(`/reviews/${id}`);
  revalidatePath('/reviews');
  return r;
}
export async function createCalibrationSession(cycleId: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const expected: Record<string, number> = {};
  for (const part of str(form.get('expectedDistribution')).split(/[,;\n]/)) {
    const [k, v] = part.split('=').map((x) => x.trim());
    if (k && v && !Number.isNaN(Number(v))) expected[k] = Number(v);
  }
  let created: { id: string } | null = null;
  const r = await attempt(async () => {
    created = await apiFetch<{ id: string }>(`/review-cycles/${cycleId}/calibration-sessions`, {
      method: 'POST',
      body: JSON.stringify({ name: str(form.get('name')), orgUnitIds: form.getAll('orgUnitIds').map(String).filter(Boolean), participantPersonIds: form.getAll('participantPersonIds').map(String).filter(Boolean), facilitatorPersonId: str(form.get('facilitatorPersonId')) || null, expectedDistribution: Object.keys(expected).length ? expected : null, notes: str(form.get('notes')) || null }),
    });
  }, 'Sessione creata');
  if (r.error || !created) return r;
  revalidatePath(`/reviews/cycles/${cycleId}`);
  redirect(`/reviews/calibration/${(created as { id: string }).id}`);
}
export async function setCalibrationRating(sessionId: string, reviewId: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const rating = str(form.get('rating'));
  const potential = str(form.get('potential'));
  const r = await attempt(() => apiFetch(`/calibration-sessions/${sessionId}/ratings`, { method: 'POST', body: JSON.stringify({ reviewId, rating: rating === '' ? undefined : Number(rating), potential: potential === '' ? null : Number(potential), note: str(form.get('note')) || undefined }) }), 'Salvato');
  revalidatePath(`/reviews/calibration/${sessionId}`);
  revalidatePath(`/reviews/${reviewId}`);
  return r;
}
export async function calibrationSessionAction(sessionId: string, action: 'lock' | 'unlock', _prev: ActionState | undefined, _form: FormData): Promise<ActionState> {
  const r = await attempt(() => apiFetch(`/calibration-sessions/${sessionId}/${action}`, { method: 'POST' }), action === 'lock' ? 'Sessione bloccata: i rating sono definitivi' : 'Sessione riaperta');
  revalidatePath(`/reviews/calibration/${sessionId}`);
  revalidatePath('/reviews');
  return r;
}

// ---- avviamento guidato (AVV) ----
export async function setGuideStep(key: string, done: boolean, _prev: ActionState | undefined, _form: FormData): Promise<ActionState> {
  const r = await attempt(() => apiFetch(`/guides/me/steps/${key}`, { method: 'POST', body: JSON.stringify({ done }) }), done ? 'Segnato come fatto' : 'Riaperto');
  revalidatePath('/inizia');
  revalidatePath('/dashboard');
  return r;
}
export async function dismissGuide(dismissed: boolean) {
  await apiFetch('/guides/me/dismiss', { method: 'POST', body: JSON.stringify({ dismissed }) });
  revalidatePath('/inizia');
  revalidatePath('/dashboard');
}
export async function createCompanyValue(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const r = await attempt(() => apiFetch('/company-values', { method: 'POST', body: JSON.stringify({ name: str(form.get('name')), description: str(form.get('description')) || undefined, icon: str(form.get('icon')) || undefined }) }), 'Valore aggiunto');
  revalidatePath('/feedback');
  revalidatePath('/inizia');
  return r;
}

export async function createOrgUnit(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const r = await attempt(() => apiFetch('/org-units', { method: 'POST', body: JSON.stringify({ name: str(form.get('name')), code: str(form.get('code')) || undefined, parentId: str(form.get('parentId')) || null }) }), 'Unità creata');
  revalidatePath('/people');
  revalidatePath('/inizia');
  return r;
}

// ---- personalizzazione del tenant (sprint 26) ----
/** Moduli attivi (CORE-004): ogni checkbox presente nel form vale «attivo», le assenti «spento». */
export async function saveModules(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const { TenantModules } = await import('@wb/shared');
  const on = new Set(form.getAll('modules').map(String));
  const modules = Object.fromEntries(TenantModules.map((m) => [m, on.has(m)]));
  const r = await attempt(() => apiFetch('/tenant/modules', { method: 'PUT', body: JSON.stringify({ modules }) }), 'Moduli aggiornati');
  revalidatePath('/', 'layout');
  return r;
}
/** Glossario aziendale (CORE-003): singolare e plurale per concetto; vuoti = default della piattaforma. */
export async function saveNaming(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const { NamingConcepts } = await import('@wb/shared');
  const overrides = Object.fromEntries(NamingConcepts.map((c) => [c, { singular: str(form.get(`${c}.singular`)), plural: str(form.get(`${c}.plural`)) }]));
  const locale = str(form.get('locale')) || undefined;
  const r = await attempt(() => apiFetch('/naming', { method: 'PUT', body: JSON.stringify({ locale, overrides }) }), 'Glossario aggiornato');
  revalidatePath('/', 'layout');
  return r;
}
function personFieldPayload(form: FormData) {
  const type = str(form.get('type')) || 'text';
  const options = str(form.get('options')).split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const [v, ...rest] = l.split('='); return { value: v!.trim(), label: (rest.join('=') || v!).trim() }; });
  return { label: str(form.get('label')), type, options: type === 'single_choice' ? options : [], section: str(form.get('section')) || null, help: str(form.get('help')) || null, required: form.get('required') === 'on', visibility: str(form.get('visibility')) || 'hr' };
}
/** Catalogo campi persona (CORE-011). */
export async function createPersonField(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const key = str(form.get('key')).trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (!key) return { error: 'Indica una chiave (es. contract_type)' };
  const r = await attempt(() => apiFetch('/person-fields', { method: 'POST', body: JSON.stringify({ key, ...personFieldPayload(form) }) }), 'Campo creato');
  revalidatePath('/settings/person-fields');
  return r;
}
export async function updatePersonField(id: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const r = await attempt(() => apiFetch(`/person-fields/${id}`, { method: 'PATCH', body: JSON.stringify(personFieldPayload(form)) }), 'Campo aggiornato');
  revalidatePath('/settings/person-fields');
  return r;
}
export async function setPersonFieldArchived(id: string, archived: boolean) {
  await apiFetch(`/person-fields/${id}`, { method: 'PATCH', body: JSON.stringify({ archived }) });
  revalidatePath('/settings/person-fields');
}
/** Valori dei campi custom sulla scheda persona: chiavi vuote vengono azzerate. */
export async function savePersonCustomFields(personId: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const customFields: Record<string, unknown> = {};
  for (const k of form.getAll('keys').map(String)) {
    const v = form.get(`cf.${k}`);
    if (form.get(`type.${k}`) === 'boolean') customFields[k] = v === 'true' ? true : v === 'false' ? false : null;
    else customFields[k] = v == null || String(v).trim() === '' ? null : String(v).trim();
  }
  const r = await attempt(() => apiFetch(`/people/${personId}`, { method: 'PATCH', body: JSON.stringify({ customFields }) }), 'Scheda aggiornata');
  revalidatePath(`/people/${personId}`);
  return r;
}

// ---- ruoli e permessi (CORE-041/043) ----
export async function saveRolePermissions(key: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const permissions = form.getAll('permissions').map(String);
  const body: Record<string, unknown> = { permissions };
  if (form.has('name')) body.name = str(form.get('name'));
  if (form.has('description')) body.description = str(form.get('description')) || null;
  if (form.has('baseRole')) body.baseRole = str(form.get('baseRole'));
  const r = await attempt(() => apiFetch(`/roles/${key}`, { method: 'PATCH', body: JSON.stringify(body) }), 'Ruolo aggiornato');
  revalidatePath('/settings/roles');
  return r;
}
export async function createRole(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const key = str(form.get('key')).toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (!key) return { error: 'Indica una chiave (es. people_ops)' };
  const body = { key, name: str(form.get('name')), description: str(form.get('description')) || null, baseRole: str(form.get('baseRole')) || 'employee', permissions: form.getAll('permissions').map(String) };
  const r = await attempt(() => apiFetch('/roles', { method: 'POST', body: JSON.stringify(body) }), 'Ruolo creato');
  if (r.ok) { revalidatePath('/settings/roles'); redirect(`/settings/roles?role=${key}`); }
  return r;
}
export async function resetRole(key: string) {
  await apiFetch(`/roles/${key}/reset`, { method: 'POST' });
  revalidatePath('/settings/roles');
}
export async function setRoleArchived(key: string, archived: boolean, _prev: ActionState | undefined): Promise<ActionState> {
  const r = await attempt(() => apiFetch(`/roles/${key}`, { method: 'PATCH', body: JSON.stringify({ archived }) }), archived ? 'Ruolo archiviato' : 'Ruolo riattivato');
  revalidatePath('/settings/roles');
  return r;
}
