/**
 * Bounded context `billing` — entidades.
 */
import type { TaxRegime } from '@castellar/billing';

export type { TaxRegime };

export type BudgetStatus =
  | 'DRAFT'
  | 'SENT'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CONVERTED';

export interface BudgetLine {
  id: string;
  tenantId: string;
  budgetId: string;
  treatmentId: string | null;
  description: string;
  /** Pieza dental en notación FDI (11..48). */
  toothRef: number | null;
  quantity: number;
  /** Precio unitario sin IVA, en céntimos. */
  unitPrice: number;
  discount: number;
  taxRegime: TaxRegime;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  position: number;
}

export interface Budget {
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
  lines: BudgetLine[];
}

export type InvoiceStatus = 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'VOIDED';
export type InvoiceKind = 'STANDARD' | 'RECTIFICATIVE';

export interface InvoiceLine {
  id: string;
  tenantId: string;
  invoiceId: string;
  treatmentId: string | null;
  description: string;
  toothRef: number | null;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRegime: TaxRegime;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  position: number;
}

export interface Invoice {
  id: string;
  tenantId: string;
  clinicId: string;
  patientId: string;
  seriesId: string;
  /** Código humano de la serie ("2026-A"). Se resuelve por join. */
  seriesCode: string;
  number: number;
  kind: InvoiceKind;
  rectifiesId: string | null;
  issuedAt: Date;
  status: InvoiceStatus;
  subtotal: number;
  taxTotal: number;
  total: number;
  paidTotal: number;
  prevHash: string | null;
  internalHash: string;
  customerNotes: string | null;
  createdById: string;
  createdAt: Date;
  lines: InvoiceLine[];
}

export interface InvoiceSeries {
  id: string;
  tenantId: string;
  clinicId: string | null;
  code: string;
  lastNumber: number;
  active: boolean;
  createdAt: Date;
}

export type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'ONLINE' | 'OTHER';

export interface Payment {
  id: string;
  tenantId: string;
  invoiceId: string;
  method: PaymentMethod;
  amount: number;
  paidAt: Date;
  reference: string | null;
  recordedById: string;
  voidedAt: Date | null;
  createdAt: Date;
}
