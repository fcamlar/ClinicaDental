'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { trpc } from '@/lib/trpc';

interface PatientForm {
  firstName: string;
  lastName: string;
  nationalId?: string;
  birthDate?: string;
  sex?: 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED' | '';
  email?: string;
  phone?: string;
  addressLine1?: string;
  postalCode?: string;
  city?: string;
  country: string;
  adminNotes?: string;
  gdprConsent: boolean;
  gdprConsentText?: string;
  marketingConsent: boolean;
  clinicId: string;
}

export default function NewPatientPage() {
  const t = useTranslations('patients.form');
  const router = useRouter();
  const clinics = trpc.identity.listClinics.useQuery();
  const create = trpc.patients.create.useMutation({
    onSuccess(p) {
      router.push(`/patients/${p.id}`);
    },
  });

  const { register, handleSubmit, watch, formState } = useForm<PatientForm>({
    defaultValues: {
      country: 'ES',
      gdprConsent: true,
      marketingConsent: false,
      gdprConsentText:
        'Consiento expresamente el tratamiento de mis datos personales para la gestión asistencial y administrativa de la clínica, en los términos del Reglamento (UE) 2016/679 (RGPD) y la LOPDGDD.',
    },
  });
  const gdprConsent = watch('gdprConsent');

  const onSubmit = handleSubmit(async (values) => {
    await create.mutateAsync({
      firstName: values.firstName,
      lastName: values.lastName,
      nationalId: values.nationalId || undefined,
      birthDate: values.birthDate ? new Date(values.birthDate) : undefined,
      sex: values.sex || undefined,
      email: values.email || undefined,
      phone: values.phone || undefined,
      addressLine1: values.addressLine1 || undefined,
      postalCode: values.postalCode || undefined,
      city: values.city || undefined,
      country: values.country,
      adminNotes: values.adminNotes || undefined,
      gdprConsent: values.gdprConsent,
      gdprConsentText: values.gdprConsent ? values.gdprConsentText : undefined,
      marketingConsent: values.marketingConsent,
      clinicId: values.clinicId,
    });
  });

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>{t('create')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="clinicId">Sede</Label>
            <select
              id="clinicId"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              {...register('clinicId', { required: true })}
            >
              {clinics.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="firstName">{t('firstName')}</Label>
            <Input id="firstName" {...register('firstName', { required: true })} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="lastName">{t('lastName')}</Label>
            <Input id="lastName" {...register('lastName', { required: true })} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="nationalId">{t('nationalId')}</Label>
            <Input id="nationalId" {...register('nationalId')} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="birthDate">{t('birthDate')}</Label>
            <Input id="birthDate" type="date" {...register('birthDate')} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="sex">{t('sex')}</Label>
            <select
              id="sex"
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              {...register('sex')}
            >
              <option value="">—</option>
              <option value="FEMALE">Mujer</option>
              <option value="MALE">Hombre</option>
              <option value="OTHER">Otro</option>
              <option value="UNDISCLOSED">No declarado</option>
            </select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="phone">{t('phone')}</Label>
            <Input id="phone" {...register('phone')} />
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="email">{t('email')}</Label>
            <Input id="email" type="email" {...register('email')} />
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="addressLine1">{t('address')}</Label>
            <Input id="addressLine1" {...register('addressLine1')} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="postalCode">{t('postalCode')}</Label>
            <Input id="postalCode" {...register('postalCode')} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="city">{t('city')}</Label>
            <Input id="city" {...register('city')} />
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="adminNotes">{t('adminNotes')}</Label>
            <textarea
              id="adminNotes"
              rows={3}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              {...register('adminNotes')}
            />
          </div>
          <div className="flex items-center gap-2 md:col-span-2">
            <input id="gdprConsent" type="checkbox" {...register('gdprConsent')} />
            <Label htmlFor="gdprConsent">{t('gdprConsent')}</Label>
          </div>
          {gdprConsent && (
            <div className="grid gap-2 md:col-span-2">
              <Label htmlFor="gdprConsentText">{t('gdprConsentText')}</Label>
              <textarea
                id="gdprConsentText"
                rows={4}
                className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                {...register('gdprConsentText', { required: gdprConsent })}
              />
            </div>
          )}
          <div className="flex items-center gap-2 md:col-span-2">
            <input id="marketingConsent" type="checkbox" {...register('marketingConsent')} />
            <Label htmlFor="marketingConsent">{t('marketingConsent')}</Label>
          </div>
          {create.error && (
            <p className="md:col-span-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {create.error.message}
            </p>
          )}
          <div className="md:col-span-2">
            <Button type="submit" disabled={formState.isSubmitting || create.isPending}>
              {create.isPending ? t('creating') : t('create')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
