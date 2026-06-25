import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { scheduling } from '@castellar/core';
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

export const schedulingRouter = router({
  /** Lista de profesionales del tenant. */
  listProfessionals: protectedProcedure.query(async ({ ctx }) => {
    return ctx.services.inTenant((deps) => deps.professionalRepo.listForClinic(''));
  }),

  /** Lista de salas de una sede. */
  listRooms: protectedProcedure
    .input(z.object({ clinicId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.services.inTenant((deps) => deps.roomRepo.listForClinic(input.clinicId));
    }),

  /** Horario laboral de un profesional en una sede. */
  workingHours: protectedProcedure
    .input(z.object({ professionalId: z.string().uuid(), clinicId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.services.inTenant((deps) =>
        deps.workingHoursRepo.listFor(input.professionalId, input.clinicId),
      );
    }),

  /** Listado de agenda en rango — vista de calendario. */
  listAgenda: protectedProcedure
    .input(scheduling.listAgendaInput)
    .query(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = scheduling.makeListAgendaUseCase({
            appointmentRepo: deps.appointmentRepo,
          });
          return useCase(input);
        }),
      );
    }),

  create: protectedProcedure
    .input(scheduling.createAppointmentInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = scheduling.makeCreateAppointmentUseCase({
            appointmentRepo: deps.appointmentRepo,
            professionalRepo: deps.professionalRepo,
            workingHoursRepo: deps.workingHoursRepo,
            exceptionsRepo: deps.availabilityRepo,
            audit: deps.audit,
            resolveTimezone: deps.resolveTimezone,
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

  reschedule: protectedProcedure
    .input(scheduling.rescheduleAppointmentInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = scheduling.makeRescheduleAppointmentUseCase({
            appointmentRepo: deps.appointmentRepo,
            workingHoursRepo: deps.workingHoursRepo,
            exceptionsRepo: deps.availabilityRepo,
            audit: deps.audit,
            resolveTimezone: deps.resolveTimezone,
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

  changeStatus: protectedProcedure
    .input(scheduling.changeStatusInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = scheduling.makeChangeStatusUseCase({
            appointmentRepo: deps.appointmentRepo,
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
