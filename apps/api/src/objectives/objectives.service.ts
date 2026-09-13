import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, or, type SQL } from 'drizzle-orm';
import { checkIns, keyResults, objectives } from '@wb/db';
import {
  ErrorCodes,
  Permissions,
  hasPermission,
  keyResultProgress,
  objectiveProgress,
  type Confidence,
  type Principal,
} from '@wb/shared';
import type { z } from 'zod';
import { principal, tx } from '../common/context.js';
import { conflict, forbidden, notFound, unprocessable } from '../common/errors.js';
import { AuditService } from '../audit/audit.service.js';
import { PeopleService } from '../core/people.service.js';
import { CyclesService } from './cycles.service.js';
import type { CheckInDto, CreateObjectiveDto, KeyResultInput, ListObjectivesQuery, UpdateObjectiveDto, closeObjectiveDto, updateKeyResultDto } from './dto.js';

export type ObjectiveRow = typeof objectives.$inferSelect;
export type KeyResultRow = typeof keyResults.$inferSelect;

export interface ObjectiveView {
  id: string;
  cycleId: string;
  title: string;
  description: string | null;
  level: ObjectiveRow['level'];
  ownerPersonId: string | null;
  ownerOrgUnitId: string | null;
  parentId: string | null;
  status: ObjectiveRow['status'];
  visibility: ObjectiveRow['visibility'];
  weight: number | null;
  progressMode: ObjectiveRow['progressMode'];
  progress: number | null;
  confidence: Confidence | null;
  startDate: string | null;
  dueDate: string | null;
  tags: string[];
  outcome: ObjectiveRow['outcome'];
  finalScore: number | null;
  stale: boolean;
  lastCheckInAt: string | null;
  createdAt: Date;
  updatedAt: Date;
  keyResults: KeyResultView[];
  children?: ObjectiveView[];
}
export interface KeyResultView {
  id: string;
  objectiveId: string;
  title: string;
  type: KeyResultRow['type'];
  unit: string | null;
  startValue: number;
  targetValue: number;
  currentValue: number;
  weight: number | null;
  ownerPersonId: string | null;
  progress: number;
  confidence: Confidence | null;
  lastCheckInAt: string | null;
  position: number;
}

const num = (v: string | null | undefined): number | null => (v == null ? null : Number(v));
const CONF_RANK: Record<Confidence, number> = { on_track: 0, at_risk: 1, off_track: 2 };

@Injectable()
export class ObjectivesService {
  constructor(private readonly audit: AuditService, private readonly cyclesSvc: CyclesService, private readonly people: PeopleService) {}

  // ---------- lettura ----------

