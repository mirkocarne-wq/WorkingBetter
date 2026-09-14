/**
 * Client minimi dei provider (ADR-0012): OAuth authorization code (PKCE), refresh, eventi calendario Google/Microsoft,
 * messaggi Slack e webhook Teams. Solo `fetch` (iniettabile nei test), nessun SDK.
 */
export type OAuthProvider = 'google' | 'microsoft' | 'slack';
export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

export interface ProviderEndpoints { authorize: string; token: string; api: string }
export const DefaultEndpoints: Record<OAuthProvider, ProviderEndpoints> = {
  google: { authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', api: 'https://www.googleapis.com/calendar/v3' },
  microsoft: { authorize: 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize', token: 'https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token', api: 'https://graph.microsoft.com/v1.0' },
  slack: { authorize: 'https://slack.com/oauth/v2/authorize', token: 'https://slack.com/api/oauth.v2.access', api: 'https://slack.com/api' },
};
export const ProviderScopes: Record<OAuthProvider, string> = {
  google: 'openid email https://www.googleapis.com/auth/calendar.events',
  microsoft: 'openid email offline_access User.Read Calendars.ReadWrite',
  slack: 'chat:write,chat:write.public,im:write,users:read,users:read.email',
};
export const ProviderLabels: Record<OAuthProvider | 'teams', string> = { google: 'Google Calendar', microsoft: 'Microsoft 365', slack: 'Slack', teams: 'Microsoft Teams' };

export interface ProviderConfig { enabled?: boolean; clientId?: string | null; clientSecretEnc?: string | null }
export interface IntegrationSettings {
  google?: ProviderConfig;
  microsoft?: ProviderConfig & { tenant?: string | null };
  slack?: ProviderConfig & { recognitionsChannel?: string | null };
  teams?: { enabled?: boolean; webhookUrl?: string | null; postRecognitions?: boolean };
  /** sovrascrittura degli endpoint (proxy aziendali, test) */
  endpoints?: Partial<Record<OAuthProvider, Partial<ProviderEndpoints>>>;
}
export function integrationSettingsOf(settings: unknown): IntegrationSettings {
  const s = (settings as { integrations?: IntegrationSettings } | null)?.integrations;
  return s && typeof s === 'object' ? s : {};
}
export function endpointsFor(settings: IntegrationSettings, provider: OAuthProvider): ProviderEndpoints {
  const base = { ...DefaultEndpoints[provider], ...(settings.endpoints?.[provider] ?? {}) };
  const tenant = provider === 'microsoft' ? (settings.microsoft?.tenant || 'common') : '';
  return { authorize: base.authorize.replace('{tenant}', tenant), token: base.token.replace('{tenant}', tenant), api: base.api.replace(/\/$/, '') };
}

export function authorizeUrl(provider: OAuthProvider, endpoints: ProviderEndpoints, p: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const url = new URL(endpoints.authorize);
  url.searchParams.set('client_id', p.clientId);
  url.searchParams.set('redirect_uri', p.redirectUri);
  url.searchParams.set('state', p.state);
  if (provider === 'slack') {
    url.searchParams.set('scope', ProviderScopes.slack);
  } else {
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', ProviderScopes[provider]);
    url.searchParams.set('code_challenge', p.challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    if (provider === 'google') { url.searchParams.set('access_type', 'offline'); url.searchParams.set('prompt', 'consent'); }
  }
  return url.toString();
}

export interface TokenSet { accessToken: string; refreshToken: string | null; expiresAt: Date | null; scope: string | null; raw: Record<string, unknown> }
const asTokenSet = (raw: Record<string, unknown>, now: Date): TokenSet => ({
  accessToken: String(raw.access_token ?? ''),
  refreshToken: typeof raw.refresh_token === 'string' ? raw.refresh_token : null,
  expiresAt: typeof raw.expires_in === 'number' ? new Date(now.getTime() + raw.expires_in * 1000) : null,
  scope: typeof raw.scope === 'string' ? raw.scope : null,
  raw,
});

export class ProviderError extends Error {
  constructor(message: string, readonly status: number, readonly body?: string) { super(message); }
  /** token non più valido: l'account va ricollegato */
  get unauthorized() { return this.status === 401 || this.status === 403 || this.status === 400 && /invalid_grant|invalid_auth|token_revoked|account_inactive/.test(this.body ?? ''); }
}

async function postForm(fetchImpl: FetchLike, url: string, form: Record<string, string>, now: Date): Promise<TokenSet> {
  const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams(form).toString(), signal: AbortSignal.timeout(10000) });
  const text = await res.text();
  let raw: Record<string, unknown> = {};
  try { raw = JSON.parse(text) as Record<string, unknown>; } catch { /* non JSON */ }
  if (!res.ok || raw.ok === false || (!raw.access_token && !raw.error)) throw new ProviderError(`Token endpoint ${res.status}: ${String(raw.error_description ?? raw.error ?? text).slice(0, 200)}`, res.ok ? 400 : res.status, text);
  if (raw.error) throw new ProviderError(`Token endpoint: ${String(raw.error_description ?? raw.error)}`, 400, text);
  return asTokenSet(raw, now);
}

export function exchangeCode(fetchImpl: FetchLike, endpoints: ProviderEndpoints, p: { clientId: string; clientSecret: string | null; code: string; redirectUri: string; verifier: string | null }, now = new Date()) {
  const form: Record<string, string> = { grant_type: 'authorization_code', code: p.code, redirect_uri: p.redirectUri, client_id: p.clientId };
  if (p.clientSecret) form.client_secret = p.clientSecret;
  if (p.verifier) form.code_verifier = p.verifier;
  return postForm(fetchImpl, endpoints.token, form, now);
}
export function refreshAccessToken(fetchImpl: FetchLike, endpoints: ProviderEndpoints, p: { clientId: string; clientSecret: string | null; refreshToken: string; scope?: string | null }, now = new Date()) {
  const form: Record<string, string> = { grant_type: 'refresh_token', refresh_token: p.refreshToken, client_id: p.clientId };
  if (p.clientSecret) form.client_secret = p.clientSecret;
  if (p.scope) form.scope = p.scope;
  return postForm(fetchImpl, endpoints.token, form, now);
}

async function apiCall<T>(fetchImpl: FetchLike, url: string, token: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetchImpl(url, { method: init.method ?? 'GET', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' }, body: init.body === undefined ? undefined : JSON.stringify(init.body), signal: AbortSignal.timeout(10000) });
  const text = await res.text();
  if (!res.ok) throw new ProviderError(`${init.method ?? 'GET'} ${url} → ${res.status}`, res.status, text.slice(0, 500));
  if (!text) return {} as T;
  try { return JSON.parse(text) as T; } catch { return {} as T; }
}

/** Identità dell'account collegato (email/nome) per mostrarla in Impostazioni. */
export async function fetchIdentity(fetchImpl: FetchLike, provider: OAuthProvider, endpoints: ProviderEndpoints, token: string, tokens: TokenSet): Promise<{ externalId: string; displayName: string }> {
  if (provider === 'slack') {
    const team = tokens.raw.team as { id?: string; name?: string } | undefined;
    return { externalId: team?.id ?? 'slack', displayName: team?.name ?? 'Slack' };
  }
  if (provider === 'google') {
    const userinfo = endpoints.api.includes('googleapis.com') ? 'https://openidconnect.googleapis.com/v1/userinfo' : `${endpoints.api}/userinfo`;
    const info = await apiCall<{ email?: string; name?: string }>(fetchImpl, userinfo, token).catch((): { email?: string; name?: string } => ({}));
    return { externalId: info.email ?? 'google', displayName: info.email ?? info.name ?? 'Google' };
  }
  const me = await apiCall<{ id?: string; mail?: string; userPrincipalName?: string; displayName?: string }>(fetchImpl, `${endpoints.api}/me`, token).catch((): { id?: string; mail?: string; userPrincipalName?: string; displayName?: string } => ({}));
  return { externalId: me.mail ?? me.userPrincipalName ?? me.id ?? 'microsoft', displayName: me.mail ?? me.userPrincipalName ?? me.displayName ?? 'Microsoft 365' };
}

// ---------- calendario (INT-020/021) ----------

export interface MeetingEventInput {
  uid: string;
  title: string;
  description: string;
  start: Date;
  durationMin: number;
  timeZone: string;
  attendees: { email: string; name: string }[];
  /** link già scelto per la relazione (INT-025): niente Meet/Teams generato */
  location?: string | null;
}
const iso = (d: Date) => d.toISOString();
const noZ = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, '');

export function googleEventBody(e: MeetingEventInput) {
  const end = new Date(e.start.getTime() + e.durationMin * 60000);
  return {
    summary: e.title,
    description: e.description,
    location: e.location ?? undefined,
    start: { dateTime: iso(e.start), timeZone: e.timeZone },
    end: { dateTime: iso(end), timeZone: e.timeZone },
    attendees: e.attendees.map((a) => ({ email: a.email, displayName: a.name })),
    reminders: { useDefault: true },
    ...(e.location ? {} : { conferenceData: { createRequest: { requestId: e.uid, conferenceSolutionKey: { type: 'hangoutsMeet' } } } }),
  };
}
export function microsoftEventBody(e: MeetingEventInput) {
  const end = new Date(e.start.getTime() + e.durationMin * 60000);
  return {
    subject: e.title,
    body: { contentType: 'text', content: e.description },
    location: e.location ? { displayName: e.location } : undefined,
    start: { dateTime: noZ(e.start), timeZone: 'UTC' },
    end: { dateTime: noZ(end), timeZone: 'UTC' },
    attendees: e.attendees.map((a) => ({ emailAddress: { address: a.email, name: a.name }, type: 'required' })),
    transactionId: e.uid,
    ...(e.location ? {} : { isOnlineMeeting: true, onlineMeetingProvider: 'teamsForBusiness' }),
  };
}

export interface CalendarEventResult { id: string; joinUrl: string | null; htmlLink: string | null }
export async function upsertCalendarEvent(fetchImpl: FetchLike, provider: 'google' | 'microsoft', endpoints: ProviderEndpoints, token: string, e: MeetingEventInput, externalEventId: string | null): Promise<CalendarEventResult> {
  if (provider === 'google') {
    const base = `${endpoints.api}/calendars/primary/events`;
    const url = externalEventId ? `${base}/${encodeURIComponent(externalEventId)}?conferenceDataVersion=1&sendUpdates=all` : `${base}?conferenceDataVersion=1&sendUpdates=all`;
    const r = await apiCall<{ id: string; hangoutLink?: string; htmlLink?: string }>(fetchImpl, url, token, { method: externalEventId ? 'PATCH' : 'POST', body: googleEventBody(e) });
    return { id: r.id ?? externalEventId ?? '', joinUrl: r.hangoutLink ?? null, htmlLink: r.htmlLink ?? null };
  }
  const base = `${endpoints.api}/me/events`;
  const r = await apiCall<{ id: string; webLink?: string; onlineMeeting?: { joinUrl?: string } }>(fetchImpl, externalEventId ? `${base}/${encodeURIComponent(externalEventId)}` : base, token, { method: externalEventId ? 'PATCH' : 'POST', body: microsoftEventBody(e) });
  return { id: r.id ?? externalEventId ?? '', joinUrl: r.onlineMeeting?.joinUrl ?? null, htmlLink: r.webLink ?? null };
}
export async function deleteCalendarEvent(fetchImpl: FetchLike, provider: 'google' | 'microsoft', endpoints: ProviderEndpoints, token: string, externalEventId: string): Promise<void> {
  const url = provider === 'google' ? `${endpoints.api}/calendars/primary/events/${encodeURIComponent(externalEventId)}?sendUpdates=all` : `${endpoints.api}/me/events/${encodeURIComponent(externalEventId)}`;
  try { await apiCall(fetchImpl, url, token, { method: 'DELETE' }); } catch (e) { if (!(e instanceof ProviderError && (e.status === 404 || e.status === 410))) throw e; }
}

// ---------- chat (INT-010/012/014) ----------

async function slackCall<T extends { ok: boolean; error?: string }>(fetchImpl: FetchLike, endpoints: ProviderEndpoints, token: string, method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetchImpl(`${endpoints.api}/${method}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  const text = await res.text();
  let data: T;
  try { data = JSON.parse(text) as T; } catch { throw new ProviderError(`Slack ${method}: risposta non valida (${res.status})`, res.status, text.slice(0, 300)); }
  if (!res.ok || !data.ok) throw new ProviderError(`Slack ${method}: ${data.error ?? res.status}`, res.ok ? 400 : res.status, text.slice(0, 300));
  return data;
}
export async function slackLookupUserByEmail(fetchImpl: FetchLike, endpoints: ProviderEndpoints, token: string, email: string): Promise<{ id: string; name: string } | null> {
  try {
    const r = await slackCall<{ ok: boolean; user?: { id: string; real_name?: string; name?: string } }>(fetchImpl, endpoints, token, 'users.lookupByEmail', { email });
    return r.user ? { id: r.user.id, name: r.user.real_name ?? r.user.name ?? email } : null;
  } catch (e) {
    if (e instanceof ProviderError && /users_not_found/.test(e.body ?? '')) return null;
    throw e;
  }
}
export async function slackPostMessage(fetchImpl: FetchLike, endpoints: ProviderEndpoints, token: string, channel: string, text: string, blocks?: unknown[]): Promise<{ ts: string | null }> {
  const r = await slackCall<{ ok: boolean; ts?: string }>(fetchImpl, endpoints, token, 'chat.postMessage', { channel, text, ...(blocks ? { blocks } : {}), unfurl_links: false });
  return { ts: r.ts ?? null };
}
export async function teamsWebhookPost(fetchImpl: FetchLike, webhookUrl: string, text: string, title?: string): Promise<void> {
  const card = { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: { $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', type: 'AdaptiveCard', version: '1.4', body: [...(title ? [{ type: 'TextBlock', text: title, weight: 'Bolder', size: 'Medium', wrap: true }] : []), { type: 'TextBlock', text, wrap: true }] } }] };
  const res = await fetchImpl(webhookUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(card), signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new ProviderError(`Teams webhook → ${res.status}`, res.status, (await res.text()).slice(0, 300));
}
