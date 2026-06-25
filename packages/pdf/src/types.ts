/**
 * Castellar — datos comunes para plantillas PDF.
 *
 * No dependemos directamente de `@castellar/core/billing` para evitar el ciclo
 * pdf → core → ui. La API construye el `PdfInvoiceData` a partir de la
 * entidad Invoice y lo pasa aquí.
 */

export interface PdfClinicInfo {
  name: string;
  vatId: string | null;
  address: string | null;
  postalCode?: string;
  city?: string;
  country?: string;
  email?: string;
  phone?: string;
}

export interface PdfPartyInfo {
  /** Nombre completo del paciente o razón social. */
  name: string;
  /** DNI/NIE/NIF. */
  nationalId: string | null;
  address: string | null;
  postalCode?: string | null;
  city?: string | null;
  email?: string | null;
}

export interface PdfLine {
  description: string;
  /** Pieza dental FDI opcional. */
  toothRef: number | null;
  quantity: number;
  /** Precio unitario en céntimos. */
  unitPrice: number;
  /** 0..1 — descuento aplicado. */
  discount: number;
  taxRegimeLabel: string;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
}

export interface PdfTotals {
  subtotal: number;
  taxTotal: number;
  total: number;
  /** Importe pagado acumulado (solo factura). */
  paidTotal?: number;
}

export interface PdfInvoiceData {
  /** "FACTURA" / "FACTURA RECTIFICATIVA". */
  documentTitle: string;
  /** Serie + número (p.ej. "2026-A / 0042"). */
  reference: string;
  issuedAt: Date;
  /** Si es rectificativa, referencia humana a la original. */
  rectifiesReference?: string;
  /** Hash interno truncado — útil para auditoría sin exponer la cadena. */
  internalHashShort: string;
  clinic: PdfClinicInfo;
  customer: PdfPartyInfo;
  lines: PdfLine[];
  totals: PdfTotals;
  notes?: string | null;
  locale: string;
}

export interface PdfBudgetData {
  documentTitle: string; // "PRESUPUESTO"
  reference: string;
  issuedAt: Date;
  validUntil: Date | null;
  status: string;
  clinic: PdfClinicInfo;
  customer: PdfPartyInfo;
  lines: PdfLine[];
  totals: PdfTotals;
  notes?: string | null;
  locale: string;
}

export function formatCents(cents: number, locale = 'es-ES'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

export function formatDate(d: Date, locale = 'es-ES'): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(d);
}
