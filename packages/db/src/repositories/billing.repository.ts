import type { Prisma, PrismaClient } from '@prisma/client';
import { billing } from '@castellar/core';

type Budget = billing.Budget;
type BudgetLine = billing.BudgetLine;
type BudgetStatus = billing.BudgetStatus;

export class PrismaBudgetRepository implements billing.BudgetRepository {
  constructor(private readonly tx: PrismaClient | Prisma.TransactionClient) {}

  async findById(id: string) {
    const b = await this.tx.budget.findUnique({
      where: { id },
      include: { lines: { orderBy: { position: 'asc' } } },
    });
    return b ? this.toEntity(b) : null;
  }

  async list(args: { patientId?: string; status?: BudgetStatus; limit: number }) {
    const where: Prisma.BudgetWhereInput = {};
    if (args.patientId) where.patientId = args.patientId;
    if (args.status) where.status = args.status;
    const items = await this.tx.budget.findMany({
      where,
      orderBy: { issuedAt: 'desc' },
      take: args.limit,
      include: { lines: { orderBy: { position: 'asc' } } },
    });
    return items.map((b) => this.toEntity(b));
  }

  async create(args: {
    budget: Omit<Budget, 'id' | 'createdAt' | 'updatedAt' | 'lines'>;
    lines: Array<Omit<BudgetLine, 'id' | 'budgetId'>>;
  }) {
    const created = await this.tx.budget.create({
      data: {
        ...args.budget,
        lines: { create: args.lines },
      },
      include: { lines: { orderBy: { position: 'asc' } } },
    });
    return this.toEntity(created);
  }

  async replaceLines(args: {
    budgetId: string;
    lines: Array<Omit<BudgetLine, 'id' | 'budgetId' | 'tenantId'>>;
    totals: { subtotal: number; taxTotal: number; total: number };
  }) {
    const existing = await this.tx.budget.findUniqueOrThrow({ where: { id: args.budgetId } });
    await this.tx.budgetLine.deleteMany({ where: { budgetId: args.budgetId } });
    await this.tx.budgetLine.createMany({
      data: args.lines.map((l) => ({ ...l, budgetId: args.budgetId, tenantId: existing.tenantId })),
    });
    const updated = await this.tx.budget.update({
      where: { id: args.budgetId },
      data: {
        subtotal: args.totals.subtotal,
        taxTotal: args.totals.taxTotal,
        total: args.totals.total,
      },
      include: { lines: { orderBy: { position: 'asc' } } },
    });
    return this.toEntity(updated);
  }

  async updateStatus(args: {
    budgetId: string;
    status: BudgetStatus;
    at: Date;
    invoiceId?: string | null;
  }) {
    const data: Prisma.BudgetUpdateInput = { status: args.status };
    if (args.status === 'SENT') data.sentAt = args.at;
    if (args.status === 'ACCEPTED') data.acceptedAt = args.at;
    if (args.status === 'REJECTED') data.rejectedAt = args.at;
    if (args.status === 'CONVERTED') {
      data.convertedAt = args.at;
      if (args.invoiceId) data.invoice = { connect: { id: args.invoiceId } };
    }
    const b = await this.tx.budget.update({
      where: { id: args.budgetId },
      data,
      include: { lines: { orderBy: { position: 'asc' } } },
    });
    return this.toEntity(b);
  }

