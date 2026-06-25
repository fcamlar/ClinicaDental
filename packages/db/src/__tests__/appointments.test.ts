import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { withTenant } from '../index.js';

/**
 * Spike GIST anti-solape — Sprint 0.
 *
 * Las dos constraints `appointments_no_overlap_professional` y
 * `appointments_no_overlap_room` deben rechazar a nivel de BD cualquier
 * intento de crear citas solapadas. Los tests pasan zonas horarias de
 * Europe/Madrid para verificar que `tstzrange` se comporta correctamente
 * incluyendo el cambio de horario.
 */

const TENANT = '11111111-1111-1111-1111-111111111111';
const CLINIC = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ROOM_A = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PROF_A = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PROF_B = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PATIENT = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const userA = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const userB = 'ffffffff-ffff-ffff-ffff-fffffffffff1';

let migrate: PrismaClient;

beforeAll(async () => {
  migrate = new PrismaClient({ datasourceUrl: process.env.DATABASE_MIGRATE_URL });

  await migrate.tenant.upsert({
    where: { id: TENANT },
    update: {},
    create: { id: TENANT, name: 'Demo' },
  });
  await migrate.clinic.upsert({
    where: { id: CLINIC },
    update: {},
    create: { id: CLINIC, tenantId: TENANT, name: 'Sede 1' },
  });
  await migrate.user.upsert({
    where: { id: userA },
    update: {},
    create: {
      id: userA,
      tenantId: TENANT,
      supabaseUserId: userA,
      email: 'a@demo.test',
      role: 'DENTIST',
    },
  });
  await migrate.user.upsert({
    where: { id: userB },
    update: {},
    create: {
      id: userB,
      tenantId: TENANT,
      supabaseUserId: userB,
      email: 'b@demo.test',
      role: 'DENTIST',
    },
  });
  await migrate.professional.upsert({
    where: { id: PROF_A },
    update: {},
    create: { id: PROF_A, tenantId: TENANT, userId: userA },
  });
  await migrate.professional.upsert({
    where: { id: PROF_B },
    update: {},
    create: { id: PROF_B, tenantId: TENANT, userId: userB },
  });
  await migrate.room.upsert({
    where: { id: ROOM_A },
    update: {},
    create: { id: ROOM_A, tenantId: TENANT, clinicId: CLINIC, name: 'Sala 1' },
  });
  await migrate.patient.upsert({
    where: { id: PATIENT },
    update: {},
    create: {
      id: PATIENT,
      tenantId: TENANT,
      clinicId: CLINIC,
      code: 'P-001',
      firstName: 'Lucía',
      lastName: 'Pérez',
    },
  });
});

beforeEach(async () => {
  await migrate.appointment.deleteMany();
});

afterAll(async () => {
  await migrate.$disconnect();
});

