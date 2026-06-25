import * as Sentry from '@sentry/node';
import { startScanWorker } from './scan.js';
import { ensureReminderSchedule, startRemindersWorker } from './reminders.js';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    sendDefaultPii: false,
    tracesSampleRate: 0.05,
  });
  Sentry.setTag('service', 'worker');
}

async function bootstrap() {
  const scan = startScanWorker();
  const reminders = startRemindersWorker();
  await ensureReminderSchedule();

  scan.on('completed', (job) => console.warn(`[scan] job ${job.id ?? '?'} ok`));
  scan.on('failed', (job, err) => {
    Sentry.captureException(err);
    console.error(`[scan] job ${job?.id ?? '?'} fail`, err);
  });
  reminders.on('completed', () => {
    /* silencioso: cada tick imprime su propio resumen */
  });
  reminders.on('failed', (job, err) => {
    Sentry.captureException(err);
    console.error(`[reminders] job ${job?.id ?? '?'} fail`, err);
  });

  console.warn('🦷 Castellar worker arriba (scan + reminders).');

  const shutdown = async (signal: NodeJS.Signals) => {
    console.warn(`[worker] señal ${signal}, cerrando…`);
    await Promise.all([scan.close(), reminders.close()]);
    await Sentry.close(2000);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap().catch((err) => {
  Sentry.captureException(err);
  console.error('[worker] bootstrap falló', err);
  process.exit(1);
});
