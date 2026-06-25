import type { Prisma, PrismaClient } from '@prisma/client';
import { PrismaTenantRepository } from './tenant.repository.js';
import { PrismaUserRepository } from './user.repository.js';
import {
  PrismaClinicRepository,
  PrismaClinicMemberRepository,
} from './clinic.repository.js';
import { PrismaInvitationRepository } from './invitation.repository.js';
import { PrismaUserSecurityRepository } from './user-security.repository.js';
import { PrismaAuditLogRepository } from './audit-log.repository.js';
import { PrismaPatientRepository } from './patient.repository.js';
import {
  PrismaConsentRepository,
  PrismaMedicalAlertRepository,
  PrismaFileRepository,
} from './patient-related.repository.js';
import { PrismaTreatmentRepository } from './treatment.repository.js';
import {
  PrismaAppointmentRepository,
  PrismaAvailabilityExceptionRepository,
  PrismaProfessionalRepository,
  PrismaRoomRepository,
  PrismaWorkingHoursRepository,
} from './scheduling.repository.js';
import {
  PrismaClinicalRecordRepository,
  PrismaVisitRepository,
  PrismaClinicalNoteRepository,
  PrismaOdontogramRepository,
} from './clinical.repository.js';
import {
  PrismaBudgetRepository,
  PrismaInvoiceRepository,
  PrismaInvoiceSeriesRepository,
  PrismaPaymentRepository,
} from './billing.repository.js';
import { PrismaAnalyticsRepository } from './analytics.repository.js';
import { PrismaPatientExportAggregator } from './patient-export.aggregator.js';
import { PrismaPortalTokenRepository } from './portal.repository.js';

/**
 * Ensambla todos los repositorios para un cliente Prisma dado.
 *
 * `migrateClient` se pasa solo a los repositorios que necesitan operar
 * fuera de RLS (provisión de tenant, lookup por token de invitación).
 */
export function makeRepositories(
  tx: PrismaClient | Prisma.TransactionClient,
  migrateClient: PrismaClient,
) {
  return {
    // identity
    tenantRepo: new PrismaTenantRepository(tx, migrateClient),
    userRepo: new PrismaUserRepository(tx),
    clinicRepo: new PrismaClinicRepository(tx),
    memberRepo: new PrismaClinicMemberRepository(tx),
    invitationRepo: new PrismaInvitationRepository(tx, migrateClient),
    securityRepo: new PrismaUserSecurityRepository(tx),
    audit: new PrismaAuditLogRepository(tx),
    // patients
    patientRepo: new PrismaPatientRepository(tx),
    consentRepo: new PrismaConsentRepository(tx),
    alertRepo: new PrismaMedicalAlertRepository(tx),
    fileRepo: new PrismaFileRepository(tx),
    // catalog
    treatmentRepo: new PrismaTreatmentRepository(tx),
    // scheduling
    appointmentRepo: new PrismaAppointmentRepository(tx),
    professionalRepo: new PrismaProfessionalRepository(tx),
    roomRepo: new PrismaRoomRepository(tx),
    workingHoursRepo: new PrismaWorkingHoursRepository(tx),
    availabilityRepo: new PrismaAvailabilityExceptionRepository(tx),
    // clinical
    clinicalRecordRepo: new PrismaClinicalRecordRepository(tx),
    visitRepo: new PrismaVisitRepository(tx),
    noteRepo: new PrismaClinicalNoteRepository(tx),
    odontogramRepo: new PrismaOdontogramRepository(tx),
    // billing
    budgetRepo: new PrismaBudgetRepository(tx),
    invoiceRepo: new PrismaInvoiceRepository(tx),
    invoiceSeriesRepo: new PrismaInvoiceSeriesRepository(tx),
    paymentRepo: new PrismaPaymentRepository(tx),
    // analytics
    analyticsRepo: new PrismaAnalyticsRepository(tx),
    // patient export RGPD
    patientExportAggregator: new PrismaPatientExportAggregator(tx),
    // portal del paciente
    portalTokenRepo: new PrismaPortalTokenRepository(tx, migrateClient),
  };
}

export type Repositories = ReturnType<typeof makeRepositories>;

/**
 * Alias retro-compatible para Sprint 1.
 * @deprecated Use makeRepositories.
 */
export const makeIdentityRepositories = makeRepositories;
export type IdentityRepositories = Repositories;

export { PrismaTenantRepository } from './tenant.repository.js';
export { PrismaUserRepository } from './user.repository.js';
export {
  PrismaClinicRepository,
  PrismaClinicMemberRepository,
} from './clinic.repository.js';
export { PrismaInvitationRepository } from './invitation.repository.js';
export { PrismaUserSecurityRepository } from './user-security.repository.js';
export { PrismaAuditLogRepository } from './audit-log.repository.js';
export { PrismaPatientRepository } from './patient.repository.js';
export {
  PrismaConsentRepository,
  PrismaMedicalAlertRepository,
  PrismaFileRepository,
} from './patient-related.repository.js';
export { PrismaTreatmentRepository } from './treatment.repository.js';
export {
  PrismaAppointmentRepository,
  PrismaAvailabilityExceptionRepository,
  PrismaProfessionalRepository,
  PrismaRoomRepository,
  PrismaWorkingHoursRepository,
} from './scheduling.repository.js';
export {
  PrismaClinicalRecordRepository,
  PrismaVisitRepository,
  PrismaClinicalNoteRepository,
  PrismaOdontogramRepository,
} from './clinical.repository.js';
export {
  PrismaBudgetRepository,
  PrismaInvoiceRepository,
  PrismaInvoiceSeriesRepository,
  PrismaPaymentRepository,
} from './billing.repository.js';
export { PrismaAnalyticsRepository } from './analytics.repository.js';
export { PrismaPatientExportAggregator } from './patient-export.aggregator.js';
export { PrismaPortalTokenRepository } from './portal.repository.js';
