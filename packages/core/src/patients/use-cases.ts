import { createHash } from 'node:crypto';
import { z } from 'zod';
import { BadRequest, Conflict, Forbidden, NotFound } from '../shared/errors.js';
import type { Clock } from '../shared/clock.js';
import {
  classifyNationalId,
  normalizeNationalId,
} from '../shared/national-id.js';
import type { identity } from '../identity/index.js';
import type {
  ConsentRepository,
  FileRepository,
  MedicalAlertRepository,
  PatientRepository,
} from './ports.js';
import type {
  AlertCategory,
  AlertSeverity,
  ConsentType,
  Patient,
  PatientSex,
} from './entities.js';

// ---------- Schemas Zod compartidos con la API ----------------------------

export const createPatientInput = z.object({
  code: z.string().trim().min(1).max(40).optional(), // si no, autoasignado
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(120),
  nationalId: z.string().trim().min(3).max(40).optional(),
  birthDate: z.coerce.date().optional(),
  sex: z.enum(['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED']).optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().max(40).optional(),
  addressLine1: z.string().max(160).optional(),
  addressLine2: z.string().max(160).optional(),
  postalCode: z.string().max(20).optional(),
  city: z.string().max(80).optional(),
  country: z
    .string()
    .length(2)
    .regex(/^[A-Z]{2}$/)
    .default('ES'),
  adminNotes: z.string().max(2000).optional(),
  /**
   * Cuando llega `true`, exigimos también `gdprConsentText` para registrar
   * el consentimiento en `consents`.
   */
  gdprConsent: z.boolean().default(false),
  gdprConsentText: z.string().max(8000).optional(),
  marketingConsent: z.boolean().default(false),
  clinicId: z.string().uuid(),
});
export type CreatePatientInput = z.infer<typeof createPatientInput>;

export const updatePatientInput = z.object({
  patientId: z.string().uuid(),
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(120).optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  addressLine1: z.string().max(160).nullable().optional(),
  addressLine2: z.string().max(160).nullable().optional(),
  postalCode: z.string().max(20).nullable().optional(),
  city: z.string().max(80).nullable().optional(),
  adminNotes: z.string().max(2000).nullable().optional(),
  marketingConsent: z.boolean().optional(),
});
export type UpdatePatientInput = z.infer<typeof updatePatientInput>;

export const getPatientInput = z.object({
  patientId: z.string().uuid(),
  /**
   * Motivo de acceso obligatorio para lectura de ficha de paciente.
   * Audit-required (Ley 41/2002 + DPIA Castellar).
   */
  reason: z.string().trim().min(3).max(255),
});
export type GetPatientInput = z.infer<typeof getPatientInput>;

export const searchPatientsInput = z.object({
  query: z.string().trim().min(1).max(120),
  limit: z.number().int().min(1).max(50).default(20),
});

export const signConsentInput = z.object({
  patientId: z.string().uuid(),
  type: z.enum([
    'GDPR',
    'TREATMENT',
    'SURGERY',
    'ORTHODONTICS',
    'IMPLANT',
    'ENDODONTICS',
    'MARKETING',
    'IMAGE_RIGHTS',
  ]),
  text: z.string().min(20).max(20_000),
});
export type SignConsentInput = z.infer<typeof signConsentInput>;

export const addMedicalAlertInput = z.object({
  patientId: z.string().uuid(),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  category: z.enum(['ALLERGY', 'MEDICATION', 'CONDITION', 'PROCEDURE_RISK', 'OTHER']),
  label: z.string().trim().min(2).max(120),
  details: z.string().max(2000).optional(),
});
export type AddMedicalAlertInput = z.infer<typeof addMedicalAlertInput>;

// ---------- Helpers --------------------------------------------------------

/**
 * SHA-256 sobre el ID normalizado. Permite búsqueda exacta sin exponer la
 * columna en el índice.
 */
export function hashNationalId(raw: string): string {
  return createHash('sha256').update(normalizeNationalId(raw), 'utf8').digest('hex');
}

function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Genera un código de paciente correlativo simple `P-YYYYMMDD-<random>`.
 * Es lo bastante humano-legible para uso administrativo y único en la práctica.
 * En Sprint 7 se podrá sustituir por correlativo por sede si lo piden.
 */
function generatePatientCode(clock: Clock): string {
  const d = clock.now();
  const stamp =
    String(d.getUTCFullYear()) +
    String(d.getUTCMonth() + 1).padStart(2, '0') +
    String(d.getUTCDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 1_000_000)
    .toString(36)
    .padStart(4, '0')
    .toUpperCase();
  return `P-${stamp}-${rand}`;
}

// ---------- Casos de uso ---------------------------------------------------

