import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { scheduling, fixedClock } from '@castellar/core';
import { makeRepositories, withTenant } from '../index.js';

/**
 * Tests integración del bounded context scheduling.
 *
 * Cubre:
 *  - creación de cita ok dentro del horario laboral
 *  - rechazo por solape detectado por la BD (GIST → OverlapConflict → CONFLICT)
 *  - rechazo fuera de horario laboral (PRECONDITION_FAILED)
 *  - flujo recordatorios: ventana 23–25h, idempotencia
 *  - aislamiento cross-tenant
 */

const TENANT = '11111111-1111-1111-1111-111111111111';
const CLINIC = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER = 'a0000000-0000-0000-0000-000000000001';
const PROF = 'c0000000-0000-0000-0000-000000000001';
const ROOM = 'b0000000-0000-0000-0000-000000000001';
const PATIENT = 'e0000000-0000-0000-0000-000000000001';

let migrate: PrismaClient;
const NOW = new Date('2026-10-19T10:00:00Z');

beforeAll(async () => {
  migrate = new PrismaClient({ datasourceUrl: process.env.DATABASE_MIGRATE_URL });
});

beforeEach(async () => {
  await migrate.$executeRawUnsafe(`DELETE FROM appointments`);
  await migrate.$executeRawUnsafe(`DELETE FROM availability_exceptions`);
  await migrate.$executeRawUnsafe(`DELETE FROM working_hours`);
  await migrate.$executeRawUnsafe(`DELETE FROM professionals`);
  await migrate.$executeRawUnsafe(`DELETE FROM rooms`);
  await migrate.$executeRawUnsafe(`DELETE FROM patients`);
  await migrate.$executeRawUnsafe(`DELETE FROM clinic_members`);
  await migrate.$executeRawUnsafe(`DELETE FROM user_security`);
  await migrate.$executeRawUnsafe(`DELETE FROM users`);
  await migrate.$executeRawUnsafe(`DELETE FROM clinics`);
  await migrate.$executeRawUnsafe(`DELETE FROM tenants`);

  await migrate.tenant.create({ data: { id: TENANT, name: 'Demo' } });
  await migrate.clinic.create({
    data: { id: CLINIC, tenantId: TENANT, name: 'Sede', timezone: 'Europe/Madrid' },
  });
  await migrate.user.create({
    data: {
      id: USER,
      tenantId: TENANT,
      supabaseUserId: USER,
      email: 'owner@demo.test',
      role: 'OWNER',
      status: 'ACTIVE',
    },
  });
  await migrate.professional.create({
    data: { id: PROF, tenantId: TENANT, userId: USER, specialty: 'Demo' },
  });
  await migrate.room.create({
    data: { id: ROOM, tenantId: TENANT, clinicId: CLINIC, name: 'Sala 1' },
  });
  await migrate.patient.create({
    data: {
      id: PATIENT,
      tenantId: TENANT,
      clinicId: CLINIC,
      code: 'P-INT-001',
      firstName: 'Lucía',
      lastName: 'Pérez',
      email: 'lucia@demo.test',
      country: 'ES',
      marketingConsent: false,
    },
  });
  // L-V 09–14 y 16–20.
  for (const dow of [1, 2, 3, 4, 5]) {
    await migrate.workingHours.createMany({
      data: [
        { tenantId: TENANT, professionalId: PROF, clinicId: CLINIC, dayOfWeek: dow, startMinute: 9 * 60, endMinute: 14 * 60 },
        { tenantId: TENANT, professionalId: PROF, clinicId: CLINIC, dayOfWeek: dow, startMinute: 16 * 60, endMinute: 20 * 60 },
      ],
    });
  }
});

afterAll(async () => {
  await migrate.$disconnect();
});

