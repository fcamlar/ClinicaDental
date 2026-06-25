import type { Budget, BudgetLine, Invoice, InvoiceLine, InvoiceSeries, Payment } from './entities.js';

export interface BudgetRepository {
  findById(id: string): Promise<Budget | null>;
  list(args: { patientId?: string; status?: Budget['status']; limit: number }): Promise<Budget[]>;
  /** Crea presupuesto y líneas en una sola operación. */
  create(args: {
    budget: Omit<Budget, 'id' | 'createdAt' | 'updatedAt' | 'lines'>;
    lines: Array<Omit<BudgetLine, 'id' | 'budgetId'>>;
  }): Promise<Budget>;
  /** Reemplaza las líneas y recalcula totales. Solo permitido en DRAFT. */
  replaceLines(args: {
    budgetId: string;
    lines: Array<Omit<BudgetLine, 'id' | 'budgetId' | 'tenantId'>>;
    totals: { subtotal: number; taxTotal: number; total: number };
  }): Promise<Budget>;
  updateStatus(args: {
    budgetId: string;
    status: Budget['status'];
    at: Date;
    invoiceId?: string | null;
  }): Promise<Budget>;
  nextCode(tenantId: string): Promise<string>;
}

export interface InvoiceSeriesRepository {
  findByCode(tenantId: string, code: string): Promise<InvoiceSeries | null>;
  ensureDefault(args: { tenantId: string; clinicId: string | null; code: string }): Promise<InvoiceSeries>;
  /**
   * Reserva atómica del siguiente número. Implementación con
   * `SELECT … FOR UPDATE`. Devuelve el nuevo número (lastNumber + 1).
   */
  reserveNextNumber(seriesId: string): Promise<number>;
}

export interface InvoiceRepository {
  findById(id: string): Promise<Invoice | null>;
  list(args: {
    patientId?: string;
    seriesId?: string;
    fromDate?: Date;
    toDate?: Date;
    limit: number;
  }): Promise<Invoice[]>;
  /** Devuelve la última factura emitida en la serie (para enlazar prevHash). */
  findLastInSeries(seriesId: string): Promise<Invoice | null>;
  /**
   * Crea factura + líneas + actualiza last_number atómicamente.
   * El caller debe haber calculado totales y hash. La BD verifica unicidad
   * (tenant, series, number).
   */
  create(args: {
    invoice: Omit<Invoice, 'id' | 'createdAt' | 'lines' | 'seriesCode'>;
    lines: Array<Omit<InvoiceLine, 'id' | 'invoiceId'>>;
  }): Promise<Invoice>;
  /** Permitido solo para campos no inmutables: status, paidTotal, customerNotes, verifactu*. */
  updateMutable(
    id: string,
    patch: Partial<Pick<Invoice, 'status' | 'paidTotal' | 'customerNotes'>> & {
      verifactuId?: string | null;
      verifactuStatus?: string | null;
      verifactuQrUrl?: string | null;
    },
  ): Promise<Invoice>;
}

export interface PaymentRepository {
  listForInvoice(invoiceId: string): Promise<Payment[]>;
  create(args: Omit<Payment, 'id' | 'createdAt' | 'voidedAt'>): Promise<Payment>;
  voidByInvoice(invoiceId: string, at: Date): Promise<void>;
  sumActiveForInvoice(invoiceId: string): Promise<number>;
}
