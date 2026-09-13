import { Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { cycles } from '@wb/db';
import type { z } from 'zod';
import { principal, tx } from '../common/context.js';
import { notFound } from '../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import type { createCycleDto, updateCycleDto } from './dto.js';

export type CycleRow = typeof cycles.$inferSelect;

@Injectable()
export class CyclesService {
  constructor(private readonly audit: AuditService) {}

  list(): Promise<CycleRow[]> {
    return tx().select().from(cycles).orderBy(desc(cycles.startDate));
  }

  async get(id: string): Promise<CycleRow> {
    const [row] = await tx().select().from(cycles).where(eq(cycles.id, id));
    if (!row) throw notFound('Periodo', id);
    return row;
  }

  /** Periodo "corrente": quello aperto che contiene oggi, altrimenti il più recente. */
  async current(): Promise<CycleRow | null> {
    const today = new Date().toISOString().slice(0, 10);
    const all = await this.list();
    return all.find((c) => c.status !== 'closed' && c.startDate <= today && c.endDate >= today) ?? all[0] ?? null;
  }

  async create(dto: z.infer<typeof createCycleDto>): Promise<CycleRow> {
    const p = principal();
    const [row] = await tx().insert(cycles).values({ ...dto, tenantId: p.tenantId, createdBy: p.userId }).returning();
    await this.audit.log({ action: 'cycle.create', entityType: 'cycle', entityId: row!.id, after: row });
    return row!;
  }

  async update(id: string, dto: z.infer<typeof updateCycleDto>): Promise<CycleRow> {
    const before = await this.get(id);
    const [row] = await tx().update(cycles).set({ ...dto, updatedAt: new Date() }).where(eq(cycles.id, id)).returning();
    await this.audit.log({ action: 'cycle.update', entityType: 'cycle', entityId: id, before, after: row });
    return row!;
  }
}
