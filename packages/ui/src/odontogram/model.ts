/**
 * Modelo del odontograma adulto (notación FDI / ISO 3950).
 *
 * 32 piezas. El número FDI codifica cuadrante (1..4) y posición (1..8):
 *   18 17 16 15 14 13 12 11 | 21 22 23 24 25 26 27 28   ← superior
 *   48 47 46 45 44 43 42 41 | 31 32 33 34 35 36 37 38   ← inferior
 *
 * Cada diente tiene 5 superficies. Los molares (cuadrante posterior, 6/7/8)
 * usan oclusal en lugar de incisal.
 */

export const ADULT_TEETH_FDI = [
  // Superior derecho 18..11
  18, 17, 16, 15, 14, 13, 12, 11,
  // Superior izquierdo 21..28
  21, 22, 23, 24, 25, 26, 27, 28,
  // Inferior izquierdo 38..31
  38, 37, 36, 35, 34, 33, 32, 31,
  // Inferior derecho 41..48
  41, 42, 43, 44, 45, 46, 47, 48,
] as const;

export type ToothFDI = (typeof ADULT_TEETH_FDI)[number];

export type Surface =
  | 'mesial'
  | 'distal'
  | 'vestibular' // bucal/labial
  | 'lingual' // palatino en superiores
  | 'occlusal'; // oclusal/incisal (centro)

/**
 * Condición clínica registrada sobre una superficie o sobre toda la pieza.
 *
 * MVP cubre los hallazgos visuales más frecuentes. El diagnóstico completo
 * y la planificación (propuesto / aceptado / realizado) entra en Sprint 4.
 */
export type Condition =
  | 'HEALTHY'
  | 'CARIES'
  | 'FILLING'
  | 'CROWN'
  | 'ENDODONTICS'
  | 'IMPLANT'
  | 'MISSING'
  | 'EXTRACTION_PLANNED';

export interface SurfaceState {
  condition: Condition;
  /** Notas libres por superficie. */
  note?: string;
}

export interface ToothState {
  /** Estado por superficie. Vacío = HEALTHY. */
  surfaces: Partial<Record<Surface, SurfaceState>>;
  /** Estado global de la pieza (MISSING, IMPLANT, CROWN cubre toda la pieza). */
  whole?: Condition;
}

export type OdontogramState = Partial<Record<ToothFDI, ToothState>>;

export function isMolar(tooth: ToothFDI): boolean {
  const position = tooth % 10;
  return position >= 6;
}

export function quadrantOf(tooth: ToothFDI): 1 | 2 | 3 | 4 {
  return Math.floor(tooth / 10) as 1 | 2 | 3 | 4;
}

export const CONDITION_COLORS: Record<Condition, string> = {
  HEALTHY: '#ffffff',
  CARIES: '#dc2626',
  FILLING: '#1d4ed8',
  CROWN: '#eab308',
  ENDODONTICS: '#7c3aed',
  IMPLANT: '#6b7280',
  MISSING: '#000000',
  EXTRACTION_PLANNED: '#f97316',
};

export const CONDITION_LABELS: Record<Condition, string> = {
  HEALTHY: 'Sana',
  CARIES: 'Caries',
  FILLING: 'Obturación',
  CROWN: 'Corona',
  ENDODONTICS: 'Endodoncia',
  IMPLANT: 'Implante',
  MISSING: 'Ausente',
  EXTRACTION_PLANNED: 'Extracción planificada',
};
