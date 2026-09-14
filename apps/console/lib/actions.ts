'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { TOKEN_COOKIE, apiFetch, errorMessage, publicFetch } from './api';

export type ActionState = { error?: string; ok?: boolean; message?: string; link?: string; expiresAt?: string };
const str = (v: FormDataEntryValue | null) => (v == null ? '' : String(v).trim());
const SECURE = (process.env.CONSOLE_PUBLIC_URL ?? '').startsWith('https://');
async function attempt(fn: () => Promise<Partial<ActionState> | void>, ok = 'Fatto'): Promise<ActionState> {
  try {
    const extra = (await fn()) ?? {};
    return { ok: true, message: ok, ...extra };
  } catch (e) {
    return { error: errorMessage(e) };
  }
}

export async function login(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  let r: { accessToken: string; expiresIn: number; mustChangePassword: boolean };
  try {
    r = await publicFetch('/platform/auth/login', { method: 'POST', body: JSON.stringify({ email: str(form.get('email')), password: str(form.get('password')) }) });
  } catch (e) {
    return { error: errorMessage(e, 'Accesso non riuscito') };
  }
  (await cookies()).set(TOKEN_COOKIE, r.accessToken, { httpOnly: true, sameSite: 'strict', path: '/', maxAge: r.expiresIn, secure: SECURE });
  redirect(r.mustChangePassword ? '/account?first=1' : '/');
}
export async function logout() {
  (await cookies()).delete(TOKEN_COOKIE);
  redirect('/login');
}
export async function changePassword(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  if (str(form.get('newPassword')) !== str(form.get('confirm'))) return { error: 'Le due password non coincidono' };
  let r: { accessToken: string; expiresIn: number };
  try {
    r = await apiFetch('/platform/auth/password', { method: 'POST', body: JSON.stringify({ currentPassword: str(form.get('currentPassword')), newPassword: str(form.get('newPassword')) }) });
  } catch (e) {
    return { error: errorMessage(e) };
  }
  (await cookies()).set(TOKEN_COOKIE, r.accessToken, { httpOnly: true, sameSite: 'strict', path: '/', maxAge: r.expiresIn, secure: SECURE });
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Password aggiornata: le altre sessioni sono state chiuse' };
}

export async function createTenant(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  return attempt(async () => {
    const r = await apiFetch<{ id: string; invite: { url: string; expiresAt: string; email: string } }>('/platform/tenants', { method: 'POST', body: JSON.stringify({ name: str(form.get('name')), slug: str(form.get('slug')).toLowerCase(), timezone: str(form.get('timezone')) || 'Europe/Rome', defaultLocale: str(form.get('defaultLocale')) || 'it', admin: { email: str(form.get('adminEmail')), firstName: str(form.get('adminFirstName')), lastName: str(form.get('adminLastName')) } }) });
    revalidatePath('/tenants');
    return { message: `Tenant creato. Invito inviato a ${r.invite.email}`, link: `/tenants/${r.id}`, expiresAt: r.invite.expiresAt, inviteUrl: r.invite.url } as ActionState & { inviteUrl: string };
  }, 'Tenant creato');
}
export async function updateTenant(id: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const body: Record<string, string> = {};
  for (const k of ['name', 'timezone', 'defaultLocale', 'status']) { const v = str(form.get(k)); if (v) body[k] = v; }
  const r = await attempt(() => apiFetch(`/platform/tenants/${id}`, { method: 'PATCH', body: JSON.stringify(body) }), body.status === 'suspended' ? 'Tenant sospeso: accessi bloccati' : body.status === 'active' ? 'Tenant riattivato' : 'Salvato');
  revalidatePath(`/tenants/${id}`);
  revalidatePath('/tenants');
  return r;
}
export async function inviteAdmin(id: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const r = await attempt(async () => {
    const x = await apiFetch<{ url: string; expiresAt: string; email: string }>(`/platform/tenants/${id}/admins`, { method: 'POST', body: JSON.stringify({ email: str(form.get('email')), firstName: str(form.get('firstName')), lastName: str(form.get('lastName')) }) });
    return { message: `Invito inviato a ${x.email}`, link: x.url, expiresAt: x.expiresAt };
  });
  revalidatePath(`/tenants/${id}`);
  return r;
}
export async function userAction(userId: string, _prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const action = str(form.get('action'));
  const r = await attempt(async () => {
    const x = await apiFetch<{ link?: string; expiresAt?: string }>(`/platform/users/${userId}/actions`, { method: 'POST', body: JSON.stringify({ action }) });
    return { message: action === 'reset_password' ? 'Email di reset accodata; account sbloccato e sessioni revocate' : 'Eseguito', link: x.link, expiresAt: x.expiresAt };
  });
  revalidatePath('/users');
  return r;
}
export async function createOperator(_prev: ActionState | undefined, form: FormData): Promise<ActionState> {
  const r = await attempt(() => apiFetch('/platform/operators', { method: 'POST', body: JSON.stringify({ email: str(form.get('email')), firstName: str(form.get('firstName')), lastName: str(form.get('lastName')), password: str(form.get('password')) }) }), 'Operatore creato: dovrà cambiare la password al primo accesso');
  revalidatePath('/operators');
  return r;
}
export async function operatorState(id: string, disabled: boolean) {
  await apiFetch(`/platform/operators/${id}`, { method: 'PATCH', body: JSON.stringify({ disabled }) });
  revalidatePath('/operators');
}
