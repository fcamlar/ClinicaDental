'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const me = trpc.identity.me.useQuery();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">
          {me.data ? t('welcome', { name: me.data.email }) : ''}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard title={t('todayAppointments')} value="—" />
        <KpiCard title={t('newPatients')} value="—" />
        <KpiCard title={t('pendingPayments')} value="—" />
        <KpiCard title={t('monthRevenue')} value="—" />
      </div>
    </div>
  );
}

function KpiCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
