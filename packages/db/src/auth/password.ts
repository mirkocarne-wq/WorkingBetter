import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Hash delle password (ADR-0007): scrypt via node:crypto, formato autodescrittivo
 * `scrypt$N$r$p$salt$hash` (base64url) così da poter migrare algoritmo o parametri al primo login.
 */
const N = 1 << 15;
const R = 8;
const P = 1;
const KEYLEN = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(32);
  const hash = scryptSync(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const actual = scryptSync(password.normalize('NFKC'), Buffer.from(salt, 'base64url'), expected.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Policy minima (CORE-030): almeno 10 caratteri, non solo spazi, non uguale all'email. */
export function passwordPolicyError(password: string, email?: string | null): string | null {
  if (password.trim().length < 10) return 'La password deve avere almeno 10 caratteri';
  if (password.length > 200) return 'Password troppo lunga';
  if (email && password.toLowerCase() === email.toLowerCase()) return 'La password non può coincidere con l’email';
  return null;
}

/** Token monouso (inviti, reset): in chiaro va solo nell'email; in database si salva l'hash SHA-256. */
export function newOneTimeToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
