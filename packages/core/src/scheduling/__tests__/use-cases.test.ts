import { describe, expect, it } from 'vitest';
import { fixedClock } from '../../shared/clock.js';
import { FakeAuditRepo } from '../../identity/__tests__/fakes.js';
import {
  makeChangeStatusUseCase,
  makeCreateAppointmentUseCase,
  makeListAgendaUseCase,
  makeRescheduleAppointmentUseCase,
} from '../use-cases.js';
import {
  FakeAppointmentRepo,
  FakeAvailabilityExceptionRepo,
  FakeProfessionalRepo,
  FakeWorkingHoursRepo,
} from './fakes.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const CLINIC = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PROF = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ROOM = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PATIENT = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const OWNER = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const NOW = new Date('2026-10-19T08:00:00Z');

function setup(opts: { withHours?: boolean } = {}) {
  const appointmentRepo = new FakeAppointmentRepo();
  const professionalRepo = new FakeProfessionalRepo();
  const workingHoursRepo = new FakeWorkingHoursRepo();
  const exceptionsRepo = new FakeAvailabilityExceptionRepo();
  const audit = new FakeAuditRepo();
  professionalRepo.add({
    id: PROF,
    tenantId: TENANT,
    userId: 'u',
    licenseNumber: null,
    specialty: null,
    color: '#0ea5e9',
  });
  if (opts.withHours !== false) {
    // L-V 9:00 - 14:00 y 16:00 - 20:00 en Europe/Madrid.
    const weekday = [1, 2, 3, 4, 5];
    for (const d of weekday) {
      workingHoursRepo.hours.push(
        { id: `${d}-am`, tenantId: TENANT, professionalId: PROF, clinicId: CLINIC, dayOfWeek: d, startMinute: 9 * 60, endMinute: 14 * 60 },
        { id: `${d}-pm`, tenantId: TENANT, professionalId: PROF, clinicId: CLINIC, dayOfWeek: d, startMinute: 16 * 60, endMinute: 20 * 60 },
      );
    }
  }
  return { appointmentRepo, professionalRepo, workingHoursRepo, exceptionsRepo, audit };
}

const resolveTimezone = () => Promise.resolve('Europe/Madrid');

