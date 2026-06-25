/**
 * Castellar — modelo fiscal de facturas.
 *
 * `taxRegime` describe el tratamiento fiscal de una línea o factura.
 * El régimen exacto se valida con el asesor fiscal en Sprint 0 antes del
 * Sprint 5; este enum cubre los casos conocidos del sector dental.
 */
export type TaxRegime =
  /** Servicio sanitario exento (Art. 20.1.3º LIVA — actos médico-dentales). */
  | 'EXEMPT_HEALTHCARE'
  /** Tratamiento estético sujeto a IVA general (típicamente 21%). */
  | 'STANDARD_AESTHETIC'
  /** Venta de productos (cepillos, férulas, etc.) sujeta a IVA general. */
  | 'STANDARD_PRODUCT'
  /** IVA reducido (10%) — casos puntuales. */
  | 'REDUCED'
  /** Operación no sujeta (cobros internos, anticipos según régimen). */
  | 'NOT_SUBJECT';

export const TAX_RATE_BY_REGIME: Record<TaxRegime, number> = {
  EXEMPT_HEALTHCARE: 0,
  STANDARD_AESTHETIC: 0.21,
  STANDARD_PRODUCT: 0.21,
  REDUCED: 0.1,
  NOT_SUBJECT: 0,
};
