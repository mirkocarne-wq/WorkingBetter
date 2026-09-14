import { Controller, Get, Inject, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { desc, sql } from 'drizzle-orm';
import { jobRuns, type AnyDb } from '@wb/db';
import type { FastifyReply } from 'fastify';
import { Public } from '../auth/decorators.js';
import { healthResponse } from '../common/responses.js';
import { ZOk } from '../common/zod.pipe.js';
import { DB } from '../db/db.module.js';

const startedAt = Date.now();
const version = process.env.APP_VERSION ?? process.env.npm_package_version ?? '0.1.0';

/**
 * Stato del servizio per bilanciatori e monitoraggio (docs/13):
 * - /health/live  → il processo risponde (nessuna dipendenza)
 * - /health/ready → il database risponde (503 altrimenti): da usare come readiness probe
 * - /health       → riepilogo: versione, uptime, latenza DB, ultimi job del worker
 */
@ApiTags('system')
@Controller()
export class HealthController {
  constructor(@Inject(DB) private readonly db: AnyDb) {}

  @Public()
  @Get('health/live')
  @ApiOperation({ summary: 'Liveness: il processo è vivo' })
  live() {
    return { status: 'ok', uptimeSec: Math.round((Date.now() - startedAt) / 1000) };
  }

  @Public()
  @Get('health/ready')
  @ApiOperation({ summary: 'Readiness: il database risponde (503 altrimenti)' })
  async ready(@Res({ passthrough: true }) reply: FastifyReply) {
    try {
      await this.db.execute(sql`SELECT 1`);
      return { status: 'ok', db: 'ok' };
    } catch (e) {
      reply.status(503);
      return { status: 'degraded', db: 'error', detail: e instanceof Error ? e.message : String(e) };
    }
  }

  @Public()
  @Get('health')
  @ZOk(healthResponse)
  @ApiOperation({ summary: 'Stato riepilogativo: versione, uptime, latenza del database, ultimi job del worker' })
  async health(@Res({ passthrough: true }) reply: FastifyReply) {
    const t0 = Date.now();
    let dbLatencyMs: number | null = null;
    let jobs: { job: string; status: string; startedAt: string; finishedAt: string | null }[] = [];
    try {
      await this.db.execute(sql`SELECT 1`);
      dbLatencyMs = Date.now() - t0;
      const rows = await this.db.select({ job: jobRuns.job, ok: jobRuns.ok, startedAt: jobRuns.startedAt, finishedAt: jobRuns.finishedAt }).from(jobRuns).orderBy(desc(jobRuns.startedAt)).limit(40);
      const latest = new Map<string, (typeof rows)[number]>();
      for (const r of rows) if (!latest.has(r.job)) latest.set(r.job, r);
      jobs = [...latest.values()].map((r) => ({ job: r.job, status: r.finishedAt ? (r.ok ? 'ok' : 'error') : 'running', startedAt: r.startedAt.toISOString(), finishedAt: r.finishedAt?.toISOString() ?? null }));
    } catch {
      reply.status(503);
      return { status: 'degraded', db: 'error', version, uptimeSec: Math.round((Date.now() - startedAt) / 1000), dbLatencyMs: null, jobs: [], time: new Date().toISOString() };
    }
    return { status: 'ok', db: 'ok', version, uptimeSec: Math.round((Date.now() - startedAt) / 1000), dbLatencyMs, jobs, time: new Date().toISOString() };
  }
}