export function makeCreatePatientUseCase(deps: {
  patientRepo: PatientRepository;
  consentRepo: ConsentRepository;
  audit: identity.AuditLogRepository;
  clock: Clock;
}) {
  return async function createPatient(args: {
    tenantId: string;
    actorId: string;
    actorRole: identity.Role;
    input: CreatePatientInput;
    ip: string | null;
  }): Promise<Patient> {
    if (
      args.actorRole !== 'OWNER' &&
      args.actorRole !== 'ADMIN_CLINIC' &&
      args.actorRole !== 'RECEPTION' &&
      args.actorRole !== 'DENTIST' &&
      args.actorRole !== 'HYGIENIST'
    ) {
      throw new Forbidden('Tu rol no permite crear pacientes');
    }

    if (args.input.gdprConsent && !args.input.gdprConsentText) {
      throw new BadRequest('El consentimiento RGPD requiere el texto firmado');
    }

    let nationalIdHash: string | null = null;
    let nationalId: string | null = null;
    if (args.input.nationalId) {
      const cls = classifyNationalId(args.input.nationalId);
      if (cls === null) {
        throw new BadRequest('Identificador (DNI/NIE/NIF/passport) inválido');
      }
      nationalId = normalizeNationalId(args.input.nationalId);
      nationalIdHash = hashNationalId(args.input.nationalId);
      const existing = await deps.patientRepo.findByNationalIdHash(nationalIdHash);
      if (existing) {
        throw new Conflict('Ya existe un paciente con ese documento');
      }
    }

    const code = args.input.code ?? generatePatientCode(deps.clock);
    const now = deps.clock.now();

    const patient = await deps.patientRepo.create({
      tenantId: args.tenantId,
      clinicId: args.input.clinicId,
      code,
      firstName: args.input.firstName,
      lastName: args.input.lastName,
      nationalId,
      nationalIdHash,
      birthDate: args.input.birthDate ?? null,
      sex: (args.input.sex as PatientSex | undefined) ?? null,
      email: args.input.email ?? null,
      phone: args.input.phone ?? null,
      addressLine1: args.input.addressLine1 ?? null,
      addressLine2: args.input.addressLine2 ?? null,
      postalCode: args.input.postalCode ?? null,
      city: args.input.city ?? null,
      country: args.input.country,
      adminNotes: args.input.adminNotes ?? null,
      gdprConsentAt: args.input.gdprConsent ? now : null,
      marketingConsent: args.input.marketingConsent,
      deletedAt: null,
    });

    if (args.input.gdprConsent && args.input.gdprConsentText) {
      await deps.consentRepo.create({
        tenantId: args.tenantId,
        patientId: patient.id,
        type: 'GDPR',
        text: args.input.gdprConsentText,
        textHash: hashText(args.input.gdprConsentText),
        signedAt: now,
        ip: args.ip,
        recordedById: args.actorId,
        documentFileId: null,
      });
    }

    await deps.audit.write({
      tenantId: args.tenantId,
      actorId: args.actorId,
      action: 'patient.create',
      resourceType: 'patient',
      resourceId: patient.id,
      ip: args.ip,
      userAgent: null,
      reason: null,
      diff: { code: patient.code, country: patient.country },
    });

    return patient;
  };
}

/**
 * Lectura de ficha de paciente. EXIGE `reason` no vacío y escribe entrada
 * de auditoría con `action='patient.read'`. Inspeccionable desde el panel
 * de auditoría del owner.
 */
export function makeGetPatientUseCase(deps: {
  patientRepo: PatientRepository;
  alertRepo: MedicalAlertRepository;
  consentRepo: ConsentRepository;
  fileRepo: FileRepository;
  audit: identity.AuditLogRepository;
}) {
  return async function getPatient(args: {
    tenantId: string;
    actorId: string;
    actorRole: identity.Role;
    input: GetPatientInput;
    ip: string | null;
    userAgent: string | null;
  }) {
    const patient = await deps.patientRepo.findById(args.input.patientId);
    if (!patient || patient.deletedAt) throw new NotFound('Paciente');

    const [alerts, consents, files] = await Promise.all([
      deps.alertRepo.listForPatient(patient.id),
      deps.consentRepo.listForPatient(patient.id),
      deps.fileRepo.listForOwner('PATIENT', patient.id),
    ]);

    await deps.audit.write({
      tenantId: args.tenantId,
      actorId: args.actorId,
      action: 'patient.read',
      resourceType: 'patient',
      resourceId: patient.id,
      ip: args.ip,
      userAgent: args.userAgent,
      reason: args.input.reason,
      diff: null,
    });

    return { patient, alerts, consents, files };
  };
}

export function makeSearchPatientsUseCase(deps: { patientRepo: PatientRepository }) {
  return async function searchPatients(args: { query: string; limit?: number }) {
    return deps.patientRepo.search({ query: args.query, limit: args.limit ?? 20 });
  };
}

