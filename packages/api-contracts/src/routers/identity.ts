import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { identity } from '@castellar/core';
import { middleware, protectedProcedure, publicProcedure, router } from '../trpc.js';
import type { DomainError } from '@castellar/core';

/**
 * Convierte un DomainError en TRPCError, preservando el código.
 */
function domainError(err: unknown): TRPCError {
  const code = (err as DomainError | undefined)?.code;
  const message = err instanceof Error ? err.message : 'Error de dominio';
  switch (code) {
    case 'NOT_FOUND':
      return new TRPCError({ code: 'NOT_FOUND', message });
    case 'CONFLICT':
      return new TRPCError({ code: 'CONFLICT', message });
    case 'FORBIDDEN':
      return new TRPCError({ code: 'FORBIDDEN', message });
    case 'BAD_REQUEST':
      return new TRPCError({ code: 'BAD_REQUEST', message });
    case 'UNAUTHORIZED':
      return new TRPCError({ code: 'UNAUTHORIZED', message });
    case 'PRECONDITION_FAILED':
      return new TRPCError({ code: 'PRECONDITION_FAILED', message });
    default:
      return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message });
  }
}

/**
 * Wrapper para invocar casos de uso y mapear sus errores.
 */
async function runUseCase<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (
      err instanceof Error &&
      typeof (err as DomainError).code === 'string' &&
      // Distinguimos errores del dominio del resto.
      [
        'NOT_FOUND',
        'CONFLICT',
        'FORBIDDEN',
        'BAD_REQUEST',
        'UNAUTHORIZED',
        'PRECONDITION_FAILED',
      ].includes((err as DomainError).code)
    ) {
      throw domainError(err);
    }
    throw err;
  }
}

/**
 * Guard: exige que el rol del usuario esté en `allowed`.
 */
function requireRole(allowed: identity.Role[]) {
  return middleware(({ ctx, next }) => {
    if (!ctx.user || !allowed.includes(ctx.user.role)) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return next({ ctx });
  });
}

const ownerOrAdmin = protectedProcedure.use(requireRole(['OWNER', 'ADMIN_CLINIC']));

export const identityRouter = router({
  // -------- Onboarding (público) ------------------------------------------
  /**
   * Crea un tenant + owner. Llamado por la página de onboarding tras el
   * registro en Supabase Auth (el cliente envía su supabaseUserId).
   */
  createTenant: publicProcedure
    .input(identity.createTenantInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.asPublic((deps) => {
          const useCase = identity.makeCreateTenantUseCase({
            tenantRepo: deps.tenantRepo,
            clinicRepo: deps.clinicRepo,
            memberRepo: deps.memberRepo,
            securityRepo: deps.securityRepo,
            audit: deps.audit,
            clock: ctx.services.clock,
          });
          return useCase(input, ctx.ip);
        }),
      );
    }),

  acceptInvitation: publicProcedure
    .input(identity.acceptInvitationInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.asPublic((deps) => {
          const useCase = identity.makeAcceptInvitationUseCase({
            invitationRepo: deps.invitationRepo,
            userRepo: deps.userRepo,
            audit: deps.audit,
            clock: ctx.services.clock,
          });
          return useCase(input, ctx.ip);
        }),
      );
    }),

  // -------- Sesión actual --------------------------------------------------
  me: protectedProcedure.query(async ({ ctx }) => {
    return ctx.services.inTenant(async (deps) => {
      const user = await deps.userRepo.findById(ctx.user.id);
      if (!user) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Usuario no encontrado' });
      }
      const security = await deps.securityRepo.get(user.id);
      const clinics = await deps.memberRepo.listForUser(user.id);
      return {
        id: user.id,
        email: user.email,
        role: user.role,
        status: user.status,
        mfaRequired: security?.mfaRequired ?? false,
        mfaEnrolled: security?.mfaEnrolledAt !== null && security?.mfaEnrolledAt !== undefined,
        clinics: clinics.map((c) => ({ clinicId: c.clinicId, role: c.role })),
      };
    });
  }),

  // -------- Usuarios -------------------------------------------------------
  listUsers: ownerOrAdmin.query(async ({ ctx }) => {
    return ctx.services.inTenant(async (deps) => {
      const users = await deps.userRepo.list();
      return users.map((u) => ({
        id: u.id,
        email: u.email,
        role: u.role,
        status: u.status,
        createdAt: u.createdAt,
      }));
    });
  }),

  inviteUser: ownerOrAdmin
    .input(identity.inviteUserInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const tenant = await deps.tenantRepo.findById(ctx.tenantId!);
          if (!tenant) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Tenant no encontrado' });
          }
          const useCase = identity.makeInviteUserUseCase({
            userRepo: deps.userRepo,
            invitationRepo: deps.invitationRepo,
            securityRepo: deps.securityRepo,
            audit: deps.audit,
            supabase: deps.supabase,
            mailer: deps.mailer,
            clock: ctx.services.clock,
            tokens: ctx.services.tokens,
            acceptUrlFor: ctx.services.acceptUrlFor,
          });
          const { user, invitation } = await useCase({
            tenantId: ctx.tenantId!,
            actorId: ctx.user!.id,
            actorEmail: ctx.user!.email,
            actorRole: ctx.user!.role,
            tenantName: tenant.name,
            input,
            ip: ctx.ip,
          });
          return {
            user: { id: user.id, email: user.email, role: user.role, status: user.status },
            invitationExpiresAt: invitation.expiresAt,
          };
        }),
      );
    }),

  // -------- Clínicas -------------------------------------------------------
  listClinics: protectedProcedure.query(async ({ ctx }) => {
    return ctx.services.inTenant(async (deps) => {
      const clinics = await deps.clinicRepo.list();
      return clinics.map((c) => ({
        id: c.id,
        name: c.name,
        address: c.address,
        timezone: c.timezone,
      }));
    });
  }),

  createClinic: ownerOrAdmin
    .input(identity.createClinicInput)
    .mutation(async ({ ctx, input }) => {
      return runUseCase(() =>
        ctx.services.inTenant(async (deps) => {
          const useCase = identity.makeCreateClinicUseCase({
            clinicRepo: deps.clinicRepo,
            memberRepo: deps.memberRepo,
            audit: deps.audit,
          });
          return useCase({
            tenantId: ctx.tenantId!,
            actorId: ctx.user!.id,
            actorRole: ctx.user!.role,
            input,
            ip: ctx.ip,
          });
        }),
      );
    }),

  // -------- Auditoría ------------------------------------------------------
  listAudit: ownerOrAdmin
    .input(
      z.object({
        resourceType: z.string().optional(),
        resourceId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(100).default(50),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return ctx.services.inTenant((deps) =>
        deps.audit.list({
          resourceType: input.resourceType,
          resourceId: input.resourceId,
          limit: input.limit,
          cursor: input.cursor,
        }),
      );
    }),

  // -------- MFA ------------------------------------------------------------
  /**
   * Marca el enrolamiento MFA como completado. Lo llama la UI cuando
   * Supabase Auth confirma `verifyTotp`.
   */
  markMfaEnrolled: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.services.inTenant(async (deps) => {
      await deps.securityRepo.markMfaEnrolled(ctx.user.id, ctx.services.clock.now());
      await deps.audit.write({
        tenantId: ctx.tenantId,
        actorId: ctx.user.id,
        action: 'user.mfa_enrolled',
        resourceType: 'user',
        resourceId: ctx.user.id,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        reason: null,
        diff: null,
      });
    });
    return { ok: true };
  }),
});
