import type { Prisma, PrismaClient } from '@prisma/client';
import { analytics } from '@castellar/core';

function startOfDayUtc(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}
function startOfMonthUtc(d: Date): Date {
  const x = new Date(d);
  x.setUTCDate(1);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

export class PrismaAnalyticsRepository implements analytics.AnalyticsRepository {
  constructor(private readonly tx: PrismaClient | Prisma.TransactionClient) {}

  async summary({ now }: { now: Date }): Promise<analytics.DashboardSummary> {
    const dayStart = startOfDayUtc(now);
    const dayEnd = addDays(dayStart, 1);
    const monthStart = startOfMonthUtc(now);
    const monthEnd = addDays(startOfMonthUtc(addDays(now, 32)), 0);
    const weekStart = addDays(dayStart, -7);

    const [
      todayCount,
      todayCompleted,
      todayUpcoming,
      newPatients,
      pendingAgg,
      pendingCount,
      monthRevAgg,
      monthPaidAgg,
      weekAppointments,
    ] = await Promise.all([
      this.tx.appointment.count({
        where: { startsAt: { gte: dayStart, lt: dayEnd } },
      }),
      this.tx.appointment.count({
        where: { startsAt: { gte: dayStart, lt: dayEnd }, status: 'COMPLETED' },
      }),
      this.tx.appointment.count({
        where: {
          startsAt: { gte: dayStart, lt: dayEnd },
          status: { in: ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN'] },
        },
      }),
      this.tx.patient.count({
        where: { createdAt: { gte: addDays(dayStart, -30) }, deletedAt: null },
      }),
      this.tx.$queryRaw<Array<{ pending: bigint | null }>>`
        SELECT COALESCE(SUM(total - paid_total), 0)::bigint AS pending
        FROM invoices
        WHERE status IN ('ISSUED', 'PARTIALLY_PAID') AND kind = 'STANDARD'
      `,
      this.tx.invoice.count({
        where: { status: { in: ['ISSUED', 'PARTIALLY_PAID'] }, kind: 'STANDARD' },
      }),
      this.tx.invoice.aggregate({
        where: {
          issuedAt: { gte: monthStart, lt: monthEnd },
          kind: 'STANDARD',
          status: { not: 'VOIDED' },
        },
        _sum: { total: true },
      }),
      this.tx.invoice.aggregate({
        where: {
          issuedAt: { gte: monthStart, lt: monthEnd },
          kind: 'STANDARD',
          status: { not: 'VOIDED' },
        },
        _sum: { paidTotal: true },
      }),
      this.tx.appointment.findMany({
        where: {
          startsAt: { gte: weekStart, lt: dayEnd },
          status: { notIn: ['CANCELLED', 'NO_SHOW'] },
        },
        select: { startsAt: true, endsAt: true },
      }),
    ]);

    const bookedMinutes = weekAppointments.reduce(
      (sum, a) => sum + Math.max(0, Math.round((a.endsAt.getTime() - a.startsAt.getTime()) / 60_000)),
      0,
    );

    // Disponibilidad semanal: usamos working_hours del tenant (sin filtrar por profesional
    // — es una aproximación; mejorará en Sprint 7).
    const hours = await this.tx.workingHours.findMany({ select: { startMinute: true, endMinute: true } });
    const dailyMinutes = hours.reduce((sum, h) => sum + Math.max(0, h.endMinute - h.startMinute), 0);
    const availableMinutes = dailyMinutes * 7;

    return {
      todayAppointments: {
        count: todayCount,
        upcoming: todayUpcoming,
        completed: todayCompleted,
      },
      newPatients30d: newPatients,
      pendingPayments: {
        amountCents: Number(pendingAgg[0]?.pending ?? 0n),
        invoiceCount: pendingCount,
      },
      monthRevenue: {
        amountCents: monthRevAgg._sum.total ?? 0,
        paidCents: monthPaidAgg._sum.paidTotal ?? 0,
      },
      weeklyOccupancy: {
        bookedMinutes,
        availableMinutes,
      },
    };
  }

  async todayAgenda({ now, limit }: { now: Date; limit: number }): Promise<analytics.AgendaItem[]> {
    const dayStart = startOfDayUtc(now);
    const dayEnd = addDays(dayStart, 1);
    const items = await this.tx.appointment.findMany({
      where: { startsAt: { gte: dayStart, lt: dayEnd } },
      orderBy: { startsAt: 'asc' },
      take: limit,
      include: {
        patient: { select: { firstName: true, lastName: true } },
      },
    });
    return items.map((a) => ({
      id: a.id,
      patientName: `${a.patient.firstName} ${a.patient.lastName}`,
      professionalId: a.professionalId,
      startsAt: a.startsAt,
      endsAt: a.endsAt,
      status: a.status,
      reason: a.reason,
    }));
  }

  async recentInvoices({ limit }: { limit: number }): Promise<analytics.RecentInvoice[]> {
    const items = await this.tx.invoice.findMany({
      orderBy: { issuedAt: 'desc' },
      take: limit,
      include: {
        series: { select: { code: true } },
        patient: { select: { firstName: true, lastName: true } },
      },
    });
    return items.map((i) => ({
      id: i.id,
      seriesCode: i.series.code,
      number: i.number,
      patientName: `${i.patient.firstName} ${i.patient.lastName}`,
      total: i.total,
      paidTotal: i.paidTotal,
      status: i.status,
      issuedAt: i.issuedAt,
    }));
  }

  async pendingInvoices({ limit, now }: { limit: number; now: Date }): Promise<
    analytics.PendingInvoice[]
  > {
    const items = await this.tx.invoice.findMany({
      where: {
        status: { in: ['ISSUED', 'PARTIALLY_PAID'] },
        kind: 'STANDARD',
      },
      orderBy: { issuedAt: 'asc' },
      take: limit,
      include: {
        series: { select: { code: true } },
        patient: { select: { firstName: true, lastName: true } },
      },
    });
    return items.map((i) => ({
      id: i.id,
      seriesCode: i.series.code,
      number: i.number,
      patientName: `${i.patient.firstName} ${i.patient.lastName}`,
      pendingCents: i.total - i.paidTotal,
      daysOverdue: Math.max(0, Math.floor((now.getTime() - i.issuedAt.getTime()) / 86_400_000)),
    }));
  }
}
