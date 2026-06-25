import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  app.enableCors({
    origin: process.env.APP_URL ?? 'http://localhost:3000',
    credentials: true,
  });

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  console.warn(`🦷 Castellar API escuchando en http://localhost:${String(port)}`);
}

bootstrap().catch((err) => {
  console.error('Fallo al arrancar la API', err);
  process.exit(1);
});
