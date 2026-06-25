import { z } from 'zod';
import { BadRequest, Forbidden, NotFound, PreconditionFailed } from '../shared/errors.js';
import type { Clock } from '../shared/clock.js';
import type * as identity from '../identity/index.js';
import type {
  ClinicalNoteRepository,
  ClinicalRecordRepository,
  OdontogramRepository,
  VisitRepository,
} from './ports.js';
import {
  NOTE_EDIT_WINDOW_MS,
  type ClinicalNote,
  type NoteType,
  type Visit,
} from './entities.js';

const NOTE_TYPES = [
  'EVOLUTION',
  'DIAGNOSIS',
  'TREATMENT_PLAN',
  'PRESCRIPTION',
  'REFERRAL',
  'OTHER',
] as const;

// ---------- Roles permitidos ----------------------------------------------

const CLINICAL_WRITE_ROLES: identity.Role[] = ['OWNER', 'DENTIST', 'HYGIENIST'];
const CLINICAL_READ_ROLES: identity.Role[] = [
  'OWNER',
  'ADMIN_CLINIC',
  'DENTIST',
  'HYGIENIST',
];

function ensureCanWriteClinical(role: identity.Role) {
  if (!CLINICAL_WRITE_ROLES.includes(role)) {
    throw new Forbidden('Tu rol no permite escribir en la historia clínica');
  }
}
function ensureCanReadClinical(role: identity.Role) {
  if (!CLINICAL_READ_ROLES.includes(role)) {
    throw new Forbidden('Tu rol no permite leer la historia clínica');
  }
}

// ---------- Zod schemas ----------------------------------------------------

export const startVisitInput = z.object({
  patientId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  motive: z.string().max(255).optional(),
  professionalId: z.string().uuid().optional(),
});
export type StartVisitInput = z.infer<typeof startVisitInput>;

export const closeVisitInput = z.object({
  visitId: z.string().uuid(),
});
export type CloseVisitInput = z.infer<typeof closeVisitInput>;

export const addNoteInput = z.object({
  visitId: z.string().uuid().optional(),
  patientId: z.string().uuid(),
  type: z.enum(NOTE_TYPES).default('EVOLUTION'),
  body: z.string().trim().min(1).max(20_000),
});
export type AddNoteInput = z.infer<typeof addNoteInput>;

export const editNoteInput = z.object({
  noteId: z.string().uuid(),
  body: z.string().trim().min(1).max(20_000),
  type: z.enum(NOTE_TYPES).optional(),
});
export type EditNoteInput = z.infer<typeof editNoteInput>;

export const addAddendumInput = z.object({
  parentNoteId: z.string().uuid(),
  body: z.string().trim().min(1).max(20_000),
});
export type AddAddendumInput = z.infer<typeof addAddendumInput>;

export const saveOdontogramInput = z.object({
  visitId: z.string().uuid(),
  state: z.unknown(),
});
export type SaveOdontogramInput = z.infer<typeof saveOdontogramInput>;

export const getVisitInput = z.object({
  visitId: z.string().uuid(),
  /** Motivo de acceso — Ley 41/2002. */
  reason: z.string().trim().min(3).max(255),
});
export type GetVisitInput = z.infer<typeof getVisitInput>;

export const listVisitsInput = z.object({
  patientId: z.string().uuid(),
  reason: z.string().trim().min(3).max(255),
  limit: z.number().int().min(1).max(50).default(20),
});

// ---------- Casos de uso ---------------------------------------------------

/**
 * Garantiza que existe ClinicalRecord para el paciente. Idempotente.
 * Lo invocan los demás casos de uso al primer acceso.
 */
export function makeEnsureRecordUseCase(deps: {
  recordRepo: ClinicalRecordRepository;
}) {
  return async function ensureRecord(args: { tenantId: string; patientId: string }) {
    return deps.recordRepo.ensureForPatient(args);
  };
}

/**
 * Inicia una visita. Si la cita asociada ya tiene una visita, la devuelve.
 * Si el paciente tiene una visita OPEN, devuelve esa (no se permiten dos
 * visitas abiertas simultáneas).
 */
