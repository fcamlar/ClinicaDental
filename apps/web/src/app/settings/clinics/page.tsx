'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

interface ClinicForm {
  name: string;
  address?: string;
  vatId?: string;
  timezone: string;
}

export default function SettingsClinicsPage() {
  const t = useTranslations('settings.clinics');
  const [showCreate, setShowCreate] = useState(false);
  const utils = trpc.useUtils();
  const clinics = trpc.identity.listClinics.useQuery();
  const create = trpc.identity.createClinic.useMutation({
    async onSuccess() {
      await utils.identity.listClinics.invalidate();
      setShowCreate(false);
    },
  });
  const { register, handleSubmit, reset, formState } = useForm<ClinicForm>({
    defaultValues: { timezone: 'Europe/Madrid' },
  });

  const onSubmit = handleSubmit(async (values) => {
    await create.mutateAsync({
      name: values.name,
      address: values.address || undefined,
      vatId: values.vatId || undefined,
      timezone: values.timezone,
    });
    reset({ timezone: 'Europe/Madrid' });
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <Button onClick={() => setShowCreate((v) => !v)} className="gap-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">{t('createNew')}</span>
          <span className="sm:hidden">Nueva</span>
        </Button>
      </header>

      {showCreate && (
        <Card>
          <CardHeader>
            <CardTitle>{t('createNew')}</CardTitle>
            <CardDescription>{t('description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="grid gap-2 md:col-span-2">
                <Label htmlFor="name">{t('name')}</Label>
                <Input id="name" {...register('name', { required: true })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="address">{t('address')}</Label>
                <Input id="address" {...register('address')} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="vatId">{t('vatId')}</Label>
                <Input id="vatId" {...register('vatId')} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="timezone">{t('timezone')}</Label>
                <Input id="timezone" {...register('timezone', { required: true })} />
              </div>
              <div className="md:col-span-2">
                <Button type="submit" disabled={formState.isSubmitting || create.isPending}>
                  Crear
                </Button>
              </div>
              {create.error && (
                <p className="col-span-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {create.error.message}
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('name')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('address')}</TableHead>
                <TableHead className="hidden sm:table-cell">{t('timezone')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clinics.data?.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <div>{c.name}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground md:hidden">
                      {c.address ?? c.timezone}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">{c.address ?? '—'}</TableCell>
                  <TableCell className="hidden sm:table-cell">{c.timezone}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