  async list(q: ListObjectivesQuery): Promise<ObjectiveView[]> {
    const p = principal();
    const conds: SQL[] = [];
    if (q.cycleId) conds.push(eq(objectives.cycleId, q.cycleId));
    if (q.level) conds.push(eq(objectives.level, q.level));
    if (q.ownerPersonId) conds.push(eq(objectives.ownerPersonId, q.ownerPersonId));
    if (q.ownerOrgUnitId) conds.push(eq(objectives.ownerOrgUnitId, q.ownerOrgUnitId));
    if (q.parentId) conds.push(eq(objectives.parentId, q.parentId));
    if (q.status) conds.push(eq(objectives.status, q.status));
    if (q.confidence) conds.push(eq(objectives.confidence, q.confidence));
    if (q.mine && p.personId) conds.push(eq(objectives.ownerPersonId, p.personId));
    if (q.team && p.personId) {
      const reports = await this.people.directReportIds(p.personId);
      conds.push(reports.length ? inArray(objectives.ownerPersonId, reports) : eq(objectives.id, '00000000-0000-0000-0000-000000000000'));
    }
    const visibility = await this.visibilityFilter(p);
    if (visibility) conds.push(visibility);
    const rows = await tx()
      .select()
      .from(objectives)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(objectives.level), desc(objectives.createdAt));
    const krs = rows.length
      ? await tx().select().from(keyResults).where(inArray(keyResults.objectiveId, rows.map((r) => r.id))).orderBy(asc(keyResults.position))
      : [];
    const cadence = await this.cadenceByCycle(rows.map((r) => r.cycleId));
    let views = rows.map((r) => this.toView(r, krs.filter((k) => k.objectiveId === r.id), cadence.get(r.cycleId) ?? 7));
    if (q.stale) views = views.filter((v) => v.stale);
    return q.tree ? this.buildTree(views) : views;
  }

  async get(id: string): Promise<ObjectiveView> {
    const p = principal();
    const [row] = await tx().select().from(objectives).where(eq(objectives.id, id));
    if (!row || !(await this.canSee(p, row))) throw notFound('Obiettivo', id);
    const krs = await tx().select().from(keyResults).where(eq(keyResults.objectiveId, id)).orderBy(asc(keyResults.position));
    const cadence = await this.cadenceByCycle([row.cycleId]);
    return this.toView(row, krs, cadence.get(row.cycleId) ?? 7);
  }

  async checkInsOf(keyResultId: string) {
    await this.getKeyResult(keyResultId);
    return tx().select().from(checkIns).where(eq(checkIns.keyResultId, keyResultId)).orderBy(desc(checkIns.createdAt));
  }

  // ---------- scrittura ----------

  async create(dto: CreateObjectiveDto): Promise<ObjectiveView> {
    const p = principal();
    await this.cyclesSvc.get(dto.cycleId);
    const ownerPersonId = dto.level === 'individual' ? (dto.ownerPersonId ?? p.personId ?? null) : (dto.ownerPersonId ?? null);
    if (dto.level === 'individual' && !ownerPersonId) throw unprocessable(ErrorCodes.VALIDATION, 'Un obiettivo individuale richiede un owner');
    if (dto.level !== 'individual' && !dto.ownerOrgUnitId && dto.level !== 'company') {
      throw unprocessable(ErrorCodes.VALIDATION, 'Gli obiettivi di unità/team richiedono ownerOrgUnitId');
    }
    await this.assertCanWrite(p, { level: dto.level, ownerPersonId });
    if (dto.parentId) await this.assertParent(dto.parentId, null);
    const [row] = await tx()
      .insert(objectives)
      .values({
        tenantId: p.tenantId,
        createdBy: p.userId,
        cycleId: dto.cycleId,
        title: dto.title,
        description: dto.description,
        level: dto.level,
        ownerPersonId,
        ownerOrgUnitId: dto.ownerOrgUnitId ?? null,
        parentId: dto.parentId ?? null,
        status: dto.publish ? 'active' : 'draft',
        visibility: dto.visibility,
        weight: dto.weight?.toString(),
        progressMode: dto.progressMode,
        startDate: dto.startDate,
        dueDate: dto.dueDate,
        tags: dto.tags ?? [],
      })
      .returning();
    let pos = 0;
    for (const kr of dto.keyResults) await this.insertKeyResult(row!, kr, pos++);
    await this.recompute(row!.id);
    await this.audit.log({ action: 'objective.create', entityType: 'objective', entityId: row!.id, after: dto });
    return this.get(row!.id);
  }

  async update(id: string, dto: UpdateObjectiveDto): Promise<ObjectiveView> {
    const p = principal();
    const before = await this.getRow(id);
    await this.assertCanWrite(p, before);
    if (before.status === 'closed' || before.status === 'cancelled') throw conflict(ErrorCodes.CONFLICT, 'Obiettivo chiuso: non modificabile');
    if (dto.parentId !== undefined && dto.parentId !== null) await this.assertParent(dto.parentId, id);
    await tx()
      .update(objectives)
      .set({
        title: dto.title,
        description: dto.description,
        ownerPersonId: dto.ownerPersonId,
        ownerOrgUnitId: dto.ownerOrgUnitId,
        parentId: dto.parentId,
        visibility: dto.visibility,
        weight: dto.weight?.toString(),
        progressMode: dto.progressMode,
        manualProgress: dto.manualProgress === undefined ? undefined : dto.manualProgress?.toString() ?? null,
        startDate: dto.startDate,
        dueDate: dto.dueDate,
        tags: dto.tags,
        updatedAt: new Date(),
      })
      .where(eq(objectives.id, id));
    await this.recompute(id);
    if (before.parentId && dto.parentId !== undefined && dto.parentId !== before.parentId) await this.recompute(before.parentId);
    await this.audit.log({ action: 'objective.update', entityType: 'objective', entityId: id, before, after: dto });
    return this.get(id);
  }

  async publish(id: string): Promise<ObjectiveView> {
    const p = principal();
    const row = await this.getRow(id);
    await this.assertCanWrite(p, row);
    if (row.status !== 'draft' && row.status !== 'pending_approval') throw conflict(ErrorCodes.CONFLICT, `Stato attuale: ${row.status}`);
    await tx().update(objectives).set({ status: 'active', updatedAt: new Date() }).where(eq(objectives.id, id));
    await this.audit.log({ action: 'objective.publish', entityType: 'objective', entityId: id });
    return this.get(id);
  }

  async close(id: string, dto: z.infer<typeof closeObjectiveDto>): Promise<ObjectiveView> {
    const p = principal();
    const row = await this.getRow(id);
    await this.assertCanWrite(p, row);
    if (row.status === 'closed' || row.status === 'cancelled') throw conflict(ErrorCodes.CONFLICT, 'Obiettivo già chiuso');
    const status = dto.outcome === 'cancelled' ? 'cancelled' : 'closed';
    const finalScore = dto.finalScore ?? (dto.outcome === 'cancelled' ? null : num(row.progress));
    await tx()
      .update(objectives)
      .set({ status, outcome: dto.outcome, finalScore: finalScore?.toString() ?? null, closedNote: dto.note, updatedAt: new Date() })
      .where(eq(objectives.id, id));
    if (row.parentId) await this.recompute(row.parentId);
    await this.audit.log({ action: 'objective.close', entityType: 'objective', entityId: id, before: row, after: dto });
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const p = principal();
    const row = await this.getRow(id);
    await this.assertCanWrite(p, row);
    if (row.status !== 'draft') throw conflict(ErrorCodes.CONFLICT, 'Solo le bozze possono essere eliminate; usa la chiusura con esito "annullato"');
    await tx().delete(keyResults).where(eq(keyResults.objectiveId, id));
    await tx().delete(objectives).where(eq(objectives.id, id));
    await this.audit.log({ action: 'objective.delete', entityType: 'objective', entityId: id, before: row });
  }

  // ---------- key result & check-in ----------

  async addKeyResult(objectiveId: string, kr: KeyResultInput): Promise<ObjectiveView> {
    const p = principal();
    const row = await this.getRow(objectiveId);
    await this.assertCanWrite(p, row);
    const [last] = await tx().select({ n: keyResults.position }).from(keyResults).where(eq(keyResults.objectiveId, objectiveId)).orderBy(desc(keyResults.position)).limit(1);
    await this.insertKeyResult(row, kr, (last?.n ?? -1) + 1);
    await this.recompute(objectiveId);
    await this.audit.log({ action: 'key_result.create', entityType: 'objective', entityId: objectiveId, after: kr });
    return this.get(objectiveId);
  }

  async updateKeyResult(krId: string, dto: z.infer<typeof updateKeyResultDto>): Promise<ObjectiveView> {
    const p = principal();
    const kr = await this.getKeyResult(krId);
    const obj = await this.getRow(kr.objectiveId);
    await this.assertCanWrite(p, obj);
    const start = dto.startValue ?? Number(kr.startValue);
    const target = dto.targetValue ?? Number(kr.targetValue);
    const progress = keyResultProgress({ type: dto.type ?? kr.type, startValue: start, targetValue: target, currentValue: Number(kr.currentValue) });
    await tx()
      .update(keyResults)
      .set({
        title: dto.title,
        type: dto.type,
        unit: dto.unit,
        startValue: dto.startValue?.toString(),
        targetValue: dto.targetValue?.toString(),
        weight: dto.weight?.toString(),
        ownerPersonId: dto.ownerPersonId,
        direction: target < start ? 'decrease' : 'increase',
        progress: progress.toString(),
        updatedAt: new Date(),
      })
      .where(eq(keyResults.id, krId));
    await this.recompute(kr.objectiveId);
    await this.audit.log({ action: 'key_result.update', entityType: 'objective', entityId: kr.objectiveId, before: kr, after: dto });
    return this.get(kr.objectiveId);
  }

  async deleteKeyResult(krId: string): Promise<ObjectiveView> {
    const p = principal();
    const kr = await this.getKeyResult(krId);
    const obj = await this.getRow(kr.objectiveId);
    await this.assertCanWrite(p, obj);
    await tx().delete(checkIns).where(eq(checkIns.keyResultId, krId));
    await tx().delete(keyResults).where(eq(keyResults.id, krId));
    await this.recompute(kr.objectiveId);
    await this.audit.log({ action: 'key_result.delete', entityType: 'objective', entityId: kr.objectiveId, before: kr });
    return this.get(kr.objectiveId);
  }

  /** Check-in su un KR: aggiorna valore, confidenza, progresso e propaga all'obiettivo e ai padri (OKR-030/031/032). */
  async checkIn(krId: string, dto: CheckInDto): Promise<ObjectiveView> {
    const p = principal();
    const kr = await this.getKeyResult(krId);
    const obj = await this.getRow(kr.objectiveId);
    const isKrOwner = kr.ownerPersonId && kr.ownerPersonId === p.personId;
    if (!isKrOwner) await this.assertCanWrite(p, obj);
    if (obj.status !== 'active') throw conflict(ErrorCodes.CONFLICT, 'Il check-in è possibile solo su obiettivi attivi');
    const progress = keyResultProgress({ type: kr.type, startValue: Number(kr.startValue), targetValue: Number(kr.targetValue), currentValue: dto.value });
    const today = new Date().toISOString().slice(0, 10);
    await tx().insert(checkIns).values({ tenantId: p.tenantId, createdBy: p.userId, keyResultId: krId, authorPersonId: p.personId, value: dto.value.toString(), confidence: dto.confidence, comment: dto.comment });
    await tx()
      .update(keyResults)
      .set({ currentValue: dto.value.toString(), progress: progress.toString(), confidence: dto.confidence, lastCheckInAt: today, updatedAt: new Date() })
      .where(eq(keyResults.id, krId));
    await this.recompute(kr.objectiveId);
    await this.audit.log({ action: 'key_result.check_in', entityType: 'objective', entityId: kr.objectiveId, after: { keyResultId: krId, ...dto } });
    return this.get(kr.objectiveId);
  }

  // ---------- interni ----------

  private async insertKeyResult(obj: ObjectiveRow, kr: KeyResultInput, position: number) {
    const p = principal();
    const progress = keyResultProgress({ type: kr.type, startValue: kr.startValue, targetValue: kr.targetValue, currentValue: kr.startValue });
    await tx().insert(keyResults).values({
      tenantId: p.tenantId,
      createdBy: p.userId,
      objectiveId: obj.id,
      title: kr.title,
      type: kr.type,
      unit: kr.unit,
      direction: kr.targetValue < kr.startValue ? 'decrease' : 'increase',
      startValue: kr.startValue.toString(),
      targetValue: kr.targetValue.toString(),
      currentValue: kr.startValue.toString(),
      weight: kr.weight?.toString(),
      ownerPersonId: kr.ownerPersonId ?? obj.ownerPersonId,
      progress: progress.toString(),
      position,
    });
  }

  /**
   * Ricalcolo del progresso: dai KR (media, pesata se pesi presenti); se l'obiettivo non ha KR,
   * dalla media dei figli allineati attivi/chiusi; override manuale se progressMode = manual.
   * La confidenza dell'obiettivo è la peggiore tra i KR. Poi risale al padre.
   */
  async recompute(objectiveId: string, depth = 0): Promise<void> {
    if (depth > 32) return;
    const [obj] = await tx().select().from(objectives).where(eq(objectives.id, objectiveId));
    if (!obj) return;
    const krs = await tx().select().from(keyResults).where(eq(keyResults.objectiveId, objectiveId));
    let progress: number | null;
    let confidence: Confidence | null = null;
    if (obj.progressMode === 'manual') {
      progress = num(obj.manualProgress);
    } else if (krs.length) {
      progress = objectiveProgress(krs.map((k) => ({ progress: Number(k.progress), weight: num(k.weight) })));
    } else {
      const children = await tx()
        .select({ progress: objectives.progress, status: objectives.status })
        .from(objectives)
        .where(and(eq(objectives.parentId, objectiveId), inArray(objectives.status, ['active', 'closed'])));
      const vals = children.map((c) => num(c.progress)).filter((v): v is number => v != null);
      progress = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10000) / 10000 : null;
    }
    for (const k of krs) if (k.confidence && (!confidence || CONF_RANK[k.confidence] > CONF_RANK[confidence])) confidence = k.confidence;
    await tx()
      .update(objectives)
      .set({ progress: progress?.toString() ?? null, confidence, updatedAt: new Date() })
      .where(eq(objectives.id, objectiveId));
    if (obj.parentId) await this.recompute(obj.parentId, depth + 1);
  }

  private async assertParent(parentId: string, selfId: string | null) {
    let cur: string | null = parentId;
    let hops = 0;
    while (cur) {
      if (cur === selfId) throw unprocessable(ErrorCodes.ALIGNMENT_CYCLE, 'L\'allineamento creerebbe un ciclo');
      const [row] = await tx().select({ id: objectives.id, parentId: objectives.parentId }).from(objectives).where(eq(objectives.id, cur));
      if (!row) throw notFound('Obiettivo padre', cur);
      cur = row.parentId;
      if (++hops > 32) throw unprocessable(ErrorCodes.ALIGNMENT_CYCLE, 'Albero di allineamento troppo profondo');
    }
  }

  private async getRow(id: string): Promise<ObjectiveRow> {
    const [row] = await tx().select().from(objectives).where(eq(objectives.id, id));
    if (!row || !(await this.canSee(principal(), row))) throw notFound('Obiettivo', id);
    return row;
  }

  private async getKeyResult(id: string): Promise<KeyResultRow> {
    const [row] = await tx().select().from(keyResults).where(eq(keyResults.id, id));
    if (!row) throw notFound('Key result', id);
    return row;
  }

  /** Permessi di scrittura: own → proprio; team → riporti diretti; company → livello azienda; any → tutto. */
  private async assertCanWrite(p: Principal, obj: { level: ObjectiveRow['level']; ownerPersonId: string | null }) {
    if (hasPermission(p.roles, Permissions.OBJECTIVES_WRITE_ANY)) {
      if (obj.level === 'company' && !hasPermission(p.roles, Permissions.OBJECTIVES_WRITE_COMPANY)) throw forbidden('Gli obiettivi aziendali richiedono il permesso objectives:write:company');
      return;
    }
    if (obj.level === 'company') throw forbidden('Gli obiettivi aziendali possono essere creati solo da HR Admin');
    if (obj.level === 'individual') {
      if (obj.ownerPersonId && obj.ownerPersonId === p.personId && hasPermission(p.roles, Permissions.OBJECTIVES_WRITE_OWN)) return;
      if (hasPermission(p.roles, Permissions.OBJECTIVES_WRITE_TEAM) && p.personId && obj.ownerPersonId) {
        const reports = await this.people.directReportIds(p.personId);
        if (reports.includes(obj.ownerPersonId)) return;
      }
      throw forbidden('Puoi modificare solo i tuoi obiettivi o quelli dei tuoi riporti diretti');
    }
    if (hasPermission(p.roles, Permissions.OBJECTIVES_WRITE_TEAM)) return; // unit/team: manager
    throw forbidden();
  }

  /** Visibilità (OKR-001): pubblico a tutti; team → owner, suo manager, suoi riporti; privato → owner e manager. HR vede tutto. */
  private async visibilityFilter(p: Principal): Promise<SQL | null> {
    if (hasPermission(p.roles, Permissions.OBJECTIVES_WRITE_ANY)) return null;
    const conds: SQL[] = [eq(objectives.visibility, 'public')];
    if (p.personId) {
      conds.push(eq(objectives.ownerPersonId, p.personId));
      const reports = await this.people.directReportIds(p.personId);
      if (reports.length) conds.push(inArray(objectives.ownerPersonId, reports));
      const me = await this.people.get(p.personId).catch(() => null);
      if (me?.managerId) conds.push(and(eq(objectives.visibility, 'team'), eq(objectives.ownerPersonId, me.managerId))!);
    }
    return or(...conds)!;
  }

  private async canSee(p: Principal, row: ObjectiveRow): Promise<boolean> {
    if (hasPermission(p.roles, Permissions.OBJECTIVES_WRITE_ANY) || row.visibility === 'public') return true;
    if (!p.personId) return false;
    if (row.ownerPersonId === p.personId) return true;
    if (row.ownerPersonId && (await this.people.directReportIds(p.personId)).includes(row.ownerPersonId)) return true;
    if (row.visibility === 'team') {
      const me = await this.people.get(p.personId).catch(() => null);
      return !!me?.managerId && me.managerId === row.ownerPersonId;
    }
    return false;
  }

  private async cadenceByCycle(cycleIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    const ids = [...new Set(cycleIds)];
    if (!ids.length) return map;
    const all = await this.cyclesSvc.list();
    for (const c of all) if (ids.includes(c.id)) map.set(c.id, c.checkInCadenceDays);
    return map;
  }

  private toView(r: ObjectiveRow, krs: KeyResultRow[], cadenceDays: number): ObjectiveView {
    const lastCheckIn = krs.map((k) => k.lastCheckInAt).filter((d): d is string => !!d).sort().at(-1) ?? null;
    const ageDays = lastCheckIn ? (Date.now() - new Date(lastCheckIn).getTime()) / 86400000 : (Date.now() - r.createdAt.getTime()) / 86400000;
    const stale = r.status === 'active' && krs.length > 0 && ageDays > cadenceDays;
    return {
      id: r.id,
      cycleId: r.cycleId,
      title: r.title,
      description: r.description,
      level: r.level,
      ownerPersonId: r.ownerPersonId,
      ownerOrgUnitId: r.ownerOrgUnitId,
      parentId: r.parentId,
      status: r.status,
      visibility: r.visibility,
      weight: num(r.weight),
      progressMode: r.progressMode,
      progress: num(r.progress),
      confidence: r.confidence,
      startDate: r.startDate,
      dueDate: r.dueDate,
      tags: r.tags ?? [],
      outcome: r.outcome,
      finalScore: num(r.finalScore),
      stale,
      lastCheckInAt: lastCheckIn,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      keyResults: krs.map((k) => ({
        id: k.id,
        objectiveId: k.objectiveId,
        title: k.title,
        type: k.type,
        unit: k.unit,
        startValue: Number(k.startValue),
        targetValue: Number(k.targetValue),
        currentValue: Number(k.currentValue),
        weight: num(k.weight),
        ownerPersonId: k.ownerPersonId,
        progress: Number(k.progress),
        confidence: k.confidence,
        lastCheckInAt: k.lastCheckInAt,
        position: k.position,
      })),
    };
  }

  private buildTree(views: ObjectiveView[]): ObjectiveView[] {
    const byId = new Map(views.map((v) => [v.id, { ...v, children: [] as ObjectiveView[] }]));
    const roots: ObjectiveView[] = [];
    for (const v of byId.values()) {
      const parent = v.parentId ? byId.get(v.parentId) : undefined;
      if (parent) parent.children!.push(v);
      else roots.push(v);
    }
    return roots;
  }
}
