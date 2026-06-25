import { randomUUID } from 'node:crypto';
import type {
  Appointment,
  AppointmentStatus,
  AvailabilityException,
  Professional,
  Room,
  WorkingHours,
} from '../entities.js';
import { NON_BLOCKING_STATUSES } from '../entities.js';
import {
  OverlapConflict,
  type AppointmentRepository,
  type AvailabilityExceptionRepository,
  type ProfessionalRepository,
  type RoomRepository,
  type WorkingHoursRepository,
} from '../ports.js';

function overlaps(a: { startsAt: Date; endsAt: Date }, b: { startsAt: Date; endsAt: Date }) {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

export class FakeAppointmentRepo implements AppointmentRepository {
  appointments = new Map<string, Appointment>();

  findById(id: string) {
    return Promise.resolve(this.appointments.get(id) ?? null);
  }

  private detectOverlap(candidate: Appointment): OverlapConflict | null {
    for (const a of this.appointments.values()) {
      if (a.id === candidate.id) continue;
      if (NON_BLOCKING_STATUSES.has(a.status)) continue;
      if (a.professionalId === candidate.professionalId && overlaps(a, candidate)) {
        return new OverlapConflict('PROFESSIONAL');
      }
      if (
        a.roomId !== null &&
        candidate.roomId !== null &&
        a.roomId === candidate.roomId &&
        overlaps(a, candidate)
      ) {
        return new OverlapConflict('ROOM');
      }
    }
    return null;
  }

  create(args: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Appointment> {
    const a: Appointment = {
      ...args,
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    if (!NON_BLOCKING_STATUSES.has(a.status)) {
      const conflict = this.detectOverlap(a);
      if (conflict) return Promise.reject(conflict);
    }
    this.appointments.set(a.id, a);
    return Promise.resolve(a);
  }

  update(id: string, patch: Partial<Omit<Appointment, 'id' | 'tenantId' | 'createdAt'>>) {
    const existing = this.appointments.get(id);
    if (!existing) return Promise.reject(new Error('not found'));
    const next: Appointment = { ...existing, ...patch, updatedAt: new Date() };
    if (!NON_BLOCKING_STATUSES.has(next.status)) {
      const conflict = this.detectOverlap(next);
      if (conflict) return Promise.reject(conflict);
    }
    this.appointments.set(id, next);
    return Promise.resolve(next);
  }

  listInRange({
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
    const items = [...this.appointments.values()].filter(
      (a) =>
        a.clinicId === clinicId &&
        a.startsAt < to &&
        a.endsAt > from &&
        (professionalId ? a.professionalId === professionalId : true) &&
        (roomId ? a.roomId === roomId : true),
    );
    return Promise.resolve(items);
  }

  listPendingReminders({ from, to, limit }: { from: Date; to: Date; limit: number }) {
    const ACTIVE: AppointmentStatus[] = ['SCHEDULED', 'CONFIRMED'];
    const items = [...this.appointments.values()]
      .filter(
        (a) =>
          a.remindedAt === null &&
          ACTIVE.includes(a.status) &&
          a.startsAt > from &&
          a.startsAt <= to,
      )
      .slice(0, limit);
    return Promise.resolve(items);
  }

  markReminded(id: string, at: Date) {
    const a = this.appointments.get(id);
    if (!a) return Promise.reject(new Error('not found'));
    this.appointments.set(id, { ...a, remindedAt: at });
    return Promise.resolve();
  }
}

export class FakeProfessionalRepo implements ProfessionalRepository {
  professionals = new Map<string, Professional>();
  findById(id: string) {
    return Promise.resolve(this.professionals.get(id) ?? null);
  }
  listForClinic() {
    return Promise.resolve([...this.professionals.values()]);
  }
  add(p: Professional) {
    this.professionals.set(p.id, p);
  }
}

export class FakeRoomRepo implements RoomRepository {
  rooms = new Map<string, Room>();
  findById(id: string) {
    return Promise.resolve(this.rooms.get(id) ?? null);
  }
  listForClinic(clinicId: string) {
    return Promise.resolve([...this.rooms.values()].filter((r) => r.clinicId === clinicId));
  }
  create(args: Omit<Room, 'id'>) {
    const r: Room = { ...args, id: randomUUID() };
    this.rooms.set(r.id, r);
    return Promise.resolve(r);
  }
}

export class FakeWorkingHoursRepo implements WorkingHoursRepository {
  hours: WorkingHours[] = [];
  listFor(professionalId: string, clinicId: string) {
    return Promise.resolve(
      this.hours.filter((h) => h.professionalId === professionalId && h.clinicId === clinicId),
    );
  }
  set(items: Omit<WorkingHours, 'id'>[]) {
    this.hours.push(...items.map((it) => ({ ...it, id: randomUUID() })));
    return Promise.resolve();
  }
}

export class FakeAvailabilityExceptionRepo implements AvailabilityExceptionRepository {
  exceptions: AvailabilityException[] = [];
  listInRange(professionalId: string, from: Date, to: Date) {
    return Promise.resolve(
      this.exceptions.filter(
        (e) => e.professionalId === professionalId && e.endsAt > from && e.startsAt < to,
      ),
    );
  }
  create(args: Omit<AvailabilityException, 'id'>) {
    const e: AvailabilityException = { ...args, id: randomUUID() };
    this.exceptions.push(e);
    return Promise.resolve(e);
  }
}
