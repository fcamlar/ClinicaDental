import { Controller, Get, Module } from '@nestjs/common';
import { TrpcModule } from './trpc/trpc.module.js';

@Controller('health')
class HealthController {
  @Get()
  health() {
    return { status: 'ok', uptime: process.uptime() };
  }
}

@Module({
  imports: [TrpcModule],
  controllers: [HealthController],
})
export class AppModule {}
