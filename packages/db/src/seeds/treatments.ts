/**
 * Catálogo demo de tratamientos para una clínica dental española típica.
 * Precios en céntimos.
 */

import type { catalog } from '@castellar/core';

type SeedTreatment = Omit<catalog.Treatment, 'id' | 'createdAt' | 'updatedAt' | 'tenantId'>;

export const DEMO_TREATMENTS: SeedTreatment[] = [
  // ----- Revisión y diagnóstico (exento sanitario) -----
  { code: 'REV-001', name: 'Primera visita y diagnóstico', description: null, defaultPrice: 0, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Diagnóstico', active: true },
  { code: 'REV-002', name: 'Revisión periódica', description: null, defaultPrice: 0, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Diagnóstico', active: true },
  { code: 'DIAG-RX-PAN', name: 'Radiografía panorámica', description: null, defaultPrice: 4000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Diagnóstico', active: true },
  { code: 'DIAG-RX-PER', name: 'Radiografía periapical', description: null, defaultPrice: 1500, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Diagnóstico', active: true },
  { code: 'DIAG-CBCT', name: 'TAC dental (CBCT)', description: null, defaultPrice: 12000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Diagnóstico', active: true },

  // ----- Higiene (exento) -----
  { code: 'HIG-001', name: 'Limpieza dental (tartrectomía)', description: null, defaultPrice: 6000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Higiene', active: true },
  { code: 'HIG-002', name: 'Higiene profunda (raspado y alisado radicular por cuadrante)', description: null, defaultPrice: 8500, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Higiene', active: true },
  { code: 'HIG-003', name: 'Sellado de fosas y fisuras', description: null, defaultPrice: 2500, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Higiene', active: true },

  // ----- Conservadora -----
  { code: 'CON-OBT-1S', name: 'Obturación composite 1 superficie', description: null, defaultPrice: 6000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Conservadora', active: true },
  { code: 'CON-OBT-2S', name: 'Obturación composite 2 superficies', description: null, defaultPrice: 7500, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Conservadora', active: true },
  { code: 'CON-OBT-3S', name: 'Obturación composite 3 superficies', description: null, defaultPrice: 9500, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Conservadora', active: true },
  { code: 'CON-RECON', name: 'Reconstrucción dental', description: null, defaultPrice: 12000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Conservadora', active: true },

  // ----- Endodoncia -----
  { code: 'END-1C', name: 'Endodoncia unirradicular', description: null, defaultPrice: 18000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Endodoncia', active: true },
  { code: 'END-2C', name: 'Endodoncia birradicular', description: null, defaultPrice: 22000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Endodoncia', active: true },
  { code: 'END-3C', name: 'Endodoncia multirradicular', description: null, defaultPrice: 28000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Endodoncia', active: true },
  { code: 'END-RTTO', name: 'Retratamiento de endodoncia', description: null, defaultPrice: 32000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Endodoncia', active: true },

  // ----- Cirugía y exodoncia -----
  { code: 'CIR-EXO-S', name: 'Exodoncia simple', description: null, defaultPrice: 6000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Cirugía', active: true },
  { code: 'CIR-EXO-Q', name: 'Exodoncia quirúrgica', description: null, defaultPrice: 12000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Cirugía', active: true },
  { code: 'CIR-CORDAL', name: 'Extracción de cordal incluido', description: null, defaultPrice: 18000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Cirugía', active: true },
  { code: 'CIR-FRENO', name: 'Frenectomía', description: null, defaultPrice: 15000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Cirugía', active: true },

  // ----- Periodoncia -----
  { code: 'PER-RAR', name: 'Raspado por cuadrante', description: null, defaultPrice: 8500, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Periodoncia', active: true },
  { code: 'PER-CIR', name: 'Cirugía periodontal por cuadrante', description: null, defaultPrice: 25000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Periodoncia', active: true },
  { code: 'PER-MTTO', name: 'Mantenimiento periodontal', description: null, defaultPrice: 7000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Periodoncia', active: true },

  // ----- Implantes (exento + corona estética opcional 21%) -----
  { code: 'IMP-COL', name: 'Colocación de implante', description: null, defaultPrice: 80000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Implantes', active: true },
  { code: 'IMP-PIL', name: 'Pilar protésico', description: null, defaultPrice: 25000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Implantes', active: true },
  { code: 'IMP-COR', name: 'Corona sobre implante', description: null, defaultPrice: 55000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Implantes', active: true },
  { code: 'IMP-ELEV', name: 'Elevación sinusal', description: null, defaultPrice: 60000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Implantes', active: true },
  { code: 'IMP-INJ', name: 'Injerto óseo', description: null, defaultPrice: 35000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Implantes', active: true },

  // ----- Prótesis fija -----
  { code: 'PRO-COR-PFM', name: 'Corona metal-cerámica', description: null, defaultPrice: 35000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Prótesis', active: true },
  { code: 'PRO-COR-ZR', name: 'Corona de zirconio', description: null, defaultPrice: 55000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Prótesis', active: true },
  { code: 'PRO-CARILLA', name: 'Carilla de composite', description: null, defaultPrice: 18000, taxRegime: 'STANDARD_AESTHETIC', category: 'Estética', active: true },
  { code: 'PRO-CARILLA-CER', name: 'Carilla de porcelana', description: null, defaultPrice: 45000, taxRegime: 'STANDARD_AESTHETIC', category: 'Estética', active: true },
  { code: 'PRO-PUENTE-3', name: 'Puente de 3 piezas', description: null, defaultPrice: 90000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Prótesis', active: true },
  { code: 'PRO-INLAY', name: 'Incrustación cerámica', description: null, defaultPrice: 28000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Prótesis', active: true },

  // ----- Prótesis removible -----
  { code: 'PRO-PARC-AC', name: 'Prótesis parcial acrílica', description: null, defaultPrice: 35000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Prótesis', active: true },
  { code: 'PRO-PARC-CR', name: 'Prótesis parcial esquelética', description: null, defaultPrice: 65000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Prótesis', active: true },
  { code: 'PRO-COMP', name: 'Prótesis completa', description: null, defaultPrice: 85000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Prótesis', active: true },

  // ----- Ortodoncia -----
  { code: 'ORTO-EST-INI', name: 'Estudio ortodóncico inicial', description: null, defaultPrice: 8000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Ortodoncia', active: true },
  { code: 'ORTO-BRA-MET', name: 'Brackets metálicos (presupuesto completo)', description: null, defaultPrice: 220000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Ortodoncia', active: true },
  { code: 'ORTO-BRA-EST', name: 'Brackets estéticos (presupuesto completo)', description: null, defaultPrice: 280000, taxRegime: 'STANDARD_AESTHETIC', category: 'Ortodoncia', active: true },
  { code: 'ORTO-ALI', name: 'Ortodoncia invisible (alineadores)', description: null, defaultPrice: 350000, taxRegime: 'STANDARD_AESTHETIC', category: 'Ortodoncia', active: true },
  { code: 'ORTO-REV', name: 'Revisión mensual de ortodoncia', description: null, defaultPrice: 4500, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Ortodoncia', active: true },
  { code: 'ORTO-RET', name: 'Retenedor (por arcada)', description: null, defaultPrice: 8000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Ortodoncia', active: true },

  // ----- Estética (21%) -----
  { code: 'EST-BLAN-CLI', name: 'Blanqueamiento en clínica', description: null, defaultPrice: 30000, taxRegime: 'STANDARD_AESTHETIC', category: 'Estética', active: true },
  { code: 'EST-BLAN-DOM', name: 'Blanqueamiento domiciliario', description: null, defaultPrice: 18000, taxRegime: 'STANDARD_AESTHETIC', category: 'Estética', active: true },
  { code: 'EST-DSD', name: 'Diseño digital de sonrisa (DSD)', description: null, defaultPrice: 20000, taxRegime: 'STANDARD_AESTHETIC', category: 'Estética', active: true },

  // ----- Odontopediatría -----
  { code: 'PED-REV', name: 'Revisión infantil', description: null, defaultPrice: 0, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Odontopediatría', active: true },
  { code: 'PED-FLUOR', name: 'Aplicación de flúor', description: null, defaultPrice: 2500, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Odontopediatría', active: true },
  { code: 'PED-PULP', name: 'Pulpotomía', description: null, defaultPrice: 8500, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Odontopediatría', active: true },
  { code: 'PED-MANT', name: 'Mantenedor de espacio', description: null, defaultPrice: 18000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Odontopediatría', active: true },

  // ----- ATM / Bruxismo -----
  { code: 'ATM-FERULA', name: 'Férula de descarga', description: null, defaultPrice: 18000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'ATM', active: true },
  { code: 'ATM-ESTUDIO', name: 'Estudio ATM', description: null, defaultPrice: 9000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'ATM', active: true },

  // ----- Productos (21%) -----
  { code: 'PRD-CEP', name: 'Cepillo dental', description: null, defaultPrice: 600, taxRegime: 'STANDARD_PRODUCT', category: 'Productos', active: true },
  { code: 'PRD-COL', name: 'Colutorio', description: null, defaultPrice: 1200, taxRegime: 'STANDARD_PRODUCT', category: 'Productos', active: true },
  { code: 'PRD-PAS', name: 'Pasta dentífrica especializada', description: null, defaultPrice: 1500, taxRegime: 'STANDARD_PRODUCT', category: 'Productos', active: true },
  { code: 'PRD-SED', name: 'Seda dental', description: null, defaultPrice: 400, taxRegime: 'STANDARD_PRODUCT', category: 'Productos', active: true },

  // ----- Misceláneo -----
  { code: 'URG-001', name: 'Urgencia dental', description: null, defaultPrice: 5000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Urgencias', active: true },
  { code: 'ANES-LOC', name: 'Anestesia local', description: null, defaultPrice: 0, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Anestesia', active: true },
  { code: 'SED-CONS', name: 'Sedación consciente', description: null, defaultPrice: 25000, taxRegime: 'EXEMPT_HEALTHCARE', category: 'Anestesia', active: true },
];
