import { Inject, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTPayload } from 'jose';
import { principalFromClaims, type AccessTokenClaims, type Principal } from '@wb/shared';
import { CONFIG, type AppConfig } from '../config.js';

@Injectable()
export class TokenService {
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
  private readonly devKey: Uint8Array | null;

  constructor(@Inject(CONFIG) private readonly cfg: AppConfig) {
    this.devKey = cfg.AUTH_MODE === 'dev' && cfg.AUTH_DEV_SECRET ? new TextEncoder().encode(cfg.AUTH_DEV_SECRET) : null;
  }

  async verify(token: string): Promise<Principal> {
    let payload: JWTPayload;
    if (this.cfg.AUTH_MODE === 'dev') {
      ({ payload } = await jwtVerify(token, this.devKey!, { audience: this.cfg.AUTH_AUDIENCE, issuer: 'workingbetter-dev' }));
    } else {
      this.jwks ??= createRemoteJWKSet(new URL(`${this.cfg.AUTH_ISSUER}/protocol/openid-connect/certs`));
      ({ payload } = await jwtVerify(token, this.jwks, { audience: this.cfg.AUTH_AUDIENCE, issuer: this.cfg.AUTH_ISSUER }));
    }
    const claims = payload as unknown as AccessTokenClaims;
    if (!claims.sub || !claims.tenant_id) throw new Error('token privo di sub/tenant_id');
    return principalFromClaims(claims);
  }

  /** Solo AUTH_MODE=dev: emette un token HS256 per sviluppo e test. */
  async signDev(claims: Omit<AccessTokenClaims, 'iss' | 'aud' | 'exp' | 'iat'>, ttl = '8h'): Promise<string> {
    if (!this.devKey) throw new Error('signDev disponibile solo con AUTH_MODE=dev');
    return new SignJWT({ ...claims })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer('workingbetter-dev')
      .setAudience(this.cfg.AUTH_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(ttl)
      .sign(this.devKey);
  }
}
