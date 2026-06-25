import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@castellar/api-contracts';

/** Cliente React Query + tRPC tipado contra el AppRouter. */
export const trpc = createTRPCReact<AppRouter>();
