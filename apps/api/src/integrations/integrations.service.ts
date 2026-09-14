import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { calendarEventLinks, chatOutbox, connectorAccounts, meetings, oneOnOneRelations, tenants, users, withTenant, type AnyDb } from '@wb/db';
import { ErrorCodes, Permissions, hasPermission } from '@wb/shared';
import { ProviderLabels, ProviderScopes, TenantCipher, authorizeUrl, endpointsFor, exchangeCode, fetchIdentity, integrationSettingsOf, type IntegrationSettings, type OAuthProvider } from '@wb/connectors';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service.js';
import { TokenService } from '../auth/token.service.js';
import { principal, tx } from '../common/context.js';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors.js';
import { CONFIG, type AppConfig } from '../config.js';
import { DB, DB_APP_ROLE } from '../db/db.module.js';
import type { updateIntegrationsDto } from './dto.js';

interface ConnectState extends Record<string, unknown> { t: string; u: string; p: OAuthProvider; v: string }
type AccountRow = typeof connectorAccounts.$inferSelect;
const CALENDAR: OAuthProvider[] = ['google', 'microsoft'];

/**
 * Connettori esterni (ADR-0012): configurazione per tenant (app OAuth con segreti cifrati, webhook Teams), collegamento
 * personale dei calendari, installazione Slack di workspace, code verso il worker (eventi 1:1, messaggi chat).
 */
@Injectable()
export class IntegrationsService {
  private readonly cipher: TenantCipher;
  constructor(
    @Inject(DB) private readonly db: AnyDb,
    @Inject(DB_APP_ROLE) private readonly appRole: string | null,
    @Inject(CONFIG) private readonly cfg: AppConfig,
    private readonly audit: AuditService,
    private readonly tokens: TokenService,
  ) {
    this.cipher = new TenantCipher(cfg.NOTES_MASTER_KEY);
  }

  redirectUri(provider: OAuthProvider) {
    return `${this.cfg.API_PUBLIC_URL ?? 'http://localhost:4000'}/api/v1/integrations/callback/${provider}`;
  }
  private async tenantRow() {
    const [t] = await tx().select().from(tenants).where(eq(tenants.id, principal().tenantId));
    if (!t) throw notFound('Tenant');
    return t;
  }
  private available(s: IntegrationSettings, provider: OAuthProvider) {
    const c = s[provider];
    return !!c?.enabled && !!c.clientId;
  }
  private accountView(a: AccountRow | undefined) {
    return a ? { id: a.id, provider: a.provider, externalId: a.externalId, displayName: a.displayName, status: a.status, lastError: a.lastError, connectedAt: a.createdAt, lastUsedAt: a.lastUsedAt } : null;
  }

  /** Stato per l'utente: provider disponibili nel tenant, i miei collegamenti, Slack installato. */
  async overview() {
    const p = principal();
    const t = await this.tenantRow();
    const s = integrationSettingsOf(t.settings);
    const rows = await tx().select().from(connectorAccounts).where(inArray(connectorAccounts.provider, ['google', 'microsoft', 'slack', 'slack_user']));
    const mine = (prov: string) => rows.find((r) => r.provider === prov && r.userId === p.userId);
    const slack = rows.find((r) => r.provider === 'slack' && !r.userId);
    return {
      cipherEnabled: this.cipher.enabled,
      providers: {
        google: { label: ProviderLabels.google, available: this.available(s, 'google') },
        microsoft: { label: ProviderLabels.microsoft, available: this.available(s, 'microsoft') },
        slack: { label: ProviderLabels.slack, available: this.available(s, 'slack'), installed: slack ? { teamName: slack.displayName, status: slack.status, at: slack.createdAt } : null },
        teams: { label: ProviderLabels.teams, enabled: !!s.teams?.enabled && !!s.teams.webhookUrl },
      },
      mine: { google: this.accountView(mine('google')), microsoft: this.accountView(mine('microsoft')), slackUser: this.accountView(mine('slack_user')) },
      chatEnabled: !!slack && slack.status === 'active',
    };
  }

