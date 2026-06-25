'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { trpc } from '@/lib/trpc';
import { NewAppointmentDialog } from '@/components/agenda/new-appointment-dialog';
import { AppointmentDetailsDialog } from '@/components/agenda/appointment-details-dialog';

/**
 * Vista de agenda por profesional, día completo.
 *
 * Layout: cabecera con flechas día anterior/siguiente, fila por cuarto de hora
 * (8:00..21:00), columna por profesional. Cada cita es un bloque que ocupa
 * filas según duración. Click sobre celda vacía → diálogo "Nueva cita".
 * Click sobre cita → diálogo de detalle/cambio de estado.
 *
 * Resource Timeline de FullCalendar Premium queda fuera del MVP por
 * licencia. Esta vista propia cubre el escenario piloto sin coste.
 */

const SLOT_MIN = 15; // cuarto de hora
const START_MIN = 8 * 60; // 08:00
const END_MIN = 21 * 60; // 21:00

const STATUS_STYLE: Record<string, string> = {
  SCHEDULED: 'bg-sky-100 border-sky-300 text-sky-900',
  CONFIRMED: 'bg-emerald-100 border-emerald-300 text-emerald-900',
  CHECKED_IN: 'bg-amber-100 border-amber-300 text-amber-900',
  IN_ROOM: 'bg-violet-100 border-violet-300 text-violet-900',
  COMPLETED: 'bg-slate-200 border-slate-400 text-slate-700 line-through',
  NO_SHOW: 'bg-rose-100 border-rose-300 text-rose-900',
  CANCELLED: 'bg-zinc-100 border-zinc-300 text-zinc-500 line-through',
};

