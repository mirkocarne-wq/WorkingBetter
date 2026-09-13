import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { companyValues, feedback, feedbackRequestRecipients, feedbackRequests, persons, recognitionReactions, recognitionRecipients, recognitionValues, recognitions } from '@wb/db';
import { ErrorCodes, Permissions, hasPermission, type Principal } from '@wb/shared';
import type { z } from 'zod';
import { principal, tx } from '../common/context.js';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors.js';
import { decodeCursor, toPage } from '../common/pagination.js';
import { AuditService } from '../audit/audit.service.js';
import { PeopleService } from '../core/people.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { createRequestDto, createValueDto, giveFeedbackDto, giveRecognitionDto, listFeedbackQuery, listRecognitionsQuery, updateValueDto } from './dto.js';

@Injectable()
export class FeedbackService {
  constructor(private readonly audit: AuditService, private readonly people: PeopleService, private readonly notifier: NotificationsService) {}

  // ---------- valori aziendali ----------

  listValues(includeInactive = false) {
    return tx().select().from(companyValues).where(includeInactive ? undefined : eq(companyValues.active, true)).orderBy(asc(companyValues.position), asc(companyValues.name));
  }
  async createValue(dto: z.infer<typeof createValueDto>) {
    const p = principal();
    const [row] = await tx().insert(companyValues).values({ tenantId: p.tenantId, createdBy: p.userId, ...dto }).returning();
    await this.audit.log({ action: 'company_value.create', entityType: 'company_value', entityId: row!.id, after: dto });
    return row!;
  }
  async updateValue(id: string, dto: z.infer<typeof updateValueDto>) {
    const [before] = await tx().select().from(companyValues).where(eq(companyValues.id, id));
    if (!before) throw notFound('Valore aziendale', id);
    const [row] = await tx().update(companyValues).set({ ...dto, updatedAt: new Date() }).where(eq(companyValues.id, id)).returning();
    await this.audit.log({ action: 'company_value.update', entityType: 'company_value', entityId: id, before, after: dto });
    return row!;
  }

  // ---------- feedback ----------

  async give(dto: z.infer<typeof giveFeedbackDto>) {
    const p = this.me();
    if (dto.toPersonId === p.personId) throw unprocessable(ErrorCodes.VALIDATION, 'Non puoi darti feedback da solo');
    await this.people.get(dto.toPersonId);
    let requestRecipient: typeof feedbackRequestRecipients.$inferSelect | undefined;
    if (dto.requestRecipientId) {
      [requestRecipient] = await tx().select().from(feedbackRequestRecipients).where(and(eq(feedbackRequestRecipients.id, dto.requestRecipientId), eq(feedbackRequestRecipients.personId, p.personId)));
      if (!requestRecipient) throw notFound('Richiesta di feedback', dto.requestRecipientId);
      if (requestRecipient.status !== 'pending') throw conflict(ErrorCodes.CONFLICT, 'Richiesta già evasa');
    }
    const [row] = await tx()
      .insert(feedback)
      .values({
        tenantId: p.tenantId,
        createdBy: p.userId,
        fromPersonId: p.personId,
        toPersonId: dto.toPersonId,
        kind: dto.kind,
        body: dto.body,
        visibility: dto.visibility,
        valueId: dto.valueId,
        objectiveId: dto.objectiveId,
        requestRecipientId: requestRecipient?.id,
        sharedWithManagerAt: dto.visibility === 'manager' ? new Date() : null,
      })
      .returning();
    if (requestRecipient) {
      await tx().update(feedbackRequestRecipients).set({ status: 'answered', feedbackId: row!.id, respondedAt: new Date() }).where(eq(feedbackRequestRecipients.id, requestRecipient.id));
      // feedback richiesto da un manager su un riporto: visibile al manager richiedente
      const [req] = await tx().select().from(feedbackRequests).where(eq(feedbackRequests.id, requestRecipient.requestId));
      if (req && req.requesterPersonId !== req.aboutPersonId) await tx().update(feedback).set({ visibility: 'manager', sharedWithManagerAt: new Date() }).where(eq(feedback.id, row!.id));
    }
    await this.audit.log({ action: 'feedback.give', entityType: 'feedback', entityId: row!.id, after: { toPersonId: dto.toPersonId, kind: dto.kind, visibility: dto.visibility } });
    const me = await this.people.get(p.personId);
    await this.notifier.send({ personId: dto.toPersonId, type: 'feedback.received', data: { fromName: `${me.firstName} ${me.lastName}`, preview: dto.body.slice(0, 140) }, link: '/feedback?tab=received' });
    return this.getFeedback(row!.id);
  }