  /** Configurazione per l'amministratore: segreti mai restituiti, solo la presenza. */
  async config() {
    const t = await this.tenantRow();
    const s = integrationSettingsOf(t.settings);
    const [slack] = await tx().select().from(connectorAccounts).where(and(eq(connectorAccounts.provider, 'slack'), isNull(connectorAccounts.userId)));
    const view = (prov: OAuthProvider) => ({ enabled: !!s[prov]?.enabled, clientId: s[prov]?.clientId ?? '', hasClientSecret: !!s[prov]?.clientSecretEnc, redirectUri: this.redirectUri(prov), scopes: ProviderScopes[prov] });
    return {
      cipherEnabled: this.cipher.enabled,
      google: view('google'),
      microsoft: { ...view('microsoft'), tenant: s.microsoft?.tenant ?? 'common' },
      slack: { ...view('slack'), recognitionsChannel: s.slack?.recognitionsChannel ?? '', installed: slack ? { teamName: slack.displayName, teamId: slack.externalId, status: slack.status, lastError: slack.lastError, at: slack.createdAt } : null },
      teams: { enabled: !!s.teams?.enabled, hasWebhook: !!s.teams?.webhookUrl, postRecognitions: !!s.teams?.postRecognitions },
      endpoints: s.endpoints ?? {},
    };
  }

  async updateConfig(dto: z.infer<typeof updateIntegrationsDto>) {
    const p = principal();
    const t = await this.tenantRow();
    const s: IntegrationSettings = { ...integrationSettingsOf(t.settings) };
    const secretOf = (current: string | null | undefined, incoming: string | undefined) => {
      if (incoming === undefined) return current ?? null;
      if (incoming === '') return null;
      if (!this.cipher.enabled) throw unprocessable(ErrorCodes.VALIDATION, 'NOTES_MASTER_KEY non configurata: impossibile salvare segreti');
      return this.cipher.encrypt(p.tenantId, incoming);
    };
    for (const prov of ['google', 'microsoft', 'slack'] as const) {
      const d = dto[prov];
      if (!d) continue;
      const cur = s[prov] ?? {};
      s[prov] = { ...cur, enabled: d.enabled ?? cur.enabled ?? false, clientId: d.clientId === undefined ? cur.clientId ?? null : d.clientId, clientSecretEnc: secretOf(cur.clientSecretEnc, d.clientSecret) };
    }
    if (dto.microsoft?.tenant !== undefined) s.microsoft = { ...(s.microsoft ?? {}), tenant: dto.microsoft.tenant || 'common' };
    if (dto.slack?.recognitionsChannel !== undefined) s.slack = { ...(s.slack ?? {}), recognitionsChannel: dto.slack.recognitionsChannel || null };
    if (dto.teams) s.teams = { ...(s.teams ?? {}), enabled: dto.teams.enabled ?? s.teams?.enabled ?? false, webhookUrl: dto.teams.webhookUrl === undefined ? s.teams?.webhookUrl ?? null : dto.teams.webhookUrl, postRecognitions: dto.teams.postRecognitions ?? s.teams?.postRecognitions ?? true };
    if (dto.endpoints) s.endpoints = { ...(s.endpoints ?? {}), ...dto.endpoints } as IntegrationSettings['endpoints'];
    const settings = { ...(t.settings as Record<string, unknown>), integrations: s };
    await tx().update(tenants).set({ settings, updatedAt: new Date() }).where(eq(tenants.id, p.tenantId));
    await this.audit.log({ action: 'integrations.update', entityType: 'tenant', entityId: p.tenantId, after: { google: !!dto.google, microsoft: !!dto.microsoft, slack: !!dto.slack, teams: !!dto.teams } });
    return this.config();
  }

  /** URL di autorizzazione (PKCE, state firmato 10 minuti). Slack è un'installazione di workspace: solo amministratori. */
  async connectUrl(provider: OAuthProvider) {
    const p = principal();
    if (provider === 'slack' && !hasPermission(p.roles, Permissions.TENANT_SETTINGS)) throw forbidden('Slack si collega a livello di organizzazione: serve un amministratore');
    const t = await this.tenantRow();
    const s = integrationSettingsOf(t.settings);
    if (!this.available(s, provider)) throw unprocessable(ErrorCodes.VALIDATION, `${ProviderLabels[provider]} non è configurato per questa organizzazione`);
    if (!this.cipher.enabled) throw unprocessable(ErrorCodes.VALIDATION, 'NOTES_MASTER_KEY non configurata: i token non possono essere conservati');
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const state = await this.tokens.signState({ t: p.tenantId, u: p.userId, p: provider, v: verifier } satisfies ConnectState, 600);
    return { url: authorizeUrl(provider, endpointsFor(s, provider), { clientId: s[provider]!.clientId!, redirectUri: this.redirectUri(provider), state, challenge }) };
  }

