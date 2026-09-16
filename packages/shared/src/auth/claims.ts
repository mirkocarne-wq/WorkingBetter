/** Claim attesi nel JWT (emesso da Keycloak in produzione, dal dev issuer in sviluppo). */
export interface AccessTokenClaims {
  sub: string; // user id (uuid) o id dell'operatore di piattaforma
  tenant_id?: string; // uuid; assente nei token di piattaforma (ADR-0013)
  /** token di un operatore della console di piattaforma: valido solo sulle rotte /platform (ADR-0013) */
  platform?: boolean;
  person_id?: string; // uuid della persona collegata (assente per super admin di piattaforma)
  roles: string[];
  email?: string;
  name?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
}

export interface Principal {
  userId: string;
  tenantId: string;
  personId: string | null;
  roles: string[];
  /** permessi effettivi risolti dal guard (ruoli predefiniti, personalizzati e custom del tenant, CORE-041); assenti = default dei ruoli */
  permissions?: string[];
  email?: string;
  name?: string;
  /** operatore della console di piattaforma (nessun tenant) */
  platform?: boolean;
  /** istante di emissione del token (secondi epoch): serve per la revoca delle sessioni (CORE-030) */
  issuedAt?: number;
}

export function principalFromClaims(c: AccessTokenClaims): Principal {
  return {
    userId: c.sub,
    tenantId: c.tenant_id ?? '',
    platform: c.platform === true,
    personId: c.person_id ?? null,
    roles: Array.isArray(c.roles) ? c.roles : [],
    email: c.email,
    name: c.name,
    issuedAt: typeof c.iat === 'number' ? c.iat : undefined,
  };
}
