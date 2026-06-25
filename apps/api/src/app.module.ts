import { Controller, Get, Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { TrpcModule } from './trpc/trpc.module.js';

@Controller('health')
class HealthController {
  @Get()
  health() {
    return { status: 'ok', uptime: process.uptime() };
  }
}

let readinessPrisma: PrismaClient | null = null;

@Controller('ready')
class ReadinessController {
  @Get()
  async ready() {
    if (!readinessPrisma) {
      readinessPrisma = new PrismaClient({
        datasourceUrl: process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL,
      });
    }
    try {
      await readinessPrisma.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch (err) {
      return { status: 'not_ready', error: err instanceof Error ? err.message : 'unknown' };
    }
  }
}

@Module({
  imports: [TrpcModule],
  controllers: [HealthController, ReadinessController],
})
export class AppModule {}
