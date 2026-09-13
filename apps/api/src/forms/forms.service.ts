import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, or, type SQL } from 'drizzle-orm';
import { formAnswers, formDefinitions, formResponses } from '@wb/db';
import { ErrorCodes, Permissions, computeScores, formSchema, hasPermission, validateAnswers, type Answers, type FormSchema } from '@wb/shared';
import { principal, tx } from '../common/context.js';
import { conflict, forbidden, notFound, unprocessable, validation } from '../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

export type FormDefinitionRow = typeof formDefinitions.$inferSelect;
export type FormResponseRow = typeof formResponses.$inferSelect;

/** Callback invocata dopo l'invio di una compilazione con un dato contextType (es. 'review_stage'). */
export type SubmittedResponse = Omit<FormResponseRow, 'score'> & { score: number | null };
export type SubmitHook = (response: SubmittedResponse) => Promise<void>;

@Injectable()
export class FormsService {
  private readonly submitHooks = new Map<string, SubmitHook[]>();
  constructor(private readonly audit: AuditService, private readonly notifier: NotificationsService) {}

  /** I moduli che usano il form engine (review, survey, onboarding) si registrano per reagire all'invio. */
  onSubmitted(contextType: string, hook: SubmitHook): void {
    this.submitHooks.set(contextType, [...(this.submitHooks.get(contextType) ?? []), hook]);
  }

  // ---------- definizioni ----------

  async list(q: { kind?: string; status?: 'draft' | 'published' | 'archived'; latest?: boolean }) {
    const conds: SQL[] = [];
    if (q.kind) conds.push(eq(formDefinitions.kind, q.kind));
    if (q.status) conds.push(eq(formDefinitions.status, q.status));
    const rows = await tx().select().from(formDefinitions).where(conds.length ? and(...conds) : undefined).orderBy(desc(formDefinitions.updatedAt));
    if (!q.latest) return rows.map(this.strip);
    const seen = new Set<string>();
    return rows.filter((r) => (seen.has(r.key) ? false : (seen.add(r.key), true))).map(this.strip);
  }

  async get(id: string): Promise<FormDefinitionRow> {
    const [row] = await tx().select().from(formDefinitions).where(eq(formDefinitions.id, id));
    if (!row) throw notFound('Form', id);
    return row;
  }

  /** Ultima versione pubblicata di una chiave (usata dai processi per creare istanze). */
  async latestPublished(key: string): Promise<FormDefinitionRow | null> {
    const [row] = await tx().select().from(formDefinitions).where(and(eq(formDefinitions.key, key), eq(formDefinitions.status, 'published'))).orderBy(desc(formDefinitions.version)).limit(1);
    return row ?? null;
  }

  async create(dto: { key: string; name: string; kind: string; schema: unknown }) {
    const p = principal();
    const schema = this.parseSchema(dto.schema);
    const [dup] = await tx().select({ id: formDefinitions.id }).from(formDefinitions).where(eq(formDefinitions.key, dto.key)).limit(1);
    if (dup) throw conflict(ErrorCodes.CONFLICT, `Esiste già un form con chiave ${dto.key}: crea una nuova versione`);
    const [row] = await tx().insert(formDefinitions).values({ tenantId: p.tenantId, createdBy: p.userId, key: dto.key, name: dto.name, kind: dto.kind, schema }).returning();
    await this.audit.log({ action: 'form.create', entityType: 'form_definition', entityId: row!.id, after: { key: dto.key, name: dto.name } });
    return row!;
  }

  /** Le bozze si modificano in place; una versione pubblicata è immutabile (APP-007): si crea una nuova versione bozza. */
  async update(id: string, dto: { name?: string; schema?: unknown }) {
    const before = await this.get(id);
    if (before.status !== 'draft') throw conflict(ErrorCodes.CONFLICT, 'Versione pubblicata: usa "nuova versione"');
    const schema = dto.schema === undefined ? undefined : this.parseSchema(dto.schema);
    const [row] = await tx().update(formDefinitions).set({ name: dto.name, schema, updatedAt: new Date() }).where(eq(formDefinitions.id, id)).returning();
    await this.audit.log({ action: 'form.update', entityType: 'form_definition', entityId: id, before: { name: before.name }, after: { name: dto.name } });
    return row!;
  }

