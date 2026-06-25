'use client';

export const runtime = 'edge';


import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { trpc } from '@/lib/trpc';
import { createSupabaseBrowserClient } from '@/lib/supabase';

interface OnboardingForm {
  tenantName: string;
  country: 'ES' | 'PT' | 'BR' | 'GB';
  locale: 'es-ES' | 'en-US' | 'pt-BR';
}

/**
 * Onboarding: el usuario ya tiene sesión Supabase pero no está mapeado a
 * ningún tenant todavía. Llama a identity.createTenant que persiste el
 * tenant + owner. Tras la operación, el siguiente login obtendrá el JWT
 * enriquecido con app_metadata.castellar.*.
 */
export default function OnboardingPage() {
  const t = useTranslations('onboarding');
  const router = useRouter();
  const { register, handleSubmit, formState } = useForm<OnboardingForm>({
    defaultValues: { country: 'ES', locale: 'es-ES' },
  });

  const createTenant = trpc.identity.createTenant.useMutation({
    async onSuccess() {
      // Forzar refresh del JWT para incluir los nuevos claims castellar.
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.refreshSession();
      router.push('/dashboard');
      router.refresh();
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw new Error('Sesión Supabase no encontrada');
    }
    await createTenant.mutateAsync({
      tenantName: values.tenantName,
      country: values.country,
      locale: values.locale,
      ownerEmail: data.user.email ?? '',
      ownerSupabaseUserId: data.user.id,
    });
  });

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="tenantName">{t('clinicName')}</Label>
              <Input
                id="tenantName"
                {...register('tenantName', { required: true, minLength: 2, maxLength: 120 })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="country">{t('country')}</Label>
                <select
                  id="country"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  {...register('country', { required: true })}
                >
                  <option value="ES">España</option>
                  <option value="PT">Portugal</option>
                  <option value="BR">Brasil</option>
                  <option value="GB">United Kingdom</option>
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="locale">{t('language')}</Label>
                <select
                  id="locale"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  {...register('locale', { required: true })}
                >
                  <option value="es-ES">Español</option>
                  <option value="en-US">English</option>
                  <option value="pt-BR">Português (BR)</option>
                </select>
              </div>
            </div>
            {createTenant.error && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {createTenant.error.message}
              </p>
            )}
            <Button type="submit" disabled={formState.isSubmitting || createTenant.isPending}>
              {createTenant.isPending ? t('creating') : t('submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
