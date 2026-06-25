'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { trpc } from '@/lib/trpc';

interface Props {
  clinicId: string;
  professionalId: string;
  startsAt: Date;
  onClose: () => void;
  onCreated: () => void;
}

/**
 * Diálogo modal sencillo (sin Radix Dialog para evitar tree-shake bloat en MVP).
 * Pacientes se buscan por nombre con `patients.search`.
 */
export function NewAppointmentDialog({
  clinicId,
  professionalId: initialProf,
  startsAt: initialStart,
  onClose,
  onCreated,
}: Props) {
  const t = useTranslations('agenda.form');

  const [patientQuery, setPatientQuery] = useState('');
  const [patientId, setPatientId] = useState<string | null>(null);
  const [professionalId, setProfessionalId] = useState(initialProf);
  const [duration, setDuration] = useState(30);
  const [reason, setReason] = useState('');

  const startStr = useMemo(() => {
    const d = new Date(initialStart);
    return d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
  }, [initialStart]);

  const profs = trpc.scheduling.listProfessionals.useQuery();
  const search = trpc.patients.search.useQuery(
    { query: patientQuery, limit: 10 },
    { enabled: patientQuery.length >= 2 },
  );
  const create = trpc.scheduling.create.useMutation({
    onSuccess: () => onCreated(),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId) return;
    const endsAt = new Date(initialStart.getTime() + duration * 60_000);
    create.mutate({
      clinicId,
      patientId,
      professionalId,
      startsAt: initialStart,
      endsAt,
      reason: reason || undefined,
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-2 sm:p-4">
      <Card className="max-h-[95vh] w-full max-w-md overflow-y-auto">
        <CardHeader>
          <CardTitle>{startStr}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="patientQuery">{t('patient')}</Label>
              <Input
                id="patientQuery"
                value={patientQuery}
                onChange={(e) => {
                  setPatientQuery(e.target.value);
                  setPatientId(null);
                }}
                placeholder="Buscar por nombre o código…"
                autoFocus
              />
              {patientQuery.length >= 2 && (
                <ul className="max-h-40 overflow-y-auto rounded-md border border-input">
                  {search.data?.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setPatientId(p.id);
                          setPatientQuery(`${p.firstName} ${p.lastName}`);
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                      >
                        <span className="font-medium">
                          {p.firstName} {p.lastName}
                        </span>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {p.code}
                        </span>
                      </button>
                    </li>
                  ))}
                  {search.data?.length === 0 && (
                    <li className="px-3 py-2 text-sm text-muted-foreground">Sin resultados</li>
                  )}
                </ul>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label htmlFor="professional">{t('professional')}</Label>
                <select
                  id="professional"
                  value={professionalId}
                  onChange={(e) => setProfessionalId(e.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {profs.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.specialty ?? p.id.slice(0, 6)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="duration">{t('duration')}</Label>
                <select
                  id="duration"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {[15, 30, 45, 60, 90, 120].map((d) => (
                    <option key={d} value={d}>
                      {d} min
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="reason">{t('reason')}</Label>
              <Input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={255}
              />
            </div>
            {create.error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {create.error.message}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!patientId || create.isPending}>
                Crear
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
