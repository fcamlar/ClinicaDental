import { initTRPC, TRPCError } from '@trpc/server';
import type { TrpcContext } from './context.js';

/**
 * Inicialización compartida de tRPC con tipado del contexto.
 *
 * `t.router`, `t.procedure` y los middlewares se exportan para que `apps/api`
 * (NestJS) y `apps/web` (Next.js, server-side caller) los usen.
 */
const t = initTRPC.context<TrpcContext>().create();

export const router = t.router;
export const middleware = t.middleware;
export const publicProcedure = t.procedure;

/**
 * Middleware: exige usuario autenticado y tenant activo.
 */
const isAuthed = middleware(({ ctx, next }) => {
  if (!ctx.user || !ctx.tenantId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      tenantId: ctx.tenantId,
    },
  });
});

export const protectedProcedure = publicProcedure.use(isAuthed);

/**
 * Procedure que adicionalmente exige MFA enrolado para los roles que lo
 * requieren. Lo usamos en endpoints clínicos (Sprint 4) y administrativos
 * sensibles. Mientras la UI guía al usuario al enrolamiento, los endpoints
 * básicos (me, markMfaEnrolled) usan `protectedProcedure`.
 */
const mfaEnforced = middleware(async ({ ctx, next }) => {
  if (!ctx.user || !ctx.tenantId) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  // Roles que NO exigen MFA (RECEPTION y ACCOUNTING).
  const MFA_REQUIRED: Array<NonNullable<TrpcContext['user']>['role']> = [
    'OWNER',
    'ADMIN_CLINIC',
    'DENTIST',
    'HYGIENIST',
  ];
  if (!MFA_REQUIRED.includes(ctx.user.role)) {
    return next({ ctx });
  }
  const status = await ctx.services.inTenant(async (deps) => deps.securityRepo.get(ctx.user!.id));
  if (status?.mfaRequired && !status.mfaEnrolledAt) {
    throw new TRPCError({
      code: 'PRECONDITION_FAILED',
      message: 'MFA_ENROLLMENT_REQUIRED',
    });
  }
  return next({ ctx });
});

export const mfaProtectedProcedure = publicProcedure.use(isAuthed).use(mfaEnforced);

/**
 * Helper para requerir un rol específico.
 *
 *   const ownerOnly = requireRole(['OWNER', 'ADMIN_CLINIC']);
 *   router({ dangerous: ownerOnly.mutation(...) });
 */
export function requireRole(roles: Array<NonNullable<TrpcContext['user']>['role']>) {
  return protectedProcedure.use(({ ctx, next }) => {
    if (!roles.includes(ctx.user.role)) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }
    return next({ ctx });
  });
}
