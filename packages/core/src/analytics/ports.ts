import type {
  AgendaItem,
  DashboardSummary,
  PendingInvoice,
  RecentInvoice,
} from './entities.js';

/**
 * Puerto analytics: la implementación Prisma agrega con queries SQL eficientes
 * (preferiblemente con `count`, `groupBy`, `aggregate`).
 */
export interface AnalyticsRepository {
  summary(args: { now: Date }): Promise<DashboardSummary>;
  todayAgenda(args: { now: Date; limit: number }): Promise<AgendaItem[]>;
  recentInvoices(args: { limit: number }): Promise<RecentInvoice[]>;
  pendingInvoices(args: { limit: number; now: Date }): Promise<PendingInvoice[]>;
}
