import type { Prisma, PrismaClient } from '@prisma/client';
import { scheduling } from '@castellar/core';

type Appointment = scheduling.Appointment;
type AppointmentStatus = scheduling.AppointmentStatus;
type AvailabilityException = scheduling.AvailabilityException;
type Professional = scheduling.Professional;
type Room = scheduling.Room;
type WorkingHours = scheduling.WorkingHours;
const { OverlapConflict } = scheduling;

/**
 * Traduce un error de Prisma a OverlapConflict si corresponde a una de las
 * dos constraints GIST de la tabla appointments.
 *
 *   appointments_no_overlap_professional  → professional clash
 *   appointments_no_overlap_room          → room clash
 *
 * Prisma reporta excepciones de constraint EXCLUDE como
 * PrismaClientKnownRequestError con `meta.constraint` o como mensaje libre,
 * según versión. Inspeccionamos el mensaje por seguridad.
 */
function translateError(err: unknown): never {
  const message = err instanceof Error ? err.message : '';
  if (message.includes('appointments_no_overlap_professional')) {
    throw new OverlapConflict('PROFESSIONAL');
  }
  if (message.includes('appointments_no_overlap_room')) {
    throw new OverlapConflict('ROOM');
  }
  throw err as Error;
}

function toAppointment(a: {
  id: string;
  tenantId: string;
  clinicId: string;
  patientId: string;
  professionalId: string;
  roomId: string | null;
  startsAt: Date;
  endsAt: Date;
  status: AppointmentStatus;
  reason: string | null;
  notes: string | null;
  remindedAt: Date | null;
  checkedInAt: Date | null;
  inRoomAt: Date | null;
  completedAt: Date | null;
  noShowAt: Date | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Appointment {
  return {
    id: a.id,
    tenantId: a.tenantId,
    clinicId: a.clinicId,
    patientId: a.patientId,
    professionalId: a.professionalId,
    roomId: a.roomId,
    startsAt: a.startsAt,
    endsAt: a.endsAt,
    status: a.status,
    reason: a.reason,
    notes: a.notes,
    remindedAt: a.remindedAt,
    checkedInAt: a.checkedInAt,
    inRoomAt: a.inRoomAt,
    completedAt: a.completedAt,
    noShowAt: a.noShowAt,
    cancelledAt: a.cancelledAt,
    cancelReason: a.cancelReason,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

export class PrismaAppointmentRepository implements scheduling.AppointmentRepository {
  constructor(private readonly tx: PrismaClient | Prisma.TransactionClient) {}

  async findById(id: string) {
    const a = await this.tx.appointment.findUnique({ where: { id } });
    return a ? toAppointment(a) : null;
  }

  async create(args: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>) {
    try {
      const a = await this.tx.appointment.create({ data: args });
      return toAppointment(a);
    } catch (err) {
      translateError(err);
    }
  }

  async update(id: string, patch: Partial<Omit<Appointment, 'id' | 'tenantId' | 'createdAt'>>) {
    try {
      const a = await this.tx.appointment.update({ where: { id }, data: patch });
      return toAppointment(a);
    } catch (err) {
      translateError(err);
    }
  }

  async listInRange({
    clinicId,
    from,
    to,
    professionalId,
    roomId,
  }: {
    clinicId: string;
    from: Date;
    to: Date;
    professionalId?: string;
    roomId?: string;
  }) {
    const where: Prisma.AppointmentWhereInput = {
      clinicId,
      AND: [{ startsAt: { lt: to } }, { endsAt: { gt: from } }],
    };
    if (professionalId) where.professionalId = professionalId;
    if (roomId) where.roomId = roomId;
    const items = await this.tx.appointment.findMany({
      where,
      orderBy: { startsAt: 'asc' },
    });
    return items.map(toAppointment);
  }

  async listPendingReminders({
    from,
    to,
    limit,
  }: {
    from: Date;
    to: Date;
    limit: number;
  }) {
    const items = await this.tx.appointment.findMany({
      where: {
        remindedAt: null,
        status: { in: ['SCHEDULED', 'CONFIRMED'] },
        startsAt: { gt: from, lte: to },
      },
      orderBy: { startsAt: 'asc' },
      take: limit,
    });
    return items.map(toAppointment);
  }

  async markReminded(id: string, at: Date) {
    await this.tx.appointment.update({ where: { id }, data: { remindedAt: at } });
  }
}

export class PrismaProfessionalRepository implements scheduling.ProfessionalRepository {
  constructor(private readonly tx: PrismaClient | Prisma.TransactionClient) {}
  async findById(id: string) {
    const p = await this.tx.professional.findUnique({ where: { id } });
    return p ? this.toEntity(p) : null;
  }
  async listForClinic() {
    const items = await this.tx.professional.findMany();
    return items.map((p) => this.toEntity(p));
  }
  private toEntity(p: {
    id: string;
    tenantId: string;
    userId: string;
    licenseNumber: string | null;
    specialty: string | null;
    color: string;
  }): Professional {
    return {
      id: p.id,
      tenantId: p.tenantId,
      userId: p.userId,
      licenseNumber: p.licenseNumber,
      specialty: p.specialty,
      color: p.color,
    };
  }
}

export class PrismaRoomRepository implements scheduling.RoomRepository {
  constructor(private readonly tx: PrismaClient | Prisma.TransactionClient) {}
  async findById(id: string) {
    const r = await this.tx.room.findUnique({ where: { id } });
    return r ? this.toEntity(r) : null;
  }
  async listForClinic(clinicId: string) {
    const items = await this.tx.room.findMany({ where: { clinicId } });
    return items.map((r) => this.toEntity(r));
  }
  async create(args: Omit<Room, 'id'>) {
    const r = await this.tx.room.create({ data: args });
    return this.toEntity(r);
  }
  private toEntity(r: { id: string; tenantId: string; clinicId: string; name: string }): Room {
    return { id: r.id, tenantId: r.tenantId, clinicId: r.clinicId, name: r.name };
  }
}

export class PrismaWorkingHoursRepository implements scheduling.WorkingHoursRepository {
  constructor(private readonly tx: PrismaClient | Prisma.TransactionClient) {}
  async listFor(professionalId: string, clinicId: string) {
    const items = await this.tx.workingHours.findMany({
      where: { professionalId, clinicId },
      orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }],
    });
    return items.map((h) => this.toEntity(h));
  }
  async set(items: Omit<WorkingHours, 'id'>[]) {
    if (items.length === 0) return;
    // Reemplaza atomicamente para (professionalId, clinicId) que aparezca.
    const distinct = new Set(items.map((i) => `${i.professionalId}|${i.clinicId}`));
    for (const key of distinct) {
      const [professionalId, clinicId] = key.split('|') as [string, string];
      await this.tx.workingHours.deleteMany({ where: { professionalId, clinicId } });
    }
    await this.tx.workingHours.createMany({ data: items });
  }
  private toEntity(h: {
    id: string;
    tenantId: string;
    professionalId: string;
    clinicId: string;
    dayOfWeek: number;
    startMinute: number;
    endMinute: number;
  }): WorkingHours {
    return {
      id: h.id,
      tenantId: h.tenantId,
      professionalId: h.professionalId,
      clinicId: h.clinicId,
      dayOfWeek: h.dayOfWeek,
      startMinute: h.startMinute,
      endMinute: h.endMinute,
    };
  }
}

export class PrismaAvailabilityExceptionRepository
  implements scheduling.AvailabilityExceptionRepository
{
  constructor(private readonly tx: PrismaClient | Prisma.TransactionClient) {}
  async listInRange(professionalId: string, from: Date, to: Date) {
    const items = await this.tx.availabilityException.findMany({
      where: {
        professionalId,
        AND: [{ startsAt: { lt: to } }, { endsAt: { gt: from } }],
      },
    });
    return items.map((e) => this.toEntity(e));
  }
  async create(args: Omit<AvailabilityException, 'id'>) {
    const e = await this.tx.availabilityException.create({ data: args });
    return this.toEntity(e);
  }
  private toEntity(e: {
    id: string;
    tenantId: string;
    professionalId: string;
    clinicId: string | null;
    startsAt: Date;
    endsAt: Date;
    reason: string | null;
  }): AvailabilityException {
    return {
      id: e.id,
      tenantId: e.tenantId,
      professionalId: e.professionalId,
      clinicId: e.clinicId,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      reason: e.reason,
    };
  }
}
