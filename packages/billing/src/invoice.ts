import { createHash } from 'node:crypto';
import type { TaxRegime } from './tax.js';
import { TAX_RATE_BY_REGIME } from './tax.js';

/**
 * Línea de factura. Inmutable una vez emitida.
 */
export interface InvoiceLine {
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: number; // base imponible unitaria, en céntimos
  readonly discount: number; // 0..1
  readonly taxRegime: TaxRegime;
}

/**
 * Estado de la factura. Solo DRAFT permite mutación.
 */
export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED';

/**
 * Identidad fiscal mínima para encadenar la factura.
 *
 * VERI*FACTU exige una cadena hash por (NIF, serie). Castellar mantiene la
 * cadena por (tenantId, series) — la conversión a (NIF, serie) la hará
 * el adaptador AEAT en fase post-MVP.
 */
export interface InvoiceIdentity {
  readonly tenantId: string;
  readonly series: string; // p.ej. "2026-A"
  readonly number: number; // correlativo dentro de la serie
  readonly issuedAt: Date;
}

export interface IssuedInvoice {
  readonly identity: InvoiceIdentity;
  readonly lines: ReadonlyArray<InvoiceLine>;
  readonly subtotal: number; // céntimos
  readonly taxTotal: number; // céntimos
  readonly total: number; // céntimos
  readonly prevHash: string | null;
  readonly internalHash: string;
  readonly status: InvoiceStatus;
}

/**
 * Calcula totales en céntimos para evitar errores de coma flotante.
 */
export function computeTotals(lines: ReadonlyArray<InvoiceLine>): {
  subtotal: number;
  taxTotal: number;
  total: number;
} {
  let subtotal = 0;
  let taxTotal = 0;
  for (const line of lines) {
    if (line.quantity <= 0) throw new Error('quantity debe ser > 0');
    if (line.unitPrice < 0) throw new Error('unitPrice no puede ser negativo');
    if (line.discount < 0 || line.discount >= 1) throw new Error('discount debe estar en [0,1)');

    // Trabajamos en céntimos y redondeamos a la moneda mínima al final
    // de cada línea para reproducibilidad.
    const gross = line.unitPrice * line.quantity;
    const net = Math.round(gross * (1 - line.discount));
    const rate = TAX_RATE_BY_REGIME[line.taxRegime];
    const tax = Math.round(net * rate);
    subtotal += net;
    taxTotal += tax;
  }
  return { subtotal, taxTotal, total: subtotal + taxTotal };
}

/**
 * Serialización canónica de una factura para hashing.
 *
 * El orden de los campos y el formato son ESTABLES — cualquier cambio rompe
 * la cadena hash. Si alguna vez hay que cambiarlo, se versiona (`v2`, `v3`)
 * en lugar de mutar `v1`.
 */
function canonicalize(invoice: Omit<IssuedInvoice, 'internalHash' | 'status'>): string {
  const payload = {
    v: 1,
    tenantId: invoice.identity.tenantId,
    series: invoice.identity.series,
    number: invoice.identity.number,
    issuedAt: invoice.identity.issuedAt.toISOString(),
    lines: invoice.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      discount: l.discount,
      taxRegime: l.taxRegime,
    })),
    subtotal: invoice.subtotal,
    taxTotal: invoice.taxTotal,
    total: invoice.total,
    prevHash: invoice.prevHash,
  };
  // JSON.stringify con orden de claves determinista (el objeto se construye
  // siempre en el mismo orden).
  return JSON.stringify(payload);
}

export function computeHash(invoice: Omit<IssuedInvoice, 'internalHash' | 'status'>): string {
  return createHash('sha256').update(canonicalize(invoice), 'utf8').digest('hex');
}

/**
 * Emite una factura encadenándola a la anterior de su (tenantId, series).
 *
 * Reglas (Sprint 0 — antes de VERI*FACTU real):
 *  - El número debe ser estrictamente correlativo (prev.number + 1).
 *  - La fecha de emisión no puede ser anterior a la de la previa.
 *  - El prevHash debe coincidir con el internalHash de la previa.
 *  - El internalHash se calcula sobre el contenido canónico + prevHash.
 *
 * El resultado es INMUTABLE: no hay `editInvoice`. Para corregir se anula
 * (cancelInvoice) y se emite una rectificativa.
 */
export function issueInvoice(args: {
  identity: InvoiceIdentity;
  lines: ReadonlyArray<InvoiceLine>;
  previous: IssuedInvoice | null;
}): IssuedInvoice {
  const { identity, lines, previous } = args;

  if (lines.length === 0) {
    throw new Error('La factura debe tener al menos una línea');
  }
  if (!Number.isInteger(identity.number) || identity.number < 1) {
    throw new Error('El número de factura debe ser entero positivo');
  }

  if (previous) {
    if (previous.identity.tenantId !== identity.tenantId) {
      throw new Error('La factura previa pertenece a otro tenant');
    }
    if (previous.identity.series !== identity.series) {
      throw new Error('La factura previa pertenece a otra serie');
    }
    if (identity.number !== previous.identity.number + 1) {
      throw new Error(
        `Numeración no correlativa: esperado ${String(previous.identity.number + 1)}, recibido ${String(identity.number)}`,
      );
    }
    if (identity.issuedAt.getTime() < previous.identity.issuedAt.getTime()) {
      throw new Error('La fecha de emisión no puede ser anterior a la factura previa');
    }
  } else if (identity.number !== 1) {
    throw new Error('La primera factura de una serie debe tener número 1');
  }

  const totals = computeTotals(lines);
  const prevHash = previous?.internalHash ?? null;

  const draft: Omit<IssuedInvoice, 'internalHash' | 'status'> = {
    identity,
    lines,
    subtotal: totals.subtotal,
    taxTotal: totals.taxTotal,
    total: totals.total,
    prevHash,
  };

  const internalHash = computeHash(draft);

  return Object.freeze({
    ...draft,
    lines: Object.freeze([...lines]),
    internalHash,
    status: 'ISSUED' as const,
  });
}

/**
 * Verifica que una cadena de facturas es íntegra.
 * Devuelve el índice de la primera factura corrupta, o -1 si todo está bien.
 */
export function verifyChain(invoices: ReadonlyArray<IssuedInvoice>): number {
  for (let i = 0; i < invoices.length; i++) {
    const inv = invoices[i];
    if (!inv) continue;
    const prev = i > 0 ? invoices[i - 1] ?? null : null;

    const expectedPrevHash = prev?.internalHash ?? null;
    if (inv.prevHash !== expectedPrevHash) return i;

    const expectedHash = computeHash({
      identity: inv.identity,
      lines: inv.lines,
      subtotal: inv.subtotal,
      taxTotal: inv.taxTotal,
      total: inv.total,
      prevHash: inv.prevHash,
    });
    if (expectedHash !== inv.internalHash) return i;
  }
  return -1;
}