  async list(q: z.infer<typeof listFeedbackQuery>) {
    const p = this.me();
    const conds: SQL[] = [];
    if (q.box === 'received') conds.push(eq(feedback.toPersonId, p.personId));
    else if (q.box === 'given') conds.push(eq(feedback.fromPersonId, p.personId));
    else {
      if (!q.aboutPersonId) throw unprocessable(ErrorCodes.VALIDATION, 'aboutPersonId richiesto');
      await this.assertCanReadAbout(p, q.aboutPersonId);
      const about = await this.people.get(q.aboutPersonId);
      conds.push(eq(feedback.toPersonId, q.aboutPersonId));
      // il manager attuale vede i feedback condivisi con il manager; i manager successivi solo quelli "in fascicolo"
      conds.push(about.managerId === p.personId ? eq(feedback.visibility, 'manager') : sql`${feedback.inRecordAt} IS NOT NULL`);
    }
    const c = decodeCursor(q.cursor);
    if (c) conds.push(or(lt(feedback.createdAt, c.createdAt), and(eq(feedback.createdAt, c.createdAt), lt(feedback.id, c.id)))!);
    const rows = await tx().select().from(feedback).where(and(...conds)).orderBy(desc(feedback.createdAt), desc(feedback.id)).limit(q.limit + 1);
    const page = toPage(rows, q.limit);
    return { ...page, items: await this.decorate(page.items) };
  }

  async getFeedback(id: string) {
    const p = this.me();
    const [row] = await tx().select().from(feedback).where(eq(feedback.id, id));
    if (!row) throw notFound('Feedback', id);
    const isParty = row.toPersonId === p.personId || row.fromPersonId === p.personId;
    if (!isParty) {
      const to = await this.people.get(row.toPersonId);
      const isManager = to.managerId === p.personId && row.visibility === 'manager';
      if (!isManager && !(row.inRecordAt && hasPermission(p.roles, Permissions.FEEDBACK_READ_TEAM))) throw notFound('Feedback', id);
    }
    return (await this.decorate([row]))[0]!;
  }

  async acknowledge(id: string, helpful?: boolean) {
    const p = this.me();
    const [row] = await tx().select().from(feedback).where(and(eq(feedback.id, id), eq(feedback.toPersonId, p.personId)));
    if (!row) throw notFound('Feedback', id);
    await tx().update(feedback).set({ acknowledgedAt: new Date(), helpful: helpful ?? row.helpful, updatedAt: new Date() }).where(eq(feedback.id, id));
    return this.getFeedback(id);
  }

