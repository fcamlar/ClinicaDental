'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
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

const VARIANT: Record<string, 'secondary' | 'success' | 'warning' | 'destructive'> = {
  ISSUED: 'warning',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  VOIDED: 'destructive',
};

export default function InvoicesPage() {
  const t = useTranslations('billing.invoices');
  const tS = useTranslations('billing.invoiceStatus');
  const list = trpc.billing.listInvoices.useQuery({ limit: 100 });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('series')} / {t('number')}</TableHead>
                <TableHead>{t('issued')}</TableHead>
                <TableHead>{t('status')}</TableHead>
                <TableHead className="text-right">{t('total')}</TableHead>
                <TableHead className="text-right">{t('pending')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <Link
                      href={`/invoices/${i.id}`}
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {i.seriesCode}/{String(i.number).padStart(4, '0')}
                    </Link>
                    {i.kind === 'RECTIFICATIVE' && (
                      <Badge variant="destructive" className="ml-2">
                        Rect.
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {new Date(i.issuedAt).toLocaleDateString('es-ES', { dateStyle: 'medium' })}
                  </TableCell>
                  <TableCell>
                    <Badge variant={VARIANT[i.status] ?? 'secondary'}>{tS(i.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {EURO.format(i.total / 100)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {EURO.format((i.total - i.paidTotal) / 100)}
                  </TableCell>
                </TableRow>
              ))}
              {list.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    Sin facturas
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
