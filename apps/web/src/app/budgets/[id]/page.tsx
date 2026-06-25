'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { trpc } from '@/lib/trpc';

const EURO = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

export default function BudgetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('billing.budgets');
  const tS = useTranslations('billing.budgetStatus');
  const router = useRouter();
  const utils = trpc.useUtils();
  const data = trpc.billing.getBudget.useQuery({ budgetId: id });

  const send = trpc.billing.sendBudget.useMutation({
    async onSuccess() {
      await utils.billing.getBudget.invalidate();
    },
  });
  const accept = trpc.billing.acceptBudget.useMutation({
    async onSuccess() {
      await utils.billing.getBudget.invalidate();
    },
  });
  const reject = trpc.billing.rejectBudget.useMutation({
    async onSuccess() {
      await utils.billing.getBudget.invalidate();
    },
  });
  const convert = trpc.billing.convertBudget.useMutation({
    onSuccess(inv) {
      router.push(`/invoices/${inv.id}`);
    },
  });
  const seriesQuery = trpc.billing.listSeries.useQuery();

  if (data.isLoading) return <p>…</p>;
  if (!data.data) return <p>No encontrado</p>;
  const b = data.data;

  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{b.code}</h1>
          <p className="text-sm text-muted-foreground">
            {new Date(b.issuedAt).toLocaleString('es-ES', { dateStyle: 'long' })}
          </p>
        </div>
        <Badge>{tS(b.status)}</Badge>
      </header>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descripción</TableHead>
                <TableHead className="hidden sm:table-cell">{t('tooth')}</TableHead>
                <TableHead className="hidden sm:table-cell text-right">{t('quantity')}</TableHead>
                <TableHead className="hidden md:table-cell text-right">{t('price')}</TableHead>
                <TableHead className="hidden md:table-cell text-right">{t('discount')}</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {b.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <div>{l.description}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground sm:hidden">
                      {l.quantity} × {EURO.format(l.unitPrice / 100)}
                      {l.toothRef ? ` · pieza ${l.toothRef}` : ''}
                      {l.discount > 0 ? ` · -${Math.round(l.discount * 100)}%` : ''}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{l.toothRef ?? '—'}</TableCell>
                  <TableCell className="hidden sm:table-cell text-right">{l.quantity}</TableCell>
                  <TableCell className="hidden md:table-cell text-right tabular-nums">
                    {EURO.format(l.unitPrice / 100)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-right">
                    {l.discount > 0 ? `${Math.round(l.discount * 100)}%` : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {EURO.format(l.totalAmount / 100)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {b.status === 'DRAFT' && (
            <Button size="sm" onClick={() => send.mutate({ budgetId: b.id })}>
              {t('send')}
            </Button>
          )}
          {(b.status === 'DRAFT' || b.status === 'SENT') && (
            <Button size="sm" onClick={() => accept.mutate({ budgetId: b.id })}>
              {t('accept')}
            </Button>
          )}
          {(b.status === 'DRAFT' || b.status === 'SENT' || b.status === 'ACCEPTED') && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => reject.mutate({ budgetId: b.id })}
            >
              {t('reject')}
            </Button>
          )}
          {b.status === 'ACCEPTED' && (
            <Button
              size="sm"
              onClick={() => {
                const series = seriesQuery.data?.[0]?.code;
                if (!series) return;
                convert.mutate({ budgetId: b.id, seriesCode: series });
              }}
            >
              {t('convert')}
            </Button>
          )}
        </div>
        <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm lg:w-64">
          <div className="flex justify-between gap-12">
            <span>Base</span>
            <span className="tabular-nums">{EURO.format(b.subtotal / 100)}</span>
          </div>
          <div className="flex justify-between gap-12">
            <span>IVA</span>
            <span className="tabular-nums">{EURO.format(b.taxTotal / 100)}</span>
          </div>
          <div className="mt-1 flex justify-between gap-12 border-t border-border pt-1 text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{EURO.format(b.total / 100)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
