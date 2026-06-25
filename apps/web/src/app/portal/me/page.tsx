'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';

const EURO = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

export default function PortalMePage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = sessionStorage.getItem('castellar-portal-token');
    if (!t) {
      router.replace('/');
      return;
    }
    setToken(t);
  }, [router]);

  if (!token) return null;

  return <PortalContent token={token} />;
}

function PortalContent({ token }: { token: string }) {
  const me = trpc.portal.myProfile.useQuery({ token });
  const appointments = trpc.portal.myAppointments.useQuery({ token });
  const invoices = trpc.portal.myInvoices.useQuery({ token });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {me.data ? `Hola, ${me.data.firstName}` : 'Cargando…'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {me.data && (
            <p className="text-sm text-muted-foreground">
              Paciente <span className="font-mono">{me.data.code}</span>
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Próximas citas</CardTitle>
        </CardHeader>
        <CardContent>
          {appointments.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">No tienes citas próximas.</p>
          )}
          <ul className="divide-y divide-border">
            {appointments.data?.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between py-3 text-sm"
              >
                <div>
                  <div className="font-medium">
                    {new Date(a.startsAt).toLocaleString('es-ES', {
                      dateStyle: 'long',
                      timeStyle: 'short',
                    })}
                  </div>
                  {a.reason && <div className="text-xs text-muted-foreground">{a.reason}</div>}
                </div>
                <Badge variant="secondary">{a.status}</Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tus facturas</CardTitle>
        </CardHeader>
        <CardContent>
          {invoices.data?.length === 0 && (
            <p className="text-sm text-muted-foreground">Aún no tienes facturas.</p>
          )}
          <ul className="divide-y divide-border text-sm">
            {invoices.data?.map((i) => (
              <li key={i.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="font-mono text-xs">
                    {i.seriesCode}/{String(i.number).padStart(4, '0')}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(i.issuedAt).toLocaleDateString('es-ES', { dateStyle: 'long' })}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold tabular-nums">
                    {EURO.format(i.total / 100)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    pendiente {EURO.format((i.total - i.paidTotal) / 100)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
