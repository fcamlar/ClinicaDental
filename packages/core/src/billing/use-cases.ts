import { z } from 'zod';
import {
  computeHash,
  computeTotals,
  type IssuedInvoice,
  type InvoiceLine as PureInvoiceLine,
  TAX_RATE_BY_REGIME,
} from '@castellar/billing';
import {
  BadRequest,
  Conflict,
  Forbidden,
  NotFound,
  PreconditionFailed,
} from '../shared/errors.js';
import type { Clock } from '../shared/clock.js';
import type { identity } from '../identity/index.js';
import type {
  Budget,
  BudgetLine,
  Invoice,
  InvoiceLine,
  PaymentMethod,
  TaxRegime,
} from './entities.js';
import type {
  BudgetRepository,
  InvoiceRepository,
  InvoiceSeriesRepository,
  PaymentRepository,
} from './ports.js';

const TAX_REGIMES = [
  'EXEMPT_HEALTHCARE',
  'STANDARD_AESTHETIC',
  'STANDARD_PRODUCT',
  'REDUCED',
  'NOT_SUBJECT',
] as const;
const PAYMENT_METHODS = ['CASH', 'CARD', 'TRANSFER', 'ONLINE', 'OTHER'] as const;

// ---------- RBAC ----------------------------------------------------------

const CAN_WRITE_BUDGET: identity.Role[] = [
  'OWNER',
  'ADMIN_CLINIC',
  'DENTIST',
  'HYGIENIST',
  'RECEPTION',
];
const CAN_ISSUE_INVOICE: identity.Role[] = ['OWNER', 'ADMIN_CLINIC', 'ACCOUNTING'];
const CAN_REGISTER_PAYMENT: identity.Role[] = [
  'OWNER',
  'ADMIN_CLINIC',
  'ACCOUNTING',
  'RECEPTION',
];

function ensureRole(allowed: identity.Role[], role: identity.Role, msg: string) {
  if (!allowed.includes(role)) throw new Forbidden(msg);
}

// ---------- Schemas ------------------------------------------------------

const lineInput = z.object({
  treatmentId: z.string().uuid().optional(),
  description: z.string().trim().min(1).max(255),
  toothRef: z.number().int().min(11).max(48).optional(),
  quantity: z.number().int().min(1).max(99),
  /** Precio unitario en CÉNTIMOS, sin IVA. */
  unitPrice: z.number().int().min(0).max(10_000_000),
  discount: z.number().min(0).max(0.999).default(0),
  taxRegime: z.enum(TAX_REGIMES),
});

export const createBudgetInput = z.object({
  clinicId: z.string().uuid(),
  patientId: z.string().uuid(),
  validUntil: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
  lines: z.array(lineInput).min(1).max(100),
});
export type CreateBudgetInput = z.infer<typeof createBudgetInput>;

export const updateBudgetLinesInput = z.object({
  budgetId: z.string().uuid(),
  lines: z.array(lineInput).min(1).max(100),
});

export const sendBudgetInput = z.object({ budgetId: z.string().uuid() });
export const acceptBudgetInput = z.object({ budgetId: z.string().uuid() });
export const rejectBudgetInput = z.object({
  budgetId: z.string().uuid(),
  reason: z.string().max(255).optional(),
});

export const convertBudgetInput = z.object({
  budgetId: z.string().uuid(),
  seriesCode: z.string().trim().min(1).max(40),
});
export type ConvertBudgetInput = z.infer<typeof convertBudgetInput>;

export const registerPaymentInput = z.object({
  invoiceId: z.string().uuid(),
  method: z.enum(PAYMENT_METHODS),
  /** Importe en céntimos. */
  amount: z.number().int().min(1).max(100_000_000),
  paidAt: z.coerce.date(),
  reference: z.string().max(120).optional(),
});
export type RegisterPaymentInput = z.infer<typeof registerPaymentInput>;

export const voidInvoiceInput = z.object({
  invoiceId: z.string().uuid(),
  reason: z.string().max(255).optional(),
});

// ---------- Helpers ------------------------------------------------------

interface LineCalc {
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
}

