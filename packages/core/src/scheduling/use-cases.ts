import { z } from 'zod';
import {
  BadRequest,
  Conflict,
  Forbidden,
  NotFound,
  PreconditionFailed,
} from '../shared/errors.js';
import type { Clock } from '../shared/clock.js';
import type { identity } from '../identity/index.js';
import { inTimezone } from './timezone.js';
import {
  isStatusTransitionAllowed,
  NON_BLOCKING_STATUSES,
  type Appointment,
  type AppointmentStatus,
} from './entities.js';
import {
  OverlapConflict,
  type AppointmentRepository,
  type AvailabilityExceptionRepository,
  type ProfessionalRepository,
  type RoomRepository,
  type WorkingHoursRepository,
} from './ports.js';

// ---------- Schemas Zod ----------------------------------------------------

export const createAppointmentInput = z.object({
  clinicId: z.string().uuid(),
  patientId: z.string().uuid(),
  professionalId: z.string().uuid(),
  roomId: z.string().uuid().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  reason: z.string().max(255).optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateAppointmentInput = z.infer<typeof createAppointmentInput>;

export const rescheduleAppointmentInput = z.object({
  appointmentId: z.string().uuid(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  roomId: z.string().uuid().nullable().optional(),
  professionalId: z.string().uuid().optional(),
});
export type RescheduleAppointmentInput = z.infer<typeof rescheduleAppointmentInput>;

export const changeStatusInput = z.object({
  appointmentId: z.string().uuid(),
  to: z.enum([
    'SCHEDULED',
    'CONFIRMED',
    'CHECKED_IN',
    'IN_ROOM',
    'COMPLETED',
    'NO_SHOW',
    'CANCELLED',
  ]),
  cancelReason: z.string().max(255).optional(),
});
export type ChangeStatusInput = z.infer<typeof changeStatusInput>;

export const listAgendaInput = z.object({
  clinicId: z.string().uuid(),
  from: z.coerce.date(),
  to: z.coerce.date(),
  professionalId: z.string().uuid().optional(),
  roomId: z.string().uuid().optional(),
});

// ---------- Helpers --------------------------------------------------------

function assertOrder(start: Date, end: Date) {
  if (end.getTime() <= start.getTime()) {
    throw new BadRequest('La hora de fin debe ser posterior a la de inicio');
  }
  const durMin = (end.getTime() - start.getTime()) / 60_000;
  if (durMin > 480) throw new BadRequest('La cita no puede durar más de 8 horas');
}

async function assertWithinWorkingHours(args: {
  starts: Date;
  ends: Date;
  professionalId: string;
  clinicId: string;
  timezone: string;
  workingHoursRepo: WorkingHoursRepository;
  exceptionsRepo: AvailabilityExceptionRepository;
}) {
  const hours = await args.workingHoursRepo.listFor(args.professionalId, args.clinicId);
  if (hours.length === 0) return; // Si el profesional no tiene horario definido, permitimos.

  const start = inTimezone(args.starts, args.timezone);
  const end = inTimezone(args.ends, args.timezone);
  if (start.dayOfWeek !== end.dayOfWeek) {
    throw new BadRequest('La cita no puede cruzar la medianoche local');
  }
  const sameDay = hours.filter((h) => h.dayOfWeek === start.dayOfWeek);
  const fits = sameDay.some(
    (h) => start.minuteOfDay >= h.startMinute && end.minuteOfDay <= h.endMinute,
  );
  if (!fits) {
    throw new PreconditionFailed('Fuera del horario laboral del profesional');
  }

  // Excepciones (vacaciones / festivos). Si la cita cae dentro de un bloqueo, rechazo.
  const exceptions = await args.exceptionsRepo.listInRange(
    args.professionalId,
    args.starts,
    args.ends,
  );
  const blocked = exceptions.some(
    (e) => e.endsAt > args.starts && e.startsAt < args.ends,
  );
  if (blocked) {
    throw new PreconditionFailed('El profesional no está disponible en esa franja');
  }
}

function ensureCanWriteAgenda(role: identity.Role) {
  if (
    role !== 'OWNER' &&
    role !== 'ADMIN_CLINIC' &&
    role !== 'RECEPTION' &&
    role !== 'DENTIST' &&
    role !== 'HYGIENIST'
  ) {
    throw new Forbidden('Tu rol no permite gestionar la agenda');
  }
}

// ---------- Casos de uso ---------------------------------------------------

export function makeCreateAppointmentUseCase(deps: {
  appointmentRepo: AppointmentRepository;
  professionalRepo: ProfessionalRepository;
  workingHoursRepo: WorkingHoursRepository;
  exceptionsRepo: AvailabilityExceptionRepository;
  audit: identity.AuditLogRepository;
  /** Resolver de timezone por clínica. Lo provee la API leyendo `Clinic`. */
  resolveTimezone: (clinicId: string) => Promise<string>;
}) {
  return async function createAppointment(args: {
    tenantId: string;
    actorId: string;
    actorRole: identity.Role;
    input: CreateAppointmentInput;
    ip: string | null;
  }) {
    ensureCanWriteAgenda(args.actorRole);
    assertOrder(args.input.startsAt, args.input.endsAt);

    const prof = await deps.professionalRepo.findById(args.input.professionalId);
    if (!prof) throw new NotFound('Profesional');

    const timezone = await deps.resolveTimezone(args.input.clinicId);
    await assertWithinWorkingHours({
      starts: args.input.startsAt,
      ends: args.input.endsAt,
      professionalId: args.input.professionalId,
      clinicId: args.input.clinicId,
      timezone,
      workingHoursRepo: deps.workingHoursRepo,
      exceptionsRepo: deps.exceptionsRepo,
    });

    let created: Appointment;
    try {
      created = await deps.appointmentRepo.create({
        tenantId: args.tenantId,
        clinicId: args.input.clinicId,
        patientId: args.input.patientId,
        professionalId: args.input.professionalId,
        roomId: args.input.roomId ?? null,
        startsAt: args.input.startsAt,
        endsAt: args.input.endsAt,
        status: 'SCHEDULED',
        reason: args.input.reason ?? null,
        notes: args.input.notes ?? null,
        remindedAt: null,
        checkedInAt: null,
        inRoomAt: null,
        completedAt: null,
        noShowAt: null,
        cancelledAt: null,
        cancelReason: null,
      });
    } catch (err) {
      if (err instanceof OverlapConflict) {
        throw new Conflict(
          err.kind === 'PROFESSIONAL'
            ? 'El profesional ya tiene otra cita en esa franja'
            : 'La sala está ocupada en esa franja',
        );
      }
      throw err;
    }

    await deps.audit.write({
      tenantId: args.tenantId,
      actorId: args.actorId,
      action: 'appointment.create',
      resourceType: 'appointment',
      resourceId: created.id,
      ip: args.ip,
      userAgent: null,
      reason: null,
      diff: {
        professionalId: created.professionalId,
        roomId: created.roomId,
        startsAt: created.startsAt.toISOString(),
        endsAt: created.endsAt.toISOString(),
      },
    });

    return created;
  };
}

export function makeRescheduleAppointmentUseCase(deps: {
  appointmentRepo: AppointmentRepository;
  workingHoursRepo: WorkingHoursRepository;
  exceptionsRepo: AvailabilityExceptionRepository;
  audit: identity.AuditLogRepository;
  resolveTimezone: (clinicId: string) => Promise<string>;
}) {
  return async function rescheduleAppointment(args: {
    tenantId: string;
    actorId: string;
    actorRole: identity.Role;
    input: RescheduleAppointmentInput;
    ip: string | null;
  }) {
    ensureCanWriteAgenda(args.actorRole);
    assertOrder(args.input.startsAt, args.input.endsAt);

    const existing = await deps.appointmentRepo.findById(args.input.appointmentId);
    if (!existing) throw new NotFound('Cita');
    if (existing.status === 'CANCELLED' || existing.status === 'COMPLETED') {
      throw new PreconditionFailed('La cita no se puede reagendar en su estado actual');
    }

    const professionalId = args.input.professionalId ?? existing.professionalId;
    const roomId =
      args.input.roomId === undefined ? existing.roomId : args.input.roomId;
    const timezone = await deps.resolveTimezone(existing.clinicId);

    await assertWithinWorkingHours({
      starts: args.input.startsAt,
      ends: args.input.endsAt,
      professionalId,
      clinicId: existing.clinicId,
      timezone,
      workingHoursRepo: deps.workingHoursRepo,
      exceptionsRepo: deps.exceptionsRepo,
    });

    let updated: Appointment;
    try {
      updated = await deps.appointmentRepo.update(existing.id, {
        startsAt: args.input.startsAt,
        endsAt: args.input.endsAt,
        professionalId,
        roomId,
        // Reset del recordatorio: si movemos la cita queremos volver a notificar.
        remindedAt: null,
      });
    } catch (err) {
      if (err instanceof OverlapConflict) {
        throw new Conflict(
          err.kind === 'PROFESSIONAL'
            ? 'El profesional ya tiene otra cita en esa franja'
            : 'La sala está ocupada en esa franja',
        );
      }
      throw err;
    }

    await deps.audit.write({
      tenantId: args.tenantId,
      actorId: args.actorId,
      action: 'appointment.reschedule',
      resourceType: 'appointment',
      resourceId: updated.id,
      ip: args.ip,
      userAgent: null,
      reason: null,
      diff: {
        from: {
          startsAt: existing.startsAt.toISOString(),
          endsAt: existing.endsAt.toISOString(),
          professionalId: existing.professionalId,
          roomId: existing.roomId,
        },
        to: {
          startsAt: updated.startsAt.toISOString(),
          endsAt: updated.endsAt.toISOString(),
          professionalId: updated.professionalId,
          roomId: updated.roomId,
        },
      },
    });
    return updated;
  };
}

export function makeChangeStatusUseCase(deps: {
  appointmentRepo: AppointmentRepository;
  audit: identity.AuditLogRepository;
  clock: Clock;
}) {
  return async function changeStatus(args: {
    tenantId: string;
    actorId: string;
    actorRole: identity.Role;
    input: ChangeStatusInput;
    ip: string | null;
  }) {
    ensureCanWriteAgenda(args.actorRole);
    const existing = await deps.appointmentRepo.findById(args.input.appointmentId);
    if (!existing) throw new NotFound('Cita');

    if (!isStatusTransitionAllowed(existing.status, args.input.to)) {
      throw new PreconditionFailed(
        `Transición ${existing.status} → ${args.input.to} no permitida`,
      );
    }

    const now = deps.clock.now();
    const patch: Partial<Appointment> = { status: args.input.to as AppointmentStatus };
    switch (args.input.to) {
      case 'CHECKED_IN':
        patch.checkedInAt = now;
        break;
      case 'IN_ROOM':
        patch.inRoomAt = now;
        break;
      case 'COMPLETED':
        patch.completedAt = now;
        break;
      case 'NO_SHOW':
        patch.noShowAt = now;
        break;
      case 'CANCELLED':
        patch.cancelledAt = now;
        patch.cancelReason = args.input.cancelReason ?? null;
        break;
      default:
        break;
    }

    const updated = await deps.appointmentRepo.update(existing.id, patch);

    await deps.audit.write({
      tenantId: args.tenantId,
      actorId: args.actorId,
      action: `appointment.status.${args.input.to.toLowerCase()}`,
      resourceType: 'appointment',
      resourceId: updated.id,
      ip: args.ip,
      userAgent: null,
      reason: null,
      diff: { from: existing.status, to: updated.status },
    });
    return updated;
  };
}

export function makeListAgendaUseCase(deps: {
  appointmentRepo: AppointmentRepository;
}) {
  return async function listAgenda(args: {
    clinicId: string;
    from: Date;
    to: Date;
    professionalId?: string;
    roomId?: string;
  }) {
    if (args.to.getTime() - args.from.getTime() > 32 * 24 * 60 * 60 * 1000) {
      throw new BadRequest('Rango máximo: 32 días');
    }
    return deps.appointmentRepo.listInRange(args);
  };
}

/**
 * Re-export para uso desde tests.
 */
export { NON_BLOCKING_STATUSES };
