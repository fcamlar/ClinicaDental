/**
 * Castellar — contexto compartido de tRPC.
 *
 * Los routers declarados aquí solo conocen el TIPO del contexto. La API real
 * (apps/api) implementa la construcción real con Prisma + Supabase + Resend.
 */

import type {
  identity,
  patients,
  catalog,
  scheduling,
  clinical,
  billing,
  analytics,
  portal,
  Clock,
  TokenGenerator,
} from '@castellar/core';

export interface TrpcContext {
  tenantId: string | null;
  user: AuthenticatedUser | null;
  ip: string;
  userAgent: string;
  services: TrpcServices;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: identity.Role;
  /** Clínicas a las que pertenece el usuario dentro del tenant activo. */
  clinicIds: string[];
}

/**
 * Acceso a casos de uso desde un procedure.
 *
 * `inTenant(fn)` ejecuta `fn` con repositorios envueltos en
 * `withTenant(ctx.tenantId)` — RLS activa para el tenant actual.
 *
 * `asPublic(fn)` ejecuta `fn` con repositorios sin tenant — usado solo en
 * createTenant y acceptInvitation.
 */
export interface TrpcServices {
  inTenant<T>(fn: (deps: TenantDeps) => Promise<T>): Promise<T>;
  asPublic<T>(fn: (deps: PublicDeps) => Promise<T>): Promise<T>;
  clock: Clock;
  tokens: TokenGenerator;
  acceptUrlFor: (token: string) => string;
  appUrl: string;
  /** Emisor de presigned URLs y encolado de scans (no atado a tenant). */
  presignedUploads: PresignedUploadService;
}

/** Dependencias disponibles dentro del tenant activo. */
export interface TenantDeps {
  // Identity
  tenantRepo: identity.TenantRepository;
  userRepo: identity.UserRepository;
  clinicRepo: identity.ClinicRepository;
  memberRepo: identity.ClinicMemberRepository;
  invitationRepo: identity.InvitationRepository;
  securityRepo: identity.UserSecurityRepository;
  audit: identity.AuditLogRepository;
  supabase: identity.SupabaseAdminClient;
  mailer: identity.InvitationMailer;
  // Patients
  patientRepo: patients.PatientRepository;
  consentRepo: patients.ConsentRepository;
  alertRepo: patients.MedicalAlertRepository;
  fileRepo: patients.FileRepository;
  // Catalog
  treatmentRepo: catalog.TreatmentRepository;
  // Scheduling
  appointmentRepo: scheduling.AppointmentRepository;
  professionalRepo: scheduling.ProfessionalRepository;
  roomRepo: scheduling.RoomRepository;
  workingHoursRepo: scheduling.WorkingHoursRepository;
  availabilityRepo: scheduling.AvailabilityExceptionRepository;
  // Clinical
  clinicalRecordRepo: clinical.ClinicalRecordRepository;
  visitRepo: clinical.VisitRepository;
  noteRepo: clinical.ClinicalNoteRepository;
  odontogramRepo: clinical.OdontogramRepository;
  // Billing
  budgetRepo: billing.BudgetRepository;
  invoiceRepo: billing.InvoiceRepository;
  invoiceSeriesRepo: billing.InvoiceSeriesRepository;
  paymentRepo: billing.PaymentRepository;
  // Analytics
  analyticsRepo: analytics.AnalyticsRepository;
  // Patient export RGPD
  patientExportAggregator: patients.PatientExportAggregator;
  // Portal del paciente
  portalTokenRepo: portal.PortalTokenRepository;
  /** Mailer del portal — implementado en apps/api. */
  portalMailer: portal.PortalMailer;
  /** Resolver de timezone de una clínica concreta. */
  resolveTimezone: (clinicId: string) => Promise<string>;
}

/** Dependencias para endpoints públicos (sin tenant activo). */
export type PublicDeps = TenantDeps;

/**
 * Servicio para emitir URLs presigned y encolar scan async.
 * Implementado por apps/api con R2/MinIO + BullMQ.
 */
export interface PresignedUploadService {
  createPresignedUpload(args: {
    tenantId: string;
    ownerType: patients.FileEntity['ownerType'];
    ownerId: string;
    mime: string;
    size: number;
    filename: string;
  }): Promise<{
    fileId: string;
    uploadUrl: string;
    s3Key: string;
    headers: Record<string, string>;
    expiresIn: number;
  }>;
  enqueueScan(fileId: string, s3Key: string, tenantId: string): Promise<void>;
}
