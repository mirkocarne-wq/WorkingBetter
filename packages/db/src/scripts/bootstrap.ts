/**
 * Primo avvio in produzione (docs/13 §3): crea un tenant vuoto con l'unità radice e il primo amministratore,
 * che riceve un invito via email (coda `email_outbox`, inviata dal worker) — il link è comunque stampato a video.
 *
 *   pnpm --filter @wb/db bootstrap -- --tenant "Acme S.p.A." --slug acme --admin anna@acme.it [--first Anna --last Colombo] [--timezone Europe/Rome]
 */
import { createDatabase } from '../client.js';
import { INVITE_DAYS, provisionTenant } from '../provision.js';

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

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL non impostata');
  process.exit(2);
}
const { db, close } = createDatabase({ url: process.env.DATABASE_URL });
try {
  const r = await provisionTenant(db, { name, slug, timezone, admin: { email: admin, firstName: first, lastName: last }, appBaseUrl });
  console.log(`Tenant "${name}" (${slug}) creato. Amministratore: ${admin}`);
  console.log(`Link di invito (valido ${INVITE_DAYS} giorni, inviato anche via email se il worker è attivo):\n${r.inviteUrl}`);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
} finally {
  await close();
}