  async publish(id: string) {
    const row = await this.get(id);
    if (row.status !== 'draft') throw conflict(ErrorCodes.CONFLICT, `Stato attuale: ${row.status}`);
    this.parseSchema(row.schema);
    // archivia la precedente pubblicata della stessa chiave
    await tx().update(formDefinitions).set({ status: 'archived', updatedAt: new Date() }).where(and(eq(formDefinitions.key, row.key), eq(formDefinitions.status, 'published')));
    const [updated] = await tx().update(formDefinitions).set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() }).where(eq(formDefinitions.id, id)).returning();
    await this.audit.log({ action: 'form.publish', entityType: 'form_definition', entityId: id, after: { key: row.key, version: row.version } });
    return updated!;
  }

  async newVersion(id: string) {
    const p = principal();
    const src = await this.get(id);
    const [last] = await tx().select({ v: formDefinitions.version }).from(formDefinitions).where(eq(formDefinitions.key, src.key)).orderBy(desc(formDefinitions.version)).limit(1);
    const [draftExists] = await tx().select({ id: formDefinitions.id }).from(formDefinitions).where(and(eq(formDefinitions.key, src.key), eq(formDefinitions.status, 'draft')));
    if (draftExists) throw conflict(ErrorCodes.CONFLICT, 'Esiste già una bozza per questa chiave');
    const [row] = await tx().insert(formDefinitions).values({ tenantId: p.tenantId, createdBy: p.userId, key: src.key, name: src.name, kind: src.kind, schema: src.schema, version: (last?.v ?? src.version) + 1, parentId: src.id }).returning();
    await this.audit.log({ action: 'form.new_version', entityType: 'form_definition', entityId: row!.id, after: { from: src.id, version: row!.version } });
    return row!;
  }

  // ---------- risposte ----------

  /** Crea un'istanza di compilazione (bozza). Usato dai processi (review, survey) o direttamente per form "richiesta". */
  async createResponse(dto: { formDefinitionId?: string; formKey?: string; respondentPersonId?: string; subjectPersonId?: string; contextType?: string; contextId?: string; dueDate?: string; notify?: boolean }) {
    const p = principal();
    let def: FormDefinitionRow | null = null;
    if (dto.formDefinitionId) def = await this.get(dto.formDefinitionId);
    else if (dto.formKey) def = await this.latestPublished(dto.formKey);
    if (!def) throw notFound('Form', dto.formDefinitionId ?? dto.formKey);
    if (def.status !== 'published') throw conflict(ErrorCodes.CONFLICT, 'Il form non è pubblicato');
    const respondent = dto.respondentPersonId ?? p.personId ?? null;
    if (respondent !== p.personId && !hasPermission(p.roles, Permissions.FORMS_MANAGE)) throw forbidden('Solo HR può assegnare form ad altre persone');
    const [row] = await tx()
      .insert(formResponses)
      .values({ tenantId: p.tenantId, createdBy: p.userId, formDefinitionId: def.id, formKey: def.key, formVersion: def.version, respondentPersonId: respondent, subjectPersonId: dto.subjectPersonId ?? respondent, contextType: dto.contextType, contextId: dto.contextId, dueDate: dto.dueDate ? new Date(dto.dueDate) : null })
      .returning();
    if (respondent && respondent !== p.personId && dto.notify !== false) {
      await this.notifier.send({ personId: respondent, type: 'form.assigned', data: { title: def.name, dueDate: dto.dueDate ?? null }, link: `/forms/responses/${row!.id}` });
    }
    return this.getResponse(row!.id);
  }

  async listResponses(q: { mine?: boolean; formKey?: string; status?: 'draft' | 'submitted'; subjectPersonId?: string }) {
    const p = principal();
    const conds: SQL[] = [];
    const canManage = hasPermission(p.roles, Permissions.FORMS_MANAGE);
    if (q.mine || !canManage) conds.push(or(eq(formResponses.respondentPersonId, p.personId ?? ''), eq(formResponses.subjectPersonId, p.personId ?? ''))!);
    if (q.formKey) conds.push(eq(formResponses.formKey, q.formKey));
    if (q.status) conds.push(eq(formResponses.status, q.status));
    if (q.subjectPersonId) conds.push(eq(formResponses.subjectPersonId, q.subjectPersonId));
    const rows = await tx().select().from(formResponses).where(conds.length ? and(...conds) : undefined).orderBy(desc(formResponses.createdAt));
    const defIds = [...new Set(rows.map((r) => r.formDefinitionId))];
    const defs = defIds.length ? await tx().select({ id: formDefinitions.id, name: formDefinitions.name, kind: formDefinitions.kind }).from(formDefinitions).where(inArray(formDefinitions.id, defIds)) : [];
    const dmap = new Map(defs.map((d) => [d.id, d]));
    return rows.map((r) => ({ ...r, score: r.score == null ? null : Number(r.score), form: dmap.get(r.formDefinitionId) ?? null }));
  }

  async getResponse(id: string) {
    const p = principal();
    const [row] = await tx().select().from(formResponses).where(eq(formResponses.id, id));
    if (!row) throw notFound('Compilazione', id);
    const party = row.respondentPersonId === p.personId || row.subjectPersonId === p.personId;
    if (!party && !hasPermission(p.roles, Permissions.FORMS_MANAGE)) throw notFound('Compilazione', id);
    const def = await this.get(row.formDefinitionId);
    return { ...row, score: row.score == null ? null : Number(row.score), form: { id: def.id, key: def.key, name: def.name, kind: def.kind, version: def.version, schema: def.schema as FormSchema }, canEdit: row.respondentPersonId === p.personId && row.status === 'draft' };
  }

  /** Salvataggio bozza (APP-009): validazione leggera, nessun obbligo. */
  async saveDraft(id: string, answers: Answers) {
    const r = await this.getResponse(id);
    if (!r.canEdit) throw conflict(ErrorCodes.CONFLICT, 'Compilazione non modificabile');
    const errors = validateAnswers(r.form.schema, answers, 'draft');
    if (errors.length) throw validation(errors);
    await tx().update(formResponses).set({ answers, updatedAt: new Date() }).where(eq(formResponses.id, id));
    return this.getResponse(id);
  }

  /** Invio (APP-002/004): validazione completa, punteggi, risposte normalizzate per l'analytics. */
  async submit(id: string, answers?: Answers) {
    const p = principal();
    const r = await this.getResponse(id);
    if (!r.canEdit) throw conflict(ErrorCodes.CONFLICT, 'Compilazione non modificabile');
    const final = answers ?? (r.answers as Answers);
    const errors = validateAnswers(r.form.schema, final, 'submit');
    if (errors.length) throw validation(errors);
    const scores = r.form.schema.scoring.enabled ? computeScores(r.form.schema, final) : null;
    await tx()
      .update(formResponses)
      .set({ answers: final, status: 'submitted', submittedAt: new Date(), score: scores?.total?.toString() ?? null, sectionScores: scores?.sections ?? null, updatedAt: new Date() })
      .where(eq(formResponses.id, id));
    await tx().delete(formAnswers).where(eq(formAnswers.responseId, id));
    for (const section of r.form.schema.sections) {
      for (const f of section.fields) {
        const v = final[f.key];
        if (v == null || v === '' || f.type === 'info') continue;
        await tx().insert(formAnswers).values({
          tenantId: p.tenantId,
          responseId: id,
          formKey: r.formKey,
          sectionKey: section.key,
          fieldKey: f.key,
          fieldType: f.type,
          valueNumber: typeof v === 'number' ? v.toString() : typeof v === 'boolean' ? (v ? '1' : '0') : null,
          valueText: typeof v === 'string' ? v : null,
          valueOptions: Array.isArray(v) ? v : null,
          subjectPersonId: r.subjectPersonId,
        });
      }
    }
    await this.audit.log({ action: 'form.submit', entityType: 'form_response', entityId: id, after: { formKey: r.formKey, score: scores?.total ?? null } });
    if (r.contextType) {
      const [row] = await tx().select().from(formResponses).where(eq(formResponses.id, id));
      for (const hook of this.submitHooks.get(r.contextType) ?? []) await hook({ ...row!, score: row!.score == null ? null : Number(row!.score) });
    }
    return this.getResponse(id);
  }

  async validate(id: string, answers: Answers) {
    const r = await this.getResponse(id);
    return { errors: validateAnswers(r.form.schema, answers, 'submit'), scores: r.form.schema.scoring.enabled ? computeScores(r.form.schema, answers) : null };
  }

  // ---------- interni ----------
  private parseSchema(input: unknown): FormSchema {
    const res = formSchema.safeParse(input);
    if (!res.success) throw unprocessable(ErrorCodes.VALIDATION, `Schema form non valido: ${res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    return res.data;
  }
  private strip = (r: FormDefinitionRow) => ({ ...r, schema: undefined, sections: (r.schema as FormSchema).sections.length, fields: (r.schema as FormSchema).sections.reduce((n, s) => n + s.fields.length, 0) });
}
