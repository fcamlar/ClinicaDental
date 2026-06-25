/**
 * Bounded context `portal` — acceso restringido del paciente.
 */

export interface PortalToken {
  id: string;
  tenantId: string;
  patientId: string;
  tokenHash: string;
  expiresAt: Date;
  usesLeft: number;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

/** Resultado del canjeo del token. */
export interface PortalSession {
  tenantId: string;
  patientId: string;
  /** Hasta cuándo es válida la sesión (calculado con expiresAt y usos restantes). */
  validUntil: Date;
}
