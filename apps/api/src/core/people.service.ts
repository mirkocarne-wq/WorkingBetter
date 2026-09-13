import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ilike, lt, or, sql, type SQL } from 'drizzle-orm';
import { personHistory, persons } from '@wb/db';
import { principal, tx } from '../common/context.js';
import { notFound, unprocessable } from '../common/errors.js';
import { decodeCursor, toPage, type Page } from '../common/pagination.js';
import { AuditService } from '../audit/audit.service.js';
import type { CreatePersonDto, UpdatePersonDto } from './dto.js';
import { ErrorCodes } from '@wb/shared';

export type PersonRow = typeof persons.$inferSelect;

@Injectable()
export class PeopleService {
  constructor(private readonly audit: AuditService) {}

  async list(q: { q?: string; orgUnitId?: string; managerId?: string; status?: string; limit: number; cursor?: string }): Promise<Page<PersonRow>> {
    const conds: SQL[] = [];
    if (q.q) conds.push(or(ilike(persons.firstName, `%${q.q}%`), ilike(persons.lastName, `%${q.q}%`), ilike(persons.email, `%${q.q}%`))!);
    if (q.orgUnitId) conds.push(eq(persons.orgUnitId, q.orgUnitId));
    if (q.managerId) conds.push(eq(persons.managerId, q.managerId));
    if (q.status) conds.push(eq(persons.status, q.status as PersonRow['status']));
    const c = decodeCursor(q.cursor);
    if (c) conds.push(or(lt(persons.createdAt, c.createdAt), and(eq(persons.createdAt, c.createdAt), lt(persons.id, c.id)))!);
    const rows = await tx()
      .select()
      .from(persons)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(persons.createdAt), desc(persons.id))
      .limit(q.limit + 1);
    return toPage(rows, q.limit);
  }

  async get(id: string): Promise<PersonRow> {
    const [row] = await tx().select().from(persons).where(eq(persons.id, id));
    if (!row) throw notFound('Persona', id);
    return row;
  }

  async me(): Promise<PersonRow | null> {
    const p = principal();
    if (!p.personId) return null;
    const [row] = await tx().select().from(persons).where(eq(persons.id, p.personId));
    return row ?? null;
  }

  /** Riporti diretti di una persona (usato per perimetro manager). */
  async directReportIds(personId: string): Promise<string[]> {
    const rows = await tx().select({ id: persons.id }).from(persons).where(eq(persons.managerId, personId));
    return rows.map((r) => r.id);
  }

  async create(dto: CreatePersonDto): Promise<PersonRow> {
    const p = principal();
    if (dto.managerId) await this.get(dto.managerId);
    const [row] = await tx()
      .insert(persons)
      .values({ ...dto, email: dto.email?.toLowerCase(), tenantId: p.tenantId, createdBy: p.userId, customFields: dto.customFields ?? {} })
      .returning();
    await this.recordHistory(row!, null);
    await this.audit.log({ action: 'person.create', entityType: 'person', entityId: row!.id, after: row });
    return row!;
  }

  async update(id: string, dto: UpdatePersonDto): Promise<PersonRow> {
    const before = await this.get(id);
    if (dto.managerId) {
      if (dto.managerId === id) throw unprocessable(ErrorCodes.VALIDATION, 'Una persona non può essere manager di sé stessa');
      await this.get(dto.managerId);
    }
    const [row] = await tx()
      .update(persons)
      .set({ ...dto, email: dto.email?.toLowerCase(), updatedAt: new Date() })
      .where(eq(persons.id, id))
      .returning();
    await this.recordHistory(row!, before);
    await this.audit.log({ action: 'person.update', entityType: 'person', entityId: id, before, after: row });
    return row!;
  }

  async terminate(id: string, terminationDate: string): Promise<PersonRow> {
    const before = await this.get(id);
    const [row] = await tx()
      .update(persons)
      .set({ status: 'leaving', terminationDate, updatedAt: new Date() })
      .where(eq(persons.id, id))
      .returning();
    await this.audit.log({ action: 'person.terminate', entityType: 'person', entityId: id, before, after: row });
    return row!;
  }

  /** Storico con validità temporale dei campi organizzativi (CORE-017). */
  private async recordHistory(after: PersonRow, before: PersonRow | null) {
    const today = new Date().toISOString().slice(0, 10);
    const fields: Array<[string, string | null]> = [
      ['manager_id', after.managerId],
      ['org_unit_id', after.orgUnitId],
      ['job_title', after.jobTitle],
      ['job_level', after.jobLevel],
    ];
    const prev: Record<string, string | null> = before
      ? { manager_id: before.managerId, org_unit_id: before.orgUnitId, job_title: before.jobTitle, job_level: before.jobLevel }
      : {};
    for (const [field, value] of fields) {
      if (before && prev[field] === value) continue;
      if (!before && value == null) continue;
      await tx()
        .update(personHistory)
        .set({ validTo: today })
        .where(and(eq(personHistory.personId, after.id), eq(personHistory.field, field), sql`${personHistory.validTo} IS NULL`));
      await tx().insert(personHistory).values({ tenantId: after.tenantId, personId: after.id, field, value, validFrom: today });
    }
  }

  async history(personId: string) {
    await this.get(personId);
    return tx().select().from(personHistory).where(eq(personHistory.personId, personId)).orderBy(asc(personHistory.field), asc(personHistory.validFrom));
  }
}
