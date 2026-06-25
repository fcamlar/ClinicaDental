import type {
  ClinicalNote,
  ClinicalRecord,
  NoteType,
  Odontogram,
  Visit,
  VisitStatus,
} from './entities.js';

export interface ClinicalRecordRepository {
  findByPatientId(patientId: string): Promise<ClinicalRecord | null>;
  /** Idempotente: si ya existe, devuelve el existente. */
  ensureForPatient(args: { tenantId: string; patientId: string }): Promise<ClinicalRecord>;
}

export interface VisitRepository {
  findById(id: string): Promise<Visit | null>;
  findByAppointmentId(appointmentId: string): Promise<Visit | null>;
  listForRecord(recordId: string): Promise<Visit[]>;
  /** Visita abierta (OPEN) más reciente para un paciente, si la hay. */
  findOpenForPatient(patientId: string): Promise<Visit | null>;
  create(args: Omit<Visit, 'id' | 'createdAt' | 'updatedAt'>): Promise<Visit>;
  updateStatus(id: string, status: VisitStatus, closedAt: Date | null): Promise<Visit>;
}

export interface ClinicalNoteRepository {
  findById(id: string): Promise<ClinicalNote | null>;
  listForVisit(visitId: string): Promise<ClinicalNote[]>;
  listForRecord(recordId: string, limit: number): Promise<ClinicalNote[]>;
  create(args: Omit<ClinicalNote, 'id' | 'createdAt' | 'updatedAt' | 'lockedAt'>): Promise<ClinicalNote>;
  /** Solo permitido si la nota no está locked. */
  updateBody(id: string, body: string, type: NoteType): Promise<ClinicalNote>;
  /** Marca lockedAt. Idempotente. */
  lock(id: string, at: Date): Promise<void>;
}

export interface OdontogramRepository {
  findByVisitId(visitId: string): Promise<Odontogram | null>;
  upsert(args: { tenantId: string; visitId: string; stateJson: unknown }): Promise<Odontogram>;
}
