import { startScanWorker } from './scan.js';
import { ensureReminderSchedule, startRemindersWorker } from './reminders.js';

async function bootstrap() {
  const scan = startScanWorker();
  const reminders = startRemindersWorker();
  await ensureReminderSchedule();

  scan.on('completed', (job) => console.warn(`[scan] job ${job.id ?? '?'} ok`));
  scan.on('failed', (job, err) => console.error(`[scan] job ${job?.id ?? '?'} fail`, err));
  reminders.on('completed', () => {
    /* silencioso: cada tick imprime su propio resumen */
  });
  reminders.on('failed', (job, err) =>
    console.error(`[reminders] job ${job?.id ?? '?'} fail`, err),
  );

  console.warn('🦷 Castellar worker arriba (scan + reminders).');

  const shutdown = async (signal: NodeJS.Signals) => {
    console.warn(`[worker] señal ${signal}, cerrando…`);
    await Promise.all([scan.close(), reminders.close()]);
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

bootstrap().catch((err) => {
  console.error('[worker] bootstrap falló', err);
  process.exit(1);
});
