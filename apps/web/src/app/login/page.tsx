'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSupabaseBrowserClient } from '@/lib/supabase';

interface LoginForm {
  email: string;
  password: string;
}

export default function LoginPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<LoginForm>();

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword(values);
    if (error) {
      setError(error.message);
      return;
    }
    router.push('/dashboard');
    router.refresh();
  });

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{t('signIn')}</CardTitle>
          <CardDescription>Castellar</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="email">{t('email')}</Label>
              <Input id="email" type="email" autoComplete="email" {...register('email', { required: true })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">{t('password')}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register('password', { required: true })}
              />
            </div>
            {error && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={formState.isSubmitting}>
              {formState.isSubmitting ? t('signingIn') : t('signInButton')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
