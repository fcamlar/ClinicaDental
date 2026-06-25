import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { patients as patientsCtx, catalog as catalogCtx, fixedClock } from '@castellar/core';
import { makeRepositories, withTenant } from '../index.js';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const CLINIC_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLINIC_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const OWNER_A = 'a0000000-0000-0000-0000-000000000001';
const OWNER_B = 'b0000000-0000-0000-0000-000000000001';

let migrate: PrismaClient;
const NOW = new Date('2026-06-27T10:00:00Z');

beforeAll(async () => {
  migrate = new PrismaClient({ datasourceUrl: process.env.DATABASE_MIGRATE_URL });
});

beforeEach(async () => {
  await migrate.$executeRawUnsafe(`DELETE FROM audit_log`);
  await migrate.$executeRawUnsafe(`DELETE FROM consents`);
  await migrate.$executeRawUnsafe(`DELETE FROM medical_alerts`);
  await migrate.$executeRawUnsafe(`DELETE FROM files`);
  await migrate.$executeRawUnsafe(`DELETE FROM treatments`);
  await migrate.$executeRawUnsafe(`DELETE FROM appointments`);
  await migrate.$executeRawUnsafe(`DELETE FROM patients`);
  await migrate.$executeRawUnsafe(`DELETE FROM clinic_members`);
  await migrate.$executeRawUnsafe(`DELETE FROM user_security`);
  await migrate.$executeRawUnsafe(`DELETE FROM invitations`);
  await migrate.$executeRawUnsafe(`DELETE FROM users`);
  await migrate.$executeRawUnsafe(`DELETE FROM clinics`);
  await migrate.$executeRawUnsafe(`DELETE FROM tenants`);

  await migrate.tenant.createMany({
    data: [
      { id: TENANT_A, name: 'Alfa' },
      { id: TENANT_B, name: 'Beta' },
    ],
  });
  await migrate.clinic.createMany({
    data: [
      { id: CLINIC_A, tenantId: TENANT_A, name: 'Sede Alfa' },
      { id: CLINIC_B, tenantId: TENANT_B, name: 'Sede Beta' },
    ],
  });
  await migrate.user.createMany({
    data: [
      { id: OWNER_A, tenantId: TENANT_A, supabaseUserId: OWNER_A, email: 'a@demo.test', role: 'OWNER', status: 'ACTIVE' },
      { id: OWNER_B, tenantId: TENANT_B, supabaseUserId: OWNER_B, email: 'b@demo.test', role: 'OWNER', status: 'ACTIVE' },
    ],
  });
});

afterAll(async () => {
  await migrate.$disconnect();
});

