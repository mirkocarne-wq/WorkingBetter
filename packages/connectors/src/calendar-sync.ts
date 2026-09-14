import { and, eq, inArray, lt, lte } from 'drizzle-orm';
import { calendarEventLinks, connectorAccounts, meetings, oneOnOneRelations, persons, tenants, withPlatform, withTenant, type AnyDb, type TenantTx } from '@wb/db';
import type { TenantCipher } from './cipher.js';
import { ProviderError, deleteCalendarEvent, endpointsFor, integrationSettingsOf, refreshAccessToken, upsertCalendarEvent, type FetchLike, type MeetingEventInput, type OAuthProvider } from './providers.js';

export interface ConnectorDeps { cipher: TenantCipher; fetch: FetchLike; now?: Date; appBaseUrl?: string }
export const backoffMinutes = (attempts: number) => Math.min(60, 2 ** attempts);
type AccountRow = typeof connectorAccounts.$inferSelect;

/** Token valido per l'account: rinfresca se scade entro un minuto e salva i nuovi token; 401/invalid_grant → account in errore. */
export async function accessTokenFor(t: TenantTx, deps: ConnectorDeps, account: AccountRow, settings: ReturnType<typeof integrationSettingsOf>): Promise<string> {
  const now = deps.now ?? new Date();
  const provider = account.provider as OAuthProvider;
  if (!account.accessTokenEnc) throw new ProviderError('Account senza token', 401);
  const fresh = !account.expiresAt || account.expiresAt.getTime() - now.getTime() > 60000;
  if (fresh) return deps.cipher.decrypt(account.tenantId, account.accessTokenEnc);
  if (!account.refreshTokenEnc) throw new ProviderError('Token scaduto e nessun refresh token: ricollega l’account', 401);
  const cfg = settings[provider] ?? {};
  const tokens = await refreshAccessToken(deps.fetch, endpointsFor(settings, provider), { clientId: cfg.clientId ?? '', clientSecret: cfg.clientSecretEnc ? deps.cipher.decrypt(account.tenantId, cfg.clientSecretEnc) : null, refreshToken: deps.cipher.decrypt(account.tenantId, account.refreshTokenEnc), scope: provider === 'microsoft' ? account.scopes : null }, now);
  await t.update(connectorAccounts).set({ accessTokenEnc: deps.cipher.encrypt(account.tenantId, tokens.accessToken), refreshTokenEnc: tokens.refreshToken ? deps.cipher.encrypt(account.tenantId, tokens.refreshToken) : account.refreshTokenEnc, expiresAt: tokens.expiresAt, status: 'active', lastError: null, updatedAt: now }).where(eq(connectorAccounts.id, account.id));
  return tokens.accessToken;
}

