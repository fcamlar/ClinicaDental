import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { patients } from '@castellar/core';
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

export const patientsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(100).default(50),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.services.inTenant(async (deps) => deps.patientRepo.list(input));
    }),

  search: protectedProcedure
    .input(patients.searchPatientsInput)
    .query(async ({ ctx, input }) => {
      return ctx.services.inTenant(async (deps) =>
        patients.makeSearchPatientsUseCase({ patientRepo: deps.patientRepo })(input),
      );
    }),

  /**
   * Lee la ficha completa de un paciente. EXIGE `reason` no vacío y deja
   * entrada de auditoría `patient.read`.
   */
  get: protectedProcedure
    .input(patients.getPatientInput)
    .query(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = patients.makeGetPatientUseCase({
            patientRepo: deps.patientRepo,
            alertRepo: deps.alertRepo,
            consentRepo: deps.consentRepo,
            fileRepo: deps.fileRepo,
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

  create: protectedProcedure
    .input(patients.createPatientInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = patients.makeCreatePatientUseCase({
            patientRepo: deps.patientRepo,
            consentRepo: deps.consentRepo,
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

  update: protectedProcedure
    .input(patients.updatePatientInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = patients.makeUpdatePatientUseCase({
            patientRepo: deps.patientRepo,
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

  delete: protectedProcedure
    .input(z.object({ patientId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = patients.makeSoftDeletePatientUseCase({
            patientRepo: deps.patientRepo,
            audit: deps.audit,
            clock: ctx.services.clock,
          });
          await useCase({
            tenantId: ctx.tenantId,
            actorId: ctx.user.id,
            actorRole: ctx.user.role,
            patientId: input.patientId,
            ip: ctx.ip,
          });
          return { ok: true };
        }),
      );
    }),

  signConsent: protectedProcedure
    .input(patients.signConsentInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = patients.makeSignConsentUseCase({
            consentRepo: deps.consentRepo,
            patientRepo: deps.patientRepo,
            audit: deps.audit,
            clock: ctx.services.clock,
          });
          return useCase({
            tenantId: ctx.tenantId,
            actorId: ctx.user.id,
            input,
            ip: ctx.ip,
          });
        }),
      );
    }),

  addAlert: protectedProcedure
    .input(patients.addMedicalAlertInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = patients.makeAddMedicalAlertUseCase({
            alertRepo: deps.alertRepo,
            patientRepo: deps.patientRepo,
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

  resolveAlert: protectedProcedure
    .input(z.object({ alertId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.services.inTenant(async (deps) => {
        await deps.alertRepo.resolve(input.alertId, ctx.services.clock.now());
        return { ok: true };
      });
    }),

  /**
   * Export RGPD del paciente (ARSULIPO — derecho de acceso y portabilidad).
   * Devuelve un JSON con todas las áreas asociadas al paciente y deja
   * entrada de auditoría con el motivo.
   */
  exportData: protectedProcedure
    .input(patients.exportPatientDataInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = patients.makeExportPatientDataUseCase({
            patientRepo: deps.patientRepo,
            aggregator: deps.patientExportAggregator,
            audit: deps.audit,
            clock: ctx.services.clock,
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

  importCsv: protectedProcedure
    .input(patients.importPatientsCsvInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = patients.makeImportPatientsCsvUseCase({
            patientRepo: deps.patientRepo,
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
});