describe('patients / integración', () => {
  it('crea, busca por pg_trgm y lee con motivo (auditando)', async () => {
    await withTenant(TENANT_A, async (tx) => {
      const repos = makeRepositories(tx, migrate);
      const create = patientsCtx.makeCreatePatientUseCase({
        patientRepo: repos.patientRepo,
        consentRepo: repos.consentRepo,
        audit: repos.audit,
        clock: fixedClock(NOW),
      });
      await create({
        tenantId: TENANT_A,
        actorId: OWNER_A,
        actorRole: 'OWNER',
        ip: null,
        input: {
          firstName: 'Lucía',
          lastName: 'Pérez Gómez',
          nationalId: '12345678Z',
          clinicId: CLINIC_A,
          country: 'ES',
          gdprConsent: false,
          marketingConsent: false,
        },
      });
      await create({
        tenantId: TENANT_A,
        actorId: OWNER_A,
        actorRole: 'OWNER',
        ip: null,
        input: {
          firstName: 'Pablo',
          lastName: 'Romero Sanz',
          clinicId: CLINIC_A,
          country: 'ES',
          gdprConsent: false,
          marketingConsent: false,
        },
      });

      // Búsqueda con typo: pg_trgm tolera "Luca" → "Lucía Pérez".
      const results = await repos.patientRepo.search({ query: 'Luca Perez', limit: 5 });
      const names = results.map((p) => `${p.firstName} ${p.lastName}`);
      expect(names.some((n) => n.startsWith('Lucía Pérez'))).toBe(true);
    });

    // Lectura con motivo deja entrada en auditoría.
    const created = await migrate.patient.findFirstOrThrow({ where: { tenantId: TENANT_A } });

    await withTenant(TENANT_A, async (tx) => {
      const repos = makeRepositories(tx, migrate);
      const get = patientsCtx.makeGetPatientUseCase({
        patientRepo: repos.patientRepo,
        alertRepo: repos.alertRepo,
        consentRepo: repos.consentRepo,
        fileRepo: repos.fileRepo,
        audit: repos.audit,
      });
      await get({
        tenantId: TENANT_A,
        actorId: OWNER_A,
        actorRole: 'OWNER',
        ip: '1.2.3.4',
        userAgent: 'vitest',
        input: { patientId: created.id, reason: 'Revisión semestral' },
      });
    });

    const reads = await migrate.auditLog.findMany({
      where: { tenantId: TENANT_A, action: 'patient.read' },
    });
    expect(reads).toHaveLength(1);
    expect(reads[0]?.reason).toBe('Revisión semestral');
  });

  it('rechaza DNI duplicado (mismo tenant) por nationalIdHash', async () => {
    await withTenant(TENANT_A, async (tx) => {
      const repos = makeRepositories(tx, migrate);
      const create = patientsCtx.makeCreatePatientUseCase({
        patientRepo: repos.patientRepo,
        consentRepo: repos.consentRepo,
        audit: repos.audit,
        clock: fixedClock(NOW),
      });
      await create({
        tenantId: TENANT_A,
        actorId: OWNER_A,
        actorRole: 'OWNER',
        ip: null,
        input: {
          firstName: 'Lucía',
          lastName: 'Pérez',
          nationalId: '12345678Z',
          clinicId: CLINIC_A,
          country: 'ES',
          gdprConsent: false,
          marketingConsent: false,
        },
      });
      await expect(
        create({
          tenantId: TENANT_A,
          actorId: OWNER_A,
          actorRole: 'OWNER',
          ip: null,
          input: {
            firstName: 'María',
            lastName: 'Otra',
            nationalId: '12345678Z',
            clinicId: CLINIC_A,
            country: 'ES',
            gdprConsent: false,
            marketingConsent: false,
          },
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });
  });

  it('aisla pacientes entre tenants', async () => {
    await withTenant(TENANT_A, async (tx) => {
      const repos = makeRepositories(tx, migrate);
      const create = patientsCtx.makeCreatePatientUseCase({
        patientRepo: repos.patientRepo,
        consentRepo: repos.consentRepo,
        audit: repos.audit,
        clock: fixedClock(NOW),
      });
      await create({
        tenantId: TENANT_A,
        actorId: OWNER_A,
        actorRole: 'OWNER',
        ip: null,
        input: {
          firstName: 'Lucía',
          lastName: 'Pérez',
          clinicId: CLINIC_A,
          country: 'ES',
          gdprConsent: false,
          marketingConsent: false,
        },
      });
    });

    await withTenant(TENANT_B, async (tx) => {
      const repos = makeRepositories(tx, migrate);
      const list = await repos.patientRepo.list({ limit: 10 });
      // Tenant B no ve pacientes de A.
      expect(list.items).toHaveLength(0);
    });
  });
});

describe('catalog / integración', () => {
  it('crea y lista tratamientos', async () => {
    await withTenant(TENANT_A, async (tx) => {
      const repos = makeRepositories(tx, migrate);
      const create = catalogCtx.makeCreateTreatmentUseCase({
        treatmentRepo: repos.treatmentRepo,
        audit: repos.audit,
      });
      await create({
        tenantId: TENANT_A,
        actorId: OWNER_A,
        actorRole: 'OWNER',
        ip: null,
        input: {
          code: 'TEST-001',
          name: 'Tratamiento de prueba',
          defaultPrice: 5000,
          taxRegime: 'EXEMPT_HEALTHCARE',
          active: true,
        },
      });
      const items = await repos.treatmentRepo.list({});
      expect(items.map((t) => t.code)).toContain('TEST-001');
    });
  });

  it('rechaza código duplicado', async () => {
    await withTenant(TENANT_A, async (tx) => {
      const repos = makeRepositories(tx, migrate);
      const create = catalogCtx.makeCreateTreatmentUseCase({
        treatmentRepo: repos.treatmentRepo,
        audit: repos.audit,
      });
      const input = {
        code: 'DUP-001',
        name: 'X',
        defaultPrice: 1000,
        taxRegime: 'EXEMPT_HEALTHCARE' as const,
        active: true,
      };
      await create({
        tenantId: TENANT_A,
        actorId: OWNER_A,
        actorRole: 'OWNER',
        ip: null,
        input,
      });
      await expect(
        create({
          tenantId: TENANT_A,
          actorId: OWNER_A,
          actorRole: 'OWNER',
          ip: null,
          input,
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });
  });
});
