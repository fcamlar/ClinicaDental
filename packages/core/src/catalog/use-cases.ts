import { z } from 'zod';
import { Conflict, Forbidden, NotFound } from '../shared/errors.js';
import type * as identity from '../identity/index.js';
import type { TreatmentRepository } from './ports.js';
import type { TaxRegime } from './entities.js';

const TAX_REGIMES = [
  'EXEMPT_HEALTHCARE',
  'STANDARD_AESTHETIC',
  'STANDARD_PRODUCT',
  'REDUCED',
  'NOT_SUBJECT',
] as const;

export const createTreatmentInput = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Z0-9._-]+$/, 'Solo letras mayúsculas, números, ., _ o -'),
  name: z.string().trim().min(2).max(160),
  description: z.string().max(2000).optional(),
  defaultPrice: z.number().int().min(0).max(10_000_000), // en céntimos, máx 100k €
  taxRegime: z.enum(TAX_REGIMES).default('EXEMPT_HEALTHCARE'),
  category: z.string().max(80).optional(),
  active: z.boolean().default(true),
});
export type CreateTreatmentInput = z.infer<typeof createTreatmentInput>;

export const updateTreatmentInput = z.object({
  treatmentId: z.string().uuid(),
  name: z.string().trim().min(2).max(160).optional(),
  description: z.string().max(2000).nullable().optional(),
  defaultPrice: z.number().int().min(0).max(10_000_000).optional(),
  taxRegime: z.enum(TAX_REGIMES).optional(),
  category: z.string().max(80).nullable().optional(),
  active: z.boolean().optional(),
});
export type UpdateTreatmentInput = z.infer<typeof updateTreatmentInput>;

function ensureWritable(role: identity.Role) {
  if (role !== 'OWNER' && role !== 'ADMIN_CLINIC') {
    throw new Forbidden('Tu rol no permite editar el catálogo');
  }
}

export function makeCreateTreatmentUseCase(deps: {
  treatmentRepo: TreatmentRepository;
  audit: identity.AuditLogRepository;
}) {
  return async function createTreatment(args: {
    tenantId: string;
    actorId: string;
    actorRole: identity.Role;
    input: CreateTreatmentInput;
    ip: string | null;
  }) {
    ensureWritable(args.actorRole);
    const existing = await deps.treatmentRepo.findByCode(args.input.code);
    if (existing) throw new Conflict('Ya existe un tratamiento con ese código');

    const treatment = await deps.treatmentRepo.create({
      tenantId: args.tenantId,
      code: args.input.code,
      name: args.input.name,
      description: args.input.description ?? null,
      defaultPrice: args.input.defaultPrice,
      taxRegime: args.input.taxRegime as TaxRegime,
      category: args.input.category ?? null,
      active: args.input.active,
    });

    await deps.audit.write({
      tenantId: args.tenantId,
      actorId: args.actorId,
      action: 'treatment.create',
      resourceType: 'treatment',
      resourceId: treatment.id,
      ip: args.ip,
      userAgent: null,
      reason: null,
      diff: { code: treatment.code, name: treatment.name },
    });

    return treatment;
  };
}

export function makeUpdateTreatmentUseCase(deps: {
  treatmentRepo: TreatmentRepository;
  audit: identity.AuditLogRepository;
}) {
  return async function updateTreatment(args: {
    tenantId: string;
    actorId: string;
    actorRole: identity.Role;
    input: UpdateTreatmentInput;
    ip: string | null;
  }) {
    ensureWritable(args.actorRole);
    const { treatmentId, ...patchRaw } = args.input;
    const before = await deps.treatmentRepo.findById(treatmentId);
    if (!before) throw new NotFound('Tratamiento');

    const patch: Parameters<TreatmentRepository['update']>[1] = {};
    for (const [k, v] of Object.entries(patchRaw)) {
      if (v !== undefined) (patch as Record<string, unknown>)[k] = v;
    }
    const after = await deps.treatmentRepo.update(treatmentId, patch);

    await deps.audit.write({
      tenantId: args.tenantId,
      actorId: args.actorId,
      action: 'treatment.update',
      resourceType: 'treatment',
      resourceId: after.id,
      ip: args.ip,
      userAgent: null,
      reason: null,
      diff: patch,
    });

    return after;
  };
}

export function makeListTreatmentsUseCase(deps: { treatmentRepo: TreatmentRepository }) {
  return async function listTreatments(args: {
    activeOnly?: boolean;
    category?: string;
    query?: string;
  }) {
    return deps.treatmentRepo.list(args);
  };
}
