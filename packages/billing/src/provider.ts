/**
 * Provider abstracto para envío de facturas a sistemas de control fiscal.
 *
 * En MVP el provider es `null` (no se envía nada — solo se calcula el hash
 * interno y se conserva la cadena). Cuando integremos VERI*FACTU/TicketBAI,
 * implementaremos este puerto sin tocar el dominio.
 */
import type { IssuedInvoice } from './invoice.js';

export type BillingProviderResult =
  | { kind: 'NONE' }
  | { kind: 'SUBMITTED'; providerId: string; submittedAt: Date; qrUrl?: string }
  | { kind: 'ERROR'; error: string };

export interface BillingProvider {
  readonly id: string;
  submit(invoice: IssuedInvoice): Promise<BillingProviderResult>;
}

/** Provider null — MVP. No envía nada y reporta NONE. */
export const NULL_BILLING_PROVIDER: BillingProvider = {
  id: 'null',
  submit() {
    return Promise.resolve({ kind: 'NONE' });
  },
};
