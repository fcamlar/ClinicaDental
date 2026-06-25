/**
 * Bounded context `scheduling` — entidades de dominio.
 */

export type AppointmentStatus =
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'IN_ROOM'
  | 'COMPLETED'
  | 'NO_SHOW'
  | 'CANCELLED';

export interface Professional {
  id: string;
  tenantId: string;
  userId: string;
  licenseNumber: string | null;
  specialty: string | null;
  color: string;
}

export interface Room {
  id: string;
  tenantId: string;
  clinicId: string;
  name: string;
}

export interface Appointment {
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
}

export interface WorkingHours {
  id: string;
  tenantId: string;
  professionalId: string;
  clinicId: string;
  /** 0..6 — 0 = domingo, 1 = lunes, …, 6 = sábado. */
  dayOfWeek: number;
  /** Minutos desde 00:00 en wall-clock de la clínica. */
  startMinute: number;
  endMinute: number;
}

export interface AvailabilityException {
  id: string;
  tenantId: string;
  professionalId: string;
  clinicId: string | null;
  startsAt: Date;
  endsAt: Date;
  reason: string | null;
}

/**
 * Reglas de transición de estado.
 * El primer elemento de cada tupla es el estado actual; el segundo, los
 * estados a los que puede transitar.
 *
 * `CANCELLED` y `NO_SHOW` son terminales.
 */
export const STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  SCHEDULED: ['CONFIRMED', 'CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['IN_ROOM', 'CANCELLED', 'NO_SHOW'],
  IN_ROOM: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  NO_SHOW: [],
  CANCELLED: [],
};

export function isStatusTransitionAllowed(
  from: AppointmentStatus,
  to: AppointmentStatus,
): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

/**
 * Estados que NO bloquean el solape (cancelladas y no-show liberan hueco).
 * Debe coincidir con la cláusula WHERE de las constraints GIST en la BD.
 */
export const NON_BLOCKING_STATUSES = new Set<AppointmentStatus>(['CANCELLED', 'NO_SHOW']);
