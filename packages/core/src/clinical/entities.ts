/**
 * Bounded context `clinical` — entidades.
 */

export interface ClinicalRecord {
  id: string;
  tenantId: string;
  patientId: string;
  openedAt: Date;
}

export type VisitStatus = 'OPEN' | 'CLOSED';

export interface Visit {
  id: string;
  tenantId: string;
  recordId: string;
  patientId: string;
  professionalId: string | null;
  appointmentId: string | null;
  startedAt: Date;
  closedAt: Date | null;
  motive: string | null;
  status: VisitStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type NoteType =
  | 'EVOLUTION'
  | 'DIAGNOSIS'
  | 'TREATMENT_PLAN'
  | 'PRESCRIPTION'
  | 'REFERRAL'
  | 'OTHER';

export interface ClinicalNote {
  id: string;
  tenantId: string;
  recordId: string;
  visitId: string | null;
  authorId: string;
  type: NoteType;
  body: string;
  parentNoteId: string | null;
  lockedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Estado del odontograma — la forma exacta vive en `@castellar/ui`
 * (OdontogramState). Aquí lo tratamos como `unknown` para evitar el ciclo
 * de dependencias core ⇄ ui. La API valida con Zod permissive.
 */
export interface Odontogram {
  id: string;
  tenantId: string;
  visitId: string;
  stateJson: unknown;
  snapshotAt: Date;
  updatedAt: Date;
}

/**
 * Tiempo máximo desde la creación para editar libremente una nota.
 * Después, solo se aceptan adendas (notas hijas vía parentNoteId).
 */
export const NOTE_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