function computeLine(args: {
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRegime: TaxRegime;
}): LineCalc {
  const gross = args.unitPrice * args.quantity;
  const netAmount = Math.round(gross * (1 - args.discount));
  const taxAmount = Math.round(netAmount * TAX_RATE_BY_REGIME[args.taxRegime]);
  return { netAmount, taxAmount, totalAmount: netAmount + taxAmount };
}

function totalsOf(items: LineCalc[]): { subtotal: number; taxTotal: number; total: number } {
  let subtotal = 0;
  let taxTotal = 0;
  for (const l of items) {
    subtotal += l.netAmount;
    taxTotal += l.taxAmount;
  }
  return { subtotal, taxTotal, total: subtotal + taxTotal };
}

function generateBudgetCode(seq: number, now: Date): string {
  return `B-${now.getUTCFullYear()}-${String(seq).padStart(4, '0')}`;
}

// ---------- Casos de uso -------------------------------------------------

export function makeCreateBudgetUseCase(deps: {
  budgetRepo: BudgetRepository;
  audit: identity.AuditLogRepository;
  clock: Clock;
}) {
  return async function createBudget(args: {
    tenantId: string;
    actorId: string;
    actorRole: identity.Role;
    input: CreateBudgetInput;
    ip: string | null;
  }) {
    ensureRole(CAN_WRITE_BUDGET, args.actorRole, 'Tu rol no permite crear presupuestos');

    const lineCalcs = args.input.lines.map((l) => ({
      ...l,
      taxRegime: l.taxRegime as TaxRegime,
      ...computeLine({
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
        taxRegime: l.taxRegime as TaxRegime,
      }),
    }));
    const totals = totalsOf(lineCalcs);
    const code = await deps.budgetRepo.nextCode(args.tenantId);
    const now = deps.clock.now();

    const budget = await deps.budgetRepo.create({
      budget: {
        tenantId: args.tenantId,
        clinicId: args.input.clinicId,
        patientId: args.input.patientId,
        code,
        status: 'DRAFT',
        issuedAt: now,
        validUntil: args.input.validUntil ?? null,
        sentAt: null,
        acceptedAt: null,
        rejectedAt: null,
        convertedAt: null,
        invoiceId: null,
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        notes: args.input.notes ?? null,
        createdById: args.actorId,
      },
      lines: lineCalcs.map((l, position) => ({
        tenantId: args.tenantId,
        treatmentId: l.treatmentId ?? null,
        description: l.description,
        toothRef: l.toothRef ?? null,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
        taxRegime: l.taxRegime,
        netAmount: l.netAmount,
        taxAmount: l.taxAmount,
        totalAmount: l.totalAmount,
        position,
      })),
    });

    await deps.audit.write({
      tenantId: args.tenantId,
      actorId: args.actorId,
      action: 'budget.create',
      resourceType: 'budget',
      resourceId: budget.id,
      ip: args.ip,
      userAgent: null,
      reason: null,
      diff: { code, total: totals.total },
    });

    return budget;
  };
}

export function makeUpdateBudgetLinesUseCase(deps: {
  budgetRepo: BudgetRepository;
  audit: identity.AuditLogRepository;
}) {
  return async function updateBudgetLines(args: {
    tenantId: string;
    actorId: string;
    actorRole: identity.Role;
    input: z.infer<typeof updateBudgetLinesInput>;
    ip: string | null;
  }) {
    ensureRole(CAN_WRITE_BUDGET, args.actorRole, 'Tu rol no permite editar presupuestos');
    const existing = await deps.budgetRepo.findById(args.input.budgetId);
    if (!existing) throw new NotFound('Presupuesto');
    if (existing.status !== 'DRAFT') {
      throw new PreconditionFailed('Solo se pueden editar presupuestos en borrador');
    }
    const calcs = args.input.lines.map((l) => ({
      ...l,
      taxRegime: l.taxRegime as TaxRegime,
      ...computeLine({
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
        taxRegime: l.taxRegime as TaxRegime,
      }),
    }));
    const totals = totalsOf(calcs);
    const updated = await deps.budgetRepo.replaceLines({
      budgetId: existing.id,
      lines: calcs.map((l, position) => ({
        treatmentId: l.treatmentId ?? null,
        description: l.description,
        toothRef: l.toothRef ?? null,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
        taxRegime: l.taxRegime,
        netAmount: l.netAmount,
        taxAmount: l.taxAmount,
        totalAmount: l.totalAmount,
        position,
      })),
      totals,
    });
    await deps.audit.write({
      tenantId: args.tenantId,
      actorId: args.actorId,
      action: 'budget.update_lines',
      resourceType: 'budget',
      resourceId: existing.id,
      ip: args.ip,
      userAgent: null,
      reason: null,
      diff: { total: totals.total, lines: calcs.length },
    });
    return updated;
  };
}

