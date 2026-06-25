/**
 * Entidades del bounded context `identity`.
 *
 * Estas son las representaciones de dominio — NO los modelos Prisma.
 * Los repositorios traducen entre ambas en la capa de persistencia.
 */

export type Role =
  | 'OWNER'
  | 'ADMIN_CLINIC'
  | 'DENTIST'
  | 'HYGIENIST'
  | 'RECEPTION'
  | 'ACCOUNTING';

export type UserStatus = 'ACTIVE' | 'INVITED' | 'SUSPENDED';

/**
 * Roles que exigen MFA TOTP obligatorio.
 * Política de Castellar (revisable por DPO).
 */
export const MFA_REQUIRED_ROLES: ReadonlySet<Role> = new Set([
  'OWNER',
  'ADMIN_CLINIC',
  'DENTIST',
  'HYGIENIST',
]);

export interface Tenant {
  id: string;
  name: string;
  country: string;
  locale: string;
  plan: string;
  createdAt: Date;
}

export interface Clinic {
  id: string;
  tenantId: string;
  name: string;
  address: string | null;
  vatId: string | null;
  timezone: string;
}

export interface User {
  id: string;
  tenantId: string;
  supabaseUserId: string;
  email: string;
  role: Role;
  status: UserStatus;
  createdAt: Date;
}

export interface UserSecurity {
  userId: string;
  mfaRequired: boolean;
  mfaEnrolledAt: Date | null;
  lastLoginAt: Date | null;
  lastLoginIp: string | null;
}

export interface ClinicMembership {
  userId: string;
  clinicId: string;
  role: Role;
}

export interface Invitation {
  id: string;
  tenantId: string;
  email: string;
  role: Role;
  invitedById: string;
  token: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}

/** Una entrada de auditoría. Append-only — nunca se actualiza ni borra. */
export interface AuditEntry {
  tenantId: string;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  ip: string | null;
  userAgent: string | null;
  reason: string | null;
  diff: unknown;
}
