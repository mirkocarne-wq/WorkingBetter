import { Injectable } from '@nestjs/common';
import { and, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import {
  apps,
  checkIns,
  companyValues,
  competencies,
  cycles,
  feedback,
  formDefinitions,
  guideStates,
  jobProfiles,
  meetings,
  objectives,
  onboardingTemplates,
  oneOnOneRelations,
  orgUnits,
  persons,
  recognitions,
  reviewCycles,
  reviewTemplates,
  reviews,
  roleAssignments,
  surveys,
  tenants,
  users,
  welfarePlans,
} from '@wb/db';
import { ErrorCodes, GuideCatalog, guideProfileForRoles, guideProfilesAvailable, type GuideCheck, type GuideProfile, type GuideStep, type Principal } from '@wb/shared';
import { principal, tx } from '../common/context.js';
import { forbidden, unprocessable } from '../common/errors.js';

type CheckResult = { ok: boolean; detail?: string };
type StepView = GuideStep & { status: 'done' | 'todo'; auto: boolean; detail: string | null; personal: boolean };

/** Controlli che riguardano la persona (non il tenant): per un profilo consultato «per conto di» non sono valutabili. */
const PERSONAL_CHECKS: GuideCheck[] = ['secure_access', 'has_reports', 'team_objectives', 'one_on_one_relations', 'one_on_one_done', 'feedback_given', 'team_reviews', 'own_objective', 'own_check_in', 'own_one_on_one', 'own_mfa'];

const count = sql<number>`count(*)::int`;
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Avviamento guidato (AVV): passi per profilo con controlli automatici sui dati reali del tenant o della persona,
 * più lo stato personale (passi manuali segnati, promemoria nascosto).
 */
@Injectable()
export class GuidesService {
  async me(profileParam?: string) {
    const p = principal();
    const available = guideProfilesAvailable(p.roles);
    const mine = guideProfileForRoles(p.roles);
    const profile = (profileParam as GuideProfile | undefined) ?? mine;
    if (!available.includes(profile)) throw forbidden('Profilo della guida non consultabile');
    const forSelf = profile === mine;
    const def = GuideCatalog[profile];
    const state = await this.stateRow(p, profile);
    const done = new Set((state?.doneSteps as string[] | undefined) ?? []);
    const results = new Map<GuideCheck, CheckResult>();
    for (const s of def.steps) {
      if (!s.check || results.has(s.check)) continue;
      if (!forSelf && PERSONAL_CHECKS.includes(s.check)) continue;
      results.set(s.check, await this.check(s.check, p));
    }
    const steps: StepView[] = def.steps.map((s) => {
      const personal = !!s.check && PERSONAL_CHECKS.includes(s.check);
      if (s.check && (forSelf || !personal)) {
        const r = results.get(s.check)!;
        return { ...s, auto: true, personal, status: r.ok ? 'done' : 'todo', detail: r.detail ?? null };
      }
      if (s.check && !forSelf) return { ...s, auto: true, personal: true, status: 'todo', detail: 'Da verificare con la persona: il controllo vale sul suo account' };
      return { ...s, auto: false, personal: false, status: done.has(s.key) ? 'done' : 'todo', detail: null };
    });
    const required = steps.filter((s) => !s.optional);
    const doneRequired = required.filter((s) => s.status === 'done').length;
    return {
      profile,
      isOwnProfile: forSelf,
      availableProfiles: available,
      title: def.title,
      intro: def.intro,
      steps,
      total: required.length,
      done: doneRequired,
      complete: doneRequired === required.length,
      dismissedAt: forSelf ? (state?.dismissedAt ?? null) : null,
    };
  }

  async setStep(key: string, done: boolean, profileParam?: string) {
    const p = principal();
    const profile = (profileParam as GuideProfile | undefined) ?? guideProfileForRoles(p.roles);
    if (profile !== guideProfileForRoles(p.roles)) throw forbidden('Puoi segnare solo i passi del tuo profilo');
    const step = GuideCatalog[profile].steps.find((s) => s.key === key);
    if (!step) throw unprocessable(ErrorCodes.VALIDATION, 'Passo sconosciuto');
    if (step.check) throw unprocessable(ErrorCodes.VALIDATION, 'Questo passo si aggiorna da solo in base ai dati');
    const state = await this.stateRow(p, profile);
    const set = new Set((state?.doneSteps as string[] | undefined) ?? []);
    if (done) set.add(key);
    else set.delete(key);
    await this.upsert(p, profile, { doneSteps: [...set] });
    return this.me(profile);
  }

  async dismiss(dismissed: boolean) {
    const p = principal();
    const profile = guideProfileForRoles(p.roles);
    await this.upsert(p, profile, { dismissedAt: dismissed ? new Date() : null });
    return this.me(profile);
  }

  /** Riepilogo per la Home: avanzamento del proprio profilo, senza dettagli. */
  async summary() {
    const g = await this.me();
    return { profile: g.profile, title: g.title, done: g.done, total: g.total, complete: g.complete, dismissedAt: g.dismissedAt, next: g.steps.find((s) => s.status === 'todo' && !s.optional)?.title ?? null };
  }

  // ---------- controlli ----------

  private async check(key: GuideCheck, p: Principal): Promise<CheckResult> {
    const me = p.personId;
    switch (key) {
      case 'tenant_branding': {
        const [t] = await tx().select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, p.tenantId));
        const b = (t?.settings as { branding?: { primaryColor?: string; logoDataUrl?: string } } | null)?.branding;
        return { ok: !!(b?.logoDataUrl || b?.primaryColor), detail: b ? 'Aspetto configurato' : 'Nessun logo o colore impostato' };
      }
      case 'org_units': {
        const [r] = await tx().select({ n: count }).from(orgUnits).where(isNull(orgUnits.archivedAt));
        return { ok: (r?.n ?? 0) >= 2, detail: `${r?.n ?? 0} unità organizzative` };
      }
      case 'people_loaded': {
        const [r] = await tx().select({ n: count }).from(persons).where(inArray(persons.status, ['active', 'invited']));
        return { ok: (r?.n ?? 0) >= 3, detail: `${r?.n ?? 0} persone attive` };
      }
      case 'managers_assigned': {
        const [r] = await tx().select({ n: count, withManager: sql<number>`count(${persons.managerId})::int` }).from(persons).where(inArray(persons.status, ['active', 'invited']));
        const n = r?.n ?? 0;
        const w = r?.withManager ?? 0;
        return { ok: n > 0 && w >= Math.ceil((n - 1) * 0.8), detail: `${n - w} senza manager su ${n}` };
      }
      case 'hr_roles': {
        const [r] = await tx().select({ n: count }).from(roleAssignments).where(inArray(roleAssignments.role, ['hr_admin', 'hrbp']));
        return { ok: (r?.n ?? 0) >= 1, detail: `${r?.n ?? 0} referenti HR` };
      }
      case 'users_active': {
        const [r] = await tx().select({ n: count }).from(users).where(and(sql`${users.id} <> ${p.userId}`, isNull(users.disabledAt), or(sql`${users.inviteAcceptedAt} is not null`, sql`${users.lastLoginAt} is not null`)!));
        return { ok: (r?.n ?? 0) >= 1, detail: `${r?.n ?? 0} persone oltre a te hanno già effettuato l’accesso` };
      }
      case 'secure_access': {
        const [t] = await tx().select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, p.tenantId));
        const sso = !!(t?.settings as { sso?: { enabled?: boolean } } | null)?.sso?.enabled;
        const [u] = await tx().select({ mfa: users.mfaEnabledAt }).from(users).where(eq(users.id, p.userId));
        return { ok: sso || !!u?.mfa, detail: sso ? 'SSO attivo' : u?.mfa ? 'Verifica in due passaggi attiva sul tuo utente' : 'Né SSO né verifica in due passaggi' };
      }
      case 'integrations': {
        const [t] = await tx().select({ settings: tenants.settings }).from(tenants).where(eq(tenants.id, p.tenantId));
        const i = (t?.settings as { integrations?: Record<string, { enabled?: boolean } | undefined> } | null)?.integrations ?? {};
        const on = Object.entries(i).filter(([, v]) => v && (v as { enabled?: boolean }).enabled !== false && Object.keys(v as object).length > 0).map(([k]) => k);
        return { ok: on.length > 0, detail: on.length ? `Configurati: ${on.join(', ')}` : 'Nessun connettore configurato' };
      }
      case 'okr_cycle_active': {
        const d = today();
        const [r] = await tx().select({ n: count }).from(cycles).where(and(sql`${cycles.status} <> 'closed'`, lte(cycles.startDate, d), gte(cycles.endDate, d)));
        return { ok: (r?.n ?? 0) >= 1, detail: r?.n ? 'Periodo attivo' : 'Nessun periodo che comprende oggi' };
      }
      case 'company_values': {
        const [r] = await tx().select({ n: count }).from(companyValues).where(eq(companyValues.active, true));
        return { ok: (r?.n ?? 0) >= 1, detail: `${r?.n ?? 0} valori attivi` };
      }
      case 'review_forms': {
        const [r] = await tx().select({ n: count }).from(formDefinitions).where(and(eq(formDefinitions.kind, 'review'), eq(formDefinitions.status, 'published')));
        return { ok: (r?.n ?? 0) >= 1, detail: `${r?.n ?? 0} questionari di review pubblicati` };
      }
      case 'review_template': {
        const [r] = await tx().select({ n: count }).from(reviewTemplates).where(isNull(reviewTemplates.archivedAt));
        return { ok: (r?.n ?? 0) >= 1, detail: `${r?.n ?? 0} template` };
      }
      case 'review_cycle': {
        const [r] = await tx().select({ n: count }).from(reviewCycles).where(inArray(reviewCycles.status, ['active', 'closed']));
        return { ok: (r?.n ?? 0) >= 1, detail: r?.n ? `${r.n} cicli lanciati` : 'Nessun ciclo lanciato' };
      }
      case 'survey_launched': {
        const [r] = await tx().select({ n: count }).from(surveys).where(inArray(surveys.status, ['open', 'closed', 'shared']));
        return { ok: (r?.n ?? 0) >= 1, detail: r?.n ? `${r.n} survey lanciate` : 'Nessuna survey lanciata' };
      }
      case 'competency_framework': {
        const [c] = await tx().select({ n: count }).from(competencies).where(eq(competencies.active, true));
        const [j] = await tx().select({ n: count }).from(jobProfiles).where(eq(jobProfiles.active, true));
        return { ok: (c?.n ?? 0) >= 1 && (j?.n ?? 0) >= 1, detail: `${c?.n ?? 0} competenze · ${j?.n ?? 0} job profile` };
      }
      case 'onboarding_template': {
        const [r] = await tx().select({ n: count }).from(onboardingTemplates).where(eq(onboardingTemplates.active, true));
        return { ok: (r?.n ?? 0) >= 1, detail: `${r?.n ?? 0} percorsi` };
      }
      case 'welfare_plan': {
        const [r] = await tx().select({ n: count }).from(welfarePlans);
        return { ok: (r?.n ?? 0) >= 1, detail: `${r?.n ?? 0} piani` };
      }
      case 'app_published': {
        const [r] = await tx().select({ n: count }).from(apps).where(eq(apps.status, 'published'));
        return { ok: (r?.n ?? 0) >= 1, detail: `${r?.n ?? 0} processi pubblicati` };
      }
      case 'has_reports': {
        if (!me) return { ok: false, detail: 'Nessuna persona collegata al tuo utente' };
        const [r] = await tx().select({ n: count }).from(persons).where(and(eq(persons.managerId, me), inArray(persons.status, ['active', 'invited'])));
        return { ok: (r?.n ?? 0) >= 1, detail: `${r?.n ?? 0} riporti diretti` };
      }
      case 'team_objectives': {
        if (!me) return { ok: false };
        const reports = (await tx().select({ id: persons.id }).from(persons).where(and(eq(persons.managerId, me), inArray(persons.status, ['active', 'invited'])))).map((x) => x.id);
        if (!reports.length) return { ok: false, detail: 'Nessun riporto diretto' };
        const rows = await tx().select({ owner: objectives.ownerPersonId }).from(objectives).where(and(eq(objectives.status, 'active'), inArray(objectives.ownerPersonId, reports)));
        const covered = new Set(rows.map((x) => x.owner));
        const [team] = await tx().select({ n: count }).from(objectives).where(and(eq(objectives.status, 'active'), eq(objectives.level, 'team'), eq(objectives.ownerPersonId, me)));
        return { ok: covered.size === reports.length || (team?.n ?? 0) >= 1, detail: `${covered.size} su ${reports.length} riporti con un obiettivo attivo` };
      }
      case 'one_on_one_relations': {
        if (!me) return { ok: false };
        const reports = (await tx().select({ id: persons.id }).from(persons).where(and(eq(persons.managerId, me), inArray(persons.status, ['active', 'invited'])))).map((x) => x.id);
        if (!reports.length) return { ok: false, detail: 'Nessun riporto diretto' };
        const rels = await tx().select({ a: oneOnOneRelations.personAId, b: oneOnOneRelations.personBId }).from(oneOnOneRelations).where(and(isNull(oneOnOneRelations.archivedAt), or(eq(oneOnOneRelations.personAId, me), eq(oneOnOneRelations.personBId, me))!));
        const withRel = new Set(rels.map((r) => (r.a === me ? r.b : r.a)).filter((id) => reports.includes(id)));
        return { ok: withRel.size === reports.length, detail: `${withRel.size} su ${reports.length} riporti con una relazione 1:1` };
      }
      case 'one_on_one_done': {
        if (!me) return { ok: false };
        const [r] = await tx()
          .select({ n: count })
          .from(meetings)
          .innerJoin(oneOnOneRelations, eq(meetings.relationId, oneOnOneRelations.id))
          .where(and(eq(meetings.status, 'done'), or(eq(oneOnOneRelations.personAId, me), eq(oneOnOneRelations.personBId, me))!));
        return { ok: (r?.n ?? 0) >= 1, detail: `${r?.n ?? 0} incontri conclusi` };
      }
      case 'feedback_given': {
        if (!me) return { ok: false };
        const [f] = await tx().select({ n: count }).from(feedback).where(eq(feedback.fromPersonId, me));
        const [k] = await tx().select({ n: count }).from(recognitions).where(eq(recognitions.fromPersonId, me));
        const n = (f?.n ?? 0) + (k?.n ?? 0);
        return { ok: n >= 1, detail: `${f?.n ?? 0} feedback · ${k?.n ?? 0} riconoscimenti` };
      }
      case 'team_reviews': {
        if (!me) return { ok: false };
        const [pending] = await tx().select({ n: count }).from(reviews).where(and(eq(reviews.managerPersonId, me), inArray(reviews.status, ['pending_self', 'pending_manager'])));
        const [all] = await tx().select({ n: count }).from(reviews).where(eq(reviews.managerPersonId, me));
        return { ok: (all?.n ?? 0) > 0 && (pending?.n ?? 0) === 0, detail: all?.n ? `${pending?.n ?? 0} review da scrivere su ${all.n}` : 'Nessun ciclo attivo per il tuo team' };
      }
      case 'own_objective': {
        if (!me) return { ok: false };
        const [r] = await tx().select({ n: count }).from(objectives).where(and(eq(objectives.ownerPersonId, me), inArray(objectives.status, ['active', 'closed'])));
        return { ok: (r?.n ?? 0) >= 1, detail: `${r?.n ?? 0} obiettivi pubblicati` };
      }
      case 'own_check_in': {
        if (!me) return { ok: false };
        const [r] = await tx().select({ n: count }).from(checkIns).where(eq(checkIns.authorPersonId, me));
        return { ok: (r?.n ?? 0) >= 1, detail: `${r?.n ?? 0} check-in` };
      }
      case 'own_one_on_one': {
        if (!me) return { ok: false };
        const [r] = await tx().select({ n: count }).from(oneOnOneRelations).where(and(isNull(oneOnOneRelations.archivedAt), or(eq(oneOnOneRelations.personAId, me), eq(oneOnOneRelations.personBId, me))!));
        return { ok: (r?.n ?? 0) >= 1, detail: `${r?.n ?? 0} relazioni 1:1` };
      }
      case 'own_mfa': {
        const [u] = await tx().select({ mfa: users.mfaEnabledAt }).from(users).where(eq(users.id, p.userId));
        return { ok: !!u?.mfa, detail: u?.mfa ? 'Attiva' : 'Non attiva' };
      }
    }
  }

  // ---------- stato ----------

  private async stateRow(p: Principal, profile: GuideProfile) {
    const [row] = await tx().select().from(guideStates).where(and(eq(guideStates.userId, p.userId), eq(guideStates.profile, profile)));
    return row ?? null;
  }
  private async upsert(p: Principal, profile: GuideProfile, patch: { doneSteps?: string[]; dismissedAt?: Date | null }) {
    const existing = await this.stateRow(p, profile);
    if (existing) await tx().update(guideStates).set({ ...patch, updatedAt: new Date() }).where(eq(guideStates.id, existing.id));
    else await tx().insert(guideStates).values({ tenantId: p.tenantId, createdBy: p.userId, userId: p.userId, profile, doneSteps: patch.doneSteps ?? [], dismissedAt: patch.dismissedAt ?? null });
  }
}
