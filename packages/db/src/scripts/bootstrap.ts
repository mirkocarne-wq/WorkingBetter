/**
 * Primo avvio in produzione (docs/13 §3): crea un tenant vuoto con l'unità radice e il primo amministratore,
 * che riceve un invito via email (coda `email_outbox`, inviata dal worker) — il link è comunque stampato a video.
 *
 *   pnpm --filter @wb/db bootstrap -- --tenant "Acme S.p.A." --slug acme --admin anna@acme.it [--first Anna --last Colombo] [--timezone Europe/Rome]
 */
import { and, eq } from 'drizzle-orm';
import { createDatabase } from '../client.js';
import { newOneTimeToken } from '../auth/password.js';
import { emailOutbox, orgUnits, persons, roleAssignments, tenants, users } from '../schema/index.js';
import { withTenant } from '../tenant.js';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const name = arg('tenant');
const slug = arg('slug');
const admin = arg('admin')?.toLowerCase();
if (!name || !slug || !admin) {
  console.error('Uso: bootstrap -- --tenant "<nome>" --slug <slug> --admin <email> [--first <nome>] [--last <cognome>] [--timezone <IANA>]');
  process.exit(2);
}
if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) {
  console.error('Slug non valido: minuscole, cifre e trattini (es. acme)');
  process.exit(2);
}
const first = arg('first', admin.split('@')[0] ?? 'Admin')!;
const last = arg('last', '')!;
const timezone = arg('timezone', 'Europe/Rome')!;
const appBaseUrl = (process.env.APP_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const INVITE_DAYS = 7;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL non impostata');
  process.exit(2);
}
const { db, close } = createDatabase({ url: process.env.DATABASE_URL });
try {
  const [existing] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, slug));
  if (existing) {
    console.error(`Il tenant "${slug}" esiste già: nessuna modifica.`);
    process.exit(1);
  }
  const [t] = await db.insert(tenants).values({ name, slug, timezone, defaultLocale: 'it' }).returning();
  const tenantId = t!.id;
  const link = await withTenant(db, tenantId, async (tx) => {
    const [root] = await tx.insert(orgUnits).values({ tenantId, name, path: '/' }).returning();
    await tx.update(orgUnits).set({ path: `/${root!.id}/` }).where(eq(orgUnits.id, root!.id));
    const [person] = await tx.insert(persons).values({ tenantId, firstName: first, lastName: last || '—', email: admin, orgUnitId: root!.id, jobTitle: 'Amministratore', status: 'invited' }).returning();
    const { token, hash } = newOneTimeToken();
    const [user] = await tx.insert(users).values({ tenantId, personId: person!.id, email: admin, invitedAt: new Date(), inviteTokenHash: hash, inviteExpiresAt: new Date(Date.now() + INVITE_DAYS * 86400000) }).returning();
    await tx.insert(roleAssignments).values({ tenantId, userId: user!.id, role: 'tenant_admin' });
    const inviteUrl = `${appBaseUrl}/accept-invite?token=${token}`;
    await tx.insert(emailOutbox).values({ tenantId, toEmail: admin, toName: `${first} ${last}`.trim(), subject: `Benvenuto in WorkingBetter · ${name}`, text: `Sei l'amministratore di ${name} su WorkingBetter.\n\nCompleta l'accesso entro ${INVITE_DAYS} giorni: ${inviteUrl}\n\nDopo il primo accesso attiva la verifica in due passaggi da Impostazioni.` });
    // il token in chiaro non è memorizzato: solo l'hash (come per gli inviti dall'app)
    return inviteUrl;
  });
  const [check] = await db.select({ n: tenants.id }).from(tenants).where(and(eq(tenants.id, tenantId), eq(tenants.slug, slug)));
  if (!check) throw new Error('tenant non creato');
  console.log(`Tenant "${name}" (${slug}) creato. Amministratore: ${admin}`);
  console.log(`Link di invito (valido ${INVITE_DAYS} giorni, inviato anche via email se il worker è attivo):\n${link}`);
} finally {
  await close();
}