  /** Il destinatario decide di condividere con il manager e/o di metterlo "in fascicolo" (FBK §6). */
  async share(id: string, opts: { withManager?: boolean; inRecord?: boolean }) {
    const p = this.me();
    const [row] = await tx().select().from(feedback).where(and(eq(feedback.id, id), eq(feedback.toPersonId, p.personId)));
    if (!row) throw notFound('Feedback', id);
    await tx()
      .update(feedback)
      .set({
        visibility: opts.withManager ? 'manager' : undefined,
        sharedWithManagerAt: opts.withManager ? new Date() : undefined,
        inRecordAt: opts.inRecord ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(feedback.id, id));
    await this.audit.log({ action: 'feedback.share', entityType: 'feedback', entityId: id, after: opts });
    return this.getFeedback(id);
  }

  // ---------- richieste ----------

  async createRequest(dto: z.infer<typeof createRequestDto>) {
    const p = this.me();
    const about = dto.aboutPersonId ?? p.personId;
    if (about !== p.personId) {
      const reports = await this.people.directReportIds(p.personId);
      if (!reports.includes(about) && !hasPermission(p.roles, Permissions.OBJECTIVES_WRITE_ANY)) throw forbidden('Puoi chiedere feedback su di te o sui tuoi riporti diretti');
    }
    const recipients = [...new Set(dto.recipientPersonIds)].filter((id) => id !== p.personId);
    if (!recipients.length) throw unprocessable(ErrorCodes.VALIDATION, 'Indica almeno un destinatario diverso da te');
    const existing = await tx().select({ id: persons.id }).from(persons).where(inArray(persons.id, recipients));
    if (existing.length !== recipients.length) throw notFound('Persona');
    const [req] = await tx().insert(feedbackRequests).values({ tenantId: p.tenantId, createdBy: p.userId, requesterPersonId: p.personId, aboutPersonId: about, question: dto.question, dueDate: dto.dueDate ?? null }).returning();
    for (const personId of recipients) await tx().insert(feedbackRequestRecipients).values({ tenantId: p.tenantId, createdBy: p.userId, requestId: req!.id, personId });
    await this.audit.log({ action: 'feedback_request.create', entityType: 'feedback_request', entityId: req!.id, after: { about, recipients: recipients.length } });
    const me = await this.people.get(p.personId);
    const aboutPerson = about === p.personId ? null : await this.people.get(about);
    for (const personId of recipients) {
      await this.notifier.send({ personId, type: 'feedback.request.received', data: { fromName: `${me.firstName} ${me.lastName}`, aboutName: aboutPerson ? `${aboutPerson.firstName} ${aboutPerson.lastName}` : null, question: dto.question }, link: '/feedback?tab=requests' });
    }
    return this.getRequest(req!.id);
  }

  async getRequest(id: string) {
    const p = this.me();
    const [req] = await tx().select().from(feedbackRequests).where(eq(feedbackRequests.id, id));
    if (!req) throw notFound('Richiesta di feedback', id);
    const recips = await tx().select().from(feedbackRequestRecipients).where(eq(feedbackRequestRecipients.requestId, id));
    if (req.requesterPersonId !== p.personId && !recips.some((r) => r.personId === p.personId)) throw notFound('Richiesta di feedback', id);
    return { ...req, recipients: recips };
  }

  async listRequests(q: { box: 'inbox' | 'sent'; status?: 'pending' | 'answered' | 'declined' }) {
    const p = this.me();
    if (q.box === 'sent') {
      const reqs = await tx().select().from(feedbackRequests).where(eq(feedbackRequests.requesterPersonId, p.personId)).orderBy(desc(feedbackRequests.createdAt));
      const recips = reqs.length ? await tx().select().from(feedbackRequestRecipients).where(inArray(feedbackRequestRecipients.requestId, reqs.map((r) => r.id))) : [];
      return reqs.map((r) => ({ ...r, recipients: recips.filter((x) => x.requestId === r.id) }));
    }
    const conds: SQL[] = [eq(feedbackRequestRecipients.personId, p.personId)];
    if (q.status) conds.push(eq(feedbackRequestRecipients.status, q.status));
    const rows = await tx()
      .select({ recipient: feedbackRequestRecipients, request: feedbackRequests })
      .from(feedbackRequestRecipients)
      .innerJoin(feedbackRequests, eq(feedbackRequests.id, feedbackRequestRecipients.requestId))
      .where(and(...conds))
      .orderBy(desc(feedbackRequests.createdAt));
    return rows.map((r) => ({ recipientId: r.recipient.id, status: r.recipient.status, request: r.request }));
  }

  async decline(recipientId: string, reason?: string) {
    const p = this.me();
    const [r] = await tx().select().from(feedbackRequestRecipients).where(and(eq(feedbackRequestRecipients.id, recipientId), eq(feedbackRequestRecipients.personId, p.personId)));
    if (!r) throw notFound('Richiesta di feedback', recipientId);
    if (r.status !== 'pending') throw conflict(ErrorCodes.CONFLICT, 'Richiesta già evasa');
    await tx().update(feedbackRequestRecipients).set({ status: 'declined', declineReason: reason, respondedAt: new Date() }).where(eq(feedbackRequestRecipients.id, recipientId));
    return { ok: true };
  }

  // ---------- riconoscimenti ----------

  async giveRecognition(dto: z.infer<typeof giveRecognitionDto>) {
    const p = this.me();
    const recipients = [...new Set(dto.recipientPersonIds)].filter((id) => id !== p.personId);
    if (!recipients.length) throw unprocessable(ErrorCodes.VALIDATION, 'Indica almeno un destinatario diverso da te');
    const existing = await tx().select({ id: persons.id }).from(persons).where(inArray(persons.id, recipients));
    if (existing.length !== recipients.length) throw notFound('Persona');
    if (dto.valueIds.length) {
      const vals = await tx().select({ id: companyValues.id }).from(companyValues).where(and(inArray(companyValues.id, dto.valueIds), eq(companyValues.active, true)));
      if (vals.length !== new Set(dto.valueIds).size) throw notFound('Valore aziendale');
    }
    const [rec] = await tx().insert(recognitions).values({ tenantId: p.tenantId, createdBy: p.userId, fromPersonId: p.personId, message: dto.message }).returning();
    for (const personId of recipients) await tx().insert(recognitionRecipients).values({ tenantId: p.tenantId, recognitionId: rec!.id, personId });
    for (const valueId of new Set(dto.valueIds)) await tx().insert(recognitionValues).values({ tenantId: p.tenantId, recognitionId: rec!.id, valueId });
    await this.audit.log({ action: 'recognition.give', entityType: 'recognition', entityId: rec!.id, after: { recipients, valueIds: dto.valueIds } });
    const me = await this.people.get(p.personId);
    for (const personId of recipients) await this.notifier.send({ personId, type: 'recognition.received', data: { fromName: `${me.firstName} ${me.lastName}`, preview: dto.message.slice(0, 140) }, link: '/feedback' });
    return (await this.recognitionViews([rec!]))[0]!;
  }

  async feed(q: z.infer<typeof listRecognitionsQuery>) {
    const p = this.me();
    const conds: SQL[] = [isNull(recognitions.hiddenAt)];
    let personFilter: string[] | null = null;
    if (q.scope === 'mine') personFilter = [p.personId];
    if (q.personId) personFilter = [q.personId];
    if (q.scope === 'team' && !q.personId) personFilter = [p.personId, ...(await this.people.directReportIds(p.personId))];
    if (q.scope === 'unit' && !q.personId) {
      const me = await this.people.get(p.personId);
      if (me.orgUnitId) {
        const unitPeople = await tx().select({ id: persons.id }).from(persons).where(eq(persons.orgUnitId, me.orgUnitId));
        personFilter = unitPeople.map((r) => r.id);
      }
    }
    if (personFilter) {
      const recIds = personFilter.length
        ? await tx().select({ id: recognitionRecipients.recognitionId }).from(recognitionRecipients).where(inArray(recognitionRecipients.personId, personFilter))
        : [];
      const fromIds = await tx().select({ id: recognitions.id }).from(recognitions).where(personFilter.length ? inArray(recognitions.fromPersonId, personFilter) : sql`false`);
      const ids = [...new Set([...recIds.map((r) => r.id), ...fromIds.map((r) => r.id)])];
      conds.push(ids.length ? inArray(recognitions.id, ids) : sql`false`);
    }
    const c = decodeCursor(q.cursor);
    if (c) conds.push(or(lt(recognitions.createdAt, c.createdAt), and(eq(recognitions.createdAt, c.createdAt), lt(recognitions.id, c.id)))!);
    const rows = await tx().select().from(recognitions).where(and(...conds)).orderBy(desc(recognitions.createdAt), desc(recognitions.id)).limit(q.limit + 1);
    const page = toPage(rows, q.limit);
    return { ...page, items: await this.recognitionViews(page.items) };
  }

  async react(id: string, emoji: string) {
    const p = this.me();
    const [rec] = await tx().select().from(recognitions).where(and(eq(recognitions.id, id), isNull(recognitions.hiddenAt)));
    if (!rec) throw notFound('Riconoscimento', id);
    const [existing] = await tx().select().from(recognitionReactions).where(and(eq(recognitionReactions.recognitionId, id), eq(recognitionReactions.personId, p.personId)));
    if (existing) await tx().update(recognitionReactions).set({ emoji }).where(eq(recognitionReactions.id, existing.id));
    else await tx().insert(recognitionReactions).values({ tenantId: p.tenantId, recognitionId: id, personId: p.personId, emoji });
    return (await this.recognitionViews([rec]))[0]!;
  }

  async hide(id: string) {
    const p = principal();
    const [rec] = await tx().select().from(recognitions).where(eq(recognitions.id, id));
    if (!rec) throw notFound('Riconoscimento', id);
    await tx().update(recognitions).set({ hiddenAt: new Date(), hiddenByUserId: p.userId }).where(eq(recognitions.id, id));
    await this.audit.log({ action: 'recognition.hide', entityType: 'recognition', entityId: id, before: rec });
  }

  /** Statistiche per valore (FBK-022) negli ultimi N giorni. */
  async valueStats(days = 90) {
    const since = new Date(Date.now() - days * 86400000);
    const rows = await tx()
      .select({ valueId: recognitionValues.valueId, name: companyValues.name, n: sql<number>`count(*)::int` })
      .from(recognitionValues)
      .innerJoin(recognitions, eq(recognitions.id, recognitionValues.recognitionId))
      .innerJoin(companyValues, eq(companyValues.id, recognitionValues.valueId))
      .where(and(isNull(recognitions.hiddenAt), gte(recognitions.createdAt, since)))
      .groupBy(recognitionValues.valueId, companyValues.name)
      .orderBy(desc(sql`count(*)`));
    return { windowDays: days, byValue: rows };
  }

  // ---------- interni ----------

  private me(): Principal & { personId: string } {
    const p = principal();
    if (!p.personId) throw forbidden('Serve una persona collegata all\'utente');
    return p as Principal & { personId: string };
  }

  private async assertCanReadAbout(p: Principal, aboutPersonId: string) {
    if (aboutPersonId === p.personId) return;
    if (!hasPermission(p.roles, Permissions.FEEDBACK_READ_TEAM)) throw forbidden();
    if (hasPermission(p.roles, Permissions.OBJECTIVES_WRITE_ANY)) return; // HR: solo feedback "in fascicolo" (filtro in list)
    const reports = p.personId ? await this.people.directReportIds(p.personId) : [];
    if (!reports.includes(aboutPersonId)) throw forbidden('Puoi leggere solo i feedback condivisi dei tuoi riporti diretti');
  }

  private async decorate(rows: (typeof feedback.$inferSelect)[]) {
    if (!rows.length) return [];
    const ids = [...new Set(rows.flatMap((r) => [r.fromPersonId, r.toPersonId]))];
    const people = await tx().select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName }).from(persons).where(inArray(persons.id, ids));
    const byId = new Map(people.map((x) => [x.id, x]));
    const valueIds = rows.map((r) => r.valueId).filter((v): v is string => !!v);
    const values = valueIds.length ? await tx().select().from(companyValues).where(inArray(companyValues.id, valueIds)) : [];
    const vById = new Map(values.map((v) => [v.id, v]));
    return rows.map((r) => ({ ...r, from: byId.get(r.fromPersonId) ?? null, to: byId.get(r.toPersonId) ?? null, value: r.valueId ? (vById.get(r.valueId) ?? null) : null }));
  }

  private async recognitionViews(rows: (typeof recognitions.$inferSelect)[]) {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [recips, vals, reacts] = await Promise.all([
      tx().select().from(recognitionRecipients).where(inArray(recognitionRecipients.recognitionId, ids)),
      tx().select({ recognitionId: recognitionValues.recognitionId, value: companyValues }).from(recognitionValues).innerJoin(companyValues, eq(companyValues.id, recognitionValues.valueId)).where(inArray(recognitionValues.recognitionId, ids)),
      tx().select().from(recognitionReactions).where(inArray(recognitionReactions.recognitionId, ids)),
    ]);
    const personIds = [...new Set([...rows.map((r) => r.fromPersonId), ...recips.map((r) => r.personId)])];
    const people = await tx().select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName, jobTitle: persons.jobTitle }).from(persons).where(inArray(persons.id, personIds));
    const byId = new Map(people.map((x) => [x.id, x]));
    return rows.map((r) => ({
      id: r.id,
      message: r.message,
      createdAt: r.createdAt,
      from: byId.get(r.fromPersonId) ?? null,
      recipients: recips.filter((x) => x.recognitionId === r.id).map((x) => byId.get(x.personId) ?? { id: x.personId }),
      values: vals.filter((x) => x.recognitionId === r.id).map((x) => ({ id: x.value.id, name: x.value.name, icon: x.value.icon })),
      reactions: Object.entries(reacts.filter((x) => x.recognitionId === r.id).reduce<Record<string, number>>((acc, x) => ((acc[x.emoji] = (acc[x.emoji] ?? 0) + 1), acc), {})).map(([emoji, count]) => ({ emoji, count })),
    }));
  }
}
