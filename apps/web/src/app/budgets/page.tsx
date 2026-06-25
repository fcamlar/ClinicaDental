'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  DRAFT: 'secondary',
  SENT: 'warning',
  ACCEPTED: 'success',
  REJECTED: 'destructive',
  EXPIRED: 'destructive',
  CONVERTED: 'default',
};

export default function BudgetsPage() {
  const t = useTranslations('billing.budgets');
  const tS = useTranslations('billing.budgetStatus');
  const [status, setStatus] = useState<string>('');
  const list = trpc.billing.listBudgets.useQuery({
    limit: 100,
    status: (status || undefined) as
      | 'DRAFT'
      | 'SENT'
      | 'ACCEPTED'
      | 'REJECTED'
      | 'EXPIRED'
      | 'CONVERTED'
      | undefined,
  });

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <div className="flex items-center gap-3">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">{t('status')}</option>
            {(
              ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED'] as const
            ).map((s) => (
              <option key={s} value={s}>
                {tS(s)}
              </option>
            ))}
          </select>
          <Button asChild className="gap-2">
            <Link href="/budgets/new">
              <Plus className="h-4 w-4" />
              {t('new')}
            </Link>
          </Button>
        </div>
      </header>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('code')}</TableHead>
                <TableHead>{t('issued')}</TableHead>
                <TableHead>{t('status')}</TableHead>
                <TableHead className="text-right">{t('total')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <Link
                      href={`/budgets/${b.id}`}
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {b.code}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {new Date(b.issuedAt).toLocaleDateString('es-ES', { dateStyle: 'medium' })}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[b.status] ?? 'default'}>{tS(b.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {EURO.format(b.total / 100)}
                  </TableCell>
                </TableRow>
              ))}
              {list.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Sin presupuestos
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
