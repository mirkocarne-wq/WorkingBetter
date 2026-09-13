/** Claim attesi nel JWT (emesso da Keycloak in produzione, dal dev issuer in sviluppo). */
export interface AccessTokenClaims {
  sub: string; // user id (uuid)
  tenant_id: string; // uuid
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
  email?: string;
  name?: string;
}

export function principalFromClaims(c: AccessTokenClaims): Principal {
  return {
    userId: c.sub,
    tenantId: c.tenant_id,
    personId: c.person_id ?? null,
    roles: Array.isArray(c.roles) ? c.roles : [],
    email: c.email,
    name: c.name,
  };
}
