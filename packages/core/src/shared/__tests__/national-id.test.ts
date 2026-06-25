import { describe, expect, it } from 'vitest';
import {
  classifyNationalId,
  isValidNationalId,
  normalizeNationalId,
  validateDni,
  validateNie,
  validateNifEmpresa,
} from '../national-id.js';

describe('normalizeNationalId', () => {
  it('elimina espacios, guiones y pone en mayúsculas', () => {
    expect(normalizeNationalId(' 12345678-z ')).toBe('12345678Z');
    expect(normalizeNationalId('x1234567 l')).toBe('X1234567L');
  });
});

describe('validateDni', () => {
  it('acepta DNIs reales válidos', () => {
    // Ejemplos del algoritmo oficial (FNMT).
    expect(validateDni('12345678Z')).toBe(true);
    expect(validateDni('00000000T')).toBe(true);
    expect(validateDni('99999999R')).toBe(true);
  });

  it('rechaza letra incorrecta', () => {
    expect(validateDni('12345678A')).toBe(false);
  });

  it('rechaza formato inválido', () => {
    expect(validateDni('1234567Z')).toBe(false);
    expect(validateDni('A2345678Z')).toBe(false);
    expect(validateDni('')).toBe(false);
  });
});

describe('validateNie', () => {
  it('acepta NIEs válidos', () => {
    // X-1234567-L: 01234567 mod 23 = 11 → 'L'? comprobamos con cálculo:
    //   01234567 % 23 = 4 → letra "G"
    expect(validateNie('X1234567G')).toBe(true);
    // Y: prefijo 1 → 11234567 % 23 = 4 → 'G' tampoco, calculamos:
    //   11234567 mod 23 = 5 → 'M'
    expect(validateNie('Y1234567M')).toBe(true);
    // Z: prefijo 2 → 21234567 mod 23 = 6 → 'Y'
    expect(validateNie('Z1234567Y')).toBe(true);
  });

  it('rechaza prefijo no XYZ', () => {
    expect(validateNie('A1234567L')).toBe(false);
  });

  it('rechaza letra de control incorrecta', () => {
    expect(validateNie('X1234567A')).toBe(false);
  });
});

describe('validateNifEmpresa', () => {
  it('acepta CIFs de sociedades válidos (control dígito)', () => {
    // B12345678: dígitos 1234567, control esperado:
    //   posiciones impares (0,2,4,6) → 1*2=2, 3*2=6, 5*2=10→1+0=1, 7*2=14→1+4=5; suma=14
    //   posiciones pares (1,3,5) → 2+4+6=12
    //   total=26 → control = (10 - 6)%10 = 4
    expect(validateNifEmpresa('B12345678')).toBe(false);
    expect(validateNifEmpresa('B12345674')).toBe(true);
  });

  it('acepta CIFs con control letra', () => {
    // P + 1234567 → control 'J' por la regla.
    // Calculamos: total = 26 → letra 'JABCDEFGHI'[4] = 'E'
    expect(validateNifEmpresa('P1234567E')).toBe(true);
    expect(validateNifEmpresa('P1234567X')).toBe(false);
  });

  it('rechaza letra inicial no válida', () => {
    expect(validateNifEmpresa('I12345678')).toBe(false);
  });
});

describe('classifyNationalId / isValidNationalId', () => {
  it('clasifica correctamente cada tipo', () => {
    expect(classifyNationalId('12345678Z')).toBe('DNI');
    expect(classifyNationalId('X1234567G')).toBe('NIE');
    expect(classifyNationalId('B12345674')).toBe('NIF');
    expect(classifyNationalId('ABC123456')).toBe('PASSPORT');
  });

  it('rechaza cadenas sin sentido', () => {
    expect(isValidNationalId('')).toBe(false);
    expect(isValidNationalId('???')).toBe(false);
    expect(isValidNationalId('a')).toBe(false);
  });

  it('clasifica como OTHER documentos extranjeros largos pero válidos', () => {
    expect(classifyNationalId('GBR9876543210')).toBe('PASSPORT');
    expect(classifyNationalId('PASS1234567890ABCDE')).toBe('OTHER');
  });
});
