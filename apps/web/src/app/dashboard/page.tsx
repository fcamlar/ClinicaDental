'use client';

export const runtime = 'edge';


import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';

const EURO = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const me = trpc.identity.me.useQuery();
  const summary = trpc.dashboard.summary.useQuery(undefined, { staleTime: 60_000 });
  const today = trpc.dashboard.todayAgenda.useQuery({ limit: 10 }, { staleTime: 60_000 });
  const pending = trpc.dashboard.pendingInvoices.useQuery({ limit: 10 }, { staleTime: 60_000 });

  const occupancy = summary.data
    ? Math.round(
        (summary.data.weeklyOccupancy.bookedMinutes /
          Math.max(1, summary.data.weeklyOccupancy.availableMinutes)) *
          100,
      )
    : 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="truncate text-sm text-muted-foreground sm:text-base">
          {me.data ? t('welcome', { name: me.data.email }) : ''}
        </p>
      </header>

      <div className="grid gap-3 grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <Kpi
          title={t('todayAppointments')}
          value={summary.data?.todayAppointments.count.toString() ?? '—'}
          hint={
            summary.data
              ? `${summary.data.todayAppointments.completed} completadas · ${summary.data.todayAppointments.upcoming} próximas`
              : ''
          }
        />
        <Kpi
          title={t('newPatients')}
          value={summary.data?.newPatients30d.toString() ?? '—'}
          hint="últimos 30 días"
        />
        <Kpi
          title={t('pendingPayments')}
          value={
            summary.data ? EURO.format(summary.data.pendingPayments.amountCents / 100) : '—'
          }
          hint={
            summary.data
              ? `${summary.data.pendingPayments.invoiceCount} facturas`
              : ''
          }
        />
        <Kpi
          title={t('monthRevenue')}
          value={
            summary.data ? EURO.format(summary.data.monthRevenue.amountCents / 100) : '—'
          }
          hint={
            summary.data
              ? `cobrado ${EURO.format(summary.data.monthRevenue.paidCents / 100)}`
              : ''
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Agenda de hoy</CardTitle>
          </CardHeader>
          <CardContent>
            {today.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin citas para hoy</p>
            )}
            <ul className="divide-y divide-border text-sm">
              {today.data?.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-2 py-2"
                >
                  <div className="font-mono text-xs">
                    {new Date(a.startsAt).toLocaleTimeString('es-ES', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                  <div className="flex-1 truncate">{a.patientName}</div>
                  <Badge variant="secondary" className="text-[10px]">
                    {a.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ocupación semanal</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">{occupancy}%</div>
            <p className="text-xs text-muted-foreground">
              {summary.data
                ? `${Math.round(summary.data.weeklyOccupancy.bookedMinutes / 60)}h de ${Math.round(
                    summary.data.weeklyOccupancy.availableMinutes / 60,
                  )}h disponibles`
                : '—'}
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Facturas pendientes</CardTitle>
          </CardHeader>
          <CardContent>
            {pending.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin facturas pendientes</p>
            )}
            <ul className="divide-y divide-border text-sm">
              {pending.data?.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 py-2">
                  <Link
                    href={`/invoices/${i.id}`}
                    className="font-mono text-xs text-primary hover:underline"
                  >
                    {i.seriesCode}/{String(i.number).padStart(4, '0')}
                  </Link>
                  <span className="flex-1 truncate">{i.patientName}</span>
                  <span className="text-xs text-muted-foreground">
                    {i.daysOverdue}d
                  </span>
                  <span className="tabular-nums font-medium">
                    {EURO.format(i.pendingCents / 100)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="truncate text-2xl font-semibold tabular-nums sm:text-3xl">{value}</div>
        {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
