import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { billing, fixedClock } from '@castellar/core';
import { makeRepositories, withTenant } from '../index.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const CLINIC = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER = 'a0000000-0000-0000-0000-000000000001';
const PATIENT = 'e0000000-0000-0000-0000-000000000001';
const TREATMENT = 't0000000-0000-0000-0000-000000000001';

let migrate: PrismaClient;
const NOW = new Date('2026-12-19T10:00:00Z');

beforeAll(async () => {
  migrate = new PrismaClient({ datasourceUrl: process.env.DATABASE_MIGRATE_URL });
});

beforeEach(async () => {
  await migrate.$executeRawUnsafe(`DELETE FROM payments`);
  await migrate.$executeRawUnsafe(`DELETE FROM invoice_lines`);
  await migrate.$executeRawUnsafe(`UPDATE budgets SET invoice_id = NULL`);
  await migrate.$executeRawUnsafe(`DELETE FROM invoices`);
  await migrate.$executeRawUnsafe(`DELETE FROM invoice_series`);
  await migrate.$executeRawUnsafe(`DELETE FROM budget_lines`);
  await migrate.$executeRawUnsafe(`DELETE FROM budgets`);
  await migrate.$executeRawUnsafe(`DELETE FROM treatments`);
  await migrate.$executeRawUnsafe(`DELETE FROM appointments`);
  await migrate.$executeRawUnsafe(`DELETE FROM patients`);
  await migrate.$executeRawUnsafe(`DELETE FROM users`);
  await migrate.$executeRawUnsafe(`DELETE FROM clinics`);
  await migrate.$executeRawUnsafe(`DELETE FROM tenants`);

  await migrate.tenant.create({ data: { id: TENANT, name: 'Demo' } });
  await migrate.clinic.create({
    data: { id: CLINIC, tenantId: TENANT, name: 'Sede', timezone: 'Europe/Madrid' },
  });
  await migrate.user.create({
    data: {
      id: USER,
      tenantId: TENANT,
      supabaseUserId: USER,
      email: 'owner@demo.test',
      role: 'OWNER',
      status: 'ACTIVE',
    },
  });
  await migrate.patient.create({
    data: {
      id: PATIENT,
      tenantId: TENANT,
      clinicId: CLINIC,
      code: 'P-INT-001',
      firstName: 'Lucía',
      lastName: 'Pérez',
      country: 'ES',
      marketingConsent: false,
    },
  });
  await migrate.treatment.create({
    data: {
      id: TREATMENT,
      tenantId: TENANT,
      code: 'OBT-1S',
      name: 'Obturación 1 superficie',
      defaultPrice: 6000,
      taxRegime: 'EXEMPT_HEALTHCARE',
      active: true,
    },
  });
  await migrate.invoiceSeries.create({
    data: { tenantId: TENANT, clinicId: CLINIC, code: '2026-A', lastNumber: 0 },
  });
});

afterAll(async () => {
  await migrate.$disconnect();
});

