import { z } from 'zod';
import { Forbidden } from '../shared/errors.js';
import type { Clock } from '../shared/clock.js';
import type * as identity from '../identity/index.js';
import type { AnalyticsRepository } from './ports.js';

const READ_ROLES: identity.Role[] = ['OWNER', 'ADMIN_CLINIC', 'DENTIST', 'ACCOUNTING'];

function ensureCanRead(role: identity.Role) {
  if (!READ_ROLES.includes(role)) {
    throw new Forbidden('Tu rol no permite acceder al dashboard');
  }
}

export const getSummaryInput = z.object({});
export const getTodayAgendaInput = z.object({
  limit: z.number().int().min(1).max(50).default(20),
});
export const getRecentInvoicesInput = z.object({
  limit: z.number().int().min(1).max(50).default(10),
});
export const getPendingInvoicesInput = z.object({
  limit: z.number().int().min(1).max(50).default(10),
});

export function makeGetSummaryUseCase(deps: {
  analyticsRepo: AnalyticsRepository;
  clock: Clock;
}) {
  return async function getSummary(args: { actorRole: identity.Role }) {
    ensureCanRead(args.actorRole);
    return deps.analyticsRepo.summary({ now: deps.clock.now() });
  };
}

export function makeGetTodayAgendaUseCase(deps: {
  analyticsRepo: AnalyticsRepository;
  clock: Clock;
}) {
  return async function getTodayAgenda(args: {
    actorRole: identity.Role;
    limit: number;
  }) {
    ensureCanRead(args.actorRole);
    return deps.analyticsRepo.todayAgenda({ now: deps.clock.now(), limit: args.limit });
  };
}

export function makeGetRecentInvoicesUseCase(deps: {
  analyticsRepo: AnalyticsRepository;
}) {
  return async function getRecentInvoices(args: {
    actorRole: identity.Role;
    limit: number;
  }) {
    ensureCanRead(args.actorRole);
    return deps.analyticsRepo.recentInvoices({ limit: args.limit });
  };
}

export function makeGetPendingInvoicesUseCase(deps: {
  analyticsRepo: AnalyticsRepository;
  clock: Clock;
}) {
  return async function getPendingInvoices(args: {
    actorRole: identity.Role;
    limit: number;
  }) {
    ensureCanRead(args.actorRole);
    return deps.analyticsRepo.pendingInvoices({ limit: args.limit, now: deps.clock.now() });
  };
}