  /** Callback pubblico: scambia il codice, salva i token cifrati, rimanda alla web app. */
  async callback(provider: OAuthProvider, q: { code?: string; state?: string; error?: string; error_description?: string }): Promise<string> {
    const back = (params: Record<string, string>) => `${this.cfg.APP_BASE_URL.replace(/\/$/, '')}/settings?${new URLSearchParams(params).toString()}`;
    if (q.error) return back({ integration_error: q.error_description ?? q.error });
    if (!q.code || !q.state) return back({ integration_error: 'Risposta del provider incompleta' });
    let st: ConnectState;
    try { st = await this.tokens.verifyState<ConnectState>(q.state); } catch { return back({ integration_error: 'Sessione di collegamento scaduta: riprova' }); }
    if (st.p !== provider) return back({ integration_error: 'Provider non corrispondente' });
    const [t] = await this.db.select().from(tenants).where(eq(tenants.id, st.t));
    if (!t) return back({ integration_error: 'Organizzazione non trovata' });
    const s = integrationSettingsOf(t.settings);
    const cfg = s[provider];
    if (!cfg?.clientId) return back({ integration_error: `${ProviderLabels[provider]} non configurato` });
    try {
      const endpoints = endpointsFor(s, provider);
      const tokens = await exchangeCode(fetch, endpoints, { clientId: cfg.clientId, clientSecret: cfg.clientSecretEnc ? this.cipher.decrypt(t.id, cfg.clientSecretEnc) : null, code: q.code, redirectUri: this.redirectUri(provider), verifier: provider === 'slack' ? null : st.v });
      const identity = await fetchIdentity(fetch, provider, endpoints, tokens.accessToken, tokens);
      await withTenant(this.db, t.id, async (db) => {
        const [user] = await db.select({ id: users.id, personId: users.personId }).from(users).where(eq(users.id, st.u));
        const scope = provider === 'slack' ? null : st.u;
        const values = { tenantId: t.id, createdBy: st.u, provider, userId: scope, personId: scope ? user?.personId ?? null : null, externalId: identity.externalId, displayName: identity.displayName, accessTokenEnc: this.cipher.encrypt(t.id, tokens.accessToken), refreshTokenEnc: tokens.refreshToken ? this.cipher.encrypt(t.id, tokens.refreshToken) : null, expiresAt: tokens.expiresAt, scopes: tokens.scope ?? ProviderScopes[provider], status: 'active', lastError: null, meta: provider === 'slack' ? { botUserId: (tokens.raw.bot_user_id as string | undefined) ?? null } : {}, updatedAt: new Date() };
        const existing = await db.select({ id: connectorAccounts.id, refreshTokenEnc: connectorAccounts.refreshTokenEnc }).from(connectorAccounts).where(and(eq(connectorAccounts.provider, provider), scope ? eq(connectorAccounts.userId, scope) : isNull(connectorAccounts.userId)));
        if (existing[0]) await db.update(connectorAccounts).set({ ...values, refreshTokenEnc: values.refreshTokenEnc ?? existing[0].refreshTokenEnc }).where(eq(connectorAccounts.id, existing[0].id));
        else await db.insert(connectorAccounts).values(values);
      }, { appRole: this.appRole ?? undefined });
      return back({ connected: provider });
    } catch (e) {
      return back({ integration_error: `${ProviderLabels[provider]}: ${(e as Error).message.slice(0, 160)}` });
    }
  }

  async disconnect(provider: OAuthProvider) {
    const p = principal();
    if (provider === 'slack') {
      if (!hasPermission(p.roles, Permissions.TENANT_SETTINGS)) throw forbidden();
      await tx().delete(connectorAccounts).where(inArray(connectorAccounts.provider, ['slack', 'slack_user']));
    } else {
      await tx().delete(connectorAccounts).where(and(eq(connectorAccounts.provider, provider), eq(connectorAccounts.userId, p.userId)));
    }
    await this.audit.log({ action: 'integrations.disconnect', entityType: 'tenant', entityId: p.tenantId, after: { provider } });
    return this.overview();
  }