export function makeStartVisitUseCase(deps: {
  recordRepo: ClinicalRecordRepository;
  visitRepo: VisitRepository;
  audit: identity.AuditLogRepository;
  clock: Clock;
}) {
  return async function startVisit(args: {
    tenantId: string;
    actorId: string;
    actorRole: identity.Role;
    input: StartVisitInput;
    ip: string | null;
  }) {
    ensureCanWriteClinical(args.actorRole);

    const record = await deps.recordRepo.ensureForPatient({
      tenantId: args.tenantId,
      patientId: args.input.patientId,
    });

    if (args.input.appointmentId) {
      const existing = await deps.visitRepo.findByAppointmentId(args.input.appointmentId);
      if (existing) return existing;
    }

    const open = await deps.visitRepo.findOpenForPatient(args.input.patientId);
    if (open) return open;

    const visit = await deps.visitRepo.create({
      tenantId: args.tenantId,
      recordId: record.id,
      patientId: args.input.patientId,
      professionalId: args.input.professionalId ?? null,
      appointmentId: args.input.appointmentId ?? null,
      startedAt: deps.clock.now(),
      closedAt: null,
      motive: args.input.motive ?? null,
      status: 'OPEN',
    });

    await deps.audit.write({
      tenantId: args.tenantId,
      actorId: args.actorId,
      action: 'visit.start',
      resourceType: 'visit',
      resourceId: visit.id,
      ip: args.ip,
      userAgent: null,
      reason: null,
      diff: { patientId: visit.patientId, motive: visit.motive },
    });
    return visit;
  };
}

/**
 * Cierra una visita. Tras esto, el odontograma asociado es inmutable
 * (regla en dominio + trigger en BD). Las notas siguen pudiendo recibir
 * adendas siempre que el plazo aplique.
 */
export function makeCloseVisitUseCase(deps: {
  visitRepo: VisitRepository;
  noteRepo: ClinicalNoteRepository;
  audit: identity.AuditLogRepository;
  clock: Clock;
}) {
  return async function closeVisit(args: {
    tenantId: string;
    actorId: string;
    actorRole: identity.Role;
    input: CloseVisitInput;
    ip: string | null;
  }) {
    ensureCanWriteClinical(args.actorRole);
    const visit = await deps.visitRepo.findById(args.input.visitId);
    if (!visit) throw new NotFound('Visita');
    if (visit.status === 'CLOSED') return visit;

    const closed = await deps.visitRepo.updateStatus(visit.id, 'CLOSED', deps.clock.now());

    // Bloqueo automático de notas en la visita: las que ya pasen la ventana
    // de 24h quedan locked. El resto se irán bloqueando con el cron horario.
    const cutoff = deps.clock.now().getTime() - NOTE_EDIT_WINDOW_MS;
    const notes = await deps.noteRepo.listForVisit(visit.id);
    for (const n of notes) {
      if (n.lockedAt === null && n.createdAt.getTime() <= cutoff) {
        await deps.noteRepo.lock(n.id, deps.clock.now());
      }
    }

    await deps.audit.write({
      tenantId: args.tenantId,
      actorId: args.actorId,
      action: 'visit.close',
      resourceType: 'visit',
      resourceId: visit.id,
      ip: args.ip,
      userAgent: null,
      reason: null,
      diff: { closedAt: closed.closedAt?.toISOString() ?? null },
    });
    return closed;
  };
}

