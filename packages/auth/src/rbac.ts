/**
 * Castellar — matriz de permisos RBAC.
 *
 * Cada permiso es un par `recurso.acción`. Los roles se mapean a conjuntos.
 * Esta matriz vive en el dominio (no en BD) — es código auditable en revisión.
 */

import type { AuthenticatedUser } from '@castellar/api-contracts';

export type Permission =
  // Identidad
  | 'tenant.read'
  | 'tenant.update'
  | 'user.invite'
  | 'user.read'
  | 'user.update'
  | 'user.disable'
  // Pacientes
  | 'patient.create'
  | 'patient.read'
  | 'patient.update'
  | 'patient.delete'
  | 'patient.export'
  // Agenda
  | 'appointment.create'
  | 'appointment.read'
  | 'appointment.update'
  | 'appointment.cancel'
  // Clínica
  | 'clinical.read'
  | 'clinical.write'
  | 'odontogram.write'
  // Catálogo / precios
  | 'catalog.read'
  | 'catalog.write'
  // Facturación
  | 'budget.create'
  | 'budget.read'
  | 'invoice.issue'
  | 'invoice.read'
  | 'payment.register'
  // Auditoría
  | 'audit.read';

type Role = AuthenticatedUser['role'];

const READ_ONLY_CLINICAL: Permission[] = ['clinical.read'];

const PERMISSIONS_BY_ROLE: Record<Role, Permission[]> = {
  OWNER: [
    'tenant.read',
    'tenant.update',
    'user.invite',
    'user.read',
    'user.update',
    'user.disable',
    'patient.create',
    'patient.read',
    'patient.update',
    'patient.delete',
    'patient.export',
    'appointment.create',
    'appointment.read',
    'appointment.update',
    'appointment.cancel',
    'clinical.read',
    'clinical.write',
    'odontogram.write',
    'catalog.read',
    'catalog.write',
    'budget.create',
    'budget.read',
    'invoice.issue',
    'invoice.read',
    'payment.register',
    'audit.read',
  ],
  ADMIN_CLINIC: [
    'tenant.read',
    'user.invite',
    'user.read',
    'user.update',
    'patient.create',
    'patient.read',
    'patient.update',
    'patient.export',
    'appointment.create',
    'appointment.read',
    'appointment.update',
    'appointment.cancel',
    'clinical.read',
    'catalog.read',
    'catalog.write',
    'budget.create',
    'budget.read',
    'invoice.issue',
    'invoice.read',
    'payment.register',
    'audit.read',
  ],
  DENTIST: [
    'patient.read',
    'patient.update',
    'appointment.read',
    'appointment.update',
    'clinical.read',
    'clinical.write',
    'odontogram.write',
    'catalog.read',
    'budget.create',
    'budget.read',
    'invoice.read',
  ],
  HYGIENIST: [
    'patient.read',
    'appointment.read',
    ...READ_ONLY_CLINICAL,
    'odontogram.write',
    'catalog.read',
  ],
  RECEPTION: [
    'patient.create',
    'patient.read',
    'patient.update',
    'appointment.create',
    'appointment.read',
    'appointment.update',
    'appointment.cancel',
    'catalog.read',
    'budget.create',
    'budget.read',
    'invoice.read',
    'payment.register',
  ],
  ACCOUNTING: [
    'patient.read',
    'catalog.read',
    'budget.read',
    'invoice.issue',
    'invoice.read',
    'payment.register',
  ],
};

export function rolePermissions(role: Role): ReadonlySet<Permission> {
  return new Set(PERMISSIONS_BY_ROLE[role]);
}

export function hasPermission(user: AuthenticatedUser, permission: Permission): boolean {
  return rolePermissions(user.role).has(permission);
}

export function requirePermission(user: AuthenticatedUser, permission: Permission): void {
  if (!hasPermission(user, permission)) {
    throw new Error(`Forbidden: ${user.role} no tiene permiso ${permission}`);
  }
}