  /** Messaggio di prova: DM Slack a chi chiede oppure card nel canale Teams (in coda per il worker). */
  async test(provider: 'slack' | 'teams') {
    const p = principal();
    const t = await this.tenantRow();
    const s = integrationSettingsOf(t.settings);
    if (provider === 'teams') {
      if (!s.teams?.enabled || !s.teams.webhookUrl) throw unprocessable(ErrorCodes.VALIDATION, 'Webhook Teams non configurato');
      await tx().insert(chatOutbox).values({ tenantId: p.tenantId, createdBy: p.userId, provider: 'teams', target: 'webhook', text: `Messaggio di prova inviato da ${p.name ?? p.email ?? 'un amministratore'} da WorkingBetter.`, payload: { title: 'WorkingBetter · prova' } });
    } else {
      const [ws] = await tx().select({ id: connectorAccounts.id }).from(connectorAccounts).where(and(eq(connectorAccounts.provider, 'slack'), isNull(connectorAccounts.userId), eq(connectorAccounts.status, 'active')));
      if (!ws) throw conflict(ErrorCodes.CONFLICT, 'Slack non è collegato');
      await tx().insert(chatOutbox).values({ tenantId: p.tenantId, createdBy: p.userId, provider: 'slack', target: `user:${p.userId}`, userId: p.userId, text: '*WorkingBetter* · messaggio di prova: il collegamento Slack funziona.', payload: { link: '/settings' } });
    }
    return { queued: true };
  }

  // ---------- code verso il worker ----------

  /** Per ogni partecipante con calendario collegato: riga di sincronizzazione (upsert o delete) per l'incontro. */
  async enqueueMeeting(meetingId: string, op: 'upsert' | 'delete') {
    const p = principal();
    const [m] = await tx().select().from(meetings).where(eq(meetings.id, meetingId));
    if (!m) return 0;
    const [r] = await tx().select().from(oneOnOneRelations).where(eq(oneOnOneRelations.id, m.relationId));
    if (!r) return 0;
    const accounts = await tx().select().from(connectorAccounts).where(and(inArray(connectorAccounts.provider, CALENDAR), inArray(connectorAccounts.personId, [r.personAId, r.personBId]), eq(connectorAccounts.status, 'active')));
    let n = 0;
    for (const a of accounts) {
      const [existing] = await tx().select().from(calendarEventLinks).where(and(eq(calendarEventLinks.meetingId, meetingId), eq(calendarEventLinks.accountId, a.id)));
      if (op === 'delete' && (!existing || !existing.externalEventId)) { if (existing) await tx().update(calendarEventLinks).set({ status: 'deleted', op: 'delete', updatedAt: new Date() }).where(eq(calendarEventLinks.id, existing.id)); continue; }
      if (existing) await tx().update(calendarEventLinks).set({ op, status: 'pending', attempts: 0, nextAttemptAt: new Date(), lastError: null, updatedAt: new Date() }).where(eq(calendarEventLinks.id, existing.id));
      else await tx().insert(calendarEventLinks).values({ tenantId: p.tenantId, createdBy: p.userId, meetingId, accountId: a.id, provider: a.provider, op });
      n++;
    }
    return n;
  }

  /** Stato di sincronizzazione di un incontro (link Meet/Teams, errori) per la pagina del 1:1. */
  async meetingLinks(meetingId: string) {
    const rows = await tx().select().from(calendarEventLinks).where(eq(calendarEventLinks.meetingId, meetingId));
    return rows.map((l) => ({ provider: l.provider, status: l.status, joinUrl: l.joinUrl, htmlLink: l.htmlLink, lastError: l.lastError, syncedAt: l.syncedAt }));
  }

  /** Riconoscimento nel canale Slack e/o Teams configurato (INT-012). */
  async enqueueRecognition(text: string) {
    const p = principal();
    const t = await this.tenantRow();
    const s = integrationSettingsOf(t.settings);
    let n = 0;
    if (s.slack?.recognitionsChannel) {
      const [ws] = await tx().select({ id: connectorAccounts.id }).from(connectorAccounts).where(and(eq(connectorAccounts.provider, 'slack'), isNull(connectorAccounts.userId), eq(connectorAccounts.status, 'active')));
      if (ws) { await tx().insert(chatOutbox).values({ tenantId: p.tenantId, createdBy: p.userId, provider: 'slack', target: `channel:${s.slack.recognitionsChannel}`, text, payload: { link: '/feedback' } }); n++; }
    }
    if (s.teams?.enabled && s.teams.webhookUrl && (s.teams.postRecognitions ?? true)) {
      await tx().insert(chatOutbox).values({ tenantId: p.tenantId, createdBy: p.userId, provider: 'teams', target: 'webhook', text, payload: { title: '🏅 Riconoscimento', link: '/feedback' } });
      n++;
    }
    return n;
  }
}
