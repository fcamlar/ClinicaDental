/**
 * Citas de demo: rango ±90 días alrededor de hoy. Distribuye citas a
 * profesionales en horas laborales, con un mix de estados realista.
 *
 * Se invoca al final del seed para tener tenant, clínica, profesionales,
 * pacientes y salas ya creados.
 */

import type { PrismaClient } from '@prisma/client';

const STATUSES: Array<{
  status: 'SCHEDULED' | 'CONFIRMED' | 'CHECKED_IN' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED';
  weight: number;
}> = [
  { status: 'SCHEDULED', weight: 30 },
  { status: 'CONFIRMED', weight: 15 },
  { status: 'COMPLETED', weight: 35 },
  { status: 'NO_SHOW', weight: 5 },
  { status: 'CANCELLED', weight: 15 },
];

function pickStatus(seed: number): typeof STATUSES[number]['status'] {
  const total = STATUSES.reduce((s, x) => s + x.weight, 0);
  let r = seed % total;
  for (const s of STATUSES) {
    if (r < s.weight) return s.status;
    r -= s.weight;
  }
  return 'SCHEDULED';
}

const REASONS = [
  'Revisión',
  'Higiene dental',
  'Empaste',
  'Endodoncia',
  'Implante (control)',
  'Ortodoncia (control)',
  'Urgencia',
  'Estudio inicial',
  'Blanqueamiento',
];

export async function seedAppointments(args: {
  prisma: PrismaClient;
  tenantId: string;
  clinicId: string;
  count?: number;
}) {
  const { prisma, tenantId, clinicId, count = 200 } = args;
  const professionals = await prisma.professional.findMany({ where: { tenantId } });
  const rooms = await prisma.room.findMany({ where: { tenantId, clinicId } });
  const patients = await prisma.patient.findMany({ where: { tenantId }, take: 50 });
  if (professionals.length === 0 || patients.length === 0) {
    console.warn('[seedAppointments] saltando — faltan profesionales o pacientes');
    return;
  }

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (let i = 0; i < count; i++) {
    // Día entre -90 y +90.
    const dayOffset = (i * 9) % 181 - 90;
    const dt = new Date(today);
    dt.setUTCDate(dt.getUTCDate() + dayOffset);

    // Solo L–V.
    const dow = dt.getUTCDay();
    if (dow === 0 || dow === 6) continue;

    // Hora: mañana (09–13) o tarde (16–19). Cuartos de hora.
    const slot = i % 32; // 8 mañanas + 12 tardes simplificado
    const morning = slot < 16;
    const hour = morning ? 9 + Math.floor(slot / 4) : 16 + Math.floor((slot - 16) / 4);
    const minute = (slot % 4) * 15;
    dt.setUTCHours(hour, minute, 0, 0);

    const duration = [15, 30, 30, 30, 45, 60][i % 6]!;
    const endsAt = new Date(dt.getTime() + duration * 60_000);

    const professional = professionals[i % professionals.length]!;
    const patient = patients[i % patients.length]!;
    const room = rooms[i % rooms.length]?.id ?? null;
    const status = pickStatus(i);

    try {
      await prisma.appointment.create({
        data: {
          tenantId,
          clinicId,
          patientId: patient.id,
          professionalId: professional.id,
          roomId: room,
          startsAt: dt,
          endsAt,
          status,
          reason: REASONS[i % REASONS.length],
          // Citas pasadas marcadas como recordadas para no spam-ear emails.
          remindedAt: dayOffset < 0 ? new Date(dt.getTime() - 24 * 60 * 60 * 1000) : null,
          completedAt: status === 'COMPLETED' ? new Date(dt.getTime() + duration * 60_000) : null,
          noShowAt: status === 'NO_SHOW' ? new Date(dt.getTime() + 30 * 60_000) : null,
          cancelledAt: status === 'CANCELLED' ? new Date(dt.getTime() - 24 * 60 * 60 * 1000) : null,
          checkedInAt: status === 'COMPLETED' ? new Date(dt.getTime() - 5 * 60_000) : null,
        },
      });
    } catch (err) {
      // Tolerante: si el seed cae en un solape GIST, lo ignoramos.
      if (err instanceof Error && err.message.includes('no_overlap')) continue;
      throw err;
    }
  }
}
