/**
 * 50 pacientes ficticios para arrancar la clínica demo.
 *
 * Mezcla de nombres y apellidos típicos en España. Algunos llevan alertas
 * médicas para probar la UI. Los DNIs son válidos (letra de control
 * calculada correctamente).
 */

const FIRST_NAMES = [
  'Lucía', 'Sofía', 'Martina', 'María', 'Paula', 'Daniela', 'Carla', 'Valeria',
  'Alba', 'Julia', 'Sara', 'Emma', 'Noa', 'Elena', 'Marta', 'Laura', 'Carmen',
  'Hugo', 'Martín', 'Lucas', 'Mateo', 'Leo', 'Daniel', 'Pablo', 'Álvaro',
  'Marco', 'Adrián', 'Diego', 'Manuel', 'Javier', 'David', 'Sergio', 'Iván',
];

const LAST_NAMES = [
  'García', 'Rodríguez', 'González', 'Fernández', 'López', 'Martínez',
  'Sánchez', 'Pérez', 'Gómez', 'Martín', 'Jiménez', 'Ruiz', 'Hernández',
  'Díaz', 'Moreno', 'Álvarez', 'Muñoz', 'Romero', 'Alonso', 'Gutiérrez',
];

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

function dniLetter(n: number): string {
  return DNI_LETTERS[n % 23] ?? 'X';
}

function pad8(n: number): string {
  return n.toString().padStart(8, '0');
}

function pseudoDni(seed: number): string {
  // Generamos un DNI determinístico válido a partir del índice del seed.
  const digits = 10_000_000 + ((seed * 99_991) % 90_000_000);
  return `${pad8(digits)}${dniLetter(digits)}`;
}

export interface SeedPatient {
  code: string;
  firstName: string;
  lastName: string;
  nationalId: string;
  birthDate: Date;
  sex: 'MALE' | 'FEMALE';
  phone: string;
  email: string;
  city: string;
  addAlerts?: Array<{ severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'; category: 'ALLERGY' | 'MEDICATION' | 'CONDITION' | 'PROCEDURE_RISK' | 'OTHER'; label: string }>;
}

export function generateDemoPatients(count = 50): SeedPatient[] {
  const out: SeedPatient[] = [];
  for (let i = 0; i < count; i++) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length]!;
    const last1 = LAST_NAMES[(i * 7) % LAST_NAMES.length]!;
    const last2 = LAST_NAMES[(i * 13) % LAST_NAMES.length]!;
    const sex: 'MALE' | 'FEMALE' = i % 2 === 0 ? 'FEMALE' : 'MALE';
    const year = 1955 + (i * 11) % 55;
    const month = (i * 3) % 12;
    const day = ((i * 17) % 27) + 1;
    const alerts: SeedPatient['addAlerts'] = [];
    if (i % 13 === 0) alerts.push({ severity: 'HIGH', category: 'ALLERGY', label: 'Penicilina' });
    if (i % 17 === 0) alerts.push({ severity: 'MEDIUM', category: 'MEDICATION', label: 'Anticoagulante (Sintrom)' });
    if (i % 23 === 0) alerts.push({ severity: 'CRITICAL', category: 'CONDITION', label: 'Endocarditis: profilaxis antibiótica' });
    out.push({
      code: `P-2026-${String(i + 1).padStart(4, '0')}`,
      firstName: first,
      lastName: `${last1} ${last2}`,
      nationalId: pseudoDni(i + 1),
      birthDate: new Date(Date.UTC(year, month, day)),
      sex,
      phone: `+34 6${String(10_000_000 + ((i * 7919) % 89_999_999)).padStart(8, '0')}`,
      email: `${first.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')}.${last1.toLowerCase()}@example.test`,
      city: ['Madrid', 'Barcelona', 'Valencia', 'Sevilla', 'Bilbao', 'Málaga'][i % 6]!,
      addAlerts: alerts.length > 0 ? alerts : undefined,
    });
  }
  return out;
}