function makeStatusChange(
  to: Budget['status'],
  allowedFrom: Budget['status'][],
  action: string,
) {
  return function build(deps: {
    budgetRepo: BudgetRepository;
    audit: identity.AuditLogRepository;
    clock: Clock;
  }) {
    return async function transition(args: {
      tenantId: string;
      actorId: string;
      actorRole: identity.Role;
      budgetId: string;
      ip: string | null;
    }) {
      ensureRole(CAN_WRITE_BUDGET, args.actorRole, 'Tu rol no permite cambiar presupuestos');
      const existing = await deps.budgetRepo.findById(args.budgetId);
      if (!existing) throw new NotFound('Presupuesto');
      if (!allowedFrom.includes(existing.status)) {
        throw new PreconditionFailed(`Transición ${existing.status} → ${to} no permitida`);
      }
      const now = deps.clock.now();
      const updated = await deps.budgetRepo.updateStatus({
        budgetId: existing.id,
        status: to,
        at: now,
      });
      await deps.audit.write({
        tenantId: args.tenantId,
        actorId: args.actorId,
        action,
        resourceType: 'budget',
        resourceId: existing.id,
        ip: args.ip,
        userAgent: null,
        reason: null,
        diff: { from: existing.status, to },
      });
      return updated;
    };
  };
}

export const makeSendBudgetUseCase = makeStatusChange('SENT', ['DRAFT'], 'budget.send');
export const makeAcceptBudgetUseCase = makeStatusChange(
  'ACCEPTED',
  ['SENT', 'DRAFT'],
  'budget.accept',
);
export const makeRejectBudgetUseCase = makeStatusChange(
  'REJECTED',
  ['SENT', 'DRAFT', 'ACCEPTED'],
  'budget.reject',
);

/**
 * Convierte un presupuesto aceptado en factura.
 *
 *   1. Reserva número atómico en `invoice_series` (SELECT … FOR UPDATE).
 *   2. Calcula totales (deben coincidir con los del presupuesto).
 *   3. Lee la última factura de la serie y obtiene `prevHash`.
 *   4. Calcula `internalHash` con `@castellar/billing.computeHash`.
 *   5. Crea factura + líneas + marca el presupuesto como CONVERTED.
 */
