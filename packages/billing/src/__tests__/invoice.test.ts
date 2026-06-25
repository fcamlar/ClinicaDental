import { describe, expect, it } from 'vitest';
import {
  computeTotals,
  computeHash,
  issueInvoice,
  verifyChain,
  type InvoiceLine,
} from '../invoice.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const SERIES = '2026-A';

function lines(): InvoiceLine[] {
  return [
    {
      description: 'Limpieza dental',
      quantity: 1,
      unitPrice: 6000, // 60,00 €
      discount: 0,
      taxRegime: 'EXEMPT_HEALTHCARE',
    },
    {
      description: 'Blanqueamiento',
      quantity: 1,
      unitPrice: 30000, // 300,00 €
      discount: 0.1,
      taxRegime: 'STANDARD_AESTHETIC',
    },
  ];
}

describe('computeTotals', () => {
  it('calcula subtotal e IVA por régimen', () => {
    const t = computeTotals(lines());
    // Limpieza: 6000 céntimos, exento → 6000 base, 0 IVA.
    // Blanqueamiento: 30000 - 10% = 27000 base, 21% = 5670 IVA.
    expect(t.subtotal).toBe(33000);
    expect(t.taxTotal).toBe(5670);
    expect(t.total).toBe(38670);
  });

  it('rechaza descuento >= 1', () => {
    expect(() =>
      computeTotals([
        {
          description: 'X',
          quantity: 1,
          unitPrice: 1000,
          discount: 1,
          taxRegime: 'EXEMPT_HEALTHCARE',
        },
      ]),
    ).toThrow();
  });
});

describe('issueInvoice — cadena hash', () => {
  it('primera factura de una serie debe ser nº 1', () => {
    expect(() =>
      issueInvoice({
        identity: { tenantId: TENANT, series: SERIES, number: 5, issuedAt: new Date('2026-01-01') },
        lines: lines(),
        previous: null,
      }),
    ).toThrow(/primera factura/i);
  });

  it('encadena varias facturas con prevHash correcto', () => {
    const a = issueInvoice({
      identity: { tenantId: TENANT, series: SERIES, number: 1, issuedAt: new Date('2026-01-01T10:00:00Z') },
      lines: lines(),
      previous: null,
    });
    expect(a.prevHash).toBeNull();
    expect(a.internalHash).toMatch(/^[0-9a-f]{64}$/);

    const b = issueInvoice({
      identity: { tenantId: TENANT, series: SERIES, number: 2, issuedAt: new Date('2026-01-02T10:00:00Z') },
      lines: lines(),
      previous: a,
    });
    expect(b.prevHash).toBe(a.internalHash);
    expect(b.internalHash).not.toBe(a.internalHash);

    expect(verifyChain([a, b])).toBe(-1);
  });

  it('rechaza numeración no correlativa', () => {
    const a = issueInvoice({
      identity: { tenantId: TENANT, series: SERIES, number: 1, issuedAt: new Date('2026-01-01') },
      lines: lines(),
      previous: null,
    });
    expect(() =>
      issueInvoice({
        identity: { tenantId: TENANT, series: SERIES, number: 3, issuedAt: new Date('2026-01-02') },
        lines: lines(),
        previous: a,
      }),
    ).toThrow(/correlativa/i);
  });

  it('rechaza fecha anterior a la previa', () => {
    const a = issueInvoice({
      identity: { tenantId: TENANT, series: SERIES, number: 1, issuedAt: new Date('2026-01-10') },
      lines: lines(),
      previous: null,
    });
    expect(() =>
      issueInvoice({
        identity: { tenantId: TENANT, series: SERIES, number: 2, issuedAt: new Date('2026-01-01') },
        lines: lines(),
        previous: a,
      }),
    ).toThrow(/anterior/i);
  });

  it('rechaza cadena cross-tenant', () => {
    const a = issueInvoice({
      identity: { tenantId: TENANT, series: SERIES, number: 1, issuedAt: new Date('2026-01-01') },
      lines: lines(),
      previous: null,
    });
    expect(() =>
      issueInvoice({
        identity: {
          tenantId: '22222222-2222-2222-2222-222222222222',
          series: SERIES,
          number: 2,
          issuedAt: new Date('2026-01-02'),
        },
        lines: lines(),
        previous: a,
      }),
    ).toThrow(/otro tenant/i);
  });

  it('la factura emitida es inmutable', () => {
    const a = issueInvoice({
      identity: { tenantId: TENANT, series: SERIES, number: 1, issuedAt: new Date('2026-01-01') },
      lines: lines(),
      previous: null,
    });
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.lines)).toBe(true);
  });
});

describe('verifyChain — detección de tampering', () => {
  it('detecta una factura con líneas modificadas', () => {
    const a = issueInvoice({
      identity: { tenantId: TENANT, series: SERIES, number: 1, issuedAt: new Date('2026-01-01') },
      lines: lines(),
      previous: null,
    });
    const b = issueInvoice({
      identity: { tenantId: TENANT, series: SERIES, number: 2, issuedAt: new Date('2026-01-02') },
      lines: lines(),
      previous: a,
    });

    // Fabricamos una factura "hackeada" sustituyendo las líneas pero
    // manteniendo el hash original.
    const tampered = {
      ...b,
      lines: [
        ...b.lines,
        {
          description: 'Línea pirata',
          quantity: 1,
          unitPrice: 100000,
          discount: 0,
          taxRegime: 'EXEMPT_HEALTHCARE' as const,
        },
      ],
    };

    expect(verifyChain([a, tampered])).toBe(1);
  });

  it('detecta una factura con prevHash incorrecto', () => {
    const a = issueInvoice({
      identity: { tenantId: TENANT, series: SERIES, number: 1, issuedAt: new Date('2026-01-01') },
      lines: lines(),
      previous: null,
    });
    const b = issueInvoice({
      identity: { tenantId: TENANT, series: SERIES, number: 2, issuedAt: new Date('2026-01-02') },
      lines: lines(),
      previous: a,
    });

    // Rompemos el enlace.
    const broken = { ...b, prevHash: 'deadbeef'.repeat(8) };

    expect(verifyChain([a, broken])).toBe(1);
  });
});

describe('computeHash — determinismo', () => {
  it('mismo contenido produce mismo hash', () => {
    const draft = {
      identity: { tenantId: TENANT, series: SERIES, number: 1, issuedAt: new Date('2026-01-01T10:00:00Z') },
      lines: lines(),
      subtotal: 33000,
      taxTotal: 5670,
      total: 38670,
      prevHash: null,
    };
    expect(computeHash(draft)).toBe(computeHash(draft));
  });
});
