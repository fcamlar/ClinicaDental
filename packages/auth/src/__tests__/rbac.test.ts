import { describe, expect, it } from 'vitest';
import { hasPermission, requirePermission } from '../rbac.js';
import type { AuthenticatedUser } from '@castellar/api-contracts';

function user(role: AuthenticatedUser['role']): AuthenticatedUser {
  return {
    id: 'u1',
    email: 'demo@castellar.test',
    role,
    clinicIds: ['c1'],
  };
}

describe('RBAC', () => {
  it('OWNER tiene permisos administrativos y de facturación', () => {
    const u = user('OWNER');
    expect(hasPermission(u, 'tenant.update')).toBe(true);
    expect(hasPermission(u, 'invoice.issue')).toBe(true);
    expect(hasPermission(u, 'audit.read')).toBe(true);
  });

  it('DENTIST puede escribir historia clínica pero no facturar', () => {
    const u = user('DENTIST');
    expect(hasPermission(u, 'clinical.write')).toBe(true);
    expect(hasPermission(u, 'odontogram.write')).toBe(true);
    expect(hasPermission(u, 'invoice.issue')).toBe(false);
    expect(hasPermission(u, 'tenant.update')).toBe(false);
  });

  it('RECEPTION puede gestionar agenda y cobros pero no historia clínica', () => {
    const u = user('RECEPTION');
    expect(hasPermission(u, 'appointment.create')).toBe(true);
    expect(hasPermission(u, 'payment.register')).toBe(true);
    expect(hasPermission(u, 'clinical.write')).toBe(false);
    expect(hasPermission(u, 'odontogram.write')).toBe(false);
  });

  it('ACCOUNTING puede emitir facturas pero no editar pacientes', () => {
    const u = user('ACCOUNTING');
    expect(hasPermission(u, 'invoice.issue')).toBe(true);
    expect(hasPermission(u, 'patient.update')).toBe(false);
    expect(hasPermission(u, 'clinical.write')).toBe(false);
  });

  it('HYGIENIST tiene acceso clínico limitado', () => {
    const u = user('HYGIENIST');
    expect(hasPermission(u, 'clinical.read')).toBe(true);
    expect(hasPermission(u, 'clinical.write')).toBe(false);
    expect(hasPermission(u, 'odontogram.write')).toBe(true);
  });

  it('requirePermission lanza si falta', () => {
    expect(() => requirePermission(user('RECEPTION'), 'clinical.write')).toThrow(/Forbidden/);
    expect(() => requirePermission(user('OWNER'), 'invoice.issue')).not.toThrow();
  });
});
