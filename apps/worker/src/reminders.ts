import IORedis from 'ioredis';
import { Queue, Worker, type Job } from 'bullmq';
import { Resend } from 'resend';
import { PrismaClient } from '@prisma/client';

/**
 * Worker de recordatorios de cita 24h.
 *
 * Se ejecuta como repeatable job cada 15 min. Busca citas con starts_at en
 * (now+23h, now+25h], status SCHEDULED/CONFIRMED y reminded_at = NULL.
 * Envía email vía Resend y marca remindedAt para no duplicar.
 *
 * Idempotencia: si dos workers procesan la misma cita en paralelo, el UPDATE
 * con WHERE reminded_at IS NULL garantiza que solo uno gane (PostgreSQL).
 *
 * Multi-tenant: el worker usa migrate URL para bypasear RLS porque procesa
 * todos los tenants juntos. La columna tenant_id en el email es informativa.
 */

const REMINDERS_QUEUE = 'castellar:reminders';

interface ReminderTickJob {
  /** No usado — el job es repetitivo y no lleva data. */
  _: true;
}

function getRedis(): IORedis {
  return new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });
}

function getPrisma(): PrismaClient {
  return new PrismaClient({
    datasourceUrl: process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL,
  });
}

function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY no definida');
  return new Resend(key);
}

function formatDateInTimezone(date: Date, timezone: string, locale = 'es-ES'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(date);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function processTick(prisma: PrismaClient, resend: Resend): Promise<{ sent: number }> {
  const now = new Date();
  const from = new Date(now.getTime() + 23 * 60 * 60 * 1000);
  const to = new Date(now.getTime() + 25 * 60 * 60 * 1000);

  // Sin RLS — buscamos en todos los tenants. Filtramos por status + ventana.
  const candidates = await prisma.appointment.findMany({
    where: {
      remindedAt: null,
      status: { in: ['SCHEDULED', 'CONFIRMED'] },
      startsAt: { gt: from, lte: to },
    },
    include: {
      patient: { select: { email: true, firstName: true, lastName: true } },
    },
    take: 100,
  });

  let sent = 0;
  for (const a of candidates) {
    if (!a.patient.email) {
      // Sin email — marcamos como notificado para no reintentar indefinidamente.
      await prisma.appointment.updateMany({
        where: { id: a.id, remindedAt: null },
        data: { remindedAt: new Date() },
      });
      continue;
    }
    const clinic = await prisma.clinic.findUnique({ where: { id: a.clinicId } });
    const timezone = clinic?.timezone ?? 'Europe/Madrid';
    const tenant = await prisma.tenant.findUnique({ where: { id: a.tenantId } });
    const locale = tenant?.locale ?? 'es-ES';

    const whenLabel = formatDateInTimezone(a.startsAt, timezone, locale);
    const patientName = `${a.patient.firstName} ${a.patient.lastName}`;
    const clinicName = clinic?.name ?? 'Castellar';

    // UPDATE condicional: gana el primer worker.
    const claim = await prisma.appointment.updateMany({
      where: { id: a.id, remindedAt: null },
      data: { remindedAt: new Date() },
    });
    if (claim.count === 0) continue;

    try {
      await resend.emails.send({
        from: process.env.SMTP_FROM ?? 'no-reply@castellar.app',
        to: a.patient.email,
        subject: `Recordatorio de cita — ${clinicName}`,
        html: `
          <div style="font-family: system-ui, sans-serif; max-width: 540px;">
            <h2>Recordatorio de tu cita en ${escapeHtml(clinicName)}</h2>
            <p>Hola ${escapeHtml(patientName)},</p>
            <p>Te recordamos que tienes una cita programada para:</p>
            <p style="font-size: 16px; font-weight: 600;">${escapeHtml(whenLabel)}</p>
            ${a.reason ? `<p>Motivo: ${escapeHtml(a.reason)}</p>` : ''}
            <p style="color:#6b7280;font-size:13px;">
              Si no puedes acudir, por favor contáctanos lo antes posible.
            </p>
          </div>
        `,
      });
      sent += 1;
    } catch (err) {
      // Si el envío falla, revertimos la marca para reintentar en la siguiente vuelta.
      console.error(`[reminders] envío falló para ${a.id}`, err);
      await prisma.appointment.update({
        where: { id: a.id },
        data: { remindedAt: null },
      });
    }
  }
  return { sent };
}

export function startRemindersWorker(): Worker<ReminderTickJob> {
  const connection = getRedis();
  const prisma = getPrisma();
  const resend = getResend();

  return new Worker<ReminderTickJob>(
    REMINDERS_QUEUE,
    async (_job: Job<ReminderTickJob>) => {
      const { sent } = await processTick(prisma, resend);
      if (sent > 0) console.warn(`[reminders] enviados ${String(sent)} recordatorios`);
      return { sent };
    },
    { connection, concurrency: 1 },
  );
}

/**
 * Crea el repeatable job que dispara el procesamiento cada 15 min.
 * Se llama una sola vez al arrancar el worker; BullMQ deduplica por jobId.
 */
export async function ensureReminderSchedule(): Promise<void> {
  const queue = new Queue<ReminderTickJob>(REMINDERS_QUEUE, { connection: getRedis() });
  await queue.add(
    'tick',
    { _: true },
    {
      repeat: { pattern: '*/15 * * * *' },
      jobId: 'reminders:tick',
      removeOnComplete: { count: 10 },
      removeOnFail: { count: 100 },
    },
  );
  await queue.close();
}