export function makeAddNoteUseCase(deps: {
  recordRepo: ClinicalRecordRepository;
  visitRepo: VisitRepository;
  noteRepo: ClinicalNoteRepository;
  audit: identity.AuditLogRepository;
  clock: Clock;
}) {
  return async function addNote(args: {
    tenantId: string;
    actorId: string;
    actorRole: identity.Role;
    input: AddNoteInput;
    ip: string | null;
  }) {
    ensureCanWriteClinical(args.actorRole);
    const record = await deps.recordRepo.ensureForPatient({
      tenantId: args.tenantId,
      patientId: args.input.patientId,
    });

    let visitId: string | null = args.input.visitId ?? null;
    if (visitId) {
      const visit = await deps.visitRepo.findById(visitId);
      if (!visit) throw new NotFound('Visita');
      if (visit.status === 'CLOSED') {
        throw new PreconditionFailed(
          'La visita está cerrada — añade una nota libre o reabre la visita',
        );
      }
    }

    const note = await deps.noteRepo.create({
      tenantId: args.tenantId,
      recordId: record.id,
      visitId,
      authorId: args.actorId,
      type: args.input.type as NoteType,
      body: args.input.body,
      parentNoteId: null,
    });

    await deps.audit.write({
      tenantId: args.tenantId,
      actorId: args.actorId,
      action: 'note.create',
      resourceType: 'clinical_note',
      resourceId: note.id,
      ip: args.ip,
      userAgent: null,
      reason: null,
      diff: { type: note.type, length: note.body.length },
    });
    return note;
  };
}

/**
 * Edita una nota — permitido solo dentro de la ventana de 24h y siempre que
 * la nota no esté bloqueada. Tras la ventana, debe usarse `addAddendum`.
 */
export function makeEditNoteUseCase(deps: {
  noteRepo: ClinicalNoteRepository;
  audit: identity.AuditLogRepository;
  clock: Clock;
}) {
  return async function editNote(args: {
    tenantId: string;
    actorId: string;
    actorRole: identity.Role;
    input: EditNoteInput;
    ip: string | null;
  }) {
    ensureCanWriteClinical(args.actorRole);
    const existing = await deps.noteRepo.findById(args.input.noteId);
    if (!existing) throw new NotFound('Nota clínica');
    if (existing.lockedAt) {
      throw new PreconditionFailed('La nota está bloqueada — añade una adenda');
    }
    if (
      deps.clock.now().getTime() - existing.createdAt.getTime() >
      NOTE_EDIT_WINDOW_MS
    ) {
      // Bloqueamos de paso para que el siguiente intento sea claro.
      await deps.noteRepo.lock(existing.id, deps.clock.now());
      throw new PreconditionFailed(
        'Han pasado más de 24h desde la creación — añade una adenda',
      );
    }
    if (existing.authorId !== args.actorId && args.actorRole !== 'OWNER') {
      throw new Forbidden('Solo el autor (o un OWNER) puede editar la nota');
    }

    const updated = await deps.noteRepo.updateBody(
      existing.id,
      args.input.body,
      (args.input.type ?? existing.type) as NoteType,
    );

    await deps.audit.write({
      tenantId: args.tenantId,
      actorId: args.actorId,
      action: 'note.edit',
      resourceType: 'clinical_note',
      resourceId: updated.id,
      ip: args.ip,
      userAgent: null,
      reason: null,
      diff: { lengthFrom: existing.body.length, lengthTo: updated.body.length },
    });
    return updated;
  };
}

/**
 * Añade una adenda a una nota ya creada. Se persiste como nota hija con
 * `parentNoteId` apuntando a la original. Si la original aún no estaba
 * locked, la bloqueamos como parte de la operación.
 */
export function makeAddAddendumUseCase(deps: {
  noteRepo: ClinicalNoteRepository;
  audit: identity.AuditLogRepository;
  clock: Clock;
}) {
  return async function addAddendum(args: {
    tenantId: string;
    actorId: string;
    actorRole: identity.Role;
    input: AddAddendumInput;
    ip: string | null;
  }) {
    ensureCanWriteClinical(args.actorRole);
    const parent = await deps.noteRepo.findById(args.input.parentNoteId);
    if (!parent) throw new NotFound('Nota original');
    if (parent.parentNoteId) {
      throw new BadRequest('No se pueden encadenar adendas — adjunta sobre la nota original');
    }

    if (!parent.lockedAt) {
      await deps.noteRepo.lock(parent.id, deps.clock.now());
    }

    const addendum = await deps.noteRepo.create({
      tenantId: args.tenantId,
      recordId: parent.recordId,
      visitId: parent.visitId,
      authorId: args.actorId,
      type: parent.type,
      body: args.input.body,
      parentNoteId: parent.id,
    });

    await deps.audit.write({
      tenantId: args.tenantId,
      actorId: args.actorId,
      action: 'note.addendum',
      resourceType: 'clinical_note',
      resourceId: addendum.id,
      ip: args.ip,
      userAgent: null,
      reason: null,
      diff: { parent: parent.id, length: addendum.body.length },
    });
    return addendum;
  };
}

