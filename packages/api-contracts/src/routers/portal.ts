import { TRPCError } from '@trpc/server';
import { portal } from '@castellar/core';
import type { DomainError } from '@castellar/core';
import { protectedProcedure, publicProcedure, router } from '../trpc.js';

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

export const portalRouter = router({
  /**
   * Back-office: emitir enlace de acceso al portal para un paciente.
   */
  issueLink: protectedProcedure
    .input(portal.issuePortalLinkInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const tenant = await deps.tenantRepo.findById(ctx.tenantId);
          const useCase = portal.makeIssuePortalLinkUseCase({
            patientRepo: deps.patientRepo,
            tokenRepo: deps.portalTokenRepo,
            mailer: deps.portalMailer,
            audit: deps.audit,
            tokens: ctx.services.tokens,
            clock: ctx.services.clock,
            portalUrlFor: (token) =>
              `${ctx.services.appUrl}/portal/access?token=${encodeURIComponent(token)}`,
            clinicName: tenant?.name ?? 'Castellar',
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

  /**
   * Portal público: canjea el token por una sesión.
   * El cliente recibe { tenantId, patientId, validUntil } y los pasa en
   * el header `x-portal-session` (firmado por el servidor en una versión
   * más completa; aquí los exponemos directos en MVP).
   */
  exchangeToken: publicProcedure
    .input(portal.exchangePortalTokenInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.asPublic(async (deps) => {
          const useCase = portal.makeExchangePortalTokenUseCase({
            tokenRepo: deps.portalTokenRepo,
            audit: deps.audit,
            clock: ctx.services.clock,
          });
          return useCase({ input, ip: ctx.ip });
        }),
      );
    }),

  /**
   * Portal: ver mis datos. Recibe la sesión en cabecera para evitar
   * exponer datos de otro paciente.
   *
   * Para v0 mantenemos sencillo: el cliente envía tenantId+patientId
   * como input firmado por la API tras exchangeToken. Sprint 7+ pasará
   * a una cookie HTTP-only.
   */
  myProfile: publicProcedure
    .input(portal.exchangePortalTokenInput) // reutilizamos: cliente envía el token cada vez
    .query(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.asPublic(async (deps) => {
          const exchange = portal.makeExchangePortalTokenUseCase({
            tokenRepo: deps.portalTokenRepo,
            audit: deps.audit,
            clock: ctx.services.clock,
          });
          const session = await exchange({ input, ip: ctx.ip });
          const useCase = portal.makeMyProfileUseCase({ patientRepo: deps.patientRepo });
          return useCase(session);
        }),
      );
    }),

  myAppointments: publicProcedure
    .input(portal.exchangePortalTokenInput)
    .query(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.asPublic(async (deps) => {
          const exchange = portal.makeExchangePortalTokenUseCase({
            tokenRepo: deps.portalTokenRepo,
            audit: deps.audit,
            clock: ctx.services.clock,
          });
          const session = await exchange({ input, ip: ctx.ip });
          const useCase = portal.makeMyUpcomingAppointmentsUseCase({
            appointmentRepo: deps.appointmentRepo,
            clock: ctx.services.clock,
          });
          return useCase(session);
        }),
      );
    }),

  myInvoices: publicProcedure
    .input(portal.exchangePortalTokenInput)
    .query(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.asPublic(async (deps) => {
          const exchange = portal.makeExchangePortalTokenUseCase({
            tokenRepo: deps.portalTokenRepo,
            audit: deps.audit,
            clock: ctx.services.clock,
          });
          const session = await exchange({ input, ip: ctx.ip });
          const useCase = portal.makeMyInvoicesUseCase({ invoiceRepo: deps.invoiceRepo });
          return useCase(session);
        }),
      );
    }),
});
