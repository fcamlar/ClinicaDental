'use client';

import { use, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
const METHODS = ['CASH', 'CARD', 'TRANSFER', 'ONLINE', 'OTHER'] as const;

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations('billing.invoices');
  const tS = useTranslations('billing.invoiceStatus');
  const tM = useTranslations('billing.method');
  const utils = trpc.useUtils();
  const inv = trpc.billing.getInvoice.useQuery({ invoiceId: id });

  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<(typeof METHODS)[number]>('CASH');
  const [reference, setReference] = useState('');

  const register = trpc.billing.registerPayment.useMutation({
    async onSuccess() {
      await utils.billing.getInvoice.invalidate();
      setAmount(0);
      setReference('');
    },
  });
  const voidInv = trpc.billing.voidInvoice.useMutation({
    async onSuccess() {
      await utils.billing.getInvoice.invalidate();
      await utils.billing.listInvoices.invalidate();
    },
  });

  if (inv.isLoading) return <p>…</p>;
  if (!inv.data) return <p>No encontrada</p>;
  const i = inv.data;
  const pending = i.total - i.paidTotal;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {i.seriesCode}/{String(i.number).padStart(4, '0')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {new Date(i.issuedAt).toLocaleString('es-ES', { dateStyle: 'long' })}
          </p>
          {i.kind === 'RECTIFICATIVE' && (
            <p className="text-xs text-destructive">Factura rectificativa</p>
          )}
        </div>
        <Badge>{tS(i.status)}</Badge>
      </header>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descripción</TableHead>
                <TableHead>Pieza</TableHead>
                <TableHead className="text-right">Cant.</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {i.lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{l.description}</TableCell>
                  <TableCell>{l.toothRef ?? '—'}</TableCell>
                  <TableCell className="text-right">{l.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {EURO.format(l.unitPrice / 100)}
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

      <div className="flex items-start justify-between gap-6">
        <Card className="flex-1">
          <CardHeader>
            <CardTitle className="text-base">Pagos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="divide-y divide-border">
              {i.payments.map((p) => (
                <li
                  key={p.id}
                  className={`flex items-center justify-between py-2 text-sm ${
                    p.voidedAt ? 'text-muted-foreground line-through' : ''
                  }`}
                >
                  <div>
                    <span className="font-medium">{tM(p.method)}</span>
                    {p.reference && (
                      <span className="ml-2 text-xs text-muted-foreground">{p.reference}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span>{new Date(p.paidAt).toLocaleDateString('es-ES')}</span>
                    <span className="tabular-nums">{EURO.format(p.amount / 100)}</span>
                  </div>
                </li>
              ))}
              {i.payments.length === 0 && (
                <li className="py-2 text-sm text-muted-foreground">Sin cobros</li>
              )}
            </ul>

            {i.status !== 'PAID' && i.status !== 'VOIDED' && (
              <div className="grid gap-2 rounded-md border border-dashed border-input p-3 md:grid-cols-4">
                <div className="grid gap-1">
                  <Label className="text-xs">{t('method')}</Label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as (typeof METHODS)[number])}
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {METHODS.map((m) => (
                      <option key={m} value={m}>
                        {tM(m)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs">{t('amount')}</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min={0}
                    max={(pending / 100).toFixed(2)}
                    value={(amount / 100).toFixed(2)}
                    onChange={(e) => setAmount(Math.round(Number(e.target.value) * 100))}
                  />
                </div>
                <div className="grid gap-1 md:col-span-2">
                  <Label className="text-xs">{t('reference')}</Label>
                  <Input
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Opcional"
                  />
                </div>
                <Button
                  className="md:col-span-4"
                  disabled={amount <= 0 || amount > pending || register.isPending}
                  onClick={() =>
                    register.mutate({
                      invoiceId: i.id,
                      method,
                      amount,
                      paidAt: new Date(),
                      reference: reference || undefined,
                    })
                  }
                >
                  {t('registerPayment')}
                </Button>
              </div>
            )}
            {register.error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {register.error.message}
              </p>
            )}
          </CardContent>
        </Card>

        <div className="rounded-md border border-border bg-muted/30 p-4 text-sm">
          <div className="flex w-56 justify-between">
            <span>Base</span>
            <span className="tabular-nums">{EURO.format(i.subtotal / 100)}</span>
          </div>
          <div className="flex justify-between">
            <span>IVA</span>
            <span className="tabular-nums">{EURO.format(i.taxTotal / 100)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-border pt-1 text-base font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{EURO.format(i.total / 100)}</span>
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>Pagado</span>
            <span className="tabular-nums">{EURO.format(i.paidTotal / 100)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span>Pendiente</span>
            <span className="tabular-nums">{EURO.format(pending / 100)}</span>
          </div>
          {i.status !== 'VOIDED' && i.kind !== 'RECTIFICATIVE' && (
            <Button
              variant="destructive"
              size="sm"
              className="mt-3 w-full"
              onClick={() => voidInv.mutate({ invoiceId: i.id })}
            >
              {t('void')}
            </Button>
          )}
          <p className="mt-3 text-[10px] font-mono text-muted-foreground">
            Hash: {i.internalHash.slice(0, 12)}…
          </p>
        </div>
      </div>
    </div>
  );
}