/**
 * Guarda el odontograma de una visita OPEN. Si la visita está CLOSED,
 * rechaza (el trigger de BD también lo haría).
 */
export function makeSaveOdontogramUseCase(deps: {
  visitRepo: VisitRepository;
  odontogramRepo: OdontogramRepository;
  audit: identity.AuditLogRepository;
}) {
  return async function saveOdontogram(args: {
    tenantId: string;
    actorId: string;
    actorRole: identity.Role;
    input: SaveOdontogramInput;
    ip: string | null;
  }) {
    ensureCanWriteClinical(args.actorRole);
    const visit = await deps.visitRepo.findById(args.input.visitId);
    if (!visit) throw new NotFound('Visita');
    if (visit.status === 'CLOSED') {
      throw new PreconditionFailed('La visita está cerrada — el odontograma es inmutable');
    }
    const saved = await deps.odontogramRepo.upsert({
      tenantId: args.tenantId,
      visitId: visit.id,
      stateJson: args.input.state,
    });
    await deps.audit.write({
      tenantId: args.tenantId,
      actorId: args.actorId,
      action: 'odontogram.save',
      resourceType: 'odontogram',
      resourceId: saved.id,
      ip: args.ip,
      userAgent: null,
      reason: null,
      diff: null,
    });
    return saved;
  };
}

/**
 * Carga una visita completa (notas + adendas + odontograma).
 * EXIGE `reason` por Ley 41/2002 y deja entrada de auditoría.
 */
export function makeGetVisitUseCase(deps: {
  visitRepo: VisitRepository;
  noteRepo: ClinicalNoteRepository;
  odontogramRepo: OdontogramRepository;
  audit: identity.AuditLogRepository;
}) {
  return async function getVisit(args: {
    tenantId: string;
    actorId: string;
    actorRole: identity.Role;
    input: GetVisitInput;
    ip: string | null;
    userAgent: string | null;
  }) {
    ensureCanReadClinical(args.actorRole);
    const visit = await deps.visitRepo.findById(args.input.visitId);
    if (!visit) throw new NotFound('Visita');

    const [notes, odontogram] = await Promise.all([
      deps.noteRepo.listForVisit(visit.id),
      deps.odontogramRepo.findByVisitId(visit.id),
    ]);

    await deps.audit.write({
      tenantId: args.tenantId,
      actorId: args.actorId,
      action: 'visit.read',
      resourceType: 'visit',
      resourceId: visit.id,
      ip: args.ip,
      userAgent: args.userAgent,
      reason: args.input.reason,
      diff: null,
    });

    return { visit, notes, odontogram };
  };
}

export function makeListVisitsUseCase(deps: {
  recordRepo: ClinicalRecordRepository;
  visitRepo: VisitRepository;
  audit: identity.AuditLogRepository;
}) {
  return async function listVisits(args: {
    tenantId: string;
    actorId: string;
    actorRole: identity.Role;
    input: z.infer<typeof listVisitsInput>;
    ip: string | null;
    userAgent: string | null;
  }) {
    ensureCanReadClinical(args.actorRole);
    const record = await deps.recordRepo.findByPatientId(args.input.patientId);
    if (!record) return [] satisfies Visit[];
    const visits = await deps.visitRepo.listForRecord(record.id);

    await deps.audit.write({
      tenantId: args.tenantId,
      actorId: args.actorId,
      action: 'visits.list',
      resourceType: 'clinical_record',
      resourceId: record.id,
      ip: args.ip,
      userAgent: args.userAgent,
      reason: args.input.reason,
      diff: { count: visits.length },
    });

    return visits.slice(0, args.input.limit);
  };
}

// Re-export para los routers.
export { CLINICAL_READ_ROLES, CLINICAL_WRITE_ROLES };
export type { ClinicalNote };
