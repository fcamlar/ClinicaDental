import type { Consent, FileEntity, MedicalAlert, Patient } from './entities.js';

/**
 * Puertos del bounded context patients.
 */

export interface PatientRepository {
  findById(id: string): Promise<Patient | null>;
  findByCode(code: string): Promise<Patient | null>;
  findByNationalIdHash(hash: string): Promise<Patient | null>;
  /**
   * Búsqueda libre: hace match contra nombre+apellido (pg_trgm) y código.
   * Excluye soft-deleted por defecto.
   */
  search(args: { query: string; limit: number }): Promise<Patient[]>;
  list(args: {
    limit: number;
    cursor?: string;
    includeDeleted?: boolean;
  }): Promise<{ items: Patient[]; nextCursor: string | null }>;
  create(args: Omit<Patient, 'id' | 'createdAt' | 'updatedAt'>): Promise<Patient>;
  update(
    id: string,
    patch: Partial<Omit<Patient, 'id' | 'tenantId' | 'createdAt'>>,
  ): Promise<Patient>;
  softDelete(id: string, at: Date): Promise<void>;
}

export interface ConsentRepository {
  listForPatient(patientId: string): Promise<Consent[]>;
  findById(id: string): Promise<Consent | null>;
  create(args: Omit<Consent, 'id' | 'revokedAt'>): Promise<Consent>;
  revoke(id: string, at: Date): Promise<void>;
}

export interface MedicalAlertRepository {
  listForPatient(patientId: string): Promise<MedicalAlert[]>;
  create(args: Omit<MedicalAlert, 'id' | 'createdAt' | 'resolvedAt'>): Promise<MedicalAlert>;
  resolve(id: string, at: Date): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface FileRepository {
  listForOwner(ownerType: FileEntity['ownerType'], ownerId: string): Promise<FileEntity[]>;
  findById(id: string): Promise<FileEntity | null>;
  /** Crea un registro `PENDING` antes de la subida real. */
  createPending(args: Omit<FileEntity, 'id' | 'uploadedAt' | 'scanResult' | 'deletedAt' | 'scanStatus'>): Promise<FileEntity>;
  updateScanStatus(id: string, status: FileEntity['scanStatus'], result: string | null): Promise<void>;
  softDelete(id: string, at: Date): Promise<void>;
}