/** Sincronizza le righe in coda: crea/aggiorna/cancella l'evento del 1:1 nel calendario esterno del partecipante (INT-020/021). */
export async function syncCalendarLinks(db: AnyDb, deps: ConnectorDeps, batch = 50): Promise<{ synced: number; deleted: number; failed: number; retried: number }> {
  const now = deps.now ?? new Date();
  const out = { synced: 0, deleted: 0, failed: 0, retried: 0 };
  const rows = await withPlatform(db, (t) => t.select().from(calendarEventLinks).where(and(eq(calendarEventLinks.status, 'pending'), lte(calendarEventLinks.nextAttemptAt, now), lt(calendarEventLinks.attempts, 5))).orderBy(calendarEventLinks.createdAt).limit(batch));
  const settingsCache = new Map<string, { tz: string; settings: ReturnType<typeof integrationSettingsOf> }>();
  for (const link of rows) {
    const attempts = link.attempts + 1;
    try {
      let tcfg = settingsCache.get(link.tenantId);
      if (!tcfg) {
        const [tenant] = await withPlatform(db, (t) => t.select({ tz: tenants.timezone, settings: tenants.settings }).from(tenants).where(eq(tenants.id, link.tenantId)));
        tcfg = { tz: tenant?.tz ?? 'Europe/Rome', settings: integrationSettingsOf(tenant?.settings) };
        settingsCache.set(link.tenantId, tcfg);
      }
      const result = await withTenant(db, link.tenantId, async (t) => {
        const [account] = await t.select().from(connectorAccounts).where(eq(connectorAccounts.id, link.accountId));
        if (!account || account.status === 'revoked') return { skip: 'account scollegato' };
        const provider = account.provider as 'google' | 'microsoft';
        const token = await accessTokenFor(t, deps, account, tcfg!.settings);
        const endpoints = endpointsFor(tcfg!.settings, provider);
        if (link.op === 'delete') {
          if (link.externalEventId) await deleteCalendarEvent(deps.fetch, provider, endpoints, token, link.externalEventId);
          return { deleted: true };
        }
        const [m] = await t.select().from(meetings).where(eq(meetings.id, link.meetingId));
        if (!m) return { skip: 'incontro inesistente' };
        const [r] = await t.select().from(oneOnOneRelations).where(eq(oneOnOneRelations.id, m.relationId));
        if (!r) return { skip: 'relazione inesistente' };
        const people = await t.select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName, email: persons.email }).from(persons).where(inArray(persons.id, [r.personAId, r.personBId]));
        const names = people.map((p) => `${p.firstName} ${p.lastName}`);
        const base = (deps.appBaseUrl ?? '').replace(/\/$/, '');
        const event: MeetingEventInput = {
          uid: `wb-${m.id}`,
          title: `1:1 ${names.join(' · ')}`,
          description: `Incontro 1:1 pianificato in WorkingBetter.${base ? ` Agenda e note: ${base}/one-on-ones/${r.id}?meeting=${m.id}` : ''}`,
          start: m.scheduledAt,
          durationMin: m.durationMin,
          timeZone: tcfg!.tz,
          attendees: people.filter((p) => !!p.email).map((p) => ({ email: p.email!, name: `${p.firstName} ${p.lastName}` })),
          location: r.meetingUrl ?? null,
        };
        const res = await upsertCalendarEvent(deps.fetch, provider, endpoints, token, event, link.externalEventId);
        await t.update(connectorAccounts).set({ lastUsedAt: now, updatedAt: now }).where(eq(connectorAccounts.id, account.id));
        return { synced: res };
      });
      if ('skip' in result) {
        await withPlatform(db, (t) => t.update(calendarEventLinks).set({ status: 'failed', attempts, lastError: result.skip, updatedAt: now }).where(eq(calendarEventLinks.id, link.id)));
        out.failed++;
      } else if ('deleted' in result) {
        await withPlatform(db, (t) => t.update(calendarEventLinks).set({ status: 'deleted', attempts, lastError: null, syncedAt: now, updatedAt: now }).where(eq(calendarEventLinks.id, link.id)));
        out.deleted++;
      } else {
        await withPlatform(db, (t) => t.update(calendarEventLinks).set({ status: 'synced', attempts, externalEventId: result.synced.id, joinUrl: result.synced.joinUrl, htmlLink: result.synced.htmlLink, lastError: null, syncedAt: now, updatedAt: now }).where(eq(calendarEventLinks.id, link.id)));
        out.synced++;
      }
    } catch (e) {
      const err = e as Error;
      const unauthorized = e instanceof ProviderError && e.unauthorized;
      const final = unauthorized || attempts >= 5;
      await withPlatform(db, (t) => t.update(calendarEventLinks).set({ status: final ? 'failed' : 'pending', attempts, lastError: err.message.slice(0, 500), nextAttemptAt: new Date(now.getTime() + backoffMinutes(attempts) * 60000), updatedAt: now }).where(eq(calendarEventLinks.id, link.id)));
      if (unauthorized) await withPlatform(db, (t) => t.update(connectorAccounts).set({ status: 'error', lastError: err.message.slice(0, 500), updatedAt: now }).where(eq(connectorAccounts.id, link.accountId)));
      if (final) out.failed++; else out.retried++;
    }
  }
  return out;
}
