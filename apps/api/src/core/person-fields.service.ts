import { Injectable } from '@nestjs/common';
import { asc, eq, isNull } from 'drizzle-orm';
import { personFieldDefs } from '@wb/db';
import { ErrorCodes, Permissions, effectivePermissions, validateCustomFields, visibleFieldDefs, type PersonFieldDef, type Principal } from '@wb/shared';
import { principal, tx } from '../common/context.js';
import { conflict, notFound, unprocessable } from '../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import type { CreatePersonFieldDto, UpdatePersonFieldDto } from './dto.js';

export type PersonFieldRow = typeof personFieldDefs.$inferSelect;
type Viewer = 'hr' | 'manager' | 'self' | 'other';

/** Catalogo dei campi custom della persona (CORE-011): definizioni per tenant, validazione e visibilità dei valori. */
@Injectable()
export class PersonFieldsService {
  constructor(private readonly audit: AuditService) {}

  list(includeArchived = false): Promise<PersonFieldRow[]> {
    return tx()
      .select()
      .from(personFieldDefs)
      .where(includeArchived ? undefined : isNull(personFieldDefs.archivedAt))
      .orderBy(asc(personFieldDefs.position), asc(personFieldDefs.createdAt));
  }

  /** Definizioni attive come viste dal validatore condiviso. */
  async activeDefs(): Promise<PersonFieldDef[]> {
    return (await this.list(false)).map(toDef);
  }

  async create(dto: CreatePersonFieldDto): Promise<PersonFieldRow> {
    const p = principal();
    if (dto.type === 'single_choice' && !dto.options?.length) throw unprocessable(ErrorCodes.VALIDATION, 'Un campo a scelta ha bisogno di almeno un’opzione');
    const [dup] = await tx().select({ id: personFieldDefs.id }).from(personFieldDefs).where(eq(personFieldDefs.key, dto.key));
    if (dup) throw conflict(ErrorCodes.CONFLICT, `Esiste già un campo con chiave «${dto.key}»`);
    const existing = await this.list(true);
    const [row] = await tx()
      .insert(personFieldDefs)
      .values({ ...dto, options: dto.options ?? [], position: dto.position ?? existing.length, tenantId: p.tenantId, createdBy: p.userId })
      .returning();
    await this.audit.log({ action: 'person_field.create', entityType: 'person_field_def', entityId: row!.id, after: row });
    return row!;
  }

  async update(id: string, dto: UpdatePersonFieldDto): Promise<PersonFieldRow> {
    const [before] = await tx().select().from(personFieldDefs).where(eq(personFieldDefs.id, id));
    if (!before) throw notFound('Campo persona', id);
    const { archived, ...rest } = dto;
    const type = rest.type ?? before.type;
    const options = rest.options ?? before.options;
    if (type === 'single_choice' && !options.length) throw unprocessable(ErrorCodes.VALIDATION, 'Un campo a scelta ha bisogno di almeno un’opzione');
    const patch: Partial<typeof personFieldDefs.$inferInsert> = { ...rest, updatedAt: new Date() };
    if (archived !== undefined) patch.archivedAt = archived ? (before.archivedAt ?? new Date()) : null;
    const [row] = await tx().update(personFieldDefs).set(patch).where(eq(personFieldDefs.id, id)).returning();
    await this.audit.log({ action: 'person_field.update', entityType: 'person_field_def', entityId: id, before, after: row });
    return row!;
  }

  /** Valida i valori contro il catalogo attivo; 422 con l'elenco degli errori per chiave. */
  async validate(values: Record<string, unknown>, opts: { requireAll?: boolean } = {}): Promise<Record<string, unknown>> {
    const defs = await this.activeDefs();
    const { errors, values: clean } = validateCustomFields(defs, values, opts);
    const keys = Object.keys(errors);
    if (keys.length) throw unprocessable(ErrorCodes.VALIDATION, `Campi custom non validi: ${keys.map((k) => `${k} (${errors[k]})`).join(', ')}`);
    // le chiavi esplicitamente azzerate (null o stringa vuota) vengono rimosse dal merge
    for (const [k, v] of Object.entries(values)) if ((v == null || v === '') && !(k in clean)) clean[k] = null;
    return clean;
  }

  /** Fonde i valori validati con quelli esistenti: null rimuove la chiave. */
  merge(current: unknown, incoming: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...((current as Record<string, unknown>) ?? {}) };
    for (const [k, v] of Object.entries(incoming)) { if (v == null) delete out[k]; else out[k] = v; }
    return out;
  }

  /** Punto di vista di chi legge una persona: HR (people:write) vede tutto, il manager i campi «manager», la persona stessa e gli altri solo «all». */
  viewerFor(p: Principal, person: { id: string; managerId: string | null }): Viewer {
    if (effectivePermissions(p).has(Permissions.PEOPLE_WRITE)) return 'hr';
    if (p.personId && person.managerId === p.personId) return 'manager';
    if (p.personId && person.id === p.personId) return 'self';
    return 'other';
  }

  /** Riduce customFields ai soli campi visibili all'osservatore (i valori fuori catalogo restano visibili solo all'HR). */
  redact<T extends { id: string; managerId: string | null; customFields: unknown }>(rows: T[], defs: PersonFieldDef[], p: Principal): T[] {
    return rows.map((r) => {
      const viewer = this.viewerFor(p, r);
      if (viewer === 'hr') return r;
      const allowed = new Set(visibleFieldDefs(defs, viewer).map((d) => d.key));
      const cf = (r.customFields as Record<string, unknown>) ?? {};
      return { ...r, customFields: Object.fromEntries(Object.entries(cf).filter(([k]) => allowed.has(k))) };
    });
  }
}

export const toDef = (r: PersonFieldRow): PersonFieldDef => ({
  key: r.key, label: r.label, type: r.type as PersonFieldDef['type'], options: r.options ?? [], section: r.section, help: r.help,
  required: r.required, visibility: r.visibility as PersonFieldDef['visibility'], position: r.position,
});