function startOfDayLocal(d: Date): Date {
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  return dd;
}
function addDays(d: Date, n: number): Date {
  const dd = new Date(d);
  dd.setDate(dd.getDate() + n);
  return dd;
}
function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export default function AgendaPage() {
  const t = useTranslations('agenda');
  const tS = useTranslations('agenda.status');

  const clinics = trpc.identity.listClinics.useQuery();
  const [clinicId, setClinicId] = useState<string | null>(null);
  const effectiveClinic = clinicId ?? clinics.data?.[0]?.id ?? null;

  const [date, setDate] = useState<Date>(startOfDayLocal(new Date()));
  const from = useMemo(() => startOfDayLocal(date), [date]);
  const to = useMemo(() => addDays(from, 1), [from]);

  const professionals = trpc.scheduling.listProfessionals.useQuery();
  const agenda = trpc.scheduling.listAgenda.useQuery(
    { clinicId: effectiveClinic ?? '', from, to },
    { enabled: !!effectiveClinic },
  );

  const [createDialog, setCreateDialog] = useState<
    | { open: true; professionalId: string; startsAt: Date }
    | { open: false }
  >({ open: false });
  const [detailId, setDetailId] = useState<string | null>(null);

  const slots = useMemo(() => {
    const out: number[] = [];
    for (let m = START_MIN; m < END_MIN; m += SLOT_MIN) out.push(m);
    return out;
  }, []);

  function fmtSlot(min: number): string {
    const h = Math.floor(min / 60);
    const mm = min % 60;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setDate(addDays(date, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setDate(startOfDayLocal(new Date()))}>
            {t('today')}
          </Button>
          <span className="min-w-[10ch] text-center font-medium">
            {date.toLocaleDateString('es-ES', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </span>
          <Button variant="outline" size="sm" onClick={() => setDate(addDays(date, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <select
            value={effectiveClinic ?? ''}
            onChange={(e) => setClinicId(e.target.value || null)}
            className="ml-3 h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {clinics.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <div
            className="grid"
            style={{
              gridTemplateColumns: `64px repeat(${professionals.data?.length ?? 0}, minmax(180px, 1fr))`,
            }}
          >
            {/* Cabecera */}
            <div className="border-b border-r border-border" />
            {professionals.data?.map((p) => (
              <div
                key={p.id}
                className="border-b border-l border-border px-3 py-2 text-sm font-medium"
              >
                <span
                  className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                  style={{ background: p.color }}
                />
                {p.specialty ? <span className="text-muted-foreground">{p.specialty} · </span> : null}
                <span className="font-mono text-xs text-muted-foreground">{p.id.slice(0, 6)}</span>
              </div>
            ))}

            {/* Filas de slots */}
            {slots.map((m, rowIndex) => (
              <Slot
                key={m}
                rowIndex={rowIndex}
                minute={m}
                slotLabel={fmtSlot(m)}
                date={date}
                professionals={professionals.data ?? []}
                appointments={agenda.data ?? []}
                onCreate={(profId, startsAt) =>
                  setCreateDialog({ open: true, professionalId: profId, startsAt })
                }
                onOpen={(id) => setDetailId(id)}
                statusStyle={STATUS_STYLE}
                statusLabel={tS}
              />
            ))}
          </div>
          {(agenda.data ?? []).length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('empty')}</p>
          )}
        </CardContent>
      </Card>

      <Button
        className="fixed bottom-6 right-6 gap-2 shadow-lg"
        onClick={() => {
          const first = professionals.data?.[0];
          if (!first) return;
          const at = new Date(date);
          at.setHours(9, 0, 0, 0);
          setCreateDialog({ open: true, professionalId: first.id, startsAt: at });
        }}
      >
        <Plus className="h-4 w-4" />
        {t('newAppointment')}
      </Button>

      {createDialog.open && effectiveClinic && (
        <NewAppointmentDialog
          clinicId={effectiveClinic}
          professionalId={createDialog.professionalId}
          startsAt={createDialog.startsAt}
          onClose={() => setCreateDialog({ open: false })}
          onCreated={() => {
            setCreateDialog({ open: false });
            agenda.refetch().catch(() => undefined);
          }}
        />
      )}

      {detailId && (
        <AppointmentDetailsDialog
          appointmentId={detailId}
          onClose={() => setDetailId(null)}
          onUpdated={() => {
            agenda.refetch().catch(() => undefined);
          }}
        />
      )}
    </div>
  );
}

interface SlotProps {
  rowIndex: number;
  minute: number;
  slotLabel: string;
  date: Date;
  professionals: Array<{ id: string; color: string }>;
  appointments: Array<{
    id: string;
    professionalId: string;
    startsAt: Date | string;
    endsAt: Date | string;
    status: string;
    reason: string | null;
  }>;
  onCreate: (professionalId: string, startsAt: Date) => void;
  onOpen: (id: string) => void;
  statusStyle: Record<string, string>;
  statusLabel: (key: string) => string;
}

function Slot({
  minute,
  slotLabel,
  date,
  professionals,
  appointments,
  onCreate,
  onOpen,
  statusStyle,
  statusLabel,
}: SlotProps) {
  const showLabel = minute % 60 === 0;
  return (
    <>
      <div
        className={cn(
          'h-8 border-r border-border px-2 text-right text-xs text-muted-foreground',
          showLabel ? 'border-t pt-1' : '',
        )}
      >
        {showLabel ? slotLabel : ''}
      </div>
      {professionals.map((p) => {
        // Si una cita empieza exactamente en este slot para este profesional, la pintamos.
        const slotStart = new Date(date);
        slotStart.setHours(0, 0, 0, 0);
        slotStart.setMinutes(minute);
        const match = appointments.find((a) => {
          const s = new Date(a.startsAt);
          return (
            a.professionalId === p.id &&
            s.getHours() === slotStart.getHours() &&
            s.getMinutes() === slotStart.getMinutes()
          );
        });
        const occupied = appointments.some((a) => {
          const s = new Date(a.startsAt);
          const e = new Date(a.endsAt);
          return (
            a.professionalId === p.id &&
            slotStart >= s &&
            slotStart < e &&
            !(s.getHours() === slotStart.getHours() && s.getMinutes() === slotStart.getMinutes())
          );
        });
        const top = match
          ? (() => {
              const e = new Date(match.endsAt);
              const s = new Date(match.startsAt);
              const minutes = Math.max(SLOT_MIN, (e.getTime() - s.getTime()) / 60_000);
              const slots = Math.round(minutes / SLOT_MIN);
              return slots;
            })()
          : 0;
        return (
          <div
            key={p.id}
            className={cn(
              'relative h-8 border-l border-border',
              showLabel ? 'border-t border-t-border/70' : '',
              'cursor-pointer hover:bg-accent/30',
            )}
            onClick={() => {
              if (occupied || match) return;
              onCreate(p.id, slotStart);
            }}
          >
            {match && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(match.id);
                }}
                className={cn(
                  'absolute left-0.5 right-0.5 z-10 overflow-hidden rounded-md border px-2 py-1 text-left text-xs shadow-sm',
                  statusStyle[match.status] ?? '',
                )}
                style={{ top: 0, height: `${top * 2}rem` }}
              >
                <div className="truncate font-medium">{statusLabel(match.status)}</div>
                {match.reason && <div className="truncate text-[10px] opacity-80">{match.reason}</div>}
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}
