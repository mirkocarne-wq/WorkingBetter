import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, ilike, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import {
  appInstances,
  auditLog,
  calendarEventLinks,
  chatOutbox,
  emailOutbox,
  f360Campaigns,
  feedback,
  inviteTenantAdmin,
  jobRuns,
  meetings,
  newOneTimeToken,
  notify,
  objectives,
  onboardingJourneys,
  oneOnOneRelations,
  orgUnits,
  persons,
  platformEvents,
  provisionTenantIn,
  recognitions,
  reviewCycles,
  reviews,
  roleAssignments,
  surveys,
  tenants,
  users,
  webhookDeliveries,
  welfarePlans,
  welfareRequests,
  type AnyDb,
} from '@wb/db';
import { ErrorCodes } from '@wb/shared';
import type { z } from 'zod';
import { CONFIG, type AppConfig } from '../config.js';
import { DB } from '../db/db.module.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { tx } from '../common/context.js';
import { conflict, notFound, unprocessable } from '../common/errors.js';
import { certFromFile, certFromUrl, type CertInfo } from './certificates.js';
import { PlatformAuthService } from './platform-auth.service.js';
import type { auditQuery, createTenantDto, eventsQuery, inviteAdminDto, listTenantsQuery, searchUsersQuery, updateTenantDto, userActionDto } from './dto.js';

const count = sql<number>`count(*)::int`;
const startedAt = Date.now();
const version = process.env.APP_VERSION ?? process.env.npm_package_version ?? '0.1.0';
const RESET_MINUTES = 60;
const days = (n: number) => new Date(Date.now() - n * 86400000);
const text = (v: unknown): string | null => (v == null ? null : typeof v === 'string' ? v : JSON.stringify(v));

type Cached<T> = { at: number; value: T };

/**
 * Console di piattaforma (ADR-0013, PLT-010…033): tenant, utenti dei tenant, stato, statistiche, certificati, log.
 * Solo aggregati e azioni amministrative: mai contenuti dei tenant. Ogni azione scrive un evento di piattaforma.
 */
@Injectable()
export class PlatformService {
  private readonly cache = new Map<string, Cached<unknown>>();
  constructor(@Inject(DB) private readonly db: AnyDb, @Inject(CONFIG) private readonly cfg: AppConfig, private readonly guard: AuthGuard, private readonly auth: PlatformAuthService) {}

  // ---------- tenant ----------

  async listTenants(q: z.infer<typeof listTenantsQuery>) {
    const conds = [q.status ? eq(tenants.status, q.status) : undefined, q.q ? or(ilike(tenants.name, `%${q.q}%`), ilike(tenants.slug, `%${q.q}%`)) : undefined].filter((x): x is NonNullable<typeof x> => !!x);
    const rows = await tx().select().from(tenants).where(conds.length ? and(...conds) : undefined).orderBy(tenants.name);
    const ids = rows.map((t) => t.id);
    if (!ids.length) return [];
    const people = await tx().select({ tenantId: persons.tenantId, n: count }).from(persons).where(and(inArray(persons.tenantId, ids), inArray(persons.status, ['active', 'invited']))).groupBy(persons.tenantId);
    const us = await tx().select({ tenantId: users.tenantId, n: count, last: sql<Date | null>`max(${users.lastLoginAt})`, active30: sql<number>`count(*) filter (where ${users.lastLoginAt} >= ${days(30).toISOString()}::timestamptz)::int` }).from(users).where(and(inArray(users.tenantId, ids), isNull(users.disabledAt))).groupBy(users.tenantId);
    const pm = new Map(people.map((x) => [x.tenantId, x.n]));
    const um = new Map(us.map((x) => [x.tenantId, x]));
    return rows.map((t) => ({ id: t.id, name: t.name, slug: t.slug, status: t.status, timezone: t.timezone, defaultLocale: t.defaultLocale, createdAt: t.createdAt, people: pm.get(t.id) ?? 0, users: um.get(t.id)?.n ?? 0, activeUsers30d: um.get(t.id)?.active30 ?? 0, lastLoginAt: um.get(t.id)?.last ?? null }));
  }