describe('scheduling / createAppointment', () => {
  it('crea cita dentro del horario laboral', async () => {
    const deps = setup();
    const create = makeCreateAppointmentUseCase({ ...deps, resolveTimezone });
    const a = await create({
      tenantId: TENANT,
      actorId: OWNER,
      actorRole: 'RECEPTION',
      ip: null,
      input: {
        clinicId: CLINIC,
        patientId: PATIENT,
        professionalId: PROF,
        roomId: ROOM,
        // Lunes 20 oct 2026, 10:00–10:30 CEST
        startsAt: new Date('2026-10-20T08:00:00Z'),
        endsAt: new Date('2026-10-20T08:30:00Z'),
      },
    });
    expect(a.status).toBe('SCHEDULED');
    expect(deps.audit.entries.map((e) => e.action)).toContain('appointment.create');
  });

  it('rechaza fuera de horario laboral', async () => {
    const deps = setup();
    const create = makeCreateAppointmentUseCase({ ...deps, resolveTimezone });
    // 06:00 CEST en lunes → fuera de horario.
    await expect(
      create({
        tenantId: TENANT,
        actorId: OWNER,
        actorRole: 'RECEPTION',
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

  it('rechaza solape detectado por el repo', async () => {
    const deps = setup();
    const create = makeCreateAppointmentUseCase({ ...deps, resolveTimezone });
    const input = {
      clinicId: CLINIC,
      patientId: PATIENT,
      professionalId: PROF,
      roomId: ROOM,
      startsAt: new Date('2026-10-20T08:00:00Z'),
      endsAt: new Date('2026-10-20T08:30:00Z'),
    };
    await create({ tenantId: TENANT, actorId: OWNER, actorRole: 'RECEPTION', ip: null, input });
    await expect(
      create({
        tenantId: TENANT,
        actorId: OWNER,
        actorRole: 'RECEPTION',
        ip: null,
        input: { ...input, startsAt: new Date('2026-10-20T08:15:00Z') },
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('ACCOUNTING no puede crear citas', async () => {
    const deps = setup();
    const create = makeCreateAppointmentUseCase({ ...deps, resolveTimezone });
    await expect(
      create({
        tenantId: TENANT,
        actorId: OWNER,
        actorRole: 'ACCOUNTING',
        ip: null,
        input: {
          clinicId: CLINIC,
          patientId: PATIENT,
          professionalId: PROF,
          startsAt: new Date('2026-10-20T08:00:00Z'),
          endsAt: new Date('2026-10-20T08:30:00Z'),
        },
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('respeta excepción de disponibilidad', async () => {
    const deps = setup();
    deps.exceptionsRepo.exceptions.push({
      id: 'x',
      tenantId: TENANT,
      professionalId: PROF,
      clinicId: CLINIC,
      startsAt: new Date('2026-10-20T00:00:00Z'),
      endsAt: new Date('2026-10-21T00:00:00Z'),
      reason: 'Vacaciones',
    });
    const create = makeCreateAppointmentUseCase({ ...deps, resolveTimezone });
    await expect(
      create({
        tenantId: TENANT,
        actorId: OWNER,
        actorRole: 'RECEPTION',
        ip: null,
        input: {
          clinicId: CLINIC,
          patientId: PATIENT,
          professionalId: PROF,
          startsAt: new Date('2026-10-20T08:00:00Z'),
          endsAt: new Date('2026-10-20T08:30:00Z'),
        },
      }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
});

describe('scheduling / reschedule', () => {
  it('mueve la cita y resetea remindedAt', async () => {
    const deps = setup();
    const create = makeCreateAppointmentUseCase({ ...deps, resolveTimezone });
    const reschedule = makeRescheduleAppointmentUseCase({ ...deps, resolveTimezone });
    const a = await create({
      tenantId: TENANT,
      actorId: OWNER,
      actorRole: 'RECEPTION',
      ip: null,
      input: {
        clinicId: CLINIC,
        patientId: PATIENT,
        professionalId: PROF,
        startsAt: new Date('2026-10-20T08:00:00Z'),
        endsAt: new Date('2026-10-20T08:30:00Z'),
      },
    });
    // Simulamos que ya se envió recordatorio.
    await deps.appointmentRepo.markReminded(a.id, NOW);
    const moved = await reschedule({
      tenantId: TENANT,
      actorId: OWNER,
      actorRole: 'RECEPTION',
      ip: null,
      input: {
        appointmentId: a.id,
        startsAt: new Date('2026-10-21T08:00:00Z'),
        endsAt: new Date('2026-10-21T08:30:00Z'),
      },
    });
    expect(moved.startsAt.toISOString()).toBe('2026-10-21T08:00:00.000Z');
    expect(moved.remindedAt).toBeNull();
  });

  it('rechaza reagendar una cita COMPLETED', async () => {
    const deps = setup();
    const create = makeCreateAppointmentUseCase({ ...deps, resolveTimezone });
    const change = makeChangeStatusUseCase({
      appointmentRepo: deps.appointmentRepo,
      audit: deps.audit,
      clock: fixedClock(NOW),
    });
    const reschedule = makeRescheduleAppointmentUseCase({ ...deps, resolveTimezone });
    const a = await create({
      tenantId: TENANT,
      actorId: OWNER,
      actorRole: 'RECEPTION',
      ip: null,
      input: {
        clinicId: CLINIC,
        patientId: PATIENT,
        professionalId: PROF,
        startsAt: new Date('2026-10-20T08:00:00Z'),
        endsAt: new Date('2026-10-20T08:30:00Z'),
      },
    });
    // Recorremos la máquina de estados hasta COMPLETED.
    for (const to of ['CHECKED_IN', 'IN_ROOM', 'COMPLETED'] as const) {
      await change({
        tenantId: TENANT,
        actorId: OWNER,
        actorRole: 'DENTIST',
        ip: null,
        input: { appointmentId: a.id, to },
      });
    }
    await expect(
      reschedule({
        tenantId: TENANT,
        actorId: OWNER,
        actorRole: 'RECEPTION',
        ip: null,
        input: {
          appointmentId: a.id,
          startsAt: new Date('2026-10-21T08:00:00Z'),
          endsAt: new Date('2026-10-21T08:30:00Z'),
        },
      }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });
});

describe('scheduling / changeStatus', () => {
  it('rechaza transiciones inválidas', async () => {
    const deps = setup();
    const create = makeCreateAppointmentUseCase({ ...deps, resolveTimezone });
    const change = makeChangeStatusUseCase({
      appointmentRepo: deps.appointmentRepo,
      audit: deps.audit,
      clock: fixedClock(NOW),
    });
    const a = await create({
      tenantId: TENANT,
      actorId: OWNER,
      actorRole: 'RECEPTION',
      ip: null,
      input: {
        clinicId: CLINIC,
        patientId: PATIENT,
        professionalId: PROF,
        startsAt: new Date('2026-10-20T08:00:00Z'),
        endsAt: new Date('2026-10-20T08:30:00Z'),
      },
    });
    // SCHEDULED → COMPLETED no es válido (debe pasar por CHECKED_IN, IN_ROOM).
    await expect(
      change({
        tenantId: TENANT,
        actorId: OWNER,
        actorRole: 'DENTIST',
        ip: null,
        input: { appointmentId: a.id, to: 'COMPLETED' },
      }),
    ).rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('cancela y guarda motivo', async () => {
    const deps = setup();
    const create = makeCreateAppointmentUseCase({ ...deps, resolveTimezone });
    const change = makeChangeStatusUseCase({
      appointmentRepo: deps.appointmentRepo,
      audit: deps.audit,
      clock: fixedClock(NOW),
    });
    const a = await create({
      tenantId: TENANT,
      actorId: OWNER,
      actorRole: 'RECEPTION',
      ip: null,
      input: {
        clinicId: CLINIC,
        patientId: PATIENT,
        professionalId: PROF,
        startsAt: new Date('2026-10-20T08:00:00Z'),
        endsAt: new Date('2026-10-20T08:30:00Z'),
      },
    });
    const cancelled = await change({
      tenantId: TENANT,
      actorId: OWNER,
      actorRole: 'RECEPTION',
      ip: null,
      input: { appointmentId: a.id, to: 'CANCELLED', cancelReason: 'Paciente enfermo' },
    });
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancelReason).toBe('Paciente enfermo');
    expect(cancelled.cancelledAt).toEqual(NOW);
  });
});

describe('scheduling / listAgenda', () => {
  it('filtra por profesional y rango', async () => {
    const deps = setup();
    const create = makeCreateAppointmentUseCase({ ...deps, resolveTimezone });
    const list = makeListAgendaUseCase({ appointmentRepo: deps.appointmentRepo });
    await create({
      tenantId: TENANT,
      actorId: OWNER,
      actorRole: 'RECEPTION',
      ip: null,
      input: {
        clinicId: CLINIC,
        patientId: PATIENT,
        professionalId: PROF,
        startsAt: new Date('2026-10-20T08:00:00Z'),
        endsAt: new Date('2026-10-20T08:30:00Z'),
      },
    });
    const day = await list({
      clinicId: CLINIC,
      from: new Date('2026-10-20T00:00:00Z'),
      to: new Date('2026-10-21T00:00:00Z'),
    });
    expect(day).toHaveLength(1);
    const next = await list({
      clinicId: CLINIC,
      from: new Date('2026-10-21T00:00:00Z'),
      to: new Date('2026-10-22T00:00:00Z'),
    });
    expect(next).toHaveLength(0);
  });
});
