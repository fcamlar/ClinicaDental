import { analytics } from '@castellar/core';
import { protectedProcedure, router } from '../trpc.js';

export const dashboardRouter = router({
  summary: protectedProcedure.query(async ({ ctx }) => {
    return ctx.services.inTenant(async (deps) => {
      const useCase = analytics.makeGetSummaryUseCase({
        analyticsRepo: deps.analyticsRepo,
        clock: ctx.services.clock,
      });
      return useCase({ actorRole: ctx.user.role });
    });
  }),

  todayAgenda: protectedProcedure
    .input(analytics.getTodayAgendaInput)
    .query(async ({ ctx, input }) => {
      return ctx.services.inTenant(async (deps) => {
        const useCase = analytics.makeGetTodayAgendaUseCase({
          analyticsRepo: deps.analyticsRepo,
          clock: ctx.services.clock,
        });
        return useCase({ actorRole: ctx.user.role, limit: input.limit });
      });
    }),

  recentInvoices: protectedProcedure
    .input(analytics.getRecentInvoicesInput)
    .query(async ({ ctx, input }) => {
      return ctx.services.inTenant(async (deps) => {
        const useCase = analytics.makeGetRecentInvoicesUseCase({
          analyticsRepo: deps.analyticsRepo,
        });
        return useCase({ actorRole: ctx.user.role, limit: input.limit });
      });
    }),

  pendingInvoices: protectedProcedure
    .input(analytics.getPendingInvoicesInput)
    .query(async ({ ctx, input }) => {
      return ctx.services.inTenant(async (deps) => {
        const useCase = analytics.makeGetPendingInvoicesUseCase({
          analyticsRepo: deps.analyticsRepo,
          clock: ctx.services.clock,
        });
        return useCase({ actorRole: ctx.user.role, limit: input.limit });
      });
    }),
});
