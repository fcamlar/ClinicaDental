'use client';

export const runtime = 'edge';


import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';
import { createSupabaseBrowserClient } from '@/lib/supabase';

/**
 * Página de aceptación de invitación.
 *
 * El usuario llega aquí desde el email con `?token=...`. Si todavía no
 * está autenticado en Supabase (por ejemplo, primer acceso a la plataforma),
 * Supabase lo redirigirá a su flujo de set-password. Cuando vuelve, hay
 * sesión, sacamos el supabase user id y llamamos a identity.acceptInvitation.
 */
export default function AcceptInvitePage() {
  const search = useSearchParams();
  const router = useRouter();
  const token = search.get('token');
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState<string | null>(null);

  const accept = trpc.identity.acceptInvitation.useMutation();

  useEffect(() => {
    (async () => {
      if (!token) {
        setStatus('error');
        setMessage('Token de invitación no encontrado');
        return;
      }
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        // El usuario debe pasar primero por Supabase set-password.
        router.push('/login');
        return;
      }
      try {
        await accept.mutateAsync({ token, supabaseUserId: data.user.id });
        setStatus('ok');
      } catch (err) {
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Error desconocido');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Aceptar invitación</CardTitle>
          <CardDescription>Castellar</CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'loading' && <p>Procesando…</p>}
          {status === 'ok' && (
            <div className="grid gap-4">
              <p>Invitación aceptada. ¡Bienvenido a Castellar!</p>
              <Button onClick={() => router.push('/dashboard')}>Ir al dashboard</Button>
            </div>
          )}
          {status === 'error' && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {message}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
