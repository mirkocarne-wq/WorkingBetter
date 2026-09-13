import { Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, like, sql } from 'drizzle-orm';
import { orgUnits } from '@wb/db';
import { ErrorCodes } from '@wb/shared';
import { z } from 'zod';
import { principal, tx } from '../common/context.js';
import { notFound, unprocessable } from '../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import type { createOrgUnitDto, updateOrgUnitDto } from './dto.js';

export type OrgUnitRow = typeof orgUnits.$inferSelect;
export interface OrgUnitNode extends OrgUnitRow {
  children: OrgUnitNode[];
}

@Injectable()
export class OrgUnitsService {
  constructor(private readonly audit: AuditService) {}

  async list(): Promise<OrgUnitRow[]> {
    return tx().select().from(orgUnits).where(isNull(orgUnits.archivedAt)).orderBy(asc(orgUnits.path), asc(orgUnits.name));
  }

  async tree(): Promise<OrgUnitNode[]> {
    const rows = await this.list();
    const byId = new Map<string, OrgUnitNode>(rows.map((r) => [r.id, { ...r, children: [] }]));
    const roots: OrgUnitNode[] = [];
    for (const n of byId.values()) {
      const parent = n.parentId ? byId.get(n.parentId) : undefined;
      if (parent) parent.children.push(n);
      else roots.push(n);
    }
    return roots;
  }

  async get(id: string): Promise<OrgUnitRow> {
    const [row] = await tx().select().from(orgUnits).where(eq(orgUnits.id, id));
    if (!row) throw notFound('Unità organizzativa', id);
    return row;
  }

  /** Id dell'unità e di tutte le discendenti (perimetro HRBP). */
  async subtreeIds(id: string): Promise<string[]> {
    const root = await this.get(id);
    const rows = await tx().select({ id: orgUnits.id }).from(orgUnits).where(like(orgUnits.path, `${root.path}%`));
    return rows.map((r) => r.id);
  }

  async create(dto: z.infer<typeof createOrgUnitDto>): Promise<OrgUnitRow> {
    const p = principal();
    const parent = dto.parentId ? await this.get(dto.parentId) : null;
    const [row] = await tx()
      .insert(orgUnits)
      .values({ tenantId: p.tenantId, createdBy: p.userId, name: dto.name, code: dto.code, parentId: parent?.id ?? null })
      .returning();
    const path = `${parent?.path ?? '/'}${row!.id}/`;
    const [updated] = await tx().update(orgUnits).set({ path }).where(eq(orgUnits.id, row!.id)).returning();
    await this.audit.log({ action: 'org_unit.create', entityType: 'org_unit', entityId: row!.id, after: updated });
    return updated!;
  }

  async update(id: string, dto: z.infer<typeof updateOrgUnitDto>): Promise<OrgUnitRow> {
    const before = await this.get(id);
    let path = before.path;
    if (dto.parentId !== undefined && dto.parentId !== before.parentId) {
      const parent = dto.parentId ? await this.get(dto.parentId) : null;
      if (parent && parent.path.startsWith(before.path)) throw unprocessable(ErrorCodes.VALIDATION, 'Non è possibile spostare un\'unità sotto una sua discendente');
      const newPath = `${parent?.path ?? '/'}${id}/`;
      // aggiorna il path di tutto il sottoalbero
      await tx()
        .update(orgUnits)
        .set({ path: sql`${newPath} || substr(${orgUnits.path}, ${before.path.length + 1})` })
        .where(and(like(orgUnits.path, `${before.path}%`), sql`${orgUnits.id} <> ${id}`));
      path = newPath;
    }
    const [row] = await tx()
      .update(orgUnits)
      .set({ name: dto.name, code: dto.code, parentId: dto.parentId === undefined ? before.parentId : dto.parentId, path, updatedAt: new Date() })
      .where(eq(orgUnits.id, id))
      .returning();
    await this.audit.log({ action: 'org_unit.update', entityType: 'org_unit', entityId: id, before, after: row });
    return row!;
  }

  async archive(id: string): Promise<void> {
    const before = await this.get(id);
    await tx().update(orgUnits).set({ archivedAt: new Date() }).where(eq(orgUnits.id, id));
    await this.audit.log({ action: 'org_unit.archive', entityType: 'org_unit', entityId: id, before });
  }
}