  async createTenant(dto: z.infer<typeof createTenantDto>) {
    const [existing] = await tx().select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, dto.slug));
    if (existing) throw conflict(ErrorCodes.CONFLICT, `Lo slug «${dto.slug}» è già usato`);
    // stessa logica dello script bootstrap, nella transazione di piattaforma della richiesta (niente transazioni annidate)
    const r = await provisionTenantIn(tx(), { name: dto.name, slug: dto.slug, timezone: dto.timezone, defaultLocale: dto.defaultLocale, admin: dto.admin, appBaseUrl: this.cfg.APP_BASE_URL });
    await this.auth.event('tenant.create', { tenantId: r.tenantId, targetType: 'tenant', targetId: r.tenantId, targetLabel: dto.slug, details: { name: dto.name, admin: dto.admin.email } });
    return { ...(await this.getTenant(r.tenantId)), invite: { email: dto.admin.email, url: r.inviteUrl, expiresAt: r.inviteExpiresAt } };
  }

  async getTenant(id: string) {
    const t = await this.tenantRow(id);
    const c = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
    const w = (tid: typeof persons.tenantId) => eq(tid, id);
    const [people, usersTotal, usersActive30, units, objs, cycles, revs, svy, rels, meets30, fb30, rec30, inst, wplans, wreq, f360, onb] = await Promise.all([
      c(tx().select({ n: count }).from(persons).where(and(w(persons.tenantId), inArray(persons.status, ['active', 'invited'])))),
      c(tx().select({ n: count }).from(users).where(and(eq(users.tenantId, id), isNull(users.disabledAt)))),
      c(tx().select({ n: count }).from(users).where(and(eq(users.tenantId, id), isNull(users.disabledAt), gte(users.lastLoginAt, days(30))))),
      c(tx().select({ n: count }).from(orgUnits).where(and(eq(orgUnits.tenantId, id), isNull(orgUnits.archivedAt)))),
      c(tx().select({ n: count }).from(objectives).where(and(eq(objectives.tenantId, id), eq(objectives.status, 'active')))),
      c(tx().select({ n: count }).from(reviewCycles).where(eq(reviewCycles.tenantId, id))),
      c(tx().select({ n: count }).from(reviews).where(eq(reviews.tenantId, id))),
      c(tx().select({ n: count }).from(surveys).where(eq(surveys.tenantId, id))),
      c(tx().select({ n: count }).from(oneOnOneRelations).where(and(eq(oneOnOneRelations.tenantId, id), isNull(oneOnOneRelations.archivedAt)))),
      c(tx().select({ n: count }).from(meetings).where(and(eq(meetings.tenantId, id), eq(meetings.status, 'done'), gte(meetings.completedAt, days(30))))),
      c(tx().select({ n: count }).from(feedback).where(and(eq(feedback.tenantId, id), gte(feedback.createdAt, days(30))))),
      c(tx().select({ n: count }).from(recognitions).where(and(eq(recognitions.tenantId, id), gte(recognitions.createdAt, days(30))))),
      c(tx().select({ n: count }).from(appInstances).where(eq(appInstances.tenantId, id))),
      c(tx().select({ n: count }).from(welfarePlans).where(eq(welfarePlans.tenantId, id))),
      c(tx().select({ n: count }).from(welfareRequests).where(eq(welfareRequests.tenantId, id))),
      c(tx().select({ n: count }).from(f360Campaigns).where(eq(f360Campaigns.tenantId, id))),
      c(tx().select({ n: count }).from(onboardingJourneys).where(eq(onboardingJourneys.tenantId, id))),
    ]);
    const admins = await tx()
      .select({ id: users.id, email: users.email, lastLoginAt: users.lastLoginAt, disabledAt: users.disabledAt, inviteAcceptedAt: users.inviteAcceptedAt, inviteExpiresAt: users.inviteExpiresAt, role: roleAssignments.role })
      .from(roleAssignments)
      .innerJoin(users, eq(users.id, roleAssignments.userId))
      .where(and(eq(roleAssignments.tenantId, id), inArray(roleAssignments.role, ['tenant_admin', 'hr_admin', 'hrbp'])))
      .orderBy(users.email);
    const recentLogins = await tx().select({ email: users.email, lastLoginAt: users.lastLoginAt }).from(users).where(and(eq(users.tenantId, id), isNotNull(users.lastLoginAt))).orderBy(desc(users.lastLoginAt)).limit(5);
    const events = await tx().select().from(platformEvents).where(eq(platformEvents.tenantId, id)).orderBy(desc(platformEvents.at)).limit(20);
    const settings = (t.settings as Record<string, unknown>) ?? {};
    const sso = settings.sso as { enabled?: boolean; issuer?: string } | undefined;
    const security = settings.security as { mfaRequiredRoles?: string[] } | undefined;
    const integrations = (settings.integrations as Record<string, unknown> | undefined) ?? {};
    const branding = settings.branding as { primaryColor?: string; logoDataUrl?: string } | undefined;
    return {
      id: t.id, name: t.name, slug: t.slug, status: t.status, timezone: t.timezone, defaultLocale: t.defaultLocale, createdAt: t.createdAt, updatedAt: t.updatedAt,
      stats: { people, usersTotal, usersActive30, units, objectivesActive: objs, reviewCycles: cycles, reviews: revs, surveys: svy, oneOnOneRelations: rels, meetingsDone30d: meets30, feedback30d: fb30, recognitions30d: rec30, appInstances: inst, welfarePlans: wplans, welfareRequests: wreq, f360Campaigns: f360, onboardingJourneys: onb },
      config: { ssoEnabled: !!sso?.enabled, ssoIssuer: sso?.issuer ?? null, mfaRequiredRoles: security?.mfaRequiredRoles ?? [], integrations: Object.keys(integrations), branding: !!(branding?.primaryColor || branding?.logoDataUrl) },
      admins: admins.map((a) => ({ ...a, inviteStatus: a.inviteAcceptedAt ? 'accepted' : a.inviteExpiresAt ? (a.inviteExpiresAt > new Date() ? 'pending' : 'expired') : 'none' })),
      recentLogins,
      events,
    };
  }

  async updateTenant(id: string, dto: z.infer<typeof updateTenantDto>) {
    const before = await this.tenantRow(id);
    const [after] = await tx().update(tenants).set({ ...dto, updatedAt: new Date() }).where(eq(tenants.id, id)).returning();
    if (dto.status && dto.status !== before.status) {
      await this.auth.event(dto.status === 'suspended' ? 'tenant.suspend' : 'tenant.activate', { tenantId: id, targetType: 'tenant', targetId: id, targetLabel: before.slug });
      this.guard.forgetTenant(id);
    } else {
      await this.auth.event('tenant.update', { tenantId: id, targetType: 'tenant', targetId: id, targetLabel: before.slug, details: dto });
    }
    return { ...after!, settings: undefined };
  }

  async inviteAdmin(id: string, dto: z.infer<typeof inviteAdminDto>) {
    const t = await this.tenantRow(id);
    if (t.status !== 'active') throw conflict(ErrorCodes.CONFLICT, 'Tenant sospeso');
    const r = await inviteTenantAdmin(tx(), { tenantId: id, tenantName: t.name, appBaseUrl: this.cfg.APP_BASE_URL, admin: dto });
    await this.auth.event('tenant.invite_admin', { tenantId: id, targetType: 'user', targetId: r.userId, targetLabel: dto.email });
    return { email: dto.email, url: r.inviteUrl, expiresAt: r.inviteExpiresAt };
  }

  /** PLT-015: audit del tenant come elenco di azioni, senza before/after. */
  async tenantAudit(id: string, q: z.infer<typeof auditQuery>) {
    await this.tenantRow(id);
    const conds = [eq(auditLog.tenantId, id), q.action ? ilike(auditLog.action, `${q.action}%`) : undefined].filter((x): x is NonNullable<typeof x> => !!x);
    const rows = await tx().select({ at: auditLog.at, action: auditLog.action, entityType: auditLog.entityType, entityId: auditLog.entityId, actorUserId: auditLog.actorUserId, ip: auditLog.ip }).from(auditLog).where(and(...conds)).orderBy(desc(auditLog.at)).limit(q.limit);
    const actorIds = [...new Set(rows.map((r) => r.actorUserId).filter((x): x is string => !!x))];
    const actors = actorIds.length ? await tx().select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, actorIds)) : [];
    const am = new Map(actors.map((a) => [a.id, a.email]));
    return rows.map((r) => ({ ...r, actorEmail: r.actorUserId ? (am.get(r.actorUserId) ?? null) : null }));
  }

  // ---------- utenti dei tenant ----------

  async searchUsers(q: z.infer<typeof searchUsersQuery>) {
    const conds = [ilike(users.email, `%${q.q}%`), q.tenantId ? eq(users.tenantId, q.tenantId) : undefined].filter((x): x is NonNullable<typeof x> => !!x);
    const rows = await tx()
      .select({ id: users.id, email: users.email, tenantId: users.tenantId, tenantName: tenants.name, tenantSlug: tenants.slug, personId: users.personId, lastLoginAt: users.lastLoginAt, disabledAt: users.disabledAt, lockedUntil: users.lockedUntil, failedLogins: users.failedLogins, mfaEnabledAt: users.mfaEnabledAt, inviteAcceptedAt: users.inviteAcceptedAt, inviteExpiresAt: users.inviteExpiresAt, authProvider: users.authProvider })
      .from(users)
      .innerJoin(tenants, eq(tenants.id, users.tenantId))
      .where(and(...conds))
      .orderBy(users.email)
      .limit(50);
    const ids = rows.map((r) => r.id);
    const roles = ids.length ? await tx().select({ userId: roleAssignments.userId, role: roleAssignments.role }).from(roleAssignments).where(inArray(roleAssignments.userId, ids)) : [];
    const rm = new Map<string, string[]>();
    for (const r of roles) rm.set(r.userId, [...(rm.get(r.userId) ?? []), r.role]);
    return rows.map((r) => ({ ...r, roles: rm.get(r.id) ?? [], locked: !!r.lockedUntil && r.lockedUntil > new Date(), mfa: !!r.mfaEnabledAt }));
  }

  /** PLT-021/022: azioni amministrative su un utente tenant, eseguite nella transazione del suo tenant. */
  async userAction(userId: string, dto: z.infer<typeof userActionDto>) {
    const [u] = await tx().select({ id: users.id, email: users.email, tenantId: users.tenantId, disabledAt: users.disabledAt }).from(users).where(eq(users.id, userId));
    if (!u) throw notFound('Utente', userId);
    const [t] = await tx().select({ slug: tenants.slug, status: tenants.status }).from(tenants).where(eq(tenants.id, u.tenantId));
    let result: Record<string, unknown> = {};
    const ttx = tx();
    {
      {
        switch (dto.action) {
          case 'reset_password': {
            if (u.disabledAt) throw conflict(ErrorCodes.CONFLICT, 'Utente disattivato: riattivalo prima');
            const { token, hash } = newOneTimeToken();
            const expiresAt = new Date(Date.now() + RESET_MINUTES * 60000);
            await ttx.update(users).set({ resetTokenHash: hash, resetExpiresAt: expiresAt, failedLogins: 0, lockedUntil: null, sessionsRevokedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId));
            const link = `${this.cfg.APP_BASE_URL}/reset-password?token=${token}`;
            await notify(ttx, { tenantId: u.tenantId, userId, type: 'user.password_reset', force: { email: true, inApp: false }, link });
            result = { emailQueued: true, expiresAt, link };
            break;
          }
          case 'unlock':
            await ttx.update(users).set({ failedLogins: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(users.id, userId));
            break;
          case 'revoke_sessions':
            await ttx.update(users).set({ sessionsRevokedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId));
            break;
          case 'disable':
            await ttx.update(users).set({ disabledAt: new Date(), sessionsRevokedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId));
            break;
          case 'enable':
            await ttx.update(users).set({ disabledAt: null, failedLogins: 0, lockedUntil: null, updatedAt: new Date() }).where(eq(users.id, userId));
            break;
          case 'disable_mfa':
            await ttx.update(users).set({ mfaSecretEnc: null, mfaPendingSecretEnc: null, mfaEnabledAt: null, mfaRecoveryHashes: null, sessionsRevokedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId));
            break;
        }
      }
    }
    this.guard.forget(userId);
    await this.auth.event(`user.${dto.action}`, { tenantId: u.tenantId, targetType: 'user', targetId: userId, targetLabel: u.email, details: { tenant: t?.slug } });
    return { ok: true, action: dto.action, ...result };
  }

  // ---------- stato, statistiche, certificati ----------

  async status() {
    return this.cached('status', 30_000, async () => {
      const t0 = Date.now();
      const db: Record<string, unknown> = { ok: false };
      try {
        await tx().execute(sql`select 1`);
        db.ok = true;
        db.latencyMs = Date.now() - t0;
        const [size] = (await tx().execute(sql`select pg_database_size(current_database())::bigint as size, current_database() as name, version() as version`)) as unknown as { size: string; name: string; version: string }[];
        db.sizeBytes = Number(size?.size ?? 0);
        db.name = size?.name;
        db.serverVersion = (size?.version ?? '').split(' ').slice(0, 2).join(' ');
        try {
          const [conn] = (await tx().execute(sql`select (select count(*) from pg_stat_activity where datname = current_database())::int as active, (select setting::int from pg_settings where name = 'max_connections') as max`)) as unknown as { active: number; max: number }[];
          db.connections = conn ?? null;
        } catch { db.connections = null; }
        try {
          const [mig] = (await tx().execute(sql`select count(*)::int as n, max(name) as last, max(applied_at) as at from _migrations`)) as unknown as { n: number; last: string; at: string }[];
          db.migrations = mig ?? null;
        } catch { db.migrations = null; }
      } catch (e) {
        db.error = e instanceof Error ? e.message : String(e);
      }
      const runs = await tx().select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(200);
      const latest = new Map<string, (typeof runs)[number]>();
      for (const r of runs) if (!latest.has(r.job)) latest.set(r.job, r);
      const jobs = [...latest.values()].map((r) => ({ job: r.job, status: r.finishedAt ? (r.ok ? 'ok' : 'error') : 'running', startedAt: r.startedAt, finishedAt: r.finishedAt, durationMs: r.finishedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : null, summary: text(r.summary), error: text(r.error) }));
      const queue = async (name: string, table: typeof emailOutbox | typeof chatOutbox | typeof webhookDeliveries | typeof calendarEventLinks) => {
        const rows = await tx().select({ status: table.status, n: count, oldest: sql<Date | null>`min(${table.createdAt})` }).from(table).groupBy(table.status);
        const by = Object.fromEntries(rows.map((r) => [r.status, r.n]));
        const pending = rows.filter((r) => r.status === 'pending').reduce((a, r) => a + r.n, 0);
        const failed = rows.filter((r) => r.status === 'failed' || r.status === 'error').reduce((a, r) => a + r.n, 0);
        const oldestPending = rows.find((r) => r.status === 'pending')?.oldest ?? null;
        return { name, pending, failed, byStatus: by, oldestPending };
      };
      const queues = await Promise.all([queue('email', emailOutbox), queue('chat', chatOutbox), queue('webhook', webhookDeliveries), queue('calendar', calendarEventLinks)]);
      const workerAlive = jobs.some((j) => j.startedAt.getTime() > Date.now() - 2 * 86400000);
      return {
        api: { version, uptimeSec: Math.round((Date.now() - startedAt) / 1000), env: this.cfg.NODE_ENV, authMode: this.cfg.AUTH_MODE, appBaseUrl: this.cfg.APP_BASE_URL, apiPublicUrl: this.cfg.API_PUBLIC_URL ?? null, consoleUrl: this.cfg.CONSOLE_PUBLIC_URL ?? null, redisConfigured: !!this.cfg.REDIS_URL, notesKeyConfigured: !!this.cfg.NOTES_MASTER_KEY },
        db,
        worker: { alive: workerAlive, jobs },
        queues,
        checkedAt: new Date(),
      };
    });
  }

  async stats() {
    return this.cached('stats', 30_000, async () => {
      const c = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;
      const [tenantsActive, tenantsSuspended, usersTotal, usersActive30, usersActive7, people, objs, revs, cycles, svy, meets30, fb30, rec30, inst, onb] = await Promise.all([
        c(tx().select({ n: count }).from(tenants).where(eq(tenants.status, 'active'))),
        c(tx().select({ n: count }).from(tenants).where(eq(tenants.status, 'suspended'))),
        c(tx().select({ n: count }).from(users).where(isNull(users.disabledAt))),
        c(tx().select({ n: count }).from(users).where(and(isNull(users.disabledAt), gte(users.lastLoginAt, days(30))))),
        c(tx().select({ n: count }).from(users).where(and(isNull(users.disabledAt), gte(users.lastLoginAt, days(7))))),
        c(tx().select({ n: count }).from(persons).where(inArray(persons.status, ['active', 'invited']))),
        c(tx().select({ n: count }).from(objectives).where(eq(objectives.status, 'active'))),
        c(tx().select({ n: count }).from(reviews)),
        c(tx().select({ n: count }).from(reviewCycles).where(eq(reviewCycles.status, 'active'))),
        c(tx().select({ n: count }).from(surveys).where(inArray(surveys.status, ['open', 'closed', 'shared']))),
        c(tx().select({ n: count }).from(meetings).where(and(eq(meetings.status, 'done'), gte(meetings.completedAt, days(30))))),
        c(tx().select({ n: count }).from(feedback).where(gte(feedback.createdAt, days(30)))),
        c(tx().select({ n: count }).from(recognitions).where(gte(recognitions.createdAt, days(30)))),
        c(tx().select({ n: count }).from(appInstances).where(eq(appInstances.status, 'running'))),
        c(tx().select({ n: count }).from(onboardingJourneys).where(eq(onboardingJourneys.status, 'active'))),
      ]);
      const logins = await tx().select({ day: sql<string>`to_char(${users.lastLoginAt}, 'YYYY-MM-DD')`, n: count }).from(users).where(gte(users.lastLoginAt, days(30))).groupBy(sql`1`).orderBy(sql`1`);
      const events7 = await c(tx().select({ n: count }).from(platformEvents).where(gte(platformEvents.at, days(7))));
      return { tenants: { active: tenantsActive, suspended: tenantsSuspended }, users: { total: usersTotal, active30d: usersActive30, active7d: usersActive7 }, people, modules: { objectivesActive: objs, reviews: revs, reviewCyclesActive: cycles, surveysLaunched: svy, meetingsDone30d: meets30, feedback30d: fb30, recognitions30d: rec30, appInstancesActive: inst, onboardingActive: onb }, lastLoginsByDay: logins, platformEvents7d: events7, computedAt: new Date() };
    });
  }

  async certificates(): Promise<{ items: CertInfo[]; warnDays: number; criticalDays: number; checkedAt: Date }> {
    return this.cached('certificates', 5 * 60_000, async () => {
      const urls = [...new Set([this.cfg.APP_BASE_URL, this.cfg.API_PUBLIC_URL, this.cfg.CONSOLE_PUBLIC_URL].filter((u): u is string => !!u))];
      const files = (this.cfg.TLS_CERT_FILES ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      const items = [...(await Promise.all(urls.map((u) => certFromUrl(u)))), ...files.map((f) => certFromFile(f))];
      return { items, warnDays: 30, criticalDays: 7, checkedAt: new Date() };
    });
  }

  // ---------- log ----------

  async events(q: z.infer<typeof eventsQuery>) {
    const conds = [q.tenantId ? eq(platformEvents.tenantId, q.tenantId) : undefined, q.action ? ilike(platformEvents.action, `${q.action}%`) : undefined].filter((x): x is NonNullable<typeof x> => !!x);
    const rows = await tx().select().from(platformEvents).where(conds.length ? and(...conds) : undefined).orderBy(desc(platformEvents.at)).limit(q.limit);
    const tids = [...new Set(rows.map((r) => r.tenantId).filter((x): x is string => !!x))];
    const ts = tids.length ? await tx().select({ id: tenants.id, slug: tenants.slug }).from(tenants).where(inArray(tenants.id, tids)) : [];
    const tm = new Map(ts.map((t) => [t.id, t.slug]));
    return rows.map((r) => ({ ...r, tenantSlug: r.tenantId ? (tm.get(r.tenantId) ?? null) : null }));
  }

  async jobs() {
    const rows = await tx().select().from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(100);
    return rows.map((r) => ({ id: r.id, job: r.job, ok: r.ok, startedAt: r.startedAt, finishedAt: r.finishedAt, durationMs: r.finishedAt ? r.finishedAt.getTime() - r.startedAt.getTime() : null, summary: text(r.summary), error: text(r.error) }));
  }

  async queueFailures() {
    const tids = new Map<string, string>();
    const slug = async (id: string) => {
      if (!tids.has(id)) {
        const [t] = await tx().select({ slug: tenants.slug }).from(tenants).where(eq(tenants.id, id));
        tids.set(id, t?.slug ?? id);
      }
      return tids.get(id)!;
    };
    const email = await tx().select({ id: emailOutbox.id, tenantId: emailOutbox.tenantId, to: emailOutbox.toEmail, subject: emailOutbox.subject, attempts: emailOutbox.attempts, error: emailOutbox.lastError, at: emailOutbox.updatedAt }).from(emailOutbox).where(eq(emailOutbox.status, 'failed')).orderBy(desc(emailOutbox.updatedAt)).limit(20);
    const chat = await tx().select({ id: chatOutbox.id, tenantId: chatOutbox.tenantId, target: chatOutbox.target, provider: chatOutbox.provider, attempts: chatOutbox.attempts, error: chatOutbox.lastError, at: chatOutbox.updatedAt }).from(chatOutbox).where(isNotNull(chatOutbox.lastError)).orderBy(desc(chatOutbox.updatedAt)).limit(20);
    const webhooks = await tx().select({ id: webhookDeliveries.id, tenantId: webhookDeliveries.tenantId, url: webhookDeliveries.url, attempts: webhookDeliveries.attempts, error: webhookDeliveries.lastError, status: webhookDeliveries.status, at: webhookDeliveries.updatedAt }).from(webhookDeliveries).where(isNotNull(webhookDeliveries.lastError)).orderBy(desc(webhookDeliveries.updatedAt)).limit(20);
    const calendar = await tx().select({ id: calendarEventLinks.id, tenantId: calendarEventLinks.tenantId, provider: calendarEventLinks.provider, op: calendarEventLinks.op, attempts: calendarEventLinks.attempts, error: calendarEventLinks.lastError, status: calendarEventLinks.status, at: calendarEventLinks.updatedAt }).from(calendarEventLinks).where(isNotNull(calendarEventLinks.lastError)).orderBy(desc(calendarEventLinks.updatedAt)).limit(20);
    const withSlug = async <T extends { tenantId: string }>(rows: T[]) => Promise.all(rows.map(async (r) => ({ ...r, tenantSlug: await slug(r.tenantId) })));
    return { email: await withSlug(email), chat: await withSlug(chat), webhooks: await withSlug(webhooks), calendar: await withSlug(calendar) };
  }

  // ---------- helpers ----------

  private async tenantRow(id: string) {
    const [t] = await tx().select().from(tenants).where(eq(tenants.id, id));
    if (!t) throw notFound('Tenant', id);
    return t;
  }
  private async cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key) as Cached<T> | undefined;
    if (hit && Date.now() - hit.at < ttlMs) return hit.value;
    const value = await fn();
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }
  /** Solo per i test: svuota la cache di stato/statistiche. */
  invalidate() {
    this.cache.clear();
  }
  assertUuid(id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw unprocessable(ErrorCodes.VALIDATION, 'Identificativo non valido');
  }
}
