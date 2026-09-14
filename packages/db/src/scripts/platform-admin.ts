/**
 * Crea (o reimposta la password di) un operatore della console di piattaforma (ADR-0013, PLT-002).
 *
 *   pnpm --filter @wb/db platform-admin -- --email ops@azienda.it --password 'una-password-lunga' [--first Nome --last Cognome]
 */
import { eq } from 'drizzle-orm';
import { createDatabase } from '../client.js';
import { hashPassword, passwordPolicyError } from '../auth/password.js';
import { platformUsers } from '../schema/index.js';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const email = arg('email')?.toLowerCase();
const password = arg('password');
if (!email || !password) {
  console.error("Uso: platform-admin -- --email <email> --password '<password>' [--first <nome>] [--last <cognome>]");
  process.exit(2);
}
const policy = passwordPolicyError(password, email);
if (policy) {
  console.error(policy);
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL non impostata');
  process.exit(2);
}
const { db, close } = createDatabase({ url: process.env.DATABASE_URL });
try {
  const [existing] = await db.select({ id: platformUsers.id }).from(platformUsers).where(eq(platformUsers.email, email));
  if (existing) {
    await db.update(platformUsers).set({ passwordHash: hashPassword(password), mustChangePassword: 1, failedLogins: 0, lockedUntil: null, disabledAt: null, sessionsRevokedAt: new Date(), updatedAt: new Date() }).where(eq(platformUsers.id, existing.id));
    console.log(`Operatore ${email}: password reimpostata (va cambiata al primo accesso).`);
  } else {
    await db.insert(platformUsers).values({ email, firstName: arg('first', email.split('@')[0] ?? 'Operatore')!, lastName: arg('last', '')!, passwordHash: hashPassword(password) });
    console.log(`Operatore ${email} creato (la password va cambiata al primo accesso).`);
  }
} finally {
  await close();
}
