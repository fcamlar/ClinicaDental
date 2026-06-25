/**
 * Bounded context `catalog` — tratamientos del catálogo de la clínica.
 */

export type TaxRegime =
  | 'EXEMPT_HEALTHCARE'
  | 'STANDARD_AESTHETIC'
  | 'STANDARD_PRODUCT'
  | 'REDUCED'
  | 'NOT_SUBJECT';

export interface Treatment {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  description: string | null;
  /** Precio por defecto en céntimos. */
  defaultPrice: number;
  taxRegime: TaxRegime;
  category: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}