export function makeConvertBudgetUseCase(deps: {
  budgetRepo: BudgetRepository;
  seriesRepo: InvoiceSeriesRepository;
  invoiceRepo: InvoiceRepository;
  audit: identity.AuditLogRepository;
  clock: Clock;
}) {
  return async function convertBudget(args: {
    tenantId: string;
    actorId: string;
    actorRole: identity.Role;
    input: ConvertBudgetInput;
    ip: string | null;
  }) {
    ensureRole(CAN_ISSUE_INVOICE, args.actorRole, 'Tu rol no permite emitir facturas');
    const budget = await deps.budgetRepo.findById(args.input.budgetId);
    if (!budget) throw new NotFound('Presupuesto');
    if (budget.status === 'CONVERTED') {
      throw new Conflict('El presupuesto ya está convertido');
    }
    if (budget.status !== 'ACCEPTED') {
      throw new PreconditionFailed('Solo se convierten presupuestos aceptados');
    }
    if (budget.lines.length === 0) throw new BadRequest('El presupuesto no tiene líneas');

    const series = await deps.seriesRepo.findByCode(args.tenantId, args.input.seriesCode);
    if (!series) throw new NotFound(`Serie ${args.input.seriesCode}`);
    if (!series.active) throw new PreconditionFailed('Serie inactiva');

    const number = await deps.seriesRepo.reserveNextNumber(series.id);
    const previous = await deps.invoiceRepo.findLastInSeries(series.id);

    const now = deps.clock.now();
    const pureLines: PureInvoiceLine[] = budget.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discount: l.discount,
      taxRegime: l.taxRegime,
    }));
    const totals = computeTotals(pureLines);

    if (
      totals.subtotal !== budget.subtotal ||
      totals.taxTotal !== budget.taxTotal ||
      totals.total !== budget.total
    ) {
      throw new BadRequest('Inconsistencia de totales entre presupuesto y factura');
    }

    const draftForHash: Omit<IssuedInvoice, 'internalHash' | 'status'> = {
      identity: {
        tenantId: args.tenantId,
        series: series.code,
        number,
        issuedAt: now,
      },
      lines: pureLines,
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
      prevHash: previous?.internalHash ?? null,
    };
    const internalHash = computeHash(draftForHash);

    const invoice = await deps.invoiceRepo.create({
      invoice: {
        tenantId: args.tenantId,
        clinicId: budget.clinicId,
        patientId: budget.patientId,
        seriesId: series.id,
        number,
        kind: 'STANDARD',
        rectifiesId: null,
        issuedAt: now,
        status: 'ISSUED',
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        paidTotal: 0,
        prevHash: previous?.internalHash ?? null,
        internalHash,
        customerNotes: budget.notes,
        createdById: args.actorId,
      },
      lines: budget.lines.map((l, position) => ({
        tenantId: args.tenantId,
        treatmentId: l.treatmentId,
        description: l.description,
        toothRef: l.toothRef,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
        taxRegime: l.taxRegime,
        netAmount: l.netAmount,
        taxAmount: l.taxAmount,
        totalAmount: l.totalAmount,
        position,
      })),
    });

    await deps.budgetRepo.updateStatus({
      budgetId: budget.id,
      status: 'CONVERTED',
      at: now,
      invoiceId: invoice.id,
    });

    await deps.audit.write({
      tenantId: args.tenantId,
      actorId: args.actorId,
      action: 'invoice.issue',
      resourceType: 'invoice',
      resourceId: invoice.id,
      ip: args.ip,
      userAgent: null,
      reason: null,
      diff: {
        series: series.code,
        number,
        total: totals.total,
        budgetId: budget.id,
      },
    });
    return invoice;
  };
}

export function makeRegisterPaymentUseCase(deps: {
  invoiceRepo: InvoiceRepository;
  paymentRepo: PaymentRepository;
  audit: identity.AuditLogRepository;
}) {
  return async function registerPayment(args: {
    tenantId: string;
    actorId: string;
    actorRole: identity.Role;
    input: RegisterPaymentInput;
    ip: string | null;
  }) {
    ensureRole(CAN_REGISTER_PAYMENT, args.actorRole, 'Tu rol no permite registrar cobros');
    const invoice = await deps.invoiceRepo.findById(args.input.invoiceId);
    if (!invoice) throw new NotFound('Factura');
    if (invoice.status === 'VOIDED') {
      throw new PreconditionFailed('La factura está anulada');
    }
    const currentPaid = invoice.paidTotal;
    if (currentPaid + args.input.amount > invoice.total) {
      throw new BadRequest('El cobro excede el importe pendiente');
    }
    const payment = await deps.paymentRepo.create({
      tenantId: args.tenantId,
      invoiceId: invoice.id,
      method: args.input.method as PaymentMethod,
      amount: args.input.amount,
      paidAt: args.input.paidAt,
      reference: args.input.reference ?? null,
      recordedById: args.actorId,
    });
    const newPaid = currentPaid + args.input.amount;
    await deps.invoiceRepo.updateMutable(invoice.id, {
      paidTotal: newPaid,
      status: newPaid >= invoice.total ? 'PAID' : 'PARTIALLY_PAID',
    });
    await deps.audit.write({
      tenantId: args.tenantId,
      actorId: args.actorId,
      action: 'payment.register',
      resourceType: 'invoice',
      resourceId: invoice.id,
      ip: args.ip,
      userAgent: null,
      reason: null,
      diff: { paymentId: payment.id, amount: args.input.amount, method: args.input.method },
    });
    return payment;
  };
}