  async nextCode(tenantId: string) {
    const count = await this.tx.budget.count({ where: { tenantId } });
    const year = new Date().getUTCFullYear();
    return `B-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  private toEntity(b: {
    id: string;
    tenantId: string;
    clinicId: string;
    patientId: string;
    code: string;
    status: BudgetStatus;
    issuedAt: Date;
    validUntil: Date | null;
    sentAt: Date | null;
    acceptedAt: Date | null;
    rejectedAt: Date | null;
    convertedAt: Date | null;
    invoiceId: string | null;
    subtotal: number;
    taxTotal: number;
    total: number;
    notes: string | null;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
    lines: Array<{
      id: string;
      tenantId: string;
      budgetId: string;
      treatmentId: string | null;
      description: string;
      toothRef: number | null;
      quantity: number;
      unitPrice: number;
      discount: number;
      taxRegime: billing.TaxRegime;
      netAmount: number;
      taxAmount: number;
      totalAmount: number;
      position: number;
    }>;
  }): Budget {
    return {
      id: b.id,
      tenantId: b.tenantId,
      clinicId: b.clinicId,
      patientId: b.patientId,
      code: b.code,
      status: b.status,
      issuedAt: b.issuedAt,
      validUntil: b.validUntil,
      sentAt: b.sentAt,
      acceptedAt: b.acceptedAt,
      rejectedAt: b.rejectedAt,
      convertedAt: b.convertedAt,
      invoiceId: b.invoiceId,
      subtotal: b.subtotal,
      taxTotal: b.taxTotal,
      total: b.total,
      notes: b.notes,
      createdById: b.createdById,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      lines: b.lines.map((l) => ({
        id: l.id,
        tenantId: l.tenantId,
        budgetId: l.budgetId,
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
        position: l.position,
      })),
    };
  }
}

export class PrismaInvoiceSeriesRepository implements billing.InvoiceSeriesRepository {
  constructor(private readonly tx: PrismaClient | Prisma.TransactionClient) {}

  async findByCode(tenantId: string, code: string) {
    const s = await this.tx.invoiceSeries.findFirst({ where: { tenantId, code } });
    return s ? this.toEntity(s) : null;
  }

  async ensureDefault(args: { tenantId: string; clinicId: string | null; code: string }) {
    const existing = await this.tx.invoiceSeries.findFirst({
      where: { tenantId: args.tenantId, code: args.code },
    });
    if (existing) return this.toEntity(existing);
    const created = await this.tx.invoiceSeries.create({
      data: {
        tenantId: args.tenantId,
        clinicId: args.clinicId,
        code: args.code,
      },
    });
    return this.toEntity(created);
  }

  /**
   * `SELECT … FOR UPDATE` por serie y UPDATE atómico. La cláusula
   * `RETURNING last_number` evita una segunda consulta.
   *
   * Como Prisma no expone FOR UPDATE directamente, usamos $queryRaw.
   */
  async reserveNextNumber(seriesId: string): Promise<number> {
    const rows = await this.tx.$queryRaw<Array<{ last_number: number }>>`
      UPDATE invoice_series
         SET last_number = last_number + 1
       WHERE id = ${seriesId}::uuid
   RETURNING last_number
    `;
    const row = rows[0];
    if (!row) throw new Error('invoice_series row not found');
    return row.last_number;
  }

  private toEntity(s: {
    id: string;
    tenantId: string;
    clinicId: string | null;
    code: string;
    lastNumber: number;
    active: boolean;
    createdAt: Date;
  }): billing.InvoiceSeries {
    return {
      id: s.id,
      tenantId: s.tenantId,
      clinicId: s.clinicId,
      code: s.code,
      lastNumber: s.lastNumber,
      active: s.active,
      createdAt: s.createdAt,
    };
  }
}

export class PrismaInvoiceRepository implements billing.InvoiceRepository {
  constructor(private readonly tx: PrismaClient | Prisma.TransactionClient) {}

  async findById(id: string) {
    const i = await this.tx.invoice.findUnique({
      where: { id },
      include: {
        lines: { orderBy: { position: 'asc' } },
        series: { select: { code: true } },
      },
    });
    return i ? this.toEntity(i) : null;
  }

  async list(args: {
    patientId?: string;
    seriesId?: string;
    fromDate?: Date;
    toDate?: Date;
    limit: number;
  }) {
    const where: Prisma.InvoiceWhereInput = {};
    if (args.patientId) where.patientId = args.patientId;
    if (args.seriesId) where.seriesId = args.seriesId;
    if (args.fromDate || args.toDate) {
      where.issuedAt = {};
      if (args.fromDate) (where.issuedAt as Prisma.DateTimeFilter).gte = args.fromDate;
      if (args.toDate) (where.issuedAt as Prisma.DateTimeFilter).lt = args.toDate;
    }
    const items = await this.tx.invoice.findMany({
      where,
      orderBy: { issuedAt: 'desc' },
      take: args.limit,
      include: {
        lines: { orderBy: { position: 'asc' } },
        series: { select: { code: true } },
      },
    });
    return items.map((i) => this.toEntity(i));
  }

  async findLastInSeries(seriesId: string) {
    const i = await this.tx.invoice.findFirst({
      where: { seriesId },
      orderBy: { number: 'desc' },
      include: {
        lines: { orderBy: { position: 'asc' } },
        series: { select: { code: true } },
      },
    });
    return i ? this.toEntity(i) : null;
  }

  async create(args: {
    invoice: Omit<billing.Invoice, 'id' | 'createdAt' | 'lines' | 'seriesCode'>;
    lines: Array<Omit<billing.InvoiceLine, 'id' | 'invoiceId'>>;
  }) {
    const created = await this.tx.invoice.create({
      data: {
        ...args.invoice,
        lines: { create: args.lines },
      },
      include: {
        lines: { orderBy: { position: 'asc' } },
        series: { select: { code: true } },
      },
    });
    return this.toEntity(created);
  }

  async updateMutable(
    id: string,
    patch: Partial<Pick<billing.Invoice, 'status' | 'paidTotal' | 'customerNotes'>> & {
      verifactuId?: string | null;
      verifactuStatus?: string | null;
      verifactuQrUrl?: string | null;
    },
  ) {
    const i = await this.tx.invoice.update({
      where: { id },
      data: patch,
      include: {
        lines: { orderBy: { position: 'asc' } },
        series: { select: { code: true } },
      },
    });
    return this.toEntity(i);
  }

  private toEntity(i: {
    id: string;
    tenantId: string;
    clinicId: string;
    patientId: string;
    seriesId: string;
    series: { code: string };
    number: number;
    kind: billing.InvoiceKind;
    rectifiesId: string | null;
    issuedAt: Date;
    status: billing.InvoiceStatus;
    subtotal: number;
    taxTotal: number;
    total: number;
    paidTotal: number;
    prevHash: string | null;
    internalHash: string;
    customerNotes: string | null;
    createdById: string;
    createdAt: Date;
    lines: Array<{
      id: string;
      tenantId: string;
      invoiceId: string;
      treatmentId: string | null;
      description: string;
      toothRef: number | null;
      quantity: number;
      unitPrice: number;
      discount: number;
      taxRegime: billing.TaxRegime;
      netAmount: number;
      taxAmount: number;
      totalAmount: number;
      position: number;
    }>;
  }): billing.Invoice {
    return {
      id: i.id,
      tenantId: i.tenantId,
      clinicId: i.clinicId,
      patientId: i.patientId,
      seriesId: i.seriesId,
      seriesCode: i.series.code,
      number: i.number,
      kind: i.kind,
      rectifiesId: i.rectifiesId,
      issuedAt: i.issuedAt,
      status: i.status,
      subtotal: i.subtotal,
      taxTotal: i.taxTotal,
      total: i.total,
      paidTotal: i.paidTotal,
      prevHash: i.prevHash,
      internalHash: i.internalHash,
      customerNotes: i.customerNotes,
      createdById: i.createdById,
      createdAt: i.createdAt,
      lines: i.lines.map((l) => ({
        id: l.id,
        tenantId: l.tenantId,
        invoiceId: l.invoiceId,
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
        position: l.position,
      })),
    };
  }
}

export class PrismaPaymentRepository implements billing.PaymentRepository {
  constructor(private readonly tx: PrismaClient | Prisma.TransactionClient) {}

  async listForInvoice(invoiceId: string) {
    const items = await this.tx.payment.findMany({
      where: { invoiceId },
      orderBy: { paidAt: 'asc' },
    });
    return items.map((p) => this.toEntity(p));
  }

  async create(args: Omit<billing.Payment, 'id' | 'createdAt' | 'voidedAt'>) {
    const p = await this.tx.payment.create({ data: args });
    return this.toEntity(p);
  }

  async voidByInvoice(invoiceId: string, at: Date) {
    await this.tx.payment.updateMany({
      where: { invoiceId, voidedAt: null },
      data: { voidedAt: at },
    });
  }

  async sumActiveForInvoice(invoiceId: string) {
    const r = await this.tx.payment.aggregate({
      where: { invoiceId, voidedAt: null },
      _sum: { amount: true },
    });
    return r._sum.amount ?? 0;
  }

  private toEntity(p: {
    id: string;
    tenantId: string;
    invoiceId: string;
    method: billing.PaymentMethod;
    amount: number;
    paidAt: Date;
    reference: string | null;
    recordedById: string;
    voidedAt: Date | null;
    createdAt: Date;
  }): billing.Payment {
    return {
      id: p.id,
      tenantId: p.tenantId,
      invoiceId: p.invoiceId,
      method: p.method,
      amount: p.amount,
      paidAt: p.paidAt,
      reference: p.reference,
      recordedById: p.recordedById,
      voidedAt: p.voidedAt,
      createdAt: p.createdAt,
    };
  }
}
