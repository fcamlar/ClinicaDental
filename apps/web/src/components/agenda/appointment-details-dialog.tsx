'use client';

import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';

interface Props {
  appointmentId: string;
  onClose: () => void;
  onUpdated: () => void;
}

/**
 * Diálogo de detalle de cita. Permite avanzar el estado (check-in → in-room →
 * completed) y cancelar. Las transiciones inválidas el backend las rechaza
 * con PRECONDITION_FAILED.
 */
export function AppointmentDetailsDialog({ appointmentId, onClose, onUpdated }: Props) {
  const t = useTranslations('agenda');
  const tS = useTranslations('agenda.status');
  const tA = useTranslations('agenda.actions');
  // Para el detalle usamos listAgenda con cliente filter; en Sprint 4 añadimos endpoint dedicado.
  // De momento leemos del cache invalidado tras cada mutación.
  const change = trpc.scheduling.changeStatus.useMutation({
    onSuccess: () => onUpdated(),
  });

  // Lectura optimista: usamos listAgenda del día actual. Si el caller invalidó
  // bien, el item estará en cache.
  const ctx = trpc.useUtils();
  const cached = ctx.scheduling.listAgenda
    .getInfiniteData()
    ?.pages.flatMap((p: any[]) => p)
    .find((a: any) => a.id === appointmentId) as
    | { status: string; startsAt: string; endsAt: string; reason: string | null }
    | undefined;

  const nextActions: Array<{ to: string; label: string; variant?: 'default' | 'destructive' }> = [
    { to: 'CHECKED_IN', label: tA('checkIn') },
    { to: 'IN_ROOM', label: tA('inRoom') },
    { to: 'COMPLETED', label: tA('complete') },
    { to: 'NO_SHOW', label: tA('noShow'), variant: 'destructive' },
    { to: 'CANCELLED', label: tA('cancel'), variant: 'destructive' },
  ];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-2 sm:p-4">
      <Card className="max-h-[95vh] w-full max-w-md overflow-y-auto">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span>{t('newAppointment')}</span>
            {cached && <Badge>{tS(cached.status)}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            ID: <span className="font-mono">{appointmentId.slice(0, 8)}…</span>
          </p>
          {cached?.reason && <p className="text-sm">{cached.reason}</p>}
          <div className="flex flex-wrap gap-2">
            {nextActions.map((a) => (
              <Button
                key={a.to}
                size="sm"
                variant={a.variant === 'destructive' ? 'destructive' : 'outline'}
                disabled={change.isPending}
                onClick={() =>
                  change.mutate({
                    appointmentId,
                    to: a.to as
                      | 'SCHEDULED'
                      | 'CONFIRMED'
                      | 'CHECKED_IN'
                      | 'IN_ROOM'
                      | 'COMPLETED'
                      | 'NO_SHOW'
                      | 'CANCELLED',
                  })
                }
              >
                {a.label}
              </Button>
            ))}
          </div>
          {change.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {change.error.message}
            </p>
          )}
          <div className="flex items-center justify-between pt-2">
            <Link
              href={`/agenda?id=${appointmentId}`}
              className="text-sm text-primary hover:underline"
            >
              Abrir ficha completa
            </Link>
            <Button variant="ghost" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