describe('Appointment — anti-solape GIST', () => {
  it('inserta dos citas no solapadas del mismo profesional', async () => {
    await withTenant(TENANT, async (tx) => {
      await tx.appointment.create({
        data: {
          tenantId: TENANT,
          clinicId: CLINIC,
          patientId: PATIENT,
          professionalId: PROF_A,
          roomId: ROOM_A,
          startsAt: new Date('2026-10-20T09:00:00+02:00'),
          endsAt: new Date('2026-10-20T09:30:00+02:00'),
        },
      });
      await tx.appointment.create({
        data: {
          tenantId: TENANT,
          clinicId: CLINIC,
          patientId: PATIENT,
          professionalId: PROF_A,
          roomId: ROOM_A,
          startsAt: new Date('2026-10-20T09:30:00+02:00'),
          endsAt: new Date('2026-10-20T10:00:00+02:00'),
        },
      });
    });

    const all = await migrate.appointment.findMany({ where: { professionalId: PROF_A } });
    expect(all).toHaveLength(2);
  });

  it('rechaza solape exacto del mismo profesional', async () => {
    await withTenant(TENANT, (tx) =>
      tx.appointment.create({
        data: {
          tenantId: TENANT,
          clinicId: CLINIC,
          patientId: PATIENT,
          professionalId: PROF_A,
          startsAt: new Date('2026-10-20T09:00:00+02:00'),
          endsAt: new Date('2026-10-20T09:30:00+02:00'),
        },
      }),
    );

    await expect(
      withTenant(TENANT, (tx) =>
        tx.appointment.create({
          data: {
            tenantId: TENANT,
            clinicId: CLINIC,
            patientId: PATIENT,
            professionalId: PROF_A,
            startsAt: new Date('2026-10-20T09:00:00+02:00'),
            endsAt: new Date('2026-10-20T09:30:00+02:00'),
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('rechaza solape parcial del mismo profesional', async () => {
    await withTenant(TENANT, (tx) =>
      tx.appointment.create({
        data: {
          tenantId: TENANT,
          clinicId: CLINIC,
          patientId: PATIENT,
          professionalId: PROF_A,
          startsAt: new Date('2026-10-20T09:00:00+02:00'),
          endsAt: new Date('2026-10-20T09:30:00+02:00'),
        },
      }),
    );

    await expect(
      withTenant(TENANT, (tx) =>
        tx.appointment.create({
          data: {
            tenantId: TENANT,
            clinicId: CLINIC,
            patientId: PATIENT,
            professionalId: PROF_A,
            startsAt: new Date('2026-10-20T09:15:00+02:00'),
            endsAt: new Date('2026-10-20T09:45:00+02:00'),
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('rechaza solape en la misma sala con DOS profesionales distintos', async () => {
    await withTenant(TENANT, (tx) =>
      tx.appointment.create({
        data: {
          tenantId: TENANT,
          clinicId: CLINIC,
          patientId: PATIENT,
          professionalId: PROF_A,
          roomId: ROOM_A,
          startsAt: new Date('2026-10-20T09:00:00+02:00'),
          endsAt: new Date('2026-10-20T10:00:00+02:00'),
        },
      }),
    );

    await expect(
      withTenant(TENANT, (tx) =>
        tx.appointment.create({
          data: {
            tenantId: TENANT,
            clinicId: CLINIC,
            patientId: PATIENT,
            professionalId: PROF_B,
            roomId: ROOM_A,
            startsAt: new Date('2026-10-20T09:30:00+02:00'),
            endsAt: new Date('2026-10-20T10:30:00+02:00'),
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it('una cita CANCELLED libera el hueco', async () => {
    const cancelled = await withTenant(TENANT, (tx) =>
      tx.appointment.create({
        data: {
          tenantId: TENANT,
          clinicId: CLINIC,
          patientId: PATIENT,
          professionalId: PROF_A,
          startsAt: new Date('2026-10-20T09:00:00+02:00'),
          endsAt: new Date('2026-10-20T09:30:00+02:00'),
          status: 'CANCELLED',
        },
      }),
    );
    expect(cancelled.status).toBe('CANCELLED');

    await withTenant(TENANT, (tx) =>
      tx.appointment.create({
        data: {
          tenantId: TENANT,
          clinicId: CLINIC,
          patientId: PATIENT,
          professionalId: PROF_A,
          startsAt: new Date('2026-10-20T09:00:00+02:00'),
          endsAt: new Date('2026-10-20T09:30:00+02:00'),
        },
      }),
    );

    const active = await migrate.appointment.findMany({
      where: { professionalId: PROF_A, status: 'SCHEDULED' },
    });
    expect(active).toHaveLength(1);
  });

  it('cambio de horario UTC en Europe/Madrid (DST)', async () => {
    // 2026-10-25 a las 03:00 Europe/Madrid se retrasa a 02:00 (CET).
    // Aceptamos dos citas seguidas que cruzan el salto sin colisión.
    await withTenant(TENANT, async (tx) => {
      await tx.appointment.create({
        data: {
          tenantId: TENANT,
          clinicId: CLINIC,
          patientId: PATIENT,
          professionalId: PROF_A,
          startsAt: new Date('2026-10-25T00:30:00Z'), // 02:30 CEST
          endsAt: new Date('2026-10-25T01:00:00Z'), // 03:00 CEST → 02:00 CET
        },
      });
      await tx.appointment.create({
        data: {
          tenantId: TENANT,
          clinicId: CLINIC,
          patientId: PATIENT,
          professionalId: PROF_A,
          startsAt: new Date('2026-10-25T01:00:00Z'), // 02:00 CET
          endsAt: new Date('2026-10-25T01:30:00Z'),
        },
      });
    });

    const all = await migrate.appointment.findMany({ where: { professionalId: PROF_A } });
    expect(all).toHaveLength(2);
  });
});