/**
 * Anula una factura emitiendo una factura RECTIFICATIVA con los mismos
 * importes en negativo. La factura original queda VOIDED.
 *
 * Reglas:
 *   - Solo facturas STANDARD se pueden rectificar.
 *   - El número rectificativo viene de la misma serie del presupuesto.
 *   - Los pagos se marcan voided pero no se borran (auditoría).
 */
export function makeVoidInvoiceUseCase(deps: {
  invoiceRepo: InvoiceRepository;
  seriesRepo: InvoiceSeriesRepository;
  paymentRepo: PaymentRepository;
  audit: identity.AuditLogRepository;
  clock: Clock;
}) {
  return async function voidInvoice(args: {
    tenantId: string;
    actorId: string;
    actorRole: identity.Role;
    input: z.infer<typeof voidInvoiceInput>;
    ip: string | null;
  }) {
    ensureRole(CAN_ISSUE_INVOICE, args.actorRole, 'Tu rol no permite anular facturas');
    const original = await deps.invoiceRepo.findById(args.input.invoiceId);
    if (!original) throw new NotFound('Factura');
    if (original.kind === 'RECTIFICATIVE') {
      throw new PreconditionFailed('No se rectifica una rectificativa');
    }
    if (original.status === 'VOIDED') {
      throw new Conflict('La factura ya está anulada');
    }

    const seriesId = original.seriesId;
    const number = await deps.seriesRepo.reserveNextNumber(seriesId);
    const previous = await deps.invoiceRepo.findLastInSeries(seriesId);
    const now = deps.clock.now();

    const pureLines: PureInvoiceLine[] = original.lines.map((l) => ({
      description: `[ANULACIÓN] ${l.description}`,
      quantity: l.quantity,
      // Importes negativos.
      unitPrice: -l.unitPrice,
      discount: l.discount,
      taxRegime: l.taxRegime,
    }));
    const totals = computeTotals(pureLines);
    const internalHash = computeHash({
      identity: {
        tenantId: args.tenantId,
        series: original.seriesCode,
        number,
        issuedAt: now,
      },
      lines: pureLines,
      subtotal: totals.subtotal,
      taxTotal: totals.taxTotal,
      total: totals.total,
      prevHash: previous?.internalHash ?? null,
    });

    const rectificativa = await deps.invoiceRepo.create({
      invoice: {
        tenantId: args.tenantId,
        clinicId: original.clinicId,
        patientId: original.patientId,
        seriesId,
        number,
        kind: 'RECTIFICATIVE',
        rectifiesId: original.id,
        issuedAt: now,
        status: 'ISSUED',
        subtotal: totals.subtotal,
        taxTotal: totals.taxTotal,
        total: totals.total,
        paidTotal: 0,
        prevHash: previous?.internalHash ?? null,
        internalHash,
        customerNotes: args.input.reason ?? null,
        createdById: args.actorId,
      },
      lines: pureLines.map((l, position) => ({
        tenantId: args.tenantId,
        treatmentId: null,
        description: l.description,
        toothRef: null,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
        taxRegime: l.taxRegime,
        netAmount: -Math.abs(original.lines[position]?.netAmount ?? 0),
        taxAmount: -Math.abs(original.lines[position]?.taxAmount ?? 0),
        totalAmount: -Math.abs(original.lines[position]?.totalAmount ?? 0),
        position,
      })),
    });

    await deps.paymentRepo.voidByInvoice(original.id, now);
    await deps.invoiceRepo.updateMutable(original.id, { status: 'VOIDED' });

    await deps.audit.write({
      tenantId: args.tenantId,
      actorId: args.actorId,
      action: 'invoice.void',
      resourceType: 'invoice',
      resourceId: original.id,
      ip: args.ip,
      userAgent: null,
      reason: args.input.reason ?? null,
      diff: { rectificativeId: rectificativa.id, number },
    });

    return rectificativa;
  };
}

export type { BudgetLine, InvoiceLine };