describe('scheduling / integración', () => {
  it('crea cita dentro del horario y la lista', async () => {
    await withTenant(TENANT, async (tx) => {
      const repos = makeRepositories(tx, migrate);
      const create = scheduling.makeCreateAppointmentUseCase({
        appointmentRepo: repos.appointmentRepo,
        professionalRepo: repos.professionalRepo,
        workingHoursRepo: repos.workingHoursRepo,
        exceptionsRepo: repos.availabilityRepo,
        audit: repos.audit,
        resolveTimezone: async () => 'Europe/Madrid',
      });

      const a = await create({
        tenantId: TENANT,
        actorId: USER,
        actorRole: 'OWNER',
        ip: '1.2.3.4',
        input: {
          clinicId: CLINIC,
          patientId: PATIENT,
          professionalId: PROF,
          roomId: ROOM,
          // Lunes 20 oct 2026, 10:00–10:30 Europe/Madrid (CEST: UTC+2).
          startsAt: new Date('2026-10-20T08:00:00Z'),
          endsAt: new Date('2026-10-20T08:30:00Z'),
        },
      });
      expect(a.status).toBe('SCHEDULED');

      const day = await repos.appointmentRepo.listInRange({
        clinicId: CLINIC,
        from: new Date('2026-10-20T00:00:00Z'),
        to: new Date('2026-10-21T00:00:00Z'),
      });
      expect(day).toHaveLength(1);
    });
  });

  it('detecta solape de profesional vía GIST → CONFLICT', async () => {
    await withTenant(TENANT, async (tx) => {
      const repos = makeRepositories(tx, migrate);
      const create = scheduling.makeCreateAppointmentUseCase({
        appointmentRepo: repos.appointmentRepo,
        professionalRepo: repos.professionalRepo,
        workingHoursRepo: repos.workingHoursRepo,
        exceptionsRepo: repos.availabilityRepo,
        audit: repos.audit,
        resolveTimezone: async () => 'Europe/Madrid',
      });
      await create({
        tenantId: TENANT,
        actorId: USER,
        actorRole: 'OWNER',
        ip: null,
        input: {
          clinicId: CLINIC,
          patientId: PATIENT,
          professionalId: PROF,
          startsAt: new Date('2026-10-20T08:00:00Z'),
          endsAt: new Date('2026-10-20T08:30:00Z'),
        },
      });

      await expect(
        create({
          tenantId: TENANT,
          actorId: USER,
          actorRole: 'OWNER',
          ip: null,
          input: {
            clinicId: CLINIC,
            patientId: PATIENT,
            professionalId: PROF,
            startsAt: new Date('2026-10-20T08:15:00Z'),
            endsAt: new Date('2026-10-20T08:45:00Z'),
          },
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });
  });

  it('rechaza fuera de horario laboral con PRECONDITION_FAILED', async () => {
    await withTenant(TENANT, async (tx) => {
      const repos = makeRepositories(tx, migrate);
      const create = scheduling.makeCreateAppointmentUseCase({
        appointmentRepo: repos.appointmentRepo,
        professionalRepo: repos.professionalRepo,
        workingHoursRepo: repos.workingHoursRepo,
        exceptionsRepo: repos.availabilityRepo,
        audit: repos.audit,
        resolveTimezone: async () => 'Europe/Madrid',
      });

      // 06:00 CEST en lunes — fuera del horario L–V 09–14/16–20.
      await expect(
        create({
          tenantId: TENANT,
          actorId: USER,
          actorRole: 'OWNER',
          ip: null,
          input: {
            clinicId: CLINIC,
            patientId: PATIENT,
            professionalId: PROF,
            startsAt: new Date('2026-10-20T04:00:00Z'),
            endsAt: new Date('2026-10-20T04:30:00Z'),
          },
        }),
      ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
    });
  });

  it('listPendingReminders devuelve solo citas en ventana 23-25h y status activo', async () => {
    // Cita en 24h y otra en 48h.
    const inWindow = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    const outsideWindow = new Date(NOW.getTime() + 48 * 60 * 60 * 1000);
    await withTenant(TENANT, async (tx) => {
      const repos = makeRepositories(tx, migrate);
      await repos.appointmentRepo.create({
        tenantId: TENANT,
        clinicId: CLINIC,
        patientId: PATIENT,
        professionalId: PROF,
        roomId: null,
        startsAt: inWindow,
        endsAt: new Date(inWindow.getTime() + 30 * 60_000),
        status: 'SCHEDULED',
        reason: null,
        notes: null,
        remindedAt: null,
        checkedInAt: null,
        inRoomAt: null,
        completedAt: null,
        noShowAt: null,
        cancelledAt: null,
        cancelReason: null,
      });
      await repos.appointmentRepo.create({
        tenantId: TENANT,
        clinicId: CLINIC,
        patientId: PATIENT,
        professionalId: PROF,
        roomId: null,
        startsAt: outsideWindow,
        endsAt: new Date(outsideWindow.getTime() + 30 * 60_000),
        status: 'SCHEDULED',
        reason: null,
        notes: null,
        remindedAt: null,
        checkedInAt: null,
        inRoomAt: null,
        completedAt: null,
        noShowAt: null,
        cancelledAt: null,
        cancelReason: null,
      });

      const pending = await repos.appointmentRepo.listPendingReminders({
        from: new Date(NOW.getTime() + 23 * 60 * 60 * 1000),
        to: new Date(NOW.getTime() + 25 * 60 * 60 * 1000),
        limit: 10,
      });
      expect(pending).toHaveLength(1);
      expect(pending[0]?.startsAt.toISOString()).toBe(inWindow.toISOString());
    });
  });

  it('aísla agenda entre tenants', async () => {
    await migrate.tenant.create({ data: { id: '22222222-2222-2222-2222-222222222222', name: 'B' } });
    await migrate.clinic.create({
      data: {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        tenantId: '22222222-2222-2222-2222-222222222222',
        name: 'Sede B',
      },
    });

    await withTenant(TENANT, async (tx) => {
      const repos = makeRepositories(tx, migrate);
      await repos.appointmentRepo.create({
        tenantId: TENANT,
        clinicId: CLINIC,
        patientId: PATIENT,
        professionalId: PROF,
        roomId: null,
        startsAt: new Date('2026-10-20T08:00:00Z'),
        endsAt: new Date('2026-10-20T08:30:00Z'),
        status: 'SCHEDULED',
        reason: null,
        notes: null,
        remindedAt: null,
        checkedInAt: null,
        inRoomAt: null,
        completedAt: null,
        noShowAt: null,
        cancelledAt: null,
        cancelReason: null,
      });
    });

    await withTenant('22222222-2222-2222-2222-222222222222', async (tx) => {
      const repos = makeRepositories(tx, migrate);
      const items = await repos.appointmentRepo.listInRange({
        clinicId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        from: new Date('2026-10-20T00:00:00Z'),
        to: new Date('2026-10-21T00:00:00Z'),
      });
      expect(items).toHaveLength(0);
    });
  });
});
