import 'reflect-metadata';
import { initSentry, Sentry } from './observability/sentry.js';

// Sentry debe inicializarse ANTES de cualquier import que cree el módulo Nest,
// para que las trazas capturen el bootstrap.
initSentry('api');

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { rateLimit, securityHeaders } from './security/middleware.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.enableCors({
    origin: process.env.APP_URL ?? 'http://localhost:3000',
    credentials: true,
  });

  app.use(securityHeaders());
  app.use('/trpc', rateLimit({ prefix: 'trpc', max: 60, windowMs: 60_000 }));
  app.use(
    '/trpc/portal.exchangeToken',
    rateLimit({ prefix: 'portal-exchange', max: 10, windowMs: 60_000 }),
  );

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.warn(`🦷 Castellar API escuchando en http://localhost:${String(port)}`);
}

bootstrap().catch((err) => {
  Sentry.captureException(err);
  console.error('Fallo al arrancar la API', err);
  process.exit(1);
});
