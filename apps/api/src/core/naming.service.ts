import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { namingOverrides, tenants } from '@wb/db';
import { NamingConcepts, resolveNaming, type NamingConcept, type NamingEntry } from '@wb/shared';
import { principal, tx } from '../common/context.js';
import { AuditService } from '../audit/audit.service.js';

export type NamingOverrides = Partial<Record<NamingConcept, NamingEntry>>;

/** Glossario aziendale (CORE-003): nomi dei concetti per lingua, sopra i default della piattaforma. */
@Injectable()
export class NamingService {
  constructor(private readonly audit: AuditService) {}

  private async locale(): Promise<string> {
    const [t] = await tx().select({ defaultLocale: tenants.defaultLocale }).from(tenants).where(eq(tenants.id, principal().tenantId));
    return t?.defaultLocale ?? 'it';
  }

  async overridesFor(locale: string): Promise<NamingOverrides> {
    const rows = await tx().select().from(namingOverrides).where(eq(namingOverrides.locale, locale));
    const out: NamingOverrides = {};
    for (const r of rows) if ((NamingConcepts as readonly string[]).includes(r.concept)) out[r.concept as NamingConcept] = { singular: r.singular, plural: r.plural };
    return out;
  }

  /** Nomi risolti per la lingua del tenant (o quella richiesta) più le sole personalizzazioni. */
  async get(localeParam?: string) {
    const locale = localeParam ?? (await this.locale());
    const overrides = await this.overridesFor(locale);
    return { locale, naming: resolveNaming(locale, overrides), overrides };
  }

  /** Sostituisce le personalizzazioni della lingua: una voce vuota (singolare e plurale vuoti) torna al default. */
  async put(overrides: Partial<Record<NamingConcept, Partial<NamingEntry>>>, localeParam?: string) {
    const p = principal();
    const locale = localeParam ?? (await this.locale());
    const before = await this.overridesFor(locale);
    for (const concept of NamingConcepts) {
      const o = overrides[concept];
      const singular = o?.singular?.trim() ?? '';
      const plural = o?.plural?.trim() ?? '';
      const where = and(eq(namingOverrides.concept, concept), eq(namingOverrides.locale, locale));
      if (!singular && !plural) { await tx().delete(namingOverrides).where(where); continue; }
      const values = { singular: singular || plural, plural: plural || singular };
      const existing = await tx().select({ id: namingOverrides.id }).from(namingOverrides).where(where);
      if (existing.length) await tx().update(namingOverrides).set({ ...values, updatedAt: new Date() }).where(where);
      else await tx().insert(namingOverrides).values({ ...values, concept, locale, tenantId: p.tenantId, createdBy: p.userId });
    }
    const after = await this.overridesFor(locale);
    await this.audit.log({ action: 'naming.update', entityType: 'tenant', entityId: p.tenantId, before: { locale, overrides: before }, after: { locale, overrides: after } });
    return { locale, naming: resolveNaming(locale, after), overrides: after };
  }
}