export function makeUpdatePatientUseCase(deps: {
  patientRepo: PatientRepository;
  audit: identity.AuditLogRepository;
}) {
  return async function updatePatient(args: {
    tenantId: string;
    actorId: string;
    actorRole: identity.Role;
    input: UpdatePatientInput;
    ip: string | null;
  }) {
    if (args.actorRole === 'ACCOUNTING') {
      throw new Forbidden('Tu rol no permite editar pacientes');
    }
    const before = await deps.patientRepo.findById(args.input.patientId);
    if (!before || before.deletedAt) throw new NotFound('Paciente');

    const { patientId, ...patch } = args.input;
    // Convertimos nulls explícitos manteniendo undefined fuera del patch.
    const clean: Parameters<PatientRepository['update']>[1] = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) (clean as Record<string, unknown>)[k] = v;
    }
    const after = await deps.patientRepo.update(patientId, clean);

    await deps.audit.write({
      tenantId: args.tenantId,
      actorId: args.actorId,
      action: 'patient.update',
      resourceType: 'patient',
      resourceId: after.id,
      ip: args.ip,
      userAgent: null,
      reason: null,
      diff: clean,
    });
    return after;
  };
}

export function makeSoftDeletePatientUseCase(deps: {
  patientRepo: PatientRepository;
  audit: identity.AuditLogRepository;
  clock: Clock;
}) {
  return async function softDeletePatient(args: {
    tenantId: string;
    actorId: string;
    actorRole: identity.Role;
    patientId: string;
    ip: string | null;
  }) {
    if (args.actorRole !== 'OWNER' && args.actorRole !== 'ADMIN_CLINIC') {
      throw new Forbidden('Tu rol no permite eliminar pacientes');
    }
    const p = await deps.patientRepo.findById(args.patientId);
    if (!p) throw new NotFound('Paciente');
    if (p.deletedAt) return; // idempotente
    await deps.patientRepo.softDelete(p.id, deps.clock.now());
    await deps.audit.write({
      tenantId: args.tenantId,
      actorId: args.actorId,
      action: 'patient.delete',
      resourceType: 'patient',
      resourceId: p.id,
      ip: args.ip,
      userAgent: null,
      reason: null,
      diff: { soft: true },
    });
  };
}

export function makeSignConsentUseCase(deps: {
  consentRepo: ConsentRepository;
  patientRepo: PatientRepository;
  audit: identity.AuditLogRepository;
  clock: Clock;
}) {
  return async function signConsent(args: {
    tenantId: string;
    actorId: string;
    input: SignConsentInput;
    ip: string | null;
  }) {
    const patient = await deps.patientRepo.findById(args.input.patientId);
    if (!patient || patient.deletedAt) throw new NotFound('Paciente');

    const consent = await deps.consentRepo.create({
      tenantId: args.tenantId,
      patientId: patient.id,
      type: args.input.type as ConsentType,
      text: args.input.text,
      textHash: hashText(args.input.text),
      signedAt: deps.clock.now(),
      ip: args.ip,
      recordedById: args.actorId,
      documentFileId: null,
    });

    if (args.input.type === 'GDPR' && !patient.gdprConsentAt) {
      await deps.patientRepo.update(patient.id, { gdprConsentAt: consent.signedAt });
    }

    await deps.audit.write({
      tenantId: args.tenantId,
      actorId: args.actorId,
      action: 'consent.sign',
      resourceType: 'consent',
      resourceId: consent.id,
      ip: args.ip,
      userAgent: null,
      reason: null,
      diff: { type: consent.type, textHash: consent.textHash },
    });
    return consent;
  };
}

export function makeAddMedicalAlertUseCase(deps: {
  alertRepo: MedicalAlertRepository;
  patientRepo: PatientRepository;
  audit: identity.AuditLogRepository;
}) {
  return async function addMedicalAlert(args: {
    tenantId: string;
    actorId: string;
    actorRole: identity.Role;
    input: AddMedicalAlertInput;
    ip: string | null;
  }) {
    if (args.actorRole === 'ACCOUNTING' || args.actorRole === 'RECEPTION') {
      throw new Forbidden('Tu rol no permite añadir alertas médicas');
    }
    const patient = await deps.patientRepo.findById(args.input.patientId);
    if (!patient || patient.deletedAt) throw new NotFound('Paciente');

    const alert = await deps.alertRepo.create({
      tenantId: args.tenantId,
      patientId: patient.id,
      severity: args.input.severity as AlertSeverity,
      category: args.input.category as AlertCategory,
      label: args.input.label,
      details: args.input.details ?? null,
      createdById: args.actorId,
    });

    await deps.audit.write({
      tenantId: args.tenantId,
      actorId: args.actorId,
      action: 'patient.alert.add',
      resourceType: 'patient',
      resourceId: patient.id,
      ip: args.ip,
      userAgent: null,
      reason: null,
      diff: { severity: alert.severity, category: alert.category, label: alert.label },
    });
    return alert;
  };
}
