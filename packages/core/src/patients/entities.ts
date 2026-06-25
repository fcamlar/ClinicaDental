/**
 * Bounded context `patients` — entidades de dominio.
 */

export type PatientSex = 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED';

export interface Patient {
  id: string;
  tenantId: string;
  clinicId: string;
  code: string;
  firstName: string;
  lastName: string;
  nationalId: string | null;
  nationalIdHash: string | null;
  birthDate: Date | null;
  sex: PatientSex | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
  adminNotes: string | null;
  gdprConsentAt: Date | null;
  marketingConsent: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ConsentType =
  | 'GDPR'
  | 'TREATMENT'
  | 'SURGERY'
  | 'ORTHODONTICS'
  | 'IMPLANT'
  | 'ENDODONTICS'
  | 'MARKETING'
  | 'IMAGE_RIGHTS';

export interface Consent {
  id: string;
  tenantId: string;
  patientId: string;
  type: ConsentType;
  /** Texto íntegro firmado. Inmutable. */
  text: string;
  textHash: string;
  signedAt: Date;
  ip: string | null;
  recordedById: string | null;
  documentFileId: string | null;
  revokedAt: Date | null;
}

export type AlertSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type AlertCategory =
  | 'ALLERGY'
  | 'MEDICATION'
  | 'CONDITION'
  | 'PROCEDURE_RISK'
  | 'OTHER';

export interface MedicalAlert {
  id: string;
  tenantId: string;
  patientId: string;
  severity: AlertSeverity;
  category: AlertCategory;
  label: string;
  details: string | null;
  createdById: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

export type FileOwnerType = 'PATIENT' | 'CONSENT' | 'BUDGET' | 'INVOICE';
export type ScanStatus = 'PENDING' | 'CLEAN' | 'INFECTED' | 'ERROR';

export interface FileEntity {
  id: string;
  tenantId: string;
  ownerType: FileOwnerType;
  ownerId: string;
  s3Key: string;
  mime: string;
  size: number;
  filename: string;
  uploadedById: string | null;
  scanStatus: ScanStatus;
  scanResult: string | null;
  uploadedAt: Date;
  deletedAt: Date | null;
}
