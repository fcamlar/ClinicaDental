import { TRPCError } from '@trpc/server';
import { clinical } from '@castellar/core';
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

export const clinicalRouter = router({
  startVisit: protectedProcedure
    .input(clinical.startVisitInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = clinical.makeStartVisitUseCase({
            recordRepo: deps.clinicalRecordRepo,
            visitRepo: deps.visitRepo,
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

  closeVisit: protectedProcedure
    .input(clinical.closeVisitInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = clinical.makeCloseVisitUseCase({
            visitRepo: deps.visitRepo,
            noteRepo: deps.noteRepo,
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

  addNote: protectedProcedure
    .input(clinical.addNoteInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = clinical.makeAddNoteUseCase({
            recordRepo: deps.clinicalRecordRepo,
            visitRepo: deps.visitRepo,
            noteRepo: deps.noteRepo,
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

  editNote: protectedProcedure
    .input(clinical.editNoteInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = clinical.makeEditNoteUseCase({
            noteRepo: deps.noteRepo,
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

  addAddendum: protectedProcedure
    .input(clinical.addAddendumInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = clinical.makeAddAddendumUseCase({
            noteRepo: deps.noteRepo,
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

  saveOdontogram: protectedProcedure
    .input(clinical.saveOdontogramInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = clinical.makeSaveOdontogramUseCase({
            visitRepo: deps.visitRepo,
            odontogramRepo: deps.odontogramRepo,
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

  getVisit: protectedProcedure
    .input(clinical.getVisitInput)
    .query(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = clinical.makeGetVisitUseCase({
            visitRepo: deps.visitRepo,
            noteRepo: deps.noteRepo,
            odontogramRepo: deps.odontogramRepo,
            audit: deps.audit,
          });
          return useCase({
            tenantId: ctx.tenantId,
            actorId: ctx.user.id,
            actorRole: ctx.user.role,
            input,
            ip: ctx.ip,
            userAgent: ctx.userAgent,
          });
        }),
      );
    }),

  listVisits: protectedProcedure
    .input(clinical.listVisitsInput)
    .query(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = clinical.makeListVisitsUseCase({
            recordRepo: deps.clinicalRecordRepo,
            visitRepo: deps.visitRepo,
            audit: deps.audit,
          });
          return useCase({
            tenantId: ctx.tenantId,
            actorId: ctx.user.id,
            actorRole: ctx.user.role,
            input,
            ip: ctx.ip,
            userAgent: ctx.userAgent,
          });
        }),
      );
    }),
});
