import { readFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
import tls from 'node:tls';

export type CertStatus = 'ok' | 'warning' | 'critical' | 'error' | 'none';
export interface CertInfo { source: string; kind: 'url' | 'file'; subject: string | null; issuer: string | null; validFrom: string | null; validTo: string | null; daysLeft: number | null; status: CertStatus; detail: string | null }

export const WARN_DAYS = 30;
export const CRITICAL_DAYS = 7;

function statusFor(validTo: Date | null): { status: CertStatus; daysLeft: number | null } {
  if (!validTo) return { status: 'error', daysLeft: null };
  const daysLeft = Math.floor((validTo.getTime() - Date.now()) / 86400000);
  return { status: daysLeft < 0 || daysLeft <= CRITICAL_DAYS ? 'critical' : daysLeft <= WARN_DAYS ? 'warning' : 'ok', daysLeft };
}

/** Legge un certificato PEM dal disco (es. quello che la console usa per il TLS nativo). */
export function certFromFile(path: string): CertInfo {
  try {
    const x = new X509Certificate(readFileSync(path));
    const validTo = new Date(x.validTo);
    return { source: path, kind: 'file', subject: x.subject.replace(/\n/g, ', '), issuer: x.issuer.replace(/\n/g, ', '), validFrom: new Date(x.validFrom).toISOString(), validTo: validTo.toISOString(), ...statusFor(validTo), detail: null };
  } catch (e) {
    return { source: path, kind: 'file', subject: null, issuer: null, validFrom: null, validTo: null, daysLeft: null, status: 'error', detail: e instanceof Error ? e.message : String(e) };
  }
}

/** Interroga via TLS un URL pubblico e legge il certificato presentato (senza validarne la catena: si vuole solo la scadenza). */
export function certFromUrl(url: string, timeoutMs = 4000): Promise<CertInfo> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return Promise.resolve({ source: url, kind: 'url', subject: null, issuer: null, validFrom: null, validTo: null, daysLeft: null, status: 'error', detail: 'URL non valido' });
  }
  if (u.protocol !== 'https:') return Promise.resolve({ source: url, kind: 'url', subject: null, issuer: null, validFrom: null, validTo: null, daysLeft: null, status: 'none', detail: 'Non in HTTPS: nessun certificato da verificare (TLS terminato altrove o assente)' });
  const port = Number(u.port || 443);
  return new Promise((resolve) => {
    const done = (info: CertInfo) => { clearTimeout(timer); socket.destroy(); resolve(info); };
    const socket = tls.connect({ host: u.hostname, port, servername: u.hostname, rejectUnauthorized: false }, () => {
      const c = socket.getPeerCertificate();
      if (!c || !c.valid_to) return done({ source: url, kind: 'url', subject: null, issuer: null, validFrom: null, validTo: null, daysLeft: null, status: 'error', detail: 'Nessun certificato presentato' });
      const validTo = new Date(c.valid_to);
      const fmt = (o: Record<string, unknown> | undefined) => (o ? Object.entries(o).map(([k, v]) => `${k}=${String(v)}`).join(', ') : null);
      done({ source: url, kind: 'url', subject: fmt(c.subject as Record<string, unknown>), issuer: fmt(c.issuer as Record<string, unknown>), validFrom: new Date(c.valid_from).toISOString(), validTo: validTo.toISOString(), ...statusFor(validTo), detail: socket.authorized ? null : `Catena non verificata: ${socket.authorizationError ?? 'sconosciuto'}` });
    });
    const timer = setTimeout(() => done({ source: url, kind: 'url', subject: null, issuer: null, validFrom: null, validTo: null, daysLeft: null, status: 'error', detail: 'Timeout' }), timeoutMs);
    socket.on('error', (e) => done({ source: url, kind: 'url', subject: null, issuer: null, validFrom: null, validTo: null, daysLeft: null, status: 'error', detail: e.message }));
  });
}
