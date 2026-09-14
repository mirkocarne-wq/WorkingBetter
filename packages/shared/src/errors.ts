/** Codici errore stabili esposti dall'API (RFC 9457 `type`/`code`). */
export const ErrorCodes = {
  VALIDATION: 'validation_error',
  NOT_FOUND: 'not_found',
  FORBIDDEN: 'forbidden',
  UNAUTHENTICATED: 'unauthenticated',
  CONFLICT: 'conflict',
  ALIGNMENT_CYCLE: 'objective_alignment_cycle',
  PERIOD_MISMATCH: 'objective_period_mismatch',
  TENANT_MISMATCH: 'tenant_mismatch',
  RATE_LIMITED: 'rate_limited',
  UPSTREAM: 'upstream_error',
} as const;
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
