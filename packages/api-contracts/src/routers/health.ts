import { z } from 'zod';
import { protectedProcedure, router } from '../trpc.js';

/**
 * Router de salud / diagnóstico — útil como mini-spike e2e:
 * verifica que el contexto del tenant llega correctamente al procedure.
 */
export const healthRouter = router({
  ping: protectedProcedure.query(({ ctx }) => ({
    ok: true,
    tenantId: ctx.tenantId,
    userId: ctx.user.id,
    serverTime: new Date().toISOString(),
  })),

  echo: protectedProcedure
    .input(z.object({ message: z.string().min(1).max(280) }))
    .mutation(({ input, ctx }) => ({
      echoed: input.message,
      tenantId: ctx.tenantId,
    })),
});
