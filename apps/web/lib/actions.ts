'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { API_SERVER_URL, TOKEN_COOKIE, apiFetch } from './api';

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
  (await cookies()).set(TOKEN_COOKIE, accessToken, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: expiresIn });
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
