/**
 * Validación de identificadores fiscales / personales.
 *
 * Cubre:
 *  - DNI español  (8 dígitos + letra de control)
 *  - NIE español  (X/Y/Z + 7 dígitos + letra de control)
 *  - NIF empresa  (letra + 7 dígitos + dígito o letra de control)
 *  - Pasaporte    (validación laxa: alfanumérico, longitud razonable)
 *
 * No bloquea documentos no españoles: si el formato no encaja en ninguno
 * de los oficiales, intenta el modo "OTHER" (longitud 5..20 alfanumérica).
 */

export type NationalIdKind = 'DNI' | 'NIE' | 'NIF' | 'PASSPORT' | 'OTHER';

const DNI_LETTERS = 'TRWAGMYFPDXBNJZSQVHLCKE';

/**
 * Normaliza un identificador eliminando espacios, guiones y poniéndolo en
 * mayúsculas. Es lo que se persiste en `national_id_hash` (sha-256 sobre
 * el resultado).
 */
export function normalizeNationalId(raw: string): string {
  return raw.trim().replace(/[\s-]/g, '').toUpperCase();
}

function controlLetterForDigits(digits: number): string {
  return DNI_LETTERS[digits % 23] ?? '';
}

export function validateDni(input: string): boolean {
  const v = normalizeNationalId(input);
  const match = /^(\d{8})([A-Z])$/.exec(v);
  if (!match) return false;
  const digits = Number.parseInt(match[1]!, 10);
  return controlLetterForDigits(digits) === match[2];
}

export function validateNie(input: string): boolean {
  const v = normalizeNationalId(input);
  const match = /^([XYZ])(\d{7})([A-Z])$/.exec(v);
  if (!match) return false;
  const prefixDigit = { X: '0', Y: '1', Z: '2' }[match[1] as 'X' | 'Y' | 'Z'];
  const digits = Number.parseInt(prefixDigit + match[2]!, 10);
  return controlLetterForDigits(digits) === match[3];
}

/**
 * NIF de persona jurídica (CIF empresarial, regulado por OM HAC/1989/2014).
 * Formato: letra inicial + 7 dígitos + control (dígito o letra según tipo).
 */
export function validateNifEmpresa(input: string): boolean {
  const v = normalizeNationalId(input);
  const match = /^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/.exec(v);
  if (!match) return false;

  const digits = match[2]!;
  let sumEven = 0;
  let sumOdd = 0;
  for (let i = 0; i < digits.length; i++) {
    const d = Number(digits[i]);
    if (i % 2 === 0) {
      // Posiciones impares (1, 3, 5, 7): multiplicar por 2 y sumar dígitos.
      const doubled = d * 2;
      sumOdd += Math.floor(doubled / 10) + (doubled % 10);
    } else {
      sumEven += d;
    }
  }
  const total = sumEven + sumOdd;
  const controlDigit = (10 - (total % 10)) % 10;
  const controlLetter = 'JABCDEFGHI'[controlDigit] ?? '';

  const expected = match[3]!;
  const letter = match[1]!;
  // Tipos K, P, Q, R, S, N, W exigen letra como control.
  // Tipos A, B, E, H exigen dígito.
  // El resto (C, D, F, G, J, U, V) acepta cualquiera de los dos.
  if ('KPQRSNW'.includes(letter)) {
    return expected === controlLetter;
  }
  if ('ABEH'.includes(letter)) {
    return expected === String(controlDigit);
  }
  return expected === controlLetter || expected === String(controlDigit);
}

const PASSPORT_RE = /^[A-Z0-9]{5,20}$/;

export function classifyNationalId(input: string): NationalIdKind | null {
  const v = normalizeNationalId(input);
  if (validateDni(v)) return 'DNI';
  if (validateNie(v)) return 'NIE';
  if (validateNifEmpresa(v)) return 'NIF';
  if (PASSPORT_RE.test(v) && v.length <= 12) return 'PASSPORT';
  if (/^[A-Z0-9]{5,20}$/.test(v)) return 'OTHER';
  return null;
}

export function isValidNationalId(input: string): boolean {
  return classifyNationalId(input) !== null;
}
