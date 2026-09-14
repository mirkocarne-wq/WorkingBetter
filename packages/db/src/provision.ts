import { eq } from 'drizzle-orm';
import { newOneTimeToken } from './auth/password.js';
import { emailOutbox, orgUnits, persons, roleAssignments, tenants, users } from './schema/index.js';
import { withPlatform, type AnyDb, type TenantTx } from './tenant.js';

export const INVITE_DAYS = 7;
export const TENANT_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;

export interface ProvisionTenantInput {
  name: string;
  slug: string;
  timezone?: string;
  defaultLocale?: string;
  admin: { email: string; firstName: string; lastName: string };
  /** base URL della web app per il link d'invito */
  appBaseUrl: string;
  /** riservato: non più usato (il provisioning gira nel contesto di piattaforma) */
  appRole?: string | null;
}

export interface ProvisionTenantResult {
  tenantId: string;
  userId: string;
  personId: string;
  inviteUrl: string;
  inviteExpiresAt: Date;
}

const inviteText = (name: string, inviteUrl: string) =>
  `Sei l'amministratore di ${name} su WorkingBetter.\n\nCompleta l'attivazione del tuo account entro ${INVITE_DAYS} giorni:\n${inviteUrl}\n\nDopo l'accesso trovi la Guida con i passi di avviamento.`;

/**
 * Crea un tenant con unità radice, primo amministratore (persona + utente `tenant_admin`) e invito in coda email.
 * Usata dallo script `bootstrap` e dalla console di piattaforma (ADR-0013), così le due strade non divergono.
 */
export async function provisionTenant(db: AnyDb, input: ProvisionTenantInput): Promise<ProvisionTenantResult> {
  return withPlatform(db, (tx) => provisionTenantIn(tx, input));
}

/**
 * Variante da usare dentro una transazione di piattaforma già aperta (console, ADR-0013): niente transazioni annidate.
 * Il contesto di piattaforma opera come proprietario dello schema, quindi le righe tenant si inseriscono con `tenantId` esplicito.
 */
export async function provisionTenantIn(tx: TenantTx, input: Omit<ProvisionTenantInput, 'appRole'>): Promise<ProvisionTenantResult> {
  const slug = input.slug.toLowerCase();
  if (!TENANT_SLUG_RE.test(slug)) throw new Error('Slug non valido: minuscole, cifre e trattini (es. acme)');
  const email = input.admin.email.toLowerCase();
  const [existing] = await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug));
  if (existing) throw new Error(`Il tenant "${slug}" esiste già`);
  const [t] = await tx.insert(tenants).values({ name: input.name, slug, timezone: input.timezone ?? 'Europe/Rome', defaultLocale: input.defaultLocale ?? 'it' }).returning();
  return inviteTenantAdmin(tx, { tenantId: t!.id, tenantName: input.name, appBaseUrl: input.appBaseUrl, admin: { ...input.admin, email }, createRoot: true });
}

export interface InviteAdminInput {
  tenantId: string;
  tenantName: string;
  appBaseUrl: string;
  admin: { email: string; firstName: string; lastName: string };
  createRoot?: boolean;
}

/** Invita (o reinvita) un amministratore del tenant dentro una transazione tenant già aperta. */
export async function inviteTenantAdmin(tx: TenantTx, input: InviteAdminInput): Promise<ProvisionTenantResult> {
  const { tenantId, tenantName, appBaseUrl } = input;
  const email = input.admin.email.toLowerCase();
  let rootId: string | null = null;
  if (input.createRoot) {
    const [root] = await tx.insert(orgUnits).values({ tenantId, name: tenantName, path: '/' }).returning();
    await tx.update(orgUnits).set({ path: `/${root!.id}/` }).where(eq(orgUnits.id, root!.id));
    rootId = root!.id;
  } else {
    const [root] = await tx.select({ id: orgUnits.id }).from(orgUnits).where(eq(orgUnits.tenantId, tenantId)).limit(1);
    rootId = root?.id ?? null;
  }
  const { token, hash } = newOneTimeToken();
  const inviteExpiresAt = new Date(Date.now() + INVITE_DAYS * 86400000);
  const [existingUser] = await tx.select({ id: users.id, personId: users.personId }).from(users).where(eq(users.email, email));
  let userId: string;
  let personId: string;
  if (existingUser) {
    // reinvito: nuovo token, ruolo garantito
    userId = existingUser.id;
    personId = existingUser.personId ?? '';
    await tx.update(users).set({ invitedAt: new Date(), inviteTokenHash: hash, inviteExpiresAt, disabledAt: null, updatedAt: new Date() }).where(eq(users.id, userId));
    const [role] = await tx.select({ id: roleAssignments.id }).from(roleAssignments).where(eq(roleAssignments.userId, userId));
    if (!role) await tx.insert(roleAssignments).values({ tenantId, userId, role: 'tenant_admin' });
  } else {
    const [person] = await tx.insert(persons).values({ tenantId, firstName: input.admin.firstName, lastName: input.admin.lastName || '—', email, orgUnitId: rootId, jobTitle: 'Amministratore', status: 'invited' }).returning();
    personId = person!.id;
    const [user] = await tx.insert(users).values({ tenantId, personId, email, invitedAt: new Date(), inviteTokenHash: hash, inviteExpiresAt }).returning();
    userId = user!.id;
    await tx.insert(roleAssignments).values({ tenantId, userId, role: 'tenant_admin' });
  }
  const inviteUrl = `${appBaseUrl.replace(/\/$/, '')}/accept-invite?token=${token}`;
  await tx.insert(emailOutbox).values({ tenantId, toEmail: email, toName: `${input.admin.firstName} ${input.admin.lastName}`.trim(), subject: `Benvenuto in WorkingBetter · ${tenantName}`, text: inviteText(tenantName, inviteUrl) });
  return { tenantId, userId, personId, inviteUrl, inviteExpiresAt };
}
