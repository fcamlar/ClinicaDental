'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { trpc } from '@/lib/trpc';

/**
 * Página de canjeo del enlace mágico. El token llega como query param.
 * Si es válido, lo guardamos en sessionStorage (vive solo en la pestaña) y
 * redirigimos a /portal/me.
 *
 * En MVP, las queries del portal siguen incluyendo el token (cada call
 * lo re-canjea por sesión). Sprint 7+ pasará a cookie HTTP-only firmada
 * por el servidor.
 */
export default function PortalAccessPage() {
  const search = useSearchParams();
  const router = useRouter();
  const token = search.get('token');
  const exchange = trpc.portal.exchangeToken.useMutation();

  useEffect(() => {
    if (!token) return;
    exchange.mutate(
      { token },
      {
        onSuccess() {
          sessionStorage.setItem('castellar-portal-token', token);
          router.replace('/portal/me');
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Accediendo a tu portal…</CardTitle>
      </CardHeader>
      <CardContent>
        {!token && <p className="text-sm text-destructive">Falta el token de acceso.</p>}
        {exchange.error && (
          <p className="text-sm text-destructive">{exchange.error.message}</p>
        )}
      </CardContent>
    </Card>
  );
}
