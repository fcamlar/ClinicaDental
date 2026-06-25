import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { catalog } from '@castellar/core';
import { protectedProcedure, router } from '../trpc.js';
import type { DomainError } from '@castellar/core';

const DOMAIN_CODES = [
  'NOT_FOUND',
  'CONFLICT',
  'FORBIDDEN',
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'PRECONDITION_FAILED',
] as const;

function isDomainError(err: unknown): err is DomainError {
  return (
    err instanceof Error &&
    typeof (err as DomainError).code === 'string' &&
    DOMAIN_CODES.includes((err as DomainError).code as (typeof DOMAIN_CODES)[number])
  );
}

async function runUseCase<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (isDomainError(err)) {
      throw new TRPCError({ code: err.code as (typeof DOMAIN_CODES)[number], message: err.message });
    }
    throw err;
  }
}

export const catalogRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          activeOnly: z.boolean().optional(),
          category: z.string().optional(),
          query: z.string().optional(),
        })
        .default({}),
    )
    .query(async ({ ctx, input }) => {
      return ctx.services.inTenant(async (deps) =>
        catalog.makeListTreatmentsUseCase({ treatmentRepo: deps.treatmentRepo })(input),
      );
    }),

  create: protectedProcedure
    .input(catalog.createTreatmentInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = catalog.makeCreateTreatmentUseCase({
            treatmentRepo: deps.treatmentRepo,
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

  update: protectedProcedure
    .input(catalog.updateTreatmentInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = catalog.makeUpdateTreatmentUseCase({
            treatmentRepo: deps.treatmentRepo,
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
