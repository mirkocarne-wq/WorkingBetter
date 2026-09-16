import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import { calibrationSessions, orgUnits, persons, reviewCycles, reviewRatingChanges, reviewTemplates, reviews, talentAssessments } from '@wb/db';
import { ErrorCodes, Permissions, hasPermission, nineBoxLabel, performanceBand } from '@wb/shared';
import type { z } from 'zod';
import { principal, tx } from '../common/context.js';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import type { RatingScale } from './reviews.service.js';
import type { calibrationRatingDto, createCalibrationDto, updateCalibrationDto } from './dto.js';

type SessionRow = typeof calibrationSessions.$inferSelect;
type ReviewRow = typeof reviews.$inferSelect;
type PersonLite = { id: string; firstName: string; lastName: string; jobTitle: string | null; orgUnitId: string | null; managerId: string | null };

/** Scostamento (in punti di scala) della media di un manager dalla media della sessione oltre il quale è segnalato come outlier (REV-042). */
export const OUTLIER_THRESHOLD = 0.75;
/** Stati delle review che entrano nella tabella di calibrazione: serve almeno la manager review inviata. */
const RATED_STATUSES: ReviewRow['status'][] = ['pending_approval', 'pending_share', 'shared', 'signed', 'closed'];

const personName = (p?: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}` : '—');
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Sessioni di calibrazione (REV-040…045): perimetro per unità organizzativa, tabella dei rating proposti,
 * distribuzione vs attesa, medie per manager con outlier, griglia 9-box e blocco della sessione.
 * Finché la sessione è aperta le review nel perimetro non si condividono (vedi ReviewsService.share).
 */
@Injectable()
export class CalibrationService {
  constructor(private readonly audit: AuditService) {}

  // ---------- sessioni ----------

  /** HR vede tutte le sessioni; manager e facilitatori solo quelle a cui partecipano. */
  async list(cycleId?: string) {
    const p = principal();
    const conds = [cycleId ? eq(calibrationSessions.cycleId, cycleId) : undefined].filter((x): x is NonNullable<typeof x> => !!x);
    const rows = await tx().select().from(calibrationSessions).where(conds.length ? and(...conds) : undefined).orderBy(desc(calibrationSessions.createdAt));
    const visible = hasPermission(p, Permissions.REVIEWS_MANAGE) ? rows : rows.filter((s) => this.isMember(p.personId, s));
    const cycleIds = [...new Set(visible.map((s) => s.cycleId))];
    const cycles = cycleIds.length ? await tx().select({ id: reviewCycles.id, name: reviewCycles.name, status: reviewCycles.status }).from(reviewCycles).where(inArray(reviewCycles.id, cycleIds)) : [];
    const cmap = new Map(cycles.map((c) => [c.id, c]));
    const counts = visible.length ? await tx().select({ sessionId: reviews.calibrationSessionId, n: sql<number>`count(*)::int` }).from(reviews).where(inArray(reviews.calibrationSessionId, visible.map((s) => s.id))).groupBy(reviews.calibrationSessionId) : [];
    const nmap = new Map(counts.map((c) => [c.sessionId, c.n]));
    return visible.map((s) => ({ ...this.view(s), cycle: cmap.get(s.cycleId) ?? null, reviewCount: nmap.get(s.id) ?? 0 }));
  }

  async create(cycleId: string, dto: z.infer<typeof createCalibrationDto>) {
    const p = principal();
    const c = await this.cycleRow(cycleId);
    if (c.status === 'closed') throw conflict(ErrorCodes.CONFLICT, 'Il ciclo è chiuso');
    await this.assertUnits(dto.orgUnitIds);
    const [row] = await tx().insert(calibrationSessions).values({ tenantId: p.tenantId, createdBy: p.userId, cycleId, name: dto.name, orgUnitIds: dto.orgUnitIds, participantPersonIds: dto.participantPersonIds, facilitatorPersonId: dto.facilitatorPersonId ?? p.personId ?? null, expectedDistribution: dto.expectedDistribution ?? null, notes: dto.notes ?? null }).returning();
    await this.attachReviews(row!);
    await this.audit.log({ action: 'calibration_session.create', entityType: 'calibration_session', entityId: row!.id, after: dto });
    return this.get(row!.id);
  }

  async update(id: string, dto: z.infer<typeof updateCalibrationDto>) {
    const s = await this.sessionRow(id);
    this.assertMember(s, 'write');
    if (s.status === 'locked') throw conflict(ErrorCodes.CONFLICT, 'Sessione bloccata: sbloccala prima di modificarla');
    if (dto.orgUnitIds) await this.assertUnits(dto.orgUnitIds);
    const [row] = await tx().update(calibrationSessions).set({ ...dto, updatedAt: new Date() }).where(eq(calibrationSessions.id, id)).returning();
    if (dto.orgUnitIds) await this.attachReviews(row!);
    await this.audit.log({ action: 'calibration_session.update', entityType: 'calibration_session', entityId: id, before: { name: s.name, orgUnitIds: s.orgUnitIds }, after: dto });
    return this.get(id);
  }

  /** Vista completa: sessione, righe, distribuzione, medie per manager, 9-box. */
  async get(id: string) {
    const p = principal();
    const s = await this.sessionRow(id);
    this.assertMember(s, 'read');
    const c = await this.cycleRow(s.cycleId);
    const scale = await this.scaleOf(c);
    const rows = await tx().select().from(reviews).where(and(eq(reviews.cycleId, s.cycleId), eq(reviews.calibrationSessionId, s.id), inArray(reviews.status, RATED_STATUSES))).orderBy(asc(reviews.createdAt));
    const people = await this.peopleOf([...new Set(rows.flatMap((r) => [r.subjectPersonId, r.managerPersonId]).filter((x): x is string => !!x)), ...s.participantPersonIds as string[], ...(s.facilitatorPersonId ? [s.facilitatorPersonId] : [])]);
    const unitIds = [...new Set([...rows.map((r) => people.get(r.subjectPersonId)?.orgUnitId), ...(s.orgUnitIds as string[])].filter((x): x is string => !!x))];
    const units = unitIds.length ? await tx().select({ id: orgUnits.id, name: orgUnits.name }).from(orgUnits).where(inArray(orgUnits.id, unitIds)) : [];
    const umap = new Map(units.map((u) => [u.id, u.name]));
    const changes = rows.length ? await tx().select({ reviewId: reviewRatingChanges.reviewId, n: sql<number>`count(*)::int` }).from(reviewRatingChanges).where(and(eq(reviewRatingChanges.sessionId, s.id), inArray(reviewRatingChanges.reviewId, rows.map((r) => r.id)))).groupBy(reviewRatingChanges.reviewId) : [];
    const changed = new Map(changes.map((x) => [x.reviewId, x.n]));

    const items = rows.map((r) => {
      const rating = r.finalRating ?? r.proposedRating ?? null;
      const performance = performanceBand(rating, scale);
      const subject = people.get(r.subjectPersonId) ?? null;
      return {
        reviewId: r.id,
        status: r.status,
        subject: subject ? { id: subject.id, name: personName(subject), jobTitle: subject.jobTitle } : null,
        manager: r.managerPersonId ? { id: r.managerPersonId, name: personName(people.get(r.managerPersonId)) } : null,
        orgUnit: subject?.orgUnitId ? { id: subject.orgUnitId, name: umap.get(subject.orgUnitId) ?? '—' } : null,
        proposedRating: r.proposedRating,
        rating,
        ratingLabel: rating == null ? null : (scale.labels[String(rating)] ?? String(rating)),
        potential: r.potential,
        performance,
        nineBox: nineBoxLabel(performance, r.potential),
        changes: changed.get(r.id) ?? 0,
        calibratedAt: r.calibratedAt,
        sharedAt: r.sharedAt,
      };
    });

    // distribuzione osservata vs attesa, per ogni valore della scala
    const rated = items.filter((i) => i.rating != null);
    const expected = (s.expectedDistribution as Record<string, number> | null) ?? null;
    const distribution = [];
    for (let v = scale.min; v <= scale.max; v++) {
      const count = rated.filter((i) => i.rating === v).length;
      const pct = rated.length ? round2((count / rated.length) * 100) : 0;
      const exp = expected?.[String(v)] ?? null;
      distribution.push({ rating: v, label: scale.labels[String(v)] ?? String(v), count, pct, expectedPct: exp, delta: exp == null ? null : round2(pct - exp) });
    }
    const overallAvg = rated.length ? round2(rated.reduce((a, i) => a + (i.rating as number), 0) / rated.length) : null;

    // medie per manager e outlier (scostamento dalla media della sessione)
    const byManager = new Map<string, { managerId: string; manager: string; count: number; sum: number }>();
    for (const i of rated) {
      if (!i.manager) continue;
      const e = byManager.get(i.manager.id) ?? { managerId: i.manager.id, manager: i.manager.name, count: 0, sum: 0 };
      e.count += 1;
      e.sum += i.rating as number;
      byManager.set(i.manager.id, e);
    }
    const managers = [...byManager.values()]
      .map((m) => {
        const avg = round2(m.sum / m.count);
        const delta = overallAvg == null ? 0 : round2(avg - overallAvg);
        return { managerId: m.managerId, manager: m.manager, count: m.count, avg, delta, outlier: m.count >= 2 && Math.abs(delta) >= OUTLIER_THRESHOLD };
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    // griglia 9-box: performance (dal rating) × potenziale
    const cells: Record<string, number> = {};
    for (const i of items) if (i.performance && i.potential) cells[`${i.performance}-${i.potential}`] = (cells[`${i.performance}-${i.potential}`] ?? 0) + 1;

    const isHr = hasPermission(p, Permissions.REVIEWS_MANAGE);
    const lite = (id: string | null) => (id ? { id, name: personName(people.get(id)) } : null);
    return {
      ...this.view(s),
      cycle: { id: c.id, name: c.name, status: c.status },
      scale,
      orgUnits: (s.orgUnitIds as string[]).map((id) => ({ id, name: umap.get(id) ?? '—' })),
      facilitator: lite(s.facilitatorPersonId),
      participants: (s.participantPersonIds as string[]).map((id) => lite(id)!),
      lockedBy: lite(s.lockedByPersonId),
      items,
      distribution,
      overallAvg,
      managers,
      nineBox: { cells, unplaced: items.filter((i) => !i.performance || !i.potential).length },
      canEdit: s.status === 'open' && c.status === 'active',
      canLock: (isHr || s.facilitatorPersonId === p.personId) && s.status === 'open',
      canUnlock: isHr && s.status === 'locked',
      isHr,
    };
  }

  /** Aggiorna rating e/o potenziale di una review nella sessione, con storico (REV-043) e valutazione talento (DEV). */
  async setRating(id: string, dto: z.infer<typeof calibrationRatingDto>) {
    const p = principal();
    const s = await this.sessionRow(id);
    this.assertMember(s, 'write');
    if (s.status === 'locked') throw conflict(ErrorCodes.CONFLICT, 'Sessione bloccata');
    const c = await this.cycleRow(s.cycleId);
    if (c.status !== 'active') throw conflict(ErrorCodes.CONFLICT, 'Ciclo non attivo');
    const [r] = await tx().select().from(reviews).where(and(eq(reviews.id, dto.reviewId), eq(reviews.calibrationSessionId, s.id)));
    if (!r) throw notFound('Review nella sessione', dto.reviewId);
    if (!RATED_STATUSES.includes(r.status)) throw conflict(ErrorCodes.CONFLICT, 'La manager review non è ancora stata inviata');
    const scale = await this.scaleOf(c);
    const rating = dto.rating === undefined ? r.finalRating : dto.rating;
    if (rating != null && (rating < scale.min || rating > scale.max)) throw unprocessable(ErrorCodes.VALIDATION, `Rating fuori scala ${scale.min}–${scale.max}`);
    const potential = dto.potential === undefined ? r.potential : dto.potential;
    if (rating === r.finalRating && potential === r.potential) return this.get(id);
    const note = dto.note?.trim() || `Calibrazione · ${s.name}`;
    await tx()
      .update(reviews)
      .set({ finalRating: rating, finalRatingLabel: rating == null ? null : (scale.labels[String(rating)] ?? String(rating)), potential, calibratedAt: new Date(), ...(rating !== r.finalRating ? { ratingOverriddenBy: p.userId, ratingOverrideNote: note } : {}), updatedAt: new Date() })
      .where(eq(reviews.id, r.id));
    await tx().insert(reviewRatingChanges).values({ tenantId: p.tenantId, createdBy: p.userId, reviewId: r.id, sessionId: s.id, fromRating: r.finalRating, toRating: rating, fromPotential: r.potential, toPotential: potential, note, byPersonId: p.personId ?? null });
    if (potential != null && potential !== r.potential) {
      // il potenziale deciso in calibrazione alimenta la 9-box del modulo Sviluppo (DEV-011)
      await tx().insert(talentAssessments).values({ tenantId: p.tenantId, createdBy: p.userId, personId: r.subjectPersonId, potential, performance: performanceBand(rating, scale), note, session: s.name, assessedByPersonId: p.personId ?? r.subjectPersonId });
    }
    await this.audit.log({ action: 'review.calibrate', entityType: 'review', entityId: r.id, before: { rating: r.finalRating, potential: r.potential }, after: { rating, potential, note, sessionId: s.id } });
    return this.get(id);
  }

  async lock(id: string) {
    const p = principal();
    const s = await this.sessionRow(id);
    if (!hasPermission(p, Permissions.REVIEWS_MANAGE) && s.facilitatorPersonId !== p.personId) throw forbidden('Solo HR o il facilitatore possono bloccare la sessione');
    if (s.status === 'locked') return this.get(id);
    await tx().update(calibrationSessions).set({ status: 'locked', lockedAt: new Date(), lockedByPersonId: p.personId ?? null, updatedAt: new Date() }).where(eq(calibrationSessions.id, id));
    await this.audit.log({ action: 'calibration_session.lock', entityType: 'calibration_session', entityId: id });
    return this.get(id);
  }

  async unlock(id: string) {
    const p = principal();
    if (!hasPermission(p, Permissions.REVIEWS_MANAGE)) throw forbidden();
    const s = await this.sessionRow(id);
    if (s.status === 'open') return this.get(id);
    const c = await this.cycleRow(s.cycleId);
    if (c.status !== 'active') throw conflict(ErrorCodes.CONFLICT, 'Ciclo non attivo');
    await tx().update(calibrationSessions).set({ status: 'open', lockedAt: null, lockedByPersonId: null, updatedAt: new Date() }).where(eq(calibrationSessions.id, id));
    await this.audit.log({ action: 'calibration_session.unlock', entityType: 'calibration_session', entityId: id });
    return this.get(id);
  }

  // ---------- helpers ----------

  /**
   * Collega alla sessione le review del ciclo il cui soggetto appartiene al perimetro (sottoalbero delle unità).
   * Perimetro vuoto = tutto il ciclo. Le review già in un'altra sessione aperta restano dove sono.
   */
  private async attachReviews(s: SessionRow) {
    const unitIds = s.orgUnitIds as string[];
    let personIds: string[] | null = null;
    if (unitIds.length) {
      const units = await tx().select({ path: orgUnits.path }).from(orgUnits).where(inArray(orgUnits.id, unitIds));
      const subtree = units.length ? await tx().select({ id: orgUnits.id }).from(orgUnits).where(or(...units.map((u) => like(orgUnits.path, `${u.path}%`)))!) : [];
      const ids = [...new Set([...unitIds, ...subtree.map((u) => u.id)])];
      personIds = (await tx().select({ id: persons.id }).from(persons).where(inArray(persons.orgUnitId, ids))).map((x) => x.id);
    }
    const others = (await tx().select({ id: calibrationSessions.id }).from(calibrationSessions).where(and(eq(calibrationSessions.cycleId, s.cycleId), eq(calibrationSessions.status, 'open'), sql`${calibrationSessions.id} <> ${s.id}`))).map((x) => x.id);
    // stacca le review che non rientrano più nel perimetro
    await tx().update(reviews).set({ calibrationSessionId: null, updatedAt: new Date() }).where(and(eq(reviews.calibrationSessionId, s.id), personIds ? sql`${reviews.subjectPersonId} not in ${personIds.length ? personIds : ['00000000-0000-0000-0000-000000000000']}` : sql`false`));
    await tx()
      .update(reviews)
      .set({ calibrationSessionId: s.id, updatedAt: new Date() })
      .where(and(eq(reviews.cycleId, s.cycleId), sql`${reviews.status} <> 'cancelled'`, personIds ? (personIds.length ? inArray(reviews.subjectPersonId, personIds) : sql`false`) : sql`true`, others.length ? or(sql`${reviews.calibrationSessionId} is null`, sql`${reviews.calibrationSessionId} not in ${others}`)! : sql`true`));
  }

  private isMember(personId: string | null, s: SessionRow) {
    return !!personId && (s.facilitatorPersonId === personId || (s.participantPersonIds as string[]).includes(personId));
  }
  private assertMember(s: SessionRow, mode: 'read' | 'write') {
    const p = principal();
    if (hasPermission(p, Permissions.REVIEWS_MANAGE)) return;
    if (!this.isMember(p.personId, s)) throw forbidden('Non partecipi a questa sessione di calibrazione');
    if (mode === 'write' && !hasPermission(p, Permissions.REVIEWS_PARTICIPATE)) throw forbidden();
  }
  private async assertUnits(ids: string[]) {
    if (!ids.length) return;
    const found = await tx().select({ id: orgUnits.id }).from(orgUnits).where(inArray(orgUnits.id, ids));
    if (found.length !== new Set(ids).size) throw unprocessable(ErrorCodes.VALIDATION, 'Unità organizzativa inesistente');
  }
  private async scaleOf(c: typeof reviewCycles.$inferSelect): Promise<RatingScale> {
    const snap = c.templateSnapshot as { ratingScale?: RatingScale } | null;
    if (snap?.ratingScale) return snap.ratingScale;
    const [t] = await tx().select({ ratingScale: reviewTemplates.ratingScale }).from(reviewTemplates).where(eq(reviewTemplates.id, c.templateId));
    return (t?.ratingScale as RatingScale | undefined) ?? { min: 1, max: 5, labels: {} };
  }
  private async peopleOf(ids: string[]) {
    if (!ids.length) return new Map<string, PersonLite>();
    const rows = await tx().select({ id: persons.id, firstName: persons.firstName, lastName: persons.lastName, jobTitle: persons.jobTitle, orgUnitId: persons.orgUnitId, managerId: persons.managerId }).from(persons).where(inArray(persons.id, [...new Set(ids)]));
    return new Map(rows.map((x) => [x.id, x]));
  }
  private async sessionRow(id: string): Promise<SessionRow> {
    const [s] = await tx().select().from(calibrationSessions).where(eq(calibrationSessions.id, id));
    if (!s) throw notFound('Sessione di calibrazione', id);
    return s;
  }
  private async cycleRow(id: string) {
    const [c] = await tx().select().from(reviewCycles).where(eq(reviewCycles.id, id));
    if (!c) throw notFound('Ciclo di review', id);
    return c;
  }
  private view(s: SessionRow) {
    return { id: s.id, cycleId: s.cycleId, name: s.name, orgUnitIds: s.orgUnitIds as string[], participantPersonIds: s.participantPersonIds as string[], facilitatorPersonId: s.facilitatorPersonId, expectedDistribution: (s.expectedDistribution as Record<string, number> | null) ?? null, notes: s.notes, status: s.status, lockedAt: s.lockedAt, createdAt: s.createdAt, updatedAt: s.updatedAt };
  }
}
