'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { API_URL, TOKEN_COOKIE, apiFetch } from './api';

export async function devLogin(_prev: { error?: string } | undefined, form: FormData): Promise<{ error?: string }> {
  const tenantSlug = String(form.get('tenantSlug') ?? '');
  const email = String(form.get('email') ?? '');
  const res = await fetch(`${API_URL}/api/v1/auth/dev-login`, {
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
