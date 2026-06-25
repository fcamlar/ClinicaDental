import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { billing } from '@castellar/core';
import type { DomainError } from '@castellar/core';
import { protectedProcedure, router } from '../trpc.js';

const DOMAIN_CODES = [
  'NOT_FOUND',
  'CONFLICT',
  'FORBIDDEN',
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'PRECONDITION_FAILED',
] as const;
type DomainCode = (typeof DOMAIN_CODES)[number];

function isDomainError(err: unknown): err is DomainError {
  return (
    err instanceof Error &&
    typeof (err as DomainError).code === 'string' &&
    DOMAIN_CODES.includes((err as DomainError).code as DomainCode)
  );
}

async function runUseCase<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isDomainError(err)) {
      throw new TRPCError({ code: err.code as DomainCode, message: err.message });
    }
    throw err;
  }
}

export const billingRouter = router({
  // -------- Budgets ------------------------------------------------------
  listBudgets: protectedProcedure
    .input(
      z.object({
        patientId: z.string().uuid().optional(),
        status: z
          .enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED'])
          .optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.services.inTenant((deps) => deps.budgetRepo.list(input));
    }),

  getBudget: protectedProcedure
    .input(z.object({ budgetId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.services.inTenant(async (deps) => {
        const b = await deps.budgetRepo.findById(input.budgetId);
        if (!b) throw new TRPCError({ code: 'NOT_FOUND' });
        return b;
      });
    }),

  createBudget: protectedProcedure
    .input(billing.createBudgetInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = billing.makeCreateBudgetUseCase({
            budgetRepo: deps.budgetRepo,
            audit: deps.audit,
            clock: ctx.services.clock,
          });
          return useCase({
            tenantId: ctx.tenantId,
            actorId: ctx.user.id,
            actorRole: ctx.user.role,
            input,
            ip: ctx.ip,
          });
        }),
      );
    }),

  updateBudgetLines: protectedProcedure
    .input(billing.updateBudgetLinesInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = billing.makeUpdateBudgetLinesUseCase({
            budgetRepo: deps.budgetRepo,
            audit: deps.audit,
          });
          return useCase({
            tenantId: ctx.tenantId,
            actorId: ctx.user.id,
            actorRole: ctx.user.role,
            input,
            ip: ctx.ip,
          });
        }),
      );
    }),

  sendBudget: protectedProcedure
    .input(billing.sendBudgetInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = billing.makeSendBudgetUseCase({
            budgetRepo: deps.budgetRepo,
            audit: deps.audit,
            clock: ctx.services.clock,
          });
          return useCase({
            tenantId: ctx.tenantId,
            actorId: ctx.user.id,
            actorRole: ctx.user.role,
            budgetId: input.budgetId,
            ip: ctx.ip,
          });
        }),
      );
    }),

  acceptBudget: protectedProcedure
    .input(billing.acceptBudgetInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = billing.makeAcceptBudgetUseCase({
            budgetRepo: deps.budgetRepo,
            audit: deps.audit,
            clock: ctx.services.clock,
          });
          return useCase({
            tenantId: ctx.tenantId,
            actorId: ctx.user.id,
            actorRole: ctx.user.role,
            budgetId: input.budgetId,
            ip: ctx.ip,
          });
        }),
      );
    }),

  rejectBudget: protectedProcedure
    .input(billing.rejectBudgetInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = billing.makeRejectBudgetUseCase({
            budgetRepo: deps.budgetRepo,
            audit: deps.audit,
            clock: ctx.services.clock,
          });
          return useCase({
            tenantId: ctx.tenantId,
            actorId: ctx.user.id,
            actorRole: ctx.user.role,
            budgetId: input.budgetId,
            ip: ctx.ip,
          });
        }),
      );
    }),

  convertBudget: protectedProcedure
    .input(billing.convertBudgetInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = billing.makeConvertBudgetUseCase({
            budgetRepo: deps.budgetRepo,
            seriesRepo: deps.invoiceSeriesRepo,
            invoiceRepo: deps.invoiceRepo,
            audit: deps.audit,
            clock: ctx.services.clock,
          });
          return useCase({
            tenantId: ctx.tenantId,
            actorId: ctx.user.id,
            actorRole: ctx.user.role,
            input,
            ip: ctx.ip,
          });
        }),
      );
    }),

  // -------- Invoices -----------------------------------------------------
  listInvoices: protectedProcedure
    .input(
      z.object({
        patientId: z.string().uuid().optional(),
        seriesId: z.string().uuid().optional(),
        fromDate: z.coerce.date().optional(),
        toDate: z.coerce.date().optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.services.inTenant((deps) => deps.invoiceRepo.list(input));
    }),

  getInvoice: protectedProcedure
    .input(z.object({ invoiceId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.services.inTenant(async (deps) => {
        const i = await deps.invoiceRepo.findById(input.invoiceId);
        if (!i) throw new TRPCError({ code: 'NOT_FOUND' });
        const payments = await deps.paymentRepo.listForInvoice(i.id);
        return { ...i, payments };
      });
    }),

  voidInvoice: protectedProcedure
    .input(billing.voidInvoiceInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = billing.makeVoidInvoiceUseCase({
            invoiceRepo: deps.invoiceRepo,
            seriesRepo: deps.invoiceSeriesRepo,
            paymentRepo: deps.paymentRepo,
            audit: deps.audit,
            clock: ctx.services.clock,
          });
          return useCase({
            tenantId: ctx.tenantId,
            actorId: ctx.user.id,
            actorRole: ctx.user.role,
            input,
            ip: ctx.ip,
          });
        }),
      );
    }),

  // -------- Series -------------------------------------------------------
  listSeries: protectedProcedure.query(async ({ ctx }) => {
    return ctx.services.inTenant(async (deps) => {
      // No hay método dedicado en el puerto; reutilizamos invoiceSeriesRepo via raw.
      const def = await deps.invoiceSeriesRepo.ensureDefault({
        tenantId: ctx.tenantId,
        clinicId: null,
        code: `${new Date().getUTCFullYear()}-A`,
      });
      return [def];
    });
  }),

  // -------- Payments -----------------------------------------------------
  registerPayment: protectedProcedure
    .input(billing.registerPaymentInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = billing.makeRegisterPaymentUseCase({
            invoiceRepo: deps.invoiceRepo,
            paymentRepo: deps.paymentRepo,
            audit: deps.audit,
          });
          return useCase({
            tenantId: ctx.tenantId,
            actorId: ctx.user.id,
            actorRole: ctx.user.role,
            input,
            ip: ctx.ip,
          });
        }),
      );
    }),
});
