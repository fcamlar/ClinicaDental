'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createSupabaseBrowserClient } from '@/lib/supabase';
import { trpc } from '@/lib/trpc';

/**
 * Enrolamiento TOTP. Pasos:
 *   1. supabase.auth.mfa.enroll → devuelve QR + secret.
 *   2. Usuario escanea con Authy/Google Authenticator/1Password.
 *   3. Usuario introduce el código → supabase.auth.mfa.challenge + verify.
 *   4. Llamada a identity.markMfaEnrolled para auditar.
 */
export default function MfaEnrollPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const markEnrolled = trpc.identity.markMfaEnrolled.useMutation();

  useEffect(() => {
    (async () => {
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
      if (error) {
        setError(error.message);
        return;
      }
      setFactorId(data.id);
      setQr(data.totp.qr_code);
    })();
  }, []);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!factorId) return;
    const supabase = createSupabaseBrowserClient();
    const challenge = await supabase.auth.mfa.challenge({ factorId });
    if (challenge.error) {
      setError(challenge.error.message);
      return;
    }
    const verifyRes = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.data.id,
      code,
    });
    if (verifyRes.error) {
      setError(verifyRes.error.message);
      return;
    }
    await markEnrolled.mutateAsync();
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('mfaTitle')}</CardTitle>
          <CardDescription>{t('mfaPrompt')}</CardDescription>
        </CardHeader>
        <CardContent>
          {qr && (
            <div className="mb-4 grid place-items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR TOTP" width={180} height={180} />
            </div>
          )}
          <form onSubmit={verify} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="code">Código</Label>
              <Input
                id="code"
                inputMode="numeric"
                pattern="\\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            {error && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={!factorId || code.length !== 6 || markEnrolled.isPending}>
              Verificar
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
