'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { Plus } from 'lucide-react';
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

type Regime =
  | 'EXEMPT_HEALTHCARE'
  | 'STANDARD_AESTHETIC'
  | 'STANDARD_PRODUCT'
  | 'REDUCED'
  | 'NOT_SUBJECT';

interface TreatmentForm {
  code: string;
  name: string;
  description?: string;
  priceEuros: number;
  taxRegime: Regime;
  category?: string;
  active: boolean;
}

const EURO = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

export default function TreatmentsPage() {
  const t = useTranslations('catalog');
  const tR = useTranslations('catalog.regime');
  const [showForm, setShowForm] = useState(false);
  const utils = trpc.useUtils();
  const list = trpc.catalog.list.useQuery({});
  const create = trpc.catalog.create.useMutation({
    async onSuccess() {
      await utils.catalog.list.invalidate();
      setShowForm(false);
    },
  });
  const { register, handleSubmit, reset, formState } = useForm<TreatmentForm>({
    defaultValues: { taxRegime: 'EXEMPT_HEALTHCARE', active: true },
  });

  const onSubmit = handleSubmit(async (values) => {
    await create.mutateAsync({
      code: values.code,
      name: values.name,
      description: values.description || undefined,
      defaultPrice: Math.round(Number(values.priceEuros) * 100),
      taxRegime: values.taxRegime,
      category: values.category || undefined,
      active: values.active,
    });
    reset({ taxRegime: 'EXEMPT_HEALTHCARE', active: true });
  });

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <Button onClick={() => setShowForm((v) => !v)} className="gap-2">
          <Plus className="h-4 w-4" />
          {t('new')}
        </Button>
      </header>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{t('new')}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor="code">{t('form.code')}</Label>
                <Input id="code" {...register('code', { required: true })} />
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="name">{t('form.name')}</Label>
                <Input id="name" {...register('name', { required: true })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="priceEuros">{t('form.price')}</Label>
                <Input
                  id="priceEuros"
                  type="number"
                  step="0.01"
                  min="0"
                  {...register('priceEuros', { required: true, valueAsNumber: true })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="taxRegime">{t('form.regime')}</Label>
                <select
                  id="taxRegime"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  {...register('taxRegime', { required: true })}
                >
                  <option value="EXEMPT_HEALTHCARE">{tR('EXEMPT_HEALTHCARE')}</option>
                  <option value="STANDARD_AESTHETIC">{tR('STANDARD_AESTHETIC')}</option>
                  <option value="STANDARD_PRODUCT">{tR('STANDARD_PRODUCT')}</option>
                  <option value="REDUCED">{tR('REDUCED')}</option>
                  <option value="NOT_SUBJECT">{tR('NOT_SUBJECT')}</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="category">{t('form.category')}</Label>
                <Input id="category" {...register('category')} />
              </div>
              <div className="grid gap-2 md:col-span-3">
                <Label htmlFor="description">{t('form.description')}</Label>
                <textarea
                  id="description"
                  rows={2}
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                  {...register('description')}
                />
              </div>
              <div className="flex items-center gap-2">
                <input id="active" type="checkbox" {...register('active')} />
                <Label htmlFor="active">{t('form.active')}</Label>
              </div>
              {create.error && (
                <p className="md:col-span-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {create.error.message}
                </p>
              )}
              <div className="md:col-span-3">
                <Button type="submit" disabled={formState.isSubmitting || create.isPending}>
                  Crear
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('table.code')}</TableHead>
                <TableHead>{t('table.name')}</TableHead>
                <TableHead>{t('table.category')}</TableHead>
                <TableHead className="text-right">{t('table.price')}</TableHead>
                <TableHead>{t('table.regime')}</TableHead>
                <TableHead>{t('table.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data?.map((tr) => (
                <TableRow key={tr.id}>
                  <TableCell className="font-mono text-xs">{tr.code}</TableCell>
                  <TableCell className="font-medium">{tr.name}</TableCell>
                  <TableCell>{tr.category ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {EURO.format(tr.defaultPrice / 100)}
                  </TableCell>
                  <TableCell>{tR(tr.taxRegime)}</TableCell>
                  <TableCell>
                    {tr.active ? (
                      <Badge variant="success">Activo</Badge>
                    ) : (
                      <Badge variant="secondary">Inactivo</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
