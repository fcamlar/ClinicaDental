import {
  All,
  Controller,
  Inject,
  Injectable,
  Module,
  Req,
  Res,
  type OnModuleInit,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from '@castellar/api-contracts';
import { createContext } from './context.js';
import { ServicesModule, ServicesProvider } from '../services/services.module.js';

@Injectable()
class TrpcAdapter {
  constructor(@Inject(ServicesProvider) private readonly services: ServicesProvider) {}

  readonly middleware = createExpressMiddleware({
    router: appRouter,
    createContext: ({ req }) => createContext(req as Request, this.services),
    onError({ error, path }) {
      if (error.code === 'INTERNAL_SERVER_ERROR') {
        console.error(`[trpc] ${path ?? '?'} → ${error.code}: ${error.message}`);
      }
    },
  });
}

@Controller('trpc')
class TrpcController implements OnModuleInit {
  constructor(@Inject(TrpcAdapter) private readonly adapter: TrpcAdapter) {}

  onModuleInit() {
    // Hook para registrar telemetría/health.
  }

  @All('*')
  handle(@Req() req: Request, @Res() res: Response) {
    return this.adapter.middleware(req, res, (err) => {
      if (err) {
        console.error('[trpc] middleware error', err);
        res.status(500).json({ error: 'internal' });
      }
    });
  }
}

@Module({
  imports: [ServicesModule],
  controllers: [TrpcController],
  providers: [TrpcAdapter],
})
export class TrpcModule {}