describe('billing / integración', () => {
  it('crea presupuesto, lo convierte a factura y registra cobros', async () => {
    let invoiceId = '';
    await withTenant(TENANT, async (tx) => {
      const repos = makeRepositories(tx, migrate);
      const clock = fixedClock(NOW);

      const create = billing.makeCreateBudgetUseCase({
        budgetRepo: repos.budgetRepo,
        audit: repos.audit,
        clock,
      });
      const accept = billing.makeAcceptBudgetUseCase({
        budgetRepo: repos.budgetRepo,
        audit: repos.audit,
        clock,
      });
      const convert = billing.makeConvertBudgetUseCase({
        budgetRepo: repos.budgetRepo,
        seriesRepo: repos.invoiceSeriesRepo,
        invoiceRepo: repos.invoiceRepo,
        audit: repos.audit,
        clock,
      });
      const register = billing.makeRegisterPaymentUseCase({
        invoiceRepo: repos.invoiceRepo,
        paymentRepo: repos.paymentRepo,
        audit: repos.audit,
      });

      const budget = await create({
        tenantId: TENANT,
        actorId: USER,
        actorRole: 'OWNER',
        ip: null,
        input: {
          clinicId: CLINIC,
          patientId: PATIENT,
          lines: [
            {
              treatmentId: TREATMENT,
              description: 'Obturación',
              quantity: 1,
              unitPrice: 6000,
              discount: 0,
              taxRegime: 'EXEMPT_HEALTHCARE',
            },
          ],
        },
      });
      expect(budget.total).toBe(6000);

      await accept({
        tenantId: TENANT,
        actorId: USER,
        actorRole: 'OWNER',
        ip: null,
        budgetId: budget.id,
      });
      const invoice = await convert({
        tenantId: TENANT,
        actorId: USER,
        actorRole: 'OWNER',
        ip: null,
        input: { budgetId: budget.id, seriesCode: '2026-A' },
      });
      expect(invoice.number).toBe(1);
      expect(invoice.internalHash).toMatch(/^[0-9a-f]{64}$/);
      expect(invoice.prevHash).toBeNull();
      invoiceId = invoice.id;

      await register({
        tenantId: TENANT,
        actorId: USER,
        actorRole: 'OWNER',
        ip: null,
        input: {
          invoiceId: invoice.id,
          method: 'CASH',
          amount: 3000,
          paidAt: NOW,
        },
      });
      await register({
        tenantId: TENANT,
        actorId: USER,
        actorRole: 'OWNER',
        ip: null,
        input: {
          invoiceId: invoice.id,
          method: 'TRANSFER',
          amount: 3000,
          paidAt: NOW,
        },
      });
    });

    const updated = await migrate.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(updated.paidTotal).toBe(6000);
    expect(updated.status).toBe('PAID');
  });

  it('numera correlativamente y encadena hash entre dos facturas', async () => {
    const hashes: string[] = [];
    for (let i = 0; i < 2; i++) {
      await withTenant(TENANT, async (tx) => {
        const repos = makeRepositories(tx, migrate);
        const clock = fixedClock(new Date(NOW.getTime() + i * 60_000));
        const create = billing.makeCreateBudgetUseCase({
          budgetRepo: repos.budgetRepo,
          audit: repos.audit,
          clock,
        });
        const accept = billing.makeAcceptBudgetUseCase({
          budgetRepo: repos.budgetRepo,
          audit: repos.audit,
          clock,
        });
        const convert = billing.makeConvertBudgetUseCase({
          budgetRepo: repos.budgetRepo,
          seriesRepo: repos.invoiceSeriesRepo,
          invoiceRepo: repos.invoiceRepo,
          audit: repos.audit,
          clock,
        });
        const b = await create({
          tenantId: TENANT,
          actorId: USER,
          actorRole: 'OWNER',
          ip: null,
          input: {
            clinicId: CLINIC,
            patientId: PATIENT,
            lines: [
              {
                description: 'Línea X',
                quantity: 1,
                unitPrice: 5000,
                discount: 0,
                taxRegime: 'EXEMPT_HEALTHCARE',
              },
            ],
          },
        });
        await accept({
          tenantId: TENANT,
          actorId: USER,
          actorRole: 'OWNER',
          ip: null,
          budgetId: b.id,
        });
        const inv = await convert({
          tenantId: TENANT,
          actorId: USER,
          actorRole: 'OWNER',
          ip: null,
          input: { budgetId: b.id, seriesCode: '2026-A' },
        });
        expect(inv.number).toBe(i + 1);
        hashes.push(inv.internalHash);
        if (i > 0) expect(inv.prevHash).toBe(hashes[i - 1]);
      });
    }
  });

  it('UPDATE de total en factura → trigger BD lo bloquea', async () => {
    let invId = '';
    await withTenant(TENANT, async (tx) => {
      const repos = makeRepositories(tx, migrate);
      const clock = fixedClock(NOW);
      const c = billing.makeCreateBudgetUseCase({
        budgetRepo: repos.budgetRepo,
        audit: repos.audit,
        clock,
      });
      const a = billing.makeAcceptBudgetUseCase({
        budgetRepo: repos.budgetRepo,
        audit: repos.audit,
        clock,
      });
      const cv = billing.makeConvertBudgetUseCase({
        budgetRepo: repos.budgetRepo,
        seriesRepo: repos.invoiceSeriesRepo,
        invoiceRepo: repos.invoiceRepo,
        audit: repos.audit,
        clock,
      });
      const b = await c({
        tenantId: TENANT,
        actorId: USER,
        actorRole: 'OWNER',
        ip: null,
        input: {
          clinicId: CLINIC,
          patientId: PATIENT,
          lines: [
            {
              description: 'X',
              quantity: 1,
              unitPrice: 1000,
              discount: 0,
              taxRegime: 'EXEMPT_HEALTHCARE',
            },
          ],
        },
      });
      await a({
        tenantId: TENANT,
        actorId: USER,
        actorRole: 'OWNER',
        ip: null,
        budgetId: b.id,
      });
      const i = await cv({
        tenantId: TENANT,
        actorId: USER,
        actorRole: 'OWNER',
        ip: null,
        input: { budgetId: b.id, seriesCode: '2026-A' },
      });
      invId = i.id;
    });

    await expect(
      migrate.invoice.update({ where: { id: invId }, data: { total: 999_999 } }),
    ).rejects.toThrow(/immutable/i);
  });

  it('void crea rectificativa con totales en negativo y marca original VOIDED', async () => {
    let originalId = '';
    let rectId = '';
    await withTenant(TENANT, async (tx) => {
      const repos = makeRepositories(tx, migrate);
      const clock = fixedClock(NOW);
      const c = billing.makeCreateBudgetUseCase({
        budgetRepo: repos.budgetRepo,
        audit: repos.audit,
        clock,
      });
      const a = billing.makeAcceptBudgetUseCase({
        budgetRepo: repos.budgetRepo,
        audit: repos.audit,
        clock,
      });
      const cv = billing.makeConvertBudgetUseCase({
        budgetRepo: repos.budgetRepo,
        seriesRepo: repos.invoiceSeriesRepo,
        invoiceRepo: repos.invoiceRepo,
        audit: repos.audit,
        clock,
      });
      const v = billing.makeVoidInvoiceUseCase({
        invoiceRepo: repos.invoiceRepo,
        seriesRepo: repos.invoiceSeriesRepo,
        paymentRepo: repos.paymentRepo,
        audit: repos.audit,
        clock,
      });
      const b = await c({
        tenantId: TENANT,
        actorId: USER,
        actorRole: 'OWNER',
        ip: null,
        input: {
          clinicId: CLINIC,
          patientId: PATIENT,
          lines: [
            {
              description: 'Implante',
              quantity: 1,
              unitPrice: 80000,
              discount: 0,
              taxRegime: 'EXEMPT_HEALTHCARE',
            },
          ],
        },
      });
      await a({
        tenantId: TENANT,
        actorId: USER,
        actorRole: 'OWNER',
        ip: null,
        budgetId: b.id,
      });
      const orig = await cv({
        tenantId: TENANT,
        actorId: USER,
        actorRole: 'OWNER',
        ip: null,
        input: { budgetId: b.id, seriesCode: '2026-A' },
      });
      originalId = orig.id;
      const rect = await v({
        tenantId: TENANT,
        actorId: USER,
        actorRole: 'OWNER',
        ip: null,
        input: { invoiceId: orig.id, reason: 'Cliente cancela' },
      });
      rectId = rect.id;
      expect(rect.total).toBe(-orig.total);
      expect(rect.kind).toBe('RECTIFICATIVE');
      expect(rect.rectifiesId).toBe(orig.id);
    });

    const original = await migrate.invoice.findUniqueOrThrow({ where: { id: originalId } });
    expect(original.status).toBe('VOIDED');
    const rect = await migrate.invoice.findUniqueOrThrow({ where: { id: rectId } });
    expect(rect.number).toBe(original.number + 1);
  });

  it('aísla facturas entre tenants', async () => {
    await migrate.tenant.create({ data: { id: '22222222-2222-2222-2222-222222222222', name: 'B' } });

    await withTenant(TENANT, async (tx) => {
      const repos = makeRepositories(tx, migrate);
      const clock = fixedClock(NOW);
      const c = billing.makeCreateBudgetUseCase({
        budgetRepo: repos.budgetRepo,
        audit: repos.audit,
        clock,
      });
      const a = billing.makeAcceptBudgetUseCase({
        budgetRepo: repos.budgetRepo,
        audit: repos.audit,
        clock,
      });
      const cv = billing.makeConvertBudgetUseCase({
        budgetRepo: repos.budgetRepo,
        seriesRepo: repos.invoiceSeriesRepo,
        invoiceRepo: repos.invoiceRepo,
        audit: repos.audit,
        clock,
      });
      const b = await c({
        tenantId: TENANT,
        actorId: USER,
        actorRole: 'OWNER',
        ip: null,
        input: {
          clinicId: CLINIC,
          patientId: PATIENT,
          lines: [
            {
              description: 'X',
              quantity: 1,
              unitPrice: 1000,
              discount: 0,
              taxRegime: 'EXEMPT_HEALTHCARE',
            },
          ],
        },
      });
      await a({
        tenantId: TENANT,
        actorId: USER,
        actorRole: 'OWNER',
        ip: null,
        budgetId: b.id,
      });
      await cv({
        tenantId: TENANT,
        actorId: USER,
        actorRole: 'OWNER',
        ip: null,
        input: { budgetId: b.id, seriesCode: '2026-A' },
      });
    });

    await withTenant('22222222-2222-2222-2222-222222222222', async (tx) => {
      const repos = makeRepositories(tx, migrate);
      const list = await repos.invoiceRepo.list({ limit: 10 });
      expect(list).toHaveLength(0);
    });
  });
});
