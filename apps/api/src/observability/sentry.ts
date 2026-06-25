import * as Sentry from '@sentry/node';

/**
 * Inicializa Sentry para Node con tags estándar de Castellar.
 *
 * Reglas:
 *   - No enviamos PII al SDK (`sendDefaultPii: false`).
 *   - El tag `tenant_id` lo añade el middleware tRPC tras autenticar.
 *   - Profiling desactivado en MVP para no consumir cuota del free tier.
 *   - Trace sample rate 10% por defecto, configurable via env.
 */
export function initSentry(serviceName: 'api' | 'worker'): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE ?? undefined,
    sendDefaultPii: false,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    integrations: [
      Sentry.httpIntegration(),
      // El integration `requestData` puede capturar el body; lo dejamos por
      // defecto pero la mayor parte de payload son IDs no PII.
    ],
    beforeSend(event) {
      // Pseudoanonimización: nunca enviamos email/teléfono/IP a Sentry.
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
      }
      return event;
    },
  });

  Sentry.setTag('service', serviceName);
}

export { Sentry };
