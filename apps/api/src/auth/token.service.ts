import { Inject, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload } from 'jose';
import { principalFromClaims, type AccessTokenClaims, type Principal } from '@wb/shared';
import { CONFIG, type AppConfig } from '../config.js';

export const SESSION_ISSUER = 'workingbetter';
const DEV_ISSUER = 'workingbetter-dev';

/**
 * Sessioni emesse dall'API (ADR-0007): JWT HS256 con i claim del Principal. Verifica anche, se configurato,
 * i token dell'IdP di piattaforma (AUTH_ISSUER, JWKS) per i client macchina.
 */
@Injectable()
export class TokenService {
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
  private readonly key: Uint8Array;

  constructor(@Inject(CONFIG) private readonly cfg: AppConfig) {
    const secret = cfg.AUTH_SESSION_SECRET ?? cfg.AUTH_DEV_SECRET;
    if (!secret) throw new Error('Nessuna chiave di sessione configurata');
    this.key = new TextEncoder().encode(secret);
  }

  get sessionTtlSeconds(): number {
    return this.cfg.AUTH_SESSION_TTL_HOURS * 3600;
  }

  async verify(token: string): Promise<Principal> {
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.key, { audience: this.cfg.AUTH_AUDIENCE, issuer: [SESSION_ISSUER, DEV_ISSUER] }));
    } catch (e) {
      if (!this.cfg.AUTH_ISSUER) throw e;
      this.jwks ??= createRemoteJWKSet(new URL(`${this.cfg.AUTH_ISSUER}/protocol/openid-connect/certs`));
      ({ payload } = await jwtVerify(token, this.jwks, { audience: this.cfg.AUTH_AUDIENCE, issuer: this.cfg.AUTH_ISSUER }));
    }
    const claims = payload as unknown as AccessTokenClaims;
    if (!claims.sub || !claims.tenant_id) throw new Error('token privo di sub/tenant_id');
    return principalFromClaims(claims);
  }

  /** Emette una sessione per web, mobile e connettori. */
  async signSession(claims: Omit<AccessTokenClaims, 'iss' | 'aud' | 'exp' | 'iat'>, ttlSeconds = this.sessionTtlSeconds): Promise<string> {
    return new SignJWT({ ...claims })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(SESSION_ISSUER)
      .setAudience(this.cfg.AUTH_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
      .sign(this.key);
  }

  /** Solo AUTH_MODE=dev: token di sviluppo/test (stesso formato, issuer distinto). */
  async signDev(claims: Omit<AccessTokenClaims, 'iss' | 'aud' | 'exp' | 'iat'>, ttl = '8h'): Promise<string> {
    if (this.cfg.AUTH_MODE !== 'dev') throw new Error('signDev disponibile solo con AUTH_MODE=dev');
    return new SignJWT({ ...claims }).setProtectedHeader({ alg: 'HS256' }).setIssuer(DEV_ISSUER).setAudience(this.cfg.AUTH_AUDIENCE).setIssuedAt().setExpirationTime(ttl).sign(this.key);
  }

  /** Token firmati di breve durata per stati interni (es. `state` del flusso OIDC). */
  async signState(payload: Record<string, unknown>, ttlSeconds: number): Promise<string> {
    return new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuer(`${SESSION_ISSUER}:state`).setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds).sign(this.key);
  }
  async verifyState<T extends Record<string, unknown>>(token: string): Promise<T> {
    const { payload } = await jwtVerify(token, this.key, { issuer: `${SESSION_ISSUER}:state` });
    return payload as unknown as T;
  }
}
