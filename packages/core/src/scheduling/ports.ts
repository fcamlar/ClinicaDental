import type {
  Appointment,
  AppointmentStatus,
  AvailabilityException,
  Professional,
  Room,
  WorkingHours,
} from './entities.js';

/**
 * Error específico para el solape detectado por la BD (GIST 23P01).
 * El repositorio captura el SQLSTATE y lo convierte en este tipo.
 */
export class OverlapConflict extends Error {
  constructor(readonly kind: 'PROFESSIONAL' | 'ROOM') {
    super(`overlap:${kind}`);
    this.name = 'OverlapConflict';
  }
}

export interface AppointmentRepository {
  findById(id: string): Promise<Appointment | null>;
  /** Crea una cita. Lanza `OverlapConflict` si choca con otra activa. */
  create(args: Omit<Appointment, 'id' | 'createdAt' | 'updatedAt'>): Promise<Appointment>;
  /** Actualiza una cita. Lanza `OverlapConflict` si la nueva ventana choca. */
  update(
    id: string,
    patch: Partial<Omit<Appointment, 'id' | 'tenantId' | 'createdAt'>>,
  ): Promise<Appointment>;
  /** Listado en rango — para vista diaria/semanal. */
  listInRange(args: {
    clinicId: string;
    from: Date;
    to: Date;
    professionalId?: string;
    roomId?: string;
  }): Promise<Appointment[]>;
  /**
   * Devuelve citas que necesitan recordatorio: status SCHEDULED/CONFIRMED,
   * starts_at en (now+23h, now+25h], remindedAt = NULL.
   */
  listPendingReminders(args: { from: Date; to: Date; limit: number }): Promise<Appointment[]>;
  markReminded(id: string, at: Date): Promise<void>;
}

export interface ProfessionalRepository {
  findById(id: string): Promise<Professional | null>;
  listForClinic(clinicId: string): Promise<Professional[]>;
}

export interface RoomRepository {
  findById(id: string): Promise<Room | null>;
  listForClinic(clinicId: string): Promise<Room[]>;
  create(args: Omit<Room, 'id'>): Promise<Room>;
}

export interface WorkingHoursRepository {
  listFor(professionalId: string, clinicId: string): Promise<WorkingHours[]>;
  set(args: Omit<WorkingHours, 'id'>[]): Promise<void>;
}

export interface AvailabilityExceptionRepository {
  listInRange(professionalId: string, from: Date, to: Date): Promise<AvailabilityException[]>;
  create(args: Omit<AvailabilityException, 'id'>): Promise<AvailabilityException>;
}

/**
 * Servicio para enviar email de recordatorio. Lo implementa `apps/api` con Resend.
 */
export interface AppointmentReminderMailer {
  sendReminder(args: {
    to: string;
    patientName: string;
    professionalName: string;
    clinicName: string;
    startsAt: Date;
    timezone: string;
  }): Promise<void>;
}

export type { AppointmentStatus };
