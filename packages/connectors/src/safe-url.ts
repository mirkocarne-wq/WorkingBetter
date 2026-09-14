import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Difesa SSRF per gli URL indicati dagli utenti (webhook delle azioni, webhook Teams, endpoint alternativi):
 * solo http(s), niente credenziali nell'URL, host che non risolve a indirizzi privati, loopback, link-local o metadata.
 * In sviluppo e test (`allowPrivate`) gli indirizzi locali sono ammessi.
 */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number];
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (v === 6) {
    const low = ip.toLowerCase();
    if (low === '::1' || low === '::') return true;
    if (low.startsWith('fe80:') || low.startsWith('fc') || low.startsWith('fd')) return true;
    const m = low.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (m) return isPrivateAddress(m[1]!);
  }
  return false;
}

export class UnsafeUrlError extends Error {}

/** Controllo sintattico (sincrono): protocollo, credenziali, host letterale privato, nomi locali. */
export function checkUrlShape(raw: string, opts: { allowPrivate?: boolean; httpsOnly?: boolean } = {}): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new UnsafeUrlError('URL non valido'); }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && !opts.httpsOnly)) throw new UnsafeUrlError(opts.httpsOnly ? 'È ammesso solo https' : 'È ammesso solo http o https');
  if (url.username || url.password) throw new UnsafeUrlError('Credenziali nell’URL non ammesse');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!opts.allowPrivate) {
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host === 'metadata.google.internal') throw new UnsafeUrlError('Host locale non ammesso');
    if (isIP(host) && isPrivateAddress(host)) throw new UnsafeUrlError('Indirizzo privato non ammesso');
  }
  return url;
}

/** Controllo completo: forma dell'URL e risoluzione DNS (ogni indirizzo deve essere pubblico). */
export async function assertPublicUrl(raw: string, opts: { allowPrivate?: boolean; httpsOnly?: boolean } = {}): Promise<URL> {
  const url = checkUrlShape(raw, opts);
  if (opts.allowPrivate) return url;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host)) return url;
  let addrs: { address: string }[];
  try { addrs = await lookup(host, { all: true }); } catch { throw new UnsafeUrlError(`Host «${host}» non risolvibile`); }
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new UnsafeUrlError(`Host «${host}» risolve a un indirizzo privato`);
  return url;
}
